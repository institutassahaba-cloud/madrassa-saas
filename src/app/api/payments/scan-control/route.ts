import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensurePaymentScanSettingsColumns } from "@/lib/payment-scan-settings-schema"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await ensurePaymentScanSettingsColumns()
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: session.user.tenantId },
    select: { paymentScanEnabled: true, paymentScanStartedAt: true },
  })

  return NextResponse.json({
    enabled: Boolean(settings?.paymentScanEnabled),
    startedAt: settings?.paymentScanStartedAt ?? null,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const action = body.action === "pause" ? "pause" : "activate"
  await ensurePaymentScanSettingsColumns()

  const startedAt = new Date()
  const data = action === "pause"
    ? { paymentScanEnabled: false }
    : { paymentScanEnabled: true, paymentScanStartedAt: startedAt }

  const settings = await prisma.tenantSettings.upsert({
    where: { tenantId: session.user.tenantId },
    create: { tenantId: session.user.tenantId, ...data },
    update: data,
    select: { paymentScanEnabled: true, paymentScanStartedAt: true },
  })

  if (action === "activate") {
    await prisma.paymentMatch.updateMany({
      where: {
        tenantId: session.user.tenantId,
        status: "TO_VERIFY",
        createdAt: { lt: startedAt },
      },
      data: {
        status: "REJECTED",
        reason: "Ignoré : paiement détecté avant l'activation officielle du scan automatique.",
      },
    })
  }

  return NextResponse.json({
    enabled: settings.paymentScanEnabled,
    startedAt: settings.paymentScanStartedAt,
  })
}
