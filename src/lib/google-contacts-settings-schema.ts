import { prisma } from "@/lib/prisma"

let googleContactsSettingsReady: Promise<void> | null = null

async function addColumn(sql: string) {
  await prisma.$executeRawUnsafe(sql).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/duplicate column|already exists/i.test(message)) return
    throw error
  })
}

export function ensureGoogleContactsSettingsColumns() {
  googleContactsSettingsReady ??= Promise.all([
    addColumn('ALTER TABLE "TenantSettings" ADD COLUMN "googleContactsRefreshToken" TEXT'),
    addColumn('ALTER TABLE "TenantSettings" ADD COLUMN "googleContactsEmail" TEXT'),
  ]).then(() => undefined)

  return googleContactsSettingsReady
}
