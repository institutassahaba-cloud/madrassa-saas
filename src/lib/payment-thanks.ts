import { paymentThanksEmailHtml, sendComptaMail } from "@/lib/mail"

type PaymentThanksInput = {
  studentEmail?: string | null
  studentName: string
  teacherName?: string | null
  subject?: string | null
  amount: number
  paidDate?: Date | string | null
  method?: string | null
}

function formatAmount(amount: number) {
  return String(amount).replace(".", ",")
}

function formatPaidDate(date: Date | string | null | undefined) {
  if (!date) return new Date().toLocaleDateString("fr-FR")
  return new Date(date).toLocaleDateString("fr-FR")
}

export async function sendPaymentThanks(input: PaymentThanksInput) {
  if (!input.studentEmail) return { ok: false, reason: "no_student_email" }

  const html = paymentThanksEmailHtml({
    studentName: input.studentName,
    teacherName: input.teacherName || "—",
    subject: input.subject || "Cours",
    amount: formatAmount(input.amount),
    paidDate: formatPaidDate(input.paidDate),
    method: input.method || "Paiement",
  })

  return sendComptaMail({
    to: input.studentEmail,
    subject: "Paiement bien reçu — Institut As-Sahaba",
    html,
  })
}
