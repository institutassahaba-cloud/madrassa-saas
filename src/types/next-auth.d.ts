import type { DefaultSession } from "next-auth"
import type { JWT as DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      tenantId: string
      tenantName: string
      mustChangePassword: boolean
      hasOnboarded: boolean
    } & DefaultSession["user"]
  }

  interface User {
    role: string
    tenantId: string
    tenantName: string
    mustChangePassword: boolean
    hasOnboarded: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    role?: string
    tenantId?: string
    tenantName?: string
    mustChangePassword?: boolean
    hasOnboarded?: boolean
  }
}
