import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MONTHS_FR } from "@/lib/utils"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tenantId = (session.user as any).tenantId

  const year = new Date().getFullYear()

  const payments = await prisma.payment.groupBy({
    by: ["month", "year"],
    where: { tenantId, status: "PAID", year },
    _sum: { amount: true },
    orderBy: { month: "asc" },
  })

  const data = Array.from({ length: 12 }, (_, i) => {
    const found = payments.find((p: any) => p.month === i + 1)
    return {
      month: MONTHS_FR[i].slice(0, 3),
      amount: found ? Number(found._sum.amount ?? 0) : 0,
    }
  })

  return NextResponse.json(data)
}
