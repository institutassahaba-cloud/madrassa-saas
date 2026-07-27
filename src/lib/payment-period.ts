import { prisma } from "@/lib/prisma"
import { PAYMENT_PAID_STATUSES } from "@/lib/payment-status"
import { resolveValidatedPaymentPeriodStart } from "@/lib/payment-period-rules"

export { getBillingCycleStart } from "@/lib/payment-period-rules"

async function getValidatedPaymentPeriodSources(tenantId: string) {
  return Promise.all([
    prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { paymentScanStartedAt: true, paymentPeriodStartAt: true },
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
  ] as const)
}

export async function getValidatedPaymentPeriodStart(tenantId: string, now = new Date()) {
  const [scanSettings, latestSecretarySalary] = await getValidatedPaymentPeriodSources(tenantId)

  // Une clôture est une borne définitive : un ancien override manuel ne doit
  // jamais permettre de recompter des paiements déjà clôturés.
  return resolveValidatedPaymentPeriodStart({
    now,
    scanStartedAt: scanSettings?.paymentScanStartedAt,
    latestClosureAt: latestSecretarySalary?.periodEnd,
    manualStartAt: scanSettings?.paymentPeriodStartAt,
  })
}

// Borne minimale indépendante de l'override manuel actuel. Elle permet à la
// route de refuser explicitement une date qui recompterait un cycle ou une
// clôture déjà terminés, tout en autorisant de corriger un override trop récent.
export async function getValidatedPaymentPeriodFloor(tenantId: string, now = new Date()) {
  const [scanSettings, latestSecretarySalary] = await getValidatedPaymentPeriodSources(tenantId)
  return resolveValidatedPaymentPeriodStart({
    now,
    scanStartedAt: scanSettings?.paymentScanStartedAt,
    latestClosureAt: latestSecretarySalary?.periodEnd,
    manualStartAt: null,
  })
}

// Indique si la période courante est un override manuel (pour l'UI : label +
// bouton « Réinitialiser »).
export async function getManualPeriodStart(tenantId: string): Promise<Date | null> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { paymentPeriodStartAt: true },
  })
  return settings?.paymentPeriodStartAt ?? null
}

export function validatedPaymentAmount(payment: { amount?: number | null; receivedAmount?: number | null }) {
  return Number(payment.receivedAmount ?? payment.amount ?? 0)
}

export async function getValidatedPaymentsForPeriod(tenantId: string, periodStart: Date, periodEnd = new Date()) {
  return prisma.payment.findMany({
    where: {
      tenantId,
      status: { in: [...PAYMENT_PAID_STATUSES] },
      OR: [
        { confirmedAt: { gt: periodStart, lte: periodEnd } },
        { confirmedAt: null, paidDate: { gt: periodStart, lte: periodEnd } },
      ],
      AND: [{ OR: [{ lessonSessionId: { not: null } }, { sessionNumber: { not: null } }] }],
    },
    select: {
      id: true,
      amount: true,
      receivedAmount: true,
      method: true,
      reference: true,
      paidDate: true,
      confirmedAt: true,
      createdAt: true,
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" },
  })
}

export async function getValidatedPaymentSummary(tenantId: string, periodStart: Date, periodEnd = new Date()) {
  const payments = await getValidatedPaymentsForPeriod(tenantId, periodStart, periodEnd)
  return {
    count: payments.length,
    total: +payments.reduce((sum, payment) => sum + validatedPaymentAmount(payment), 0).toFixed(2),
  }
}
