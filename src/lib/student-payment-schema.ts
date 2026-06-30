import { prisma } from "@/lib/prisma"

let studentPaymentSchemaReady: Promise<void> | null = null

export function ensureStudentPaymentColumns() {
  studentPaymentSchemaReady ??= prisma
    .$executeRawUnsafe('ALTER TABLE "Student" ADD COLUMN "paymentGraceAllowed" BOOLEAN NOT NULL DEFAULT false')
    .then(() => undefined)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/duplicate column|already exists/i.test(message)) return
      throw error
    })

  return studentPaymentSchemaReady
}
