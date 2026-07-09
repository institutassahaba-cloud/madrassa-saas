import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MONTHS_FR } from "@/lib/utils"
import { PAYMENT_PAID_STATUSES } from "@/lib/payment-status"
import { wrap } from "@/lib/api"

export const GET = wrap(async () => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Le chiffre d'affaires est réservé au directeur et à la secrétaire.
  // Les professeurs n'ont jamais accès aux chiffres (cf. dashboard/page.tsx).
  if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const tenantId = session.user.tenantId

  const year = new Date().getFullYear()

  const payments = await prisma.payment.findMany({
    where: { tenantId, status: { in: [...PAYMENT_PAID_STATUSES] } },
    select: { amount: true, receivedAmount: true, confirmedAt: true, paidDate: true, createdAt: true },
  })

  const data = Array.from({ length: 12 }, (_, i) => {
    const monthPayments = payments.filter((payment) => {
      const receivedAt = payment.confirmedAt ?? payment.paidDate ?? payment.createdAt
      return receivedAt.getFullYear() === year && receivedAt.getMonth() === i
    })
    return {
      month: MONTHS_FR[i].slice(0, 3),
      amount: monthPayments.reduce((sum, payment) => sum + Number(payment.receivedAmount ?? payment.amount ?? 0), 0),
    }
  })

  return NextResponse.json(data)
})
