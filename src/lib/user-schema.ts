import { prisma } from "@/lib/prisma"

let meetingLinkColumnReady: Promise<void> | null = null

export function ensureUserMeetingLinkColumn() {
  meetingLinkColumnReady ??= prisma
    .$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "meetingLink" TEXT')
    .then(() => undefined)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/duplicate column|already exists/i.test(message)) return
      throw error
    })

  return meetingLinkColumnReady
}
