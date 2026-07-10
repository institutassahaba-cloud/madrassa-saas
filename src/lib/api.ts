import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

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

const SECRETARY_ACTIONS_DIR = path.join(process.cwd(), "logs")
const SECRETARY_ACTIONS_FILE = path.join(SECRETARY_ACTIONS_DIR, "secretary-actions.jsonl")
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const REDACTED_KEYS = new Set(["password", "token", "apikey", "api_key", "secret", "authorization"])

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    REDACTED_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redact(item),
  ]))
}

async function requestBodySnapshot(req: Request) {
  const text = await req.text().catch(() => "")
  if (!text) return null
  if (text.length > 20000) return { truncated: true, length: text.length }
  try {
    return redact(JSON.parse(text))
  } catch {
    return text.slice(0, 2000)
  }
}

async function logSecretaryAction(req: Request, reqForBody: Request | null, status: number) {
  if (!MUTATING_METHODS.has(req.method)) return
  const session = await auth().catch(() => null)
  const user = session?.user
  if (user?.role !== "SECRETARY") return

  const url = new URL(req.url)
  const entry = {
    at: new Date().toISOString(),
    secretaryId: user.id,
    secretaryName: user.name ?? null,
    secretaryEmail: user.email ?? null,
    tenantId: user.tenantId,
    method: req.method,
    path: url.pathname,
    query: url.search || null,
    status,
    body: reqForBody ? await requestBodySnapshot(reqForBody) : null,
  }

  await mkdir(SECRETARY_ACTIONS_DIR, { recursive: true })
  await appendFile(SECRETARY_ACTIONS_FILE, `${JSON.stringify(entry)}\n`, "utf8")
}

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
    const auditReq = MUTATING_METHODS.has(req.method) ? req.clone() : null
    try {
      const response = await handler(req, ctx)
      await logSecretaryAction(req, auditReq, response.status).catch((error) => {
        console.error("[audit] Impossible d'écrire l'action secrétaire:", error)
      })
      return response
    } catch (err) {
      await logSecretaryAction(req, auditReq, err instanceof ApiError ? err.status : 500).catch((error) => {
        console.error("[audit] Impossible d'écrire l'action secrétaire:", error)
      })
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
