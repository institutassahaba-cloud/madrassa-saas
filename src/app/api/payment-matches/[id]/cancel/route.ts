import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { forgetLearnedPaymentAlias } from "@/lib/student-payment-aliases"
import { DIRECTOR_REMAINDER_SUFFIX } from "@/lib/director-payer-alias"
import { wrap } from "@/lib/api"

// Annulation d'un paiement confirmé → ré-attribuable.
// Le statut « payé » d'une session dérive du Payment CONFIRMED lié : on retire
// donc ces paiements pour que les sessions concernées redeviennent « non payées ».
// Le match repart en TO_VERIFY (réapparaît dans « à valider »). L'alias APPRIS
// de cette attribution (source CONFIRMED) est oublié pour ne pas répéter une
// erreur ; les alias saisis à la main / importés sont préservés.
export const POST = wrap(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const match = await prisma.paymentMatch.findFirst({
    where: { id, tenantId: user.tenantId, status: { in: ["CONFIRMED", "AUTO_CONFIRMED"] } },
    include: { allocations: true },
  })
  if (!match) return NextResponse.json({ error: "Paiement confirmé introuvable." }, { status: 404 })

  const allocationPaymentIds = new Set(match.allocations.map((a) => a.paymentId))

  const payments = await prisma.payment.findMany({
    where: { tenantId: user.tenantId, id: { in: [...allocationPaymentIds] }, status: "CONFIRMED" },
    select: { id: true, studentId: true },
  })
  const studentIds = new Set(payments.map((p) => p.studentId))
  const paymentIds = payments.map((p) => p.id)
  // AUTO_CONFIRMED valide une demande existante : on la remet en attente.
  // CONFIRMED manuel / nouvel élève crée des paiements dédiés : on les supprime.
  const toRevert = match.status === "AUTO_CONFIRMED" ? paymentIds : []
  const toDelete = match.status === "AUTO_CONFIRMED" ? [] : paymentIds

  await prisma.$transaction([
    prisma.paymentAllocation.deleteMany({ where: { paymentMatchId: match.id } }),
    ...(toDelete.length
      ? [prisma.payment.deleteMany({ where: { id: { in: toDelete }, tenantId: user.tenantId } })]
      : []),
    ...(toRevert.length
      ? [prisma.payment.updateMany({
          where: { id: { in: toRevert }, tenantId: user.tenantId },
          data: {
            status: "EXPECTED",
            paidDate: null,
            method: null,
            reference: null,
            source: "MANUAL",
            receivedAmount: null,
            detectedPayerName: null,
            confirmedAt: null,
          },
        })]
      : []),
    prisma.paymentMatch.update({
      where: { id: match.id },
      data: { status: "TO_VERIFY", confirmedAt: null },
    }),
    // La part « directeur » créée lors de la validation repart avec elle :
    // la ré-attribution repart du montant total reçu.
    prisma.paymentMatch.deleteMany({
      where: { tenantId: user.tenantId, gmailMessageId: `${match.gmailMessageId}${DIRECTOR_REMAINDER_SUFFIX}`, status: "DIRECTOR" },
    }),
  ])

  for (const studentId of studentIds) {
    await forgetLearnedPaymentAlias(user.tenantId, studentId, match.detectedPayerName)
      .catch((err) => console.error("[alias] oubli échoué:", err))
  }

  return NextResponse.json({ ok: true, deleted: toDelete.length, reverted: toRevert.length })
})
