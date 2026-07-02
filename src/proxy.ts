import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

// Proxy (ex-middleware, renommé en Next 16) : exécute le callback `authorized`
// de auth.config sur chaque requête ciblée — login requis, onboarding
// (/bienvenue) et mot de passe provisoire à changer (mustChangePassword →
// redirection vers /dashboard/settings). Sans ce fichier, ce callback est
// du code mort. Config edge-safe : pas d'adapter Prisma ici.
export const proxy = NextAuth(authConfig).auth

export const config = {
  matcher: ["/dashboard/:path*", "/bienvenue/:path*"],
}
