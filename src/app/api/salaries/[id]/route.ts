import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"
import { ensureTeacherPayrollSchema } from "@/lib/teacher-payroll-schema"
import { snapshotTeacherSalary } from "@/lib/salary-history"
import { appendSecretaryPaymentDetails, readSecretaryPaymentDetails } from "@/lib/secretary-salary-details"

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
  const parsedSecretaryDetails = readSecretaryPaymentDetails(salary.notes)
  const displayNotes = correctionNote ? [parsedSecretaryDetails.displayNotes, correctionNote].filter(Boolean).join("\n") : parsedSecretaryDetails.displayNotes
  const notes = parsedSecretaryDetails.payments.length > 0 && displayNotes
    ? appendSecretaryPaymentDetails(displayNotes, parsedSecretaryDetails.payments)
    : displayNotes

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

export const DELETE = wrap(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  await ensureTeacherPayrollSchema()
  const salary = await prisma.teacherSalary.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { teacher: { select: { role: true } } },
  })
  if (!salary) return NextResponse.json({ error: "Fiche de paie introuvable." }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.teacherSalary.delete({ where: { id: salary.id } })

    if (salary.teacher.role === "SECRETARY") {
      const settings = await tx.tenantSettings.findUnique({
        where: { tenantId: user.tenantId },
        select: { paymentPeriodStartAt: true },
      })
      await tx.secretaryCommission.deleteMany({
        where: {
          tenantId: user.tenantId,
          secretaryId: salary.teacherId,
          month: salary.month,
          year: salary.year,
        },
      })
      if (salary.periodEnd && settings?.paymentPeriodStartAt?.getTime() === salary.periodEnd.getTime()) {
        const latestRemainingClosure = await tx.teacherSalary.findFirst({
          where: {
            tenantId: user.tenantId,
            periodEnd: { not: null },
            teacher: { role: "SECRETARY" },
          },
          select: { periodEnd: true },
          orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
        })
        await tx.tenantSettings.update({
          where: { tenantId: user.tenantId },
          data: { paymentPeriodStartAt: latestRemainingClosure?.periodEnd ?? null },
        })
      }
    }
  })

  return NextResponse.json({ deleted: true, id: salary.id })
})
