export type SelectableSecretaryPayment = {
  id: string
  validationDate: Date
}

export function selectSecretaryPayments<T extends SelectableSecretaryPayment>(
  payments: T[],
  options: { startPaymentId?: string | null; endPaymentId?: string | null; excludedPaymentIds?: string[] },
) {
  const ordered = [...payments].sort((a, b) =>
    a.validationDate.getTime() - b.validationDate.getTime() || a.id.localeCompare(b.id)
  )
  const startIndex = options.startPaymentId ? ordered.findIndex((payment) => payment.id === options.startPaymentId) : 0
  const endIndex = options.endPaymentId ? ordered.findIndex((payment) => payment.id === options.endPaymentId) : ordered.length - 1

  if (startIndex < 0 || endIndex < 0) throw new Error("PAYMENT_BOUNDARY_NOT_FOUND")
  if (startIndex > endIndex) throw new Error("PAYMENT_BOUNDARIES_REVERSED")

  const excluded = new Set(options.excludedPaymentIds ?? [])
  return ordered.slice(startIndex, endIndex + 1).filter((payment) => !excluded.has(payment.id))
}
