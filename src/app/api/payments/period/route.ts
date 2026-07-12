import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensurePaymentScanSettingsColumns } from "@/lib/payment-scan-settings-schema"
import { wrap } from "@/lib/api"

// Définit (ou réinitialise) le début manuel de la « période en cours ».
// - { startAt: ISO }  → la période courante démarre juste avant cette date
//   (le paiement pointé et tous les suivants sont comptés).
// - { reset: true }    → retour au calcul automatique (25 du mois, etc.).
export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "DIRECTOR") return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  await ensurePaymentScanSettingsColumns()

  let paymentPeriodStartAt: Date | null
  if (body.reset === true) {
    paymentPeriodStartAt = null
  } else {
    const parsed = new Date(body.startAt)
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Date invalide." }, { status: 400 })
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

  return NextResponse.json({ paymentPeriodStartAt: settings.paymentPeriodStartAt })
})
