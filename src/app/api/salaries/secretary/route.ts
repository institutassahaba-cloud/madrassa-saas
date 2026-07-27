import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getValidatedPaymentPeriodStart, getValidatedPaymentsForPeriod, validatedPaymentAmount } from "@/lib/payment-period"
import { snapshotTeacherSalary } from "@/lib/salary-history"
import { ensureTeacherPayrollSchema } from "@/lib/teacher-payroll-schema"
import { wrap } from "@/lib/api"

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const tenantId = user.tenantId
  await ensureTeacherPayrollSchema()

  const secretaries = await prisma.user.findMany({
    where: { tenantId, role: "SECRETARY", isActive: true },
    select: { id: true, name: true },
  })

  if (secretaries.length === 0) {
    return NextResponse.json({ error: "Aucune secrétaire trouvée" }, { status: 404 })
  }

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const periodStart = await getValidatedPaymentPeriodStart(tenantId, now)
  if (body.confirm && body.periodStart && new Date(body.periodStart).getTime() !== periodStart.getTime()) {
    return NextResponse.json({ error: "La période a changé depuis la prévisualisation. Recalculez avant de clôturer." }, { status: 409 })
  }

  const payments = await getValidatedPaymentsForPeriod(tenantId, periodStart, now)
  const collectedTotal = +payments.reduce((sum, payment) => sum + validatedPaymentAmount(payment), 0).toFixed(2)
  const rate = 0.10
  const amount = +(collectedTotal * rate).toFixed(2)
  const paymentLines = payments.map((payment) => {
    const date = payment.paidDate ? payment.paidDate.toLocaleDateString("fr-FR") : "date inconnue"
    const closedAt = payment.confirmedAt ?? payment.createdAt
    const student = `${payment.student.firstName} ${payment.student.lastName}`.trim()
    const ref = payment.reference ? ` · réf. ${payment.reference}` : ""
    const method = payment.method ? ` · ${payment.method}` : ""
    return `${date} · ${student} · ${validatedPaymentAmount(payment).toFixed(2)} €${method}${ref} · validé le ${closedAt.toLocaleString("fr-FR")}`
  })
  const notes = [
    `Commission secrétaire 10% sur ${collectedTotal.toFixed(2)} € de paiements validés pendant la période.`,
    `Période clôturée du ${periodStart.toLocaleString("fr-FR")} au ${now.toLocaleString("fr-FR")}.`,
    `${payments.length} paiement${payments.length > 1 ? "s" : ""} inclus.`,
    paymentLines.length > 0 ? `Détail :\n${paymentLines.join("\n")}` : "Aucun paiement inclus.",
  ].join("\n")

  const results = secretaries.map((sec) => ({
      secretaryId: sec.id,
      secretaryName: sec.name,
      collectedTotal,
      rate,
      amount,
      paymentCount: payments.length,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
  }))

  if (body.confirm) {
    if (payments.length === 0) {
      return NextResponse.json({ error: "Aucun paiement validé à clôturer sur cette période." }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      for (const sec of secretaries) {
        const commissionData = {
          tenantId,
          secretaryId: sec.id,
          month,
          year,
          collectedTotal,
          rate,
          amount,
          status: "PENDING",
          notes,
        }
        const existingCommission = await tx.secretaryCommission.findUnique({
          where: { secretaryId_month_year: { secretaryId: sec.id, month, year } },
        })
        if (existingCommission) {
          await tx.secretaryCommission.update({ where: { id: existingCommission.id }, data: commissionData })
        } else {
          await tx.secretaryCommission.create({ data: commissionData })
        }

        const salaryData = {
          tenantId,
          teacherId: sec.id,
          month,
          year,
          hoursWorked: null,
          lessonsCount: payments.length,
          totalAmount: amount,
          periodStart,
          periodEnd: now,
          status: "PENDING",
          notes,
        }
        const existing = await tx.teacherSalary.findUnique({
          where: { teacherId_month_year: { teacherId: sec.id, month, year } },
        })
        if (existing) {
          await snapshotTeacherSalary(tx, existing.id, user.id)
          await tx.teacherSalary.update({ where: { id: existing.id }, data: salaryData })
        } else {
          await tx.teacherSalary.create({ data: salaryData })
        }
      }

      // La prochaine période commence exactement à cette clôture. Cette écriture
      // est dans la même transaction que les fiches pour éviter tout double compte.
      await tx.tenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, paymentPeriodStartAt: now },
        update: { paymentPeriodStartAt: now },
      })
    })
  }

  return NextResponse.json(results)
})
