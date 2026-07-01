/**
 * Limiteur de débit léger, en mémoire (par instance de serveur).
 *
 * ⚠️ Best-effort : sur un hébergement serverless, le compteur est propre à
 * chaque instance et se réinitialise à froid. Suffisant comme première barrière
 * pour un outil interne (anti-flood / anti-brute-force). Pour une garantie forte
 * multi-instances, il faudrait un store partagé (Redis/Upstash).
 */

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

function currentBucket(key: string, windowMs: number): Bucket {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs }
    buckets.set(key, b)
  }
  return b
}

/** Vrai si la clé a déjà atteint la limite sur la fenêtre courante (lecture seule). */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): { limited: boolean; retryAfterSec: number } {
  const b = currentBucket(key, windowMs)
  if (b.count >= limit) {
    return { limited: true, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - Date.now()) / 1000)) }
  }
  return { limited: false, retryAfterSec: 0 }
}

/** Enregistre une tentative (à appeler sur chaque requête, ou seulement sur échec). */
export function registerAttempt(key: string, windowMs: number): void {
  const b = currentBucket(key, windowMs)
  b.count++
  // Purge opportuniste pour éviter une croissance illimitée de la map.
  if (buckets.size > 5000) {
    const now = Date.now()
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k)
  }
}

/** Extrait l'IP cliente des en-têtes (Vercel fournit x-forwarded-for). */
export function getClientIp(req: Request | undefined | null): string | null {
  if (!req) return null
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]?.trim() || null
  return req.headers.get("x-real-ip")
}
