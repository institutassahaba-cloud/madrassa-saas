import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensurePaymentMatchLabelColumn } from "@/lib/payment-match-schema"
import { ensurePaymentScanSettingsColumns } from "@/lib/payment-scan-settings-schema"
import { scanPaymentEmails } from "@/lib/payment-email-reader"
import { wrap } from "@/lib/api"

function isAuthorized(req: Request) {
  const secret = process.env.PAYMENT_SCAN_SECRET || process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = req.headers.get("authorization")
  return authHeader === `Bearer ${secret}`
}

export const GET = wrap(async (req: Request) => {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensurePaymentMatchLabelColumn()
  await ensurePaymentScanSettingsColumns()

  const settings = await prisma.tenantSettings.findMany({
    where: {
      gmailRefreshToken: { not: null },
      paymentScanEnabled: true,
      paymentScanStartedAt: { not: null },
    },
    select: { tenantId: true, paymentScanStartedAt: true, paymentScanLastRunAt: true },
  })

  const results = []
  for (const setting of settings) {
    let lastError: string | null = null
    let succeeded = false
    try {
      // Chevauchement de 10 minutes pour ne rater aucun mail en cas de retard
      // Gmail, sans rescanner toute la période à chaque passage du cron.
      const overlapStart = setting.paymentScanLastRunAt
        ? new Date(setting.paymentScanLastRunAt.getTime() - 10 * 60 * 1000)
        : setting.paymentScanStartedAt
      const startedAt = overlapStart && setting.paymentScanStartedAt && overlapStart < setting.paymentScanStartedAt
        ? setting.paymentScanStartedAt
        : overlapStart
      const result = await scanPaymentEmails(setting.tenantId, { startedAt })
      results.push({ tenantId: setting.tenantId, ...result })
      succeeded = true
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Lecture Gmail impossible."
      results.push({ tenantId: setting.tenantId, ok: false, error: lastError })
    }
    // Santé du scan : visible sur la page Paiements pour éviter les pannes silencieuses
    // (ex: jeton Gmail expiré → « invalid_grant » alors que le cron répond 200 à l'Apps Script).
    await prisma.tenantSettings.update({
      where: { tenantId: setting.tenantId },
      data: {
        ...(succeeded ? { paymentScanLastRunAt: new Date() } : {}),
        paymentScanLastError: lastError,
      },
    }).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    scannedTenants: settings.length,
    results,
  })
})
