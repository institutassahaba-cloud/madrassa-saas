import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { ids?: unknown }
  const rawIds = Array.isArray(body.ids) ? body.ids : []
  const ids = [...new Set(rawIds.flatMap((id) => typeof id === "string" && id.length > 0 ? [id] : []))]
  if (ids.length === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins un paiement validé." }, { status: 400 })
  }

  const now = new Date()
  const matches = await prisma.paymentMatch.findMany({
    where: {
      tenantId: user.tenantId,
      id: { in: ids },
      status: "CONFIRMED",
    },
    select: { id: true },
  })

  const allocations = await prisma.paymentAllocation.findMany({
    where: { paymentMatchId: { in: matches.map((match) => match.id) } },
    select: { paymentId: true },
  })
  const paymentIds = [...new Set(allocations.map((allocation) => allocation.paymentId))]

  await prisma.$transaction([
    prisma.paymentMatch.updateMany({
      where: { tenantId: user.tenantId, id: { in: matches.map((match) => match.id) }, status: "CONFIRMED" },
      data: { confirmedAt: now },
    }),
    ...(paymentIds.length > 0
      ? [prisma.payment.updateMany({
          where: { tenantId: user.tenantId, id: { in: paymentIds }, status: "CONFIRMED" },
          data: { confirmedAt: now },
        })]
      : []),
  ])

  return NextResponse.json({ ok: true, matches: matches.length, payments: paymentIds.length, confirmedAt: now })
})
