import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getValidatedPaymentPeriodStart, getValidatedPaymentsForPeriod, validatedPaymentAmount, validatedPaymentDate } from "@/lib/payment-period"
import { selectSecretaryPayments } from "@/lib/secretary-payment-selection"
import { appendSecretaryPaymentDetails } from "@/lib/secretary-salary-details"
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

  const eligiblePayments = await getValidatedPaymentsForPeriod(tenantId, periodStart, now)
  const eligibleWithValidationDate = eligiblePayments.flatMap((payment) => {
    const validationDate = validatedPaymentDate(payment)
    return validationDate ? [{ ...payment, validationDate }] : []
  })
  let payments
  try {
    payments = selectSecretaryPayments(
      eligibleWithValidationDate,
      {
        startPaymentId: body.startPaymentId,
        endPaymentId: body.endPaymentId,
        excludedPaymentIds: Array.isArray(body.excludedPaymentIds) ? body.excludedPaymentIds.filter((id: unknown): id is string => typeof id === "string") : [],
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    return NextResponse.json({
      error: message === "PAYMENT_BOUNDARIES_REVERSED"
        ? "Le dernier paiement doit être postérieur au premier."
        : "Un paiement sélectionné n'est plus disponible. Recalculez la prévisualisation.",
    }, { status: 409 })
  }
  const endBoundary = body.endPaymentId
    ? eligibleWithValidationDate.find((payment) => payment.id === body.endPaymentId)?.validationDate
    : now
  if (!endBoundary) {
    return NextResponse.json({ error: "Le dernier paiement n'est plus disponible. Recalculez la prévisualisation." }, { status: 409 })
  }
  const periodEnd = endBoundary
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
  const summaryNotes = [
    `Commission secrétaire 10% sur ${collectedTotal.toFixed(2)} € de paiements validés pendant la période.`,
    `Période clôturée du ${periodStart.toLocaleString("fr-FR")} au ${periodEnd.toLocaleString("fr-FR")}.`,
    `${payments.length} paiement${payments.length > 1 ? "s" : ""} inclus.`,
    paymentLines.length > 0 ? `Détail :\n${paymentLines.join("\n")}` : "Aucun paiement inclus.",
  ].join("\n")
  const notes = appendSecretaryPaymentDetails(summaryNotes, payments.map((payment) => ({
    id: payment.id,
    paymentDate: payment.paidDate?.toISOString() ?? null,
    student: `${payment.student.firstName} ${payment.student.lastName}`.trim(),
    session: payment.lessonSession
      ? `${payment.lessonSession.subject} · session ${payment.lessonSession.number}`
      : payment.sessionNumber != null ? `Session ${payment.sessionNumber}` : null,
    amount: validatedPaymentAmount(payment),
    method: payment.method,
    validated: true,
    validationDate: payment.validationDate.toISOString(),
    reference: payment.reference,
  })))

  const results = secretaries.map((sec) => ({
      secretaryId: sec.id,
      secretaryName: sec.name,
      collectedTotal,
      rate,
      amount,
      paymentCount: payments.length,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      payments: payments.map((payment) => ({
        id: payment.id,
        student: `${payment.student.firstName} ${payment.student.lastName}`.trim(),
        amount: validatedPaymentAmount(payment),
        validationDate: payment.validationDate.toISOString(),
        reference: payment.reference,
      })),
  }))

  if (body.confirm) {
    if (payments.length === 0) {
      return NextResponse.json({ error: "Aucun paiement validé à clôturer sur cette période." }, { status: 400 })
    }
    const expectedIds: string[] = Array.isArray(body.expectedPaymentIds) ? body.expectedPaymentIds.filter((id: unknown): id is string => typeof id === "string") : []
    const selectedIds = payments.map((payment) => payment.id)
    if (expectedIds.length === 0 || expectedIds.length !== selectedIds.length || expectedIds.some((id, index) => id !== selectedIds[index]) || Number(body.expectedCollectedTotal) !== collectedTotal) {
      return NextResponse.json({ error: "La sélection ou le montant a changé depuis la prévisualisation. Recalculez avant de clôturer." }, { status: 409 })
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
          periodEnd,
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
        create: { tenantId, paymentPeriodStartAt: periodEnd },
        update: { paymentPeriodStartAt: periodEnd },
      })
    })
  }

  return NextResponse.json(results)
})
