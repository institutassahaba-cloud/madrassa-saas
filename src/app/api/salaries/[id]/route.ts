import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"
import { ensureTeacherPayrollSchema } from "@/lib/teacher-payroll-schema"
import { snapshotTeacherSalary } from "@/lib/salary-history"

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  await ensureTeacherPayrollSchema()

  const salary = await prisma.teacherSalary.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!salary) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const totalAmount = body.totalAmount === undefined ? undefined : Number(body.totalAmount)
  if (totalAmount !== undefined && (!Number.isFinite(totalAmount) || totalAmount < 0)) {
    return NextResponse.json({ error: "Montant invalide." }, { status: 400 })
  }
  const allowedStatuses = new Set(["PENDING", "PARTIAL", "CONFIRMED", "PAID"])
  if (body.status !== undefined && !allowedStatuses.has(body.status)) {
    return NextResponse.json({ error: "Statut de paie invalide." }, { status: 400 })
  }
  const paidDate = body.paidDate === undefined ? salary.paidDate : body.paidDate ? new Date(body.paidDate) : null
  if (paidDate && Number.isNaN(paidDate.getTime())) {
    return NextResponse.json({ error: "Date de paiement invalide." }, { status: 400 })
  }

  const correctionNote = totalAmount !== undefined && totalAmount !== salary.totalAmount
    ? `Correction manuelle le ${new Date().toLocaleString("fr-FR")} : ${salary.totalAmount.toFixed(2)} € → ${totalAmount.toFixed(2)} €.`
    : null
  const notes = correctionNote ? [salary.notes, correctionNote].filter(Boolean).join("\n") : salary.notes

  const updated = await prisma.$transaction(async (tx) => {
    await snapshotTeacherSalary(tx, salary.id, user.id)
    const saved = await tx.teacherSalary.update({
      where: { id },
      data: {
        status: body.status === undefined ? salary.status : body.status,
        paidDate,
        totalAmount,
        notes,
      },
    })

    if (totalAmount !== undefined && salary.teacherId) {
      const teacher = await tx.user.findUnique({ where: { id: salary.teacherId }, select: { role: true } })
      if (teacher?.role === "SECRETARY") {
        await tx.secretaryCommission.updateMany({
          where: { tenantId: user.tenantId, secretaryId: salary.teacherId, month: salary.month, year: salary.year },
          data: { amount: totalAmount },
        })
      }
    }
    return saved
  })
  const result = await prisma.teacherSalary.findUnique({
    where: { id: updated.id },
    include: {
      teacher: { select: { id: true, name: true } },
      revisions: { orderBy: { revision: "desc" } },
    },
  })
  return NextResponse.json(result)
})
