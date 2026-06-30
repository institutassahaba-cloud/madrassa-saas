import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { ensurePaymentMatchLabelColumn } from "@/lib/payment-match-schema"
import { ensurePaymentScanSettingsColumns } from "@/lib/payment-scan-settings-schema"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"
import { getEffectiveUser } from "@/lib/view-as"
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

  const [payments, students, teachers, lessonSessions, paymentMatches, autoPaymentMatches, pendingPayments, scanSettings] = await Promise.all([
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
      select: { id: true, studentId: true, teacherId: true, subject: true, number: true, isComplete: true },
      orderBy: [{ teacher: { name: "asc" } }, { student: { lastName: "asc" } }, { number: "asc" }],
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
    prisma.payment.findMany({
      where: { tenantId: user.tenantId, status: { in: ["EXPECTED", "EMAIL_SENT", "REMINDED", "PENDING"] } },
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
  ])

  return (
    <PaymentsClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payments={payments as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      students={students as any}
      teachers={teachers}
      lessonSessions={lessonSessions}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paymentMatches={paymentMatches as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoPaymentMatches={autoPaymentMatches as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingPayments={pendingPayments as any}
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
