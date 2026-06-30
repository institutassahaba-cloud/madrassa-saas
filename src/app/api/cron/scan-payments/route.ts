import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensurePaymentMatchLabelColumn } from "@/lib/payment-match-schema"
import { scanPaymentEmails } from "@/lib/payment-email-reader"

function isAuthorized(req: Request) {
  const secret = process.env.PAYMENT_SCAN_SECRET || process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = req.headers.get("authorization")
  const url = new URL(req.url)
  return authHeader === `Bearer ${secret}` || url.searchParams.get("secret") === secret
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensurePaymentMatchLabelColumn()

  const settings = await prisma.tenantSettings.findMany({
    where: { gmailRefreshToken: { not: null } },
    select: { tenantId: true },
  })

  const results = []
  for (const setting of settings) {
    try {
      const result = await scanPaymentEmails(setting.tenantId)
      results.push({ tenantId: setting.tenantId, ...result })
    } catch (error) {
      results.push({
        tenantId: setting.tenantId,
        ok: false,
        error: error instanceof Error ? error.message : "Lecture Gmail impossible.",
      })
    }
  }

  return NextResponse.json({
    ok: true,
    scannedTenants: settings.length,
    results,
  })
}
