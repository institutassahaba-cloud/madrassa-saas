import { prisma } from "@/lib/prisma"

let legacyPayrollBoundaryColumnReady: Promise<void> | null = null

export function ensureLessonLegacyPayrollBoundaryColumn() {
  legacyPayrollBoundaryColumnReady ??= prisma
    .$executeRawUnsafe('ALTER TABLE "Lesson" ADD COLUMN "legacyPayrollBoundary" BOOLEAN NOT NULL DEFAULT false')
    .then(() => undefined)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/duplicate column|already exists/i.test(message)) return
      throw error
    })

  return legacyPayrollBoundaryColumnReady
}
