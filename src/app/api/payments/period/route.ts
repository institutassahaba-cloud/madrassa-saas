import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensurePaymentScanSettingsColumns } from "@/lib/payment-scan-settings-schema"
import { getValidatedPaymentPeriodFloor, getValidatedPaymentPeriodStart, getValidatedPaymentSummary } from "@/lib/payment-period"
import { validateRequestedPaymentPeriodStart } from "@/lib/payment-period-rules"
import { wrap } from "@/lib/api"

// Définit (ou réinitialise) le début manuel de la « période en cours ».
// - { startAt: ISO }  → la période courante démarre juste avant cette date
//   (la date ou le paiement pointé et tous les suivants sont comptés).
// - { reset: true }    → retour au calcul automatique (25 du mois, etc.).
export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "DIRECTOR") return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  await ensurePaymentScanSettingsColumns()
  const now = new Date()

  let paymentPeriodStartAt: Date | null
  if (body.reset === true) {
    paymentPeriodStartAt = null
  } else {
    const parsed = new Date(body.startAt)
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Date invalide." }, { status: 400 })
    }
    const minimumStartAt = await getValidatedPaymentPeriodFloor(session.user.tenantId, now)
    const rejection = validateRequestedPaymentPeriodStart({ requestedAt: parsed, minimumStartAt, now })
    if (rejection === "future") {
      return NextResponse.json({ error: "La période ne peut pas commencer dans le futur." }, { status: 400 })
    }
    if (rejection === "before-minimum") {
      return NextResponse.json({
        error: `Cette date précède une période déjà ouverte ou clôturée. La borne minimale est le ${minimumStartAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}. Si elle tombe en cours de journée, choisissez le lendemain ou sélectionnez directement un paiement postérieur.`,
        minimumStartAt: minimumStartAt.toISOString(),
      }, { status: 409 })
    }
    // On borne 1 ms AVANT le paiement choisi pour que celui-ci soit inclus
    // (le filtre utilise « date > début », strictement supérieur).
    paymentPeriodStartAt = new Date(parsed.getTime() - 1)
  }

  const settings = await prisma.tenantSettings.upsert({
    where: { tenantId: session.user.tenantId },
    create: { tenantId: session.user.tenantId, paymentPeriodStartAt },
    update: { paymentPeriodStartAt },
    select: { paymentPeriodStartAt: true },
  })

  const effectiveStartAt = await getValidatedPaymentPeriodStart(session.user.tenantId, now)
  if (body.reset !== true && new Date(body.startAt).getTime() < effectiveStartAt.getTime()) {
    return NextResponse.json({
      error: "La période a été clôturée ou déplacée pendant la modification. Rechargez les données puis réessayez.",
      minimumStartAt: effectiveStartAt.toISOString(),
    }, { status: 409 })
  }

  // Source unique de vérité : le récapitulatif et la clôture doivent interroger
  // exactement toute la base, et non le sous-ensemble de paiements chargé dans
  // le navigateur pour l'historique.
  const summary = await getValidatedPaymentSummary(session.user.tenantId, effectiveStartAt, now)

  return NextResponse.json({
    paymentPeriodStartAt: effectiveStartAt,
    isManual: settings.paymentPeriodStartAt?.getTime() === effectiveStartAt.getTime(),
    summary,
  })
})
