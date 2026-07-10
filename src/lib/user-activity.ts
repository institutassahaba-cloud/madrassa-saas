import { prisma } from "@/lib/prisma"

export async function touchUserActivity(userId: string) {
  const now = new Date()
  const threshold = new Date(now.getTime() - 15 * 60 * 1000)

  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { lastLoginAt: null },
        { lastLoginAt: { lt: threshold } },
      ],
    },
    data: { lastLoginAt: now },
  })
}
