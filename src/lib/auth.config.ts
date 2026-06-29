import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isDashboard = nextUrl.pathname.startsWith("/dashboard")
      const isWelcome = nextUrl.pathname.startsWith("/bienvenue")

      if (isWelcome) {
        if (!isLoggedIn) return false
        if (auth?.user?.hasOnboarded) {
          return Response.redirect(new URL("/dashboard", nextUrl))
        }
        return true
      }

      if (isDashboard) {
        if (!isLoggedIn) return false
        if (!auth?.user?.hasOnboarded) {
          return Response.redirect(new URL("/bienvenue", nextUrl))
        }
        if (auth?.user?.mustChangePassword && !nextUrl.pathname.startsWith("/dashboard/settings")) {
          return Response.redirect(new URL("/dashboard/settings", nextUrl))
        }
        return true
      }
      return true
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = user.role
        token.tenantId = user.tenantId
        token.tenantName = user.tenantName
        token.mustChangePassword = user.mustChangePassword ?? false
        token.hasOnboarded = user.hasOnboarded ?? false
      }
      if (trigger === "update") {
        token.mustChangePassword = false
        token.hasOnboarded = true
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.role = token.role ?? ""
        session.user.tenantId = token.tenantId ?? ""
        session.user.tenantName = token.tenantName ?? ""
        session.user.mustChangePassword = token.mustChangePassword ?? false
        session.user.hasOnboarded = token.hasOnboarded ?? false
      }
      return session
    },
  },
}
