import { NextResponse } from "next/server"

/**
 * Erreur métier volontaire : `throw new ApiError(403, "…")` dans une route
 * produit une réponse JSON propre `{ error }` avec le bon code HTTP.
 */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = "ApiError"
  }
}

type RouteHandler<C> = (req: Request, ctx: C) => Promise<Response> | Response

/**
 * Enveloppe une route API : capture toute exception non gérée, journalise
 * l'erreur côté serveur et renvoie une réponse JSON cohérente au lieu d'un
 * 500 opaque. Mappe aussi les erreurs Prisma et Zod courantes.
 *
 * Usage :
 *   export const POST = wrap(async (req) => { ... })
 *   export const PUT  = wrap(async (req, { params }: { params: Promise<{ id: string }> }) => { ... })
 */
export function wrap<C = unknown>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }

      // Corps JSON invalide
      if (err instanceof SyntaxError) {
        return NextResponse.json({ error: "Requête invalide." }, { status: 400 })
      }

      // Erreurs Prisma connues
      const code = (err as { code?: string })?.code
      if (code === "P2002") {
        return NextResponse.json({ error: "Cette valeur existe déjà (doublon)." }, { status: 409 })
      }
      if (code === "P2025") {
        return NextResponse.json({ error: "Ressource introuvable." }, { status: 404 })
      }
      if (code === "P2003") {
        return NextResponse.json({ error: "Référence liée invalide." }, { status: 400 })
      }

      let path = "?"
      try { path = new URL(req.url).pathname } catch { /* noop */ }
      console.error(`[api] ${req.method ?? "?"} ${path} — erreur non gérée:`, err)

      return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 })
    }
  }
}
