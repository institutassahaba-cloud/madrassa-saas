import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const salary = await prisma.teacherSalary.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!salary) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const totalAmount = body.totalAmount === undefined ? undefined : Number(body.totalAmount)
  if (totalAmount !== undefined && (!Number.isFinite(totalAmount) || totalAmount < 0)) {
    return NextResponse.json({ error: "Montant invalide." }, { status: 400 })
  }

  const correctionNote = totalAmount !== undefined && totalAmount !== salary.totalAmount
    ? `Correction manuelle le ${new Date().toLocaleString("fr-FR")} : ${salary.totalAmount.toFixed(2)} € → ${totalAmount.toFixed(2)} €.`
    : null
  const notes = correctionNote ? [salary.notes, correctionNote].filter(Boolean).join("\n") : salary.notes

  const updated = await prisma.teacherSalary.update({
    where: { id },
    data: {
      status: body.status === undefined ? salary.status : body.status,
      paidDate: body.paidDate === undefined ? salary.paidDate : body.paidDate ? new Date(body.paidDate) : null,
      totalAmount,
      notes,
    },
  })

  if (totalAmount !== undefined && salary.teacherId) {
    const teacher = await prisma.user.findUnique({ where: { id: salary.teacherId }, select: { role: true } })
    if (teacher?.role === "SECRETARY") {
      await prisma.secretaryCommission.updateMany({
        where: { tenantId: user.tenantId, secretaryId: salary.teacherId, month: salary.month, year: salary.year },
        data: { amount: totalAmount },
      })
    }
  }
  return NextResponse.json(updated)
})
