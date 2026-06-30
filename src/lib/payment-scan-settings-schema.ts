import { prisma } from "@/lib/prisma"

let paymentScanSettingsReady: Promise<void> | null = null

async function addColumn(sql: string) {
  await prisma.$executeRawUnsafe(sql).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/duplicate column|already exists/i.test(message)) return
    throw error
  })
}

export function ensurePaymentScanSettingsColumns() {
  paymentScanSettingsReady ??= Promise.all([
    addColumn('ALTER TABLE "TenantSettings" ADD COLUMN "paymentScanEnabled" BOOLEAN NOT NULL DEFAULT false'),
    addColumn('ALTER TABLE "TenantSettings" ADD COLUMN "paymentScanStartedAt" DATETIME'),
  ]).then(() => undefined)

  return paymentScanSettingsReady
}
