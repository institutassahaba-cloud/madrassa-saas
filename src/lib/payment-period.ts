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
  ])

  // Override manuel : si le directeur a pointé un paiement précis comme départ
  // de la période en cours, il fait autorité (il peut être plus ancien ou plus
  // récent que le calcul auto). « Réinitialiser » remet ce champ à null.
  if (scanSettings?.paymentPeriodStartAt) return scanSettings.paymentPeriodStartAt

  const starts = [
    getBillingCycleStart(now),
    scanSettings?.paymentScanStartedAt ?? null,
    latestSecretarySalary?.periodEnd ?? null,
  ].filter((date): date is Date => Boolean(date))

  return starts.reduce((latest, date) => (date > latest ? date : latest))
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
