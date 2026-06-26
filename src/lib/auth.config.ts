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
      if (isDashboard) {
        if (!isLoggedIn) return false
        if (auth?.user?.mustChangePassword && !nextUrl.pathname.startsWith("/dashboard/mon-compte")) {
          return Response.redirect(new URL("/dashboard/mon-compte", nextUrl))
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
      }
      if (trigger === "update") {
        token.mustChangePassword = false
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
      }
      return session
    },
  },
}
