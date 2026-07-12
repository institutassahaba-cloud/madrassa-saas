import { prisma } from "@/lib/prisma"

export function getBillingCycleStart(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 25, 0, 0, 0, 0)
  if (now < start) start.setMonth(start.getMonth() - 1)
  return start
}

export async function getValidatedPaymentPeriodStart(tenantId: string, now = new Date()) {
  const [scanSettings, latestSecretarySalary] = await Promise.all([
    prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { paymentScanStartedAt: true },
    }),
    prisma.teacherSalary.findFirst({
      where: {
        tenantId,
        periodEnd: { not: null },
        teacher: { role: "SECRETARY" },
      },
      select: { periodEnd: true },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    }),
  ])

  const starts = [
    getBillingCycleStart(now),
    scanSettings?.paymentScanStartedAt ?? null,
    latestSecretarySalary?.periodEnd ?? null,
  ].filter((date): date is Date => Boolean(date))

  return starts.reduce((latest, date) => (date > latest ? date : latest))
}

export function validatedPaymentAmount(payment: { amount?: number | null; receivedAmount?: number | null }) {
  return Number(payment.receivedAmount ?? payment.amount ?? 0)
}
