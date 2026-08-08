import { prisma } from "@/lib/prisma"

// Colonnes de facturation ajoutées après coup : libSQL ne rejoue pas les migrations
// Prisma en production, on les crée donc à la volée (idempotent).
const PAYMENT_COLUMNS = [
  'ALTER TABLE "Student" ADD COLUMN "paymentGraceAllowed" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "Student" ADD COLUMN "customFee" BOOLEAN NOT NULL DEFAULT false',
]

let studentPaymentSchemaReady: Promise<void> | null = null

export function ensureStudentPaymentColumns() {
  studentPaymentSchemaReady ??= (async () => {
    for (const statement of PAYMENT_COLUMNS) {
      try {
        await prisma.$executeRawUnsafe(statement)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        if (/duplicate column|already exists/i.test(message)) continue
        throw error
      }
    }
  })()

  return studentPaymentSchemaReady
}
