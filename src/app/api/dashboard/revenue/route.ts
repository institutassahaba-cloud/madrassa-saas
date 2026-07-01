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

  const payments = await prisma.payment.groupBy({
    by: ["month", "year"],
    where: { tenantId, status: { in: [...PAYMENT_PAID_STATUSES] }, year, paidDate: { lte: new Date() } },
    _sum: { amount: true },
    orderBy: { month: "asc" },
  })

  const data = Array.from({ length: 12 }, (_, i) => {
    const found = payments.find((p) => p.month === i + 1)
    return {
      month: MONTHS_FR[i].slice(0, 3),
      amount: found ? Number(found._sum.amount ?? 0) : 0,
    }
  })

  return NextResponse.json(data)
})
