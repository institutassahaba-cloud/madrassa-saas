import { prisma } from "@/lib/prisma"

let studentContactSchemaReady: Promise<void> | null = null

export function ensureStudentContactColumns() {
  studentContactSchemaReady ??= prisma
    .$executeRawUnsafe('ALTER TABLE "Student" ADD COLUMN "googleContactResourceName" TEXT')
    .then(() => undefined)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/duplicate column|already exists/i.test(message)) return
      throw error
    })

  return studentContactSchemaReady
}
