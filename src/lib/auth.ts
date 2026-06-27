import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "./auth.config"

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
      async authorize(credentials) {
        const parsed = z.object({
          email: z.string().min(1),
          password: z.string().min(6),
        }).safeParse(credentials)

        if (!parsed.success) return null

        const { email, password } = parsed.data

        const user = await prisma.user.findFirst({
          where: { email: email.trim().toLowerCase(), isActive: true },
          include: { tenant: { select: { name: true, isActive: true } } },
        })
        if (!user || !user.password || !user.tenant?.isActive) return null

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null

        prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})

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
