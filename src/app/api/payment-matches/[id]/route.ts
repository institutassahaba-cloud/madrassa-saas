import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { learnDirectorPayerAlias } from "@/lib/director-payer-alias"
import { ensurePaymentMatchAttributedSessionColumn } from "@/lib/payment-match-schema"
import { wrap } from "@/lib/api"

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const action = body.action
  await ensurePaymentMatchAttributedSessionColumn()

  const match = await prisma.paymentMatch.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, status: true, source: true, detectedPayerName: true },
  })
  if (!match) return NextResponse.json({ error: "Paiement détecté introuvable." }, { status: 404 })

  if (action === "not_institute" || action === "trash") {
    if (match.status !== "TO_VERIFY") {
      return NextResponse.json({ error: "Seuls les paiements à associer peuvent être classés hors institut." }, { status: 400 })
    }
    await prisma.paymentMatch.update({
      where: { id },
      data: { status: "NOT_INSTITUTE", reason: "Ce paiement ne concerne pas l'institut." },
    })
    return NextResponse.json({ ok: true, status: "NOT_INSTITUTE" })
  }

  if (action === "already_attributed") {
    if (match.status !== "TO_VERIFY") {
      return NextResponse.json({ error: "Seuls les paiements à associer peuvent être marqués déjà attribués." }, { status: 400 })
    }
    const studentId = typeof body.studentId === "string" ? body.studentId : ""
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
    const lessonSession = await prisma.lessonSession.findFirst({
      where: { id: sessionId, studentId, tenantId: user.tenantId },
      select: { id: true },
    })
    if (!lessonSession) {
      return NextResponse.json({ error: "Choisissez un élève et une session valides." }, { status: 400 })
    }
    await prisma.paymentMatch.update({
      where: { id },
      data: {
        status: "ALREADY_ATTRIBUTED",
        studentId,
        attributedSessionId: lessonSession.id,
        reason: "Paiement déjà attribué et comptabilisé auparavant.",
      },
    })
    return NextResponse.json({ ok: true, status: "ALREADY_ATTRIBUTED" })
  }

  if (action === "director") {
    if (match.status !== "TO_VERIFY") {
      return NextResponse.json({ error: "Seuls les paiements à associer peuvent être classés en élèves du directeur." }, { status: 400 })
    }
    await prisma.paymentMatch.update({ where: { id }, data: { status: "DIRECTOR" } })
    await learnDirectorPayerAlias(user.tenantId, match.source, match.detectedPayerName)
      .catch((err) => console.error("[director-alias] apprentissage échoué:", err))
    return NextResponse.json({ ok: true, status: "DIRECTOR" })
  }

  if (action === "restore") {
    if (!["TRASHED", "NOT_INSTITUTE", "ALREADY_ATTRIBUTED", "DIRECTOR"].includes(match.status)) {
      return NextResponse.json({ error: "Ce paiement ne peut pas être remis dans les paiements à associer." }, { status: 400 })
    }
    await prisma.paymentMatch.update({
      where: { id },
      data: { status: "TO_VERIFY", attributedSessionId: null, reason: "Paiement restauré, à associer." },
    })
    return NextResponse.json({ ok: true, status: "TO_VERIFY" })
  }

  if (action === "delete") {
    // On conserve une empreinte invisible au lieu d'effacer la ligne : l'ID Gmail
    // reste ainsi connu et le scan récurrent ne recrée pas le paiement supprimé.
    if (!["TO_VERIFY", "TRASHED", "NOT_INSTITUTE"].includes(match.status)) {
      return NextResponse.json({ error: "Ce paiement ne peut pas être supprimé." }, { status: 400 })
    }
    await prisma.paymentMatch.update({
      where: { id },
      data: { status: "DELETED", studentId: null, attributedSessionId: null, score: null, reason: "Paiement supprimé par le directeur." },
    })
    return NextResponse.json({ ok: true, deleted: true })
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
})
