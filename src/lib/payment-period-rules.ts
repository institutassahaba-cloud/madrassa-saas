export function getBillingCycleStart(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 25, 0, 0, 0, 0)
  if (now < start) start.setMonth(start.getMonth() - 1)
  return start
}

export function resolveValidatedPaymentPeriodStart({
  now,
  scanStartedAt,
  latestClosureAt,
  manualStartAt,
}: {
  now: Date
  scanStartedAt?: Date | null
  latestClosureAt?: Date | null
  manualStartAt?: Date | null
}) {
  const starts = [
    getBillingCycleStart(now),
    scanStartedAt ?? null,
    latestClosureAt ?? null,
    manualStartAt ?? null,
  ].filter((date): date is Date => Boolean(date))

  return starts.reduce((latest, date) => (date > latest ? date : latest))
}

export function validateRequestedPaymentPeriodStart({
  requestedAt,
  minimumStartAt,
  now,
}: {
  requestedAt: Date
  minimumStartAt: Date
  now: Date
}): "future" | "before-minimum" | null {
  if (requestedAt > now) return "future"
  if (requestedAt < minimumStartAt) return "before-minimum"
  return null
}
