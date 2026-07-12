import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { learnDirectorPayerAlias } from "@/lib/director-payer-alias"
import { wrap } from "@/lib/api"

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const action = body.action

  const match = await prisma.paymentMatch.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, status: true, source: true, detectedPayerName: true },
  })
  if (!match) return NextResponse.json({ error: "Paiement détecté introuvable." }, { status: 404 })

  if (action === "trash") {
    if (match.status !== "TO_VERIFY") {
      return NextResponse.json({ error: "Seuls les paiements non traités peuvent être mis à la corbeille." }, { status: 400 })
    }
    await prisma.paymentMatch.update({ where: { id }, data: { status: "TRASHED" } })
    return NextResponse.json({ ok: true, status: "TRASHED" })
  }

  if (action === "director") {
    if (match.status !== "TO_VERIFY") {
      return NextResponse.json({ error: "Seuls les paiements non traités peuvent être marqués pour le directeur." }, { status: 400 })
    }
    await prisma.paymentMatch.update({ where: { id }, data: { status: "DIRECTOR" } })
    await learnDirectorPayerAlias(user.tenantId, match.source, match.detectedPayerName)
      .catch((err) => console.error("[director-alias] apprentissage échoué:", err))
    return NextResponse.json({ ok: true, status: "DIRECTOR" })
  }

  if (action === "restore") {
    if (match.status !== "TRASHED" && match.status !== "DIRECTOR") {
      return NextResponse.json({ error: "Ce paiement n'est pas dans la corbeille ni marqué pour le directeur." }, { status: 400 })
    }
    await prisma.paymentMatch.update({ where: { id }, data: { status: "TO_VERIFY" } })
    return NextResponse.json({ ok: true, status: "TO_VERIFY" })
  }

  if (action === "delete") {
    // Suppression DÉFINITIVE, réservée aux paiements en corbeille (jamais un
    // paiement validé/directeur/à associer). Pas d'allocation à ce stade.
    if (match.status !== "TRASHED") {
      return NextResponse.json({ error: "Seuls les paiements en corbeille peuvent être supprimés définitivement." }, { status: 400 })
    }
    await prisma.paymentMatch.delete({ where: { id } })
    return NextResponse.json({ ok: true, deleted: true })
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
})
