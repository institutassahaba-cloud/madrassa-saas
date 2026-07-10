import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "./auth.config"
import { isRateLimited, registerAttempt, getClientIp } from "@/lib/rate-limit"
import { touchUserActivity } from "@/lib/user-activity"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, request) {
        const parsed = z.object({
          email: z.string().min(1),
          password: z.string().min(6),
        }).safeParse(credentials)

        if (!parsed.success) return null

        const { email, password } = parsed.data

        // Anti-brute-force : au plus 8 échecs / 15 min par IP (les connexions
        // réussies ne sont pas comptées).
        const ip = getClientIp(request as unknown as Request)
        const rlKey = ip ? `login:${ip}` : null
        const WINDOW = 15 * 60 * 1000
        if (rlKey && isRateLimited(rlKey, 8, WINDOW).limited) return null

        const user = await prisma.user.findFirst({
          where: { email: email.trim().toLowerCase(), isActive: true },
          include: { tenant: { select: { name: true, isActive: true } } },
        })
        if (!user || !user.password || !user.tenant?.isActive) {
          if (rlKey) registerAttempt(rlKey, WINDOW)
          return null
        }

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) {
          if (rlKey) registerAttempt(rlKey, WINDOW)
          return null
        }

        await touchUserActivity(user.id).catch(() => null)

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          mustChangePassword: user.mustChangePassword,
          hasOnboarded: user.hasOnboarded,
        }
      },
    }),
  ],
})
