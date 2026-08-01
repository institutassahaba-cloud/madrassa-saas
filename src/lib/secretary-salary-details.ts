export type SecretarySalaryPaymentDetail = {
  id?: string
  paymentDate: string | null
  student: string
  session: string | null
  amount: number
  method: string | null
  validated: boolean
  validationDate: string | null
  reference?: string | null
}

const DETAILS_MARKER = "[[SECRETARY_PAYMENT_DETAILS_V1]]"

export function appendSecretaryPaymentDetails(notes: string, payments: SecretarySalaryPaymentDetail[]) {
  return `${notes}\n${DETAILS_MARKER}${JSON.stringify(payments)}`
}

export function readSecretaryPaymentDetails(notes: string | null | undefined) {
  if (!notes) return { displayNotes: notes ?? null, payments: [] as SecretarySalaryPaymentDetail[] }
  const markerIndex = notes.indexOf(DETAILS_MARKER)
  if (markerIndex >= 0) {
    try {
      const payments = JSON.parse(notes.slice(markerIndex + DETAILS_MARKER.length)) as SecretarySalaryPaymentDetail[]
      return { displayNotes: notes.slice(0, markerIndex).trim() || null, payments: Array.isArray(payments) ? payments : [] }
    } catch {
      return { displayNotes: notes.slice(0, markerIndex).trim() || null, payments: [] as SecretarySalaryPaymentDetail[] }
    }
  }

  const detailStart = notes.indexOf("Détail :\n")
  if (detailStart < 0) return { displayNotes: notes, payments: [] as SecretarySalaryPaymentDetail[] }
  const header = notes.slice(0, detailStart).trim()
  const payments = notes.slice(detailStart + "Détail :\n".length).split("\n").flatMap((line) => {
    const parts = line.split(" · ")
    const amountIndex = parts.findIndex((part) => / €$/.test(part))
    if (amountIndex < 2) return []
    const amount = Number(parts[amountIndex].replace(" €", "").replace(",", "."))
    const validationPart = parts.find((part) => part.startsWith("validé le "))
    return [{
      paymentDate: parts[0] || null,
      student: parts.slice(1, amountIndex).join(" · "),
      session: null,
      amount: Number.isFinite(amount) ? amount : 0,
      method: parts[amountIndex + 1]?.startsWith("réf.") || parts[amountIndex + 1]?.startsWith("validé le") ? null : parts[amountIndex + 1] ?? null,
      validated: Boolean(validationPart),
      validationDate: validationPart?.slice("validé le ".length) ?? null,
      reference: parts.find((part) => part.startsWith("réf. "))?.slice(5) ?? null,
    }]
  })
  return { displayNotes: header || null, payments }
}
