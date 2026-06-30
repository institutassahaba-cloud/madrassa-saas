import { prisma } from "@/lib/prisma"

let paymentAliasSchemaReady: Promise<void> | null = null

async function execIgnoreExisting(sql: string) {
  await prisma.$executeRawUnsafe(sql).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/duplicate column|already exists|index .* already exists/i.test(message)) return
    throw error
  })
}

export function ensurePaymentAliasSchema() {
  paymentAliasSchemaReady ??= Promise.all([
    execIgnoreExisting(`
      CREATE TABLE IF NOT EXISTS "PaymentAlias" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "studentId" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'ANY',
        "alias" TEXT NOT NULL,
        "normalized" TEXT NOT NULL,
        "source" TEXT NOT NULL DEFAULT 'MANUAL',
        "confidence" TEXT NOT NULL DEFAULT 'EXACT',
        "lastSeenAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PaymentAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "PaymentAlias_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `),
    execIgnoreExisting('CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAlias_tenantId_studentId_type_normalized_key" ON "PaymentAlias" ("tenantId", "studentId", "type", "normalized")'),
    execIgnoreExisting('CREATE INDEX IF NOT EXISTS "PaymentAlias_tenantId_normalized_idx" ON "PaymentAlias" ("tenantId", "normalized")'),
    execIgnoreExisting('CREATE INDEX IF NOT EXISTS "PaymentAlias_tenantId_type_idx" ON "PaymentAlias" ("tenantId", "type")'),
  ]).then(() => undefined)

  return paymentAliasSchemaReady
}

export function normalizePaymentAlias(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
}
