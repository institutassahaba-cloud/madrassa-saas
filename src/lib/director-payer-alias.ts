import { prisma } from "@/lib/prisma"
import { normalizePaymentAlias } from "@/lib/payment-alias-schema"

// Suffixe de la référence (gmailMessageId) du PaymentMatch créé pour la part
// « directeur » d'un virement partiellement alloué à des sessions.
export const DIRECTOR_REMAINDER_SUFFIX = "#directeur"

let directorPayerAliasSchemaReady: Promise<void> | null = null

async function execIgnoreExisting(sql: string) {
  await prisma.$executeRawUnsafe(sql).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/duplicate column|already exists|index .* already exists/i.test(message)) return
    throw error
  })
}

export function ensureDirectorPayerAliasSchema() {
  directorPayerAliasSchemaReady ??= Promise.all([
    execIgnoreExisting(`
      CREATE TABLE IF NOT EXISTS "DirectorPayerAlias" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'ANY',
        "alias" TEXT NOT NULL,
        "normalized" TEXT NOT NULL,
        "lastSeenAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DirectorPayerAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `),
    execIgnoreExisting('CREATE UNIQUE INDEX IF NOT EXISTS "DirectorPayerAlias_tenantId_type_normalized_key" ON "DirectorPayerAlias" ("tenantId", "type", "normalized")'),
    execIgnoreExisting('CREATE INDEX IF NOT EXISTS "DirectorPayerAlias_tenantId_normalized_idx" ON "DirectorPayerAlias" ("tenantId", "normalized")'),
  ]).then(() => undefined)

  return directorPayerAliasSchemaReady
}

function normalizeType(type: string | null | undefined) {
  if (type === "PAYPAL" || type === "WISE") return type
  return "ANY"
}

// Un payeur connu (ex: le directeur lui-même, son épouse, sa fille...) dont les
// virements ne concernent aucun élève. Vérifié au scan pour classer directement
// le paiement en statut DIRECTOR, sans repasser par « non traités ».
export async function isKnownDirectorPayer(tenantId: string, source: string, payerName: string | null | undefined) {
  const normalized = normalizePaymentAlias(payerName)
  if (!normalized) return false
  await ensureDirectorPayerAliasSchema()
  const type = normalizeType(source)
  const match = await prisma.directorPayerAlias.findFirst({
    where: { tenantId, normalized, OR: [{ type }, { type: "ANY" }] },
    select: { id: true },
  })
  return Boolean(match)
}

// Mémorise le payeur → « pour le directeur », suite à un marquage manuel.
export async function learnDirectorPayerAlias(tenantId: string, source: string, payerName: string | null | undefined) {
  const alias = (payerName ?? "").trim()
  const normalized = normalizePaymentAlias(alias)
  if (!alias || !normalized) return
  await ensureDirectorPayerAliasSchema()
  const type = normalizeType(source)
  await prisma.directorPayerAlias.upsert({
    where: { tenantId_type_normalized: { tenantId, type, normalized } },
    create: { tenantId, type, alias, normalized, lastSeenAt: new Date() },
    update: { alias, lastSeenAt: new Date() },
  })
}
