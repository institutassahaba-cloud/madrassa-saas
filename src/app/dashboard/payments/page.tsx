import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { ensurePaymentMatchLabelColumn } from "@/lib/payment-match-schema"
import { ensurePaymentScanSettingsColumns } from "@/lib/payment-scan-settings-schema"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"
import { getEffectiveUser } from "@/lib/view-as"
import { PAYMENT_AWAITING_STATUSES } from "@/lib/payment-status"
import { PaymentsClient } from "./payments-client"

export default async function PaymentsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (user.role === "TEACHER") redirect("/dashboard")
  await ensurePaymentMatchLabelColumn()
  await ensurePaymentScanSettingsColumns()
  await ensureStudentPaymentColumns()

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [payments, students, teachers, lessonSessions, sessionPayments, paymentMatches, autoPaymentMatches, confirmedPaymentMatches, trashedPaymentMatches, directorPaymentMatches, pendingPayments, scanSettings, salaryPeriods] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId: user.tenantId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, paymentGraceAllowed: true, group: { select: { name: true, teacherId: true } } } },
        lessonSession: { select: { id: true, number: true, subject: true, teacherId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.student.findMany({
      where: { tenantId: user.tenantId, status: "ACTIVE" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        monthlyFee: true,
        payerName: true,
        paymentType: true,
        group: { select: { teacherId: true, name: true } },
      },
      orderBy: { lastName: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.lessonSession.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, studentId: true, teacherId: true, subject: true, number: true, isComplete: true, frequency: true, duration: true, paymentRequestedAt: true },
      orderBy: [{ teacher: { name: "asc" } }, { student: { lastName: "asc" } }, { number: "asc" }],
    }),
    // Paiements par session → sert uniquement à calculer paidBySession (date + statut, jamais le montant).
    prisma.payment.findMany({
      where: { tenantId: user.tenantId, sessionNumber: { not: null }, status: { not: "REJECTED" } },
      select: { studentId: true, sessionNumber: true, paidDate: true },
    }),
    prisma.paymentMatch.findMany({
      where: { tenantId: user.tenantId, status: "TO_VERIFY" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, monthlyFee: true, payerName: true, paymentType: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.paymentMatch.findMany({
      where: { tenantId: user.tenantId, status: "AUTO_CONFIRMED" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, monthlyFee: true, payerName: true, paymentType: true } },
      },
      orderBy: { confirmedAt: "desc" },
      take: 30,
    }),
    prisma.paymentMatch.findMany({
      where: { tenantId: user.tenantId, status: "CONFIRMED" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, monthlyFee: true, payerName: true, paymentType: true } },
      },
      orderBy: { confirmedAt: "desc" },
      take: 30,
    }),
    prisma.paymentMatch.findMany({
      where: { tenantId: user.tenantId, status: "TRASHED" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, monthlyFee: true, payerName: true, paymentType: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.paymentMatch.findMany({
      where: { tenantId: user.tenantId, status: "DIRECTOR" },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, monthlyFee: true, payerName: true, paymentType: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.payment.findMany({
      where: { tenantId: user.tenantId, status: { in: [...PAYMENT_AWAITING_STATUSES] } },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, group: { select: { name: true, teacherId: true } } } },
        lessonSession: { select: { id: true, number: true, subject: true, teacherId: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId: user.tenantId },
      select: { paymentScanEnabled: true, paymentScanStartedAt: true },
    }),
    prisma.teacherSalary.findMany({
      where: { tenantId: user.tenantId, periodStart: { not: null }, periodEnd: { not: null } },
      select: { periodStart: true, periodEnd: true, createdAt: true },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    }),
  ])

  // Clé "studentId:sessionNumber" -> date du paiement le plus récent.
  const paidBySession: Record<string, string> = {}
  for (const p of sessionPayments) {
    if (!p.paidDate) continue
    const key = `${p.studentId}:${p.sessionNumber}`
    const iso = p.paidDate.toISOString()
    if (!paidBySession[key] || iso > paidBySession[key]) paidBySession[key] = iso
  }

  const periodMap = new Map<string, { id: string; label: string; start: string | null; end: string | null; isCurrent?: boolean }>()
  let latestPeriodEnd: Date | null = null
  for (const salary of salaryPeriods) {
    if (!salary.periodStart || !salary.periodEnd) continue
    if (!latestPeriodEnd || salary.periodEnd > latestPeriodEnd) latestPeriodEnd = salary.periodEnd
    const start = salary.periodStart.toISOString()
    const end = salary.periodEnd.toISOString()
    const key = `${start}__${end}`
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        id: key,
        start,
        end,
        label: `${salary.periodStart.toLocaleDateString("fr-FR")} → ${salary.periodEnd.toLocaleDateString("fr-FR")}`,
      })
    }
  }
  const paymentPeriods = [
    {
      id: "CURRENT",
      start: scanSettings?.paymentScanStartedAt?.toISOString() ?? null,
      end: null,
      isCurrent: true,
      label: "Période en cours",
    },
    ...Array.from(periodMap.values()),
  ]

  return (
    <PaymentsClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payments={payments as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      students={students as any}
      teachers={teachers}
      lessonSessions={lessonSessions}
      paidBySession={paidBySession}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paymentMatches={paymentMatches as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoPaymentMatches={autoPaymentMatches as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      confirmedPaymentMatches={confirmedPaymentMatches as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trashedPaymentMatches={trashedPaymentMatches as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      directorPaymentMatches={directorPaymentMatches as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingPayments={pendingPayments as any}
      paymentPeriods={paymentPeriods}
      currentMonth={month}
      currentYear={year}
      isDirector={user.role === "DIRECTOR"}
      scanControl={{
        enabled: Boolean(scanSettings?.paymentScanEnabled),
        startedAt: scanSettings?.paymentScanStartedAt?.toISOString() ?? null,
      }}
    />
  )
}
