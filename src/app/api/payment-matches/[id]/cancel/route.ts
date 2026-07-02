import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { forgetLearnedPaymentAlias } from "@/lib/student-payment-aliases"
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

  // Tous les paiements liés à ce relevé partagent sa référence provider.
  const payments = await prisma.payment.findMany({
    where: { tenantId: user.tenantId, reference: match.gmailMessageId, status: "CONFIRMED" },
    select: { id: true, studentId: true },
  })
  const studentIds = new Set(payments.map((p) => p.studentId))
  // Créés par une validation manuelle (ont une allocation) → supprimer.
  const toDelete = payments.filter((p) => allocationPaymentIds.has(p.id)).map((p) => p.id)
  // Demandes préexistantes auto-validées (sans allocation) → remettre en attente.
  const toRevert = payments.filter((p) => !allocationPaymentIds.has(p.id)).map((p) => p.id)

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
  ])

  for (const studentId of studentIds) {
    await forgetLearnedPaymentAlias(user.tenantId, studentId, match.detectedPayerName)
      .catch((err) => console.error("[alias] oubli échoué:", err))
  }

  return NextResponse.json({ ok: true, deleted: toDelete.length, reverted: toRevert.length })
})
