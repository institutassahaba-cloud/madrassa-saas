export function paymentProviderReference(match: {
  gmailMessageId: string
  paymentReference?: string | null
}) {
  return match.paymentReference || `gmail:${match.gmailMessageId}`
}

