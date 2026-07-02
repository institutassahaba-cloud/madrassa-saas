import crypto from "crypto"

// Chiffrement des secrets stockés en base (tokens OAuth, clés PayPal/Wise…).
// AES-256-GCM. La clé vient de l'env SECRETS_ENCRYPTION_KEY (n'importe quelle
// passphrase : elle est dérivée en 32 octets via SHA-256).
//
// Conçu pour être SÛR PAR DÉFAUT et sans migration :
//  - encryptSecret sans clé → renvoie la valeur en clair (comportement legacy).
//  - decryptSecret sur une valeur non préfixée « enc:v1: » → legacy clair,
//    renvoyée telle quelle. Les anciens secrets se rechiffrent au prochain
//    enregistrement, une fois la clé définie.

const PREFIX = "enc:v1:"

function getKey(): Buffer | null {
  const raw = process.env.SECRETS_ENCRYPTION_KEY
  if (!raw) return null
  return crypto.createHash("sha256").update(raw).digest()
}

let warned = false
function warnOnce() {
  if (!warned) {
    warned = true
    console.warn("[secrets] SECRETS_ENCRYPTION_KEY absente : secrets stockés en clair.")
  }
}

/** Chiffre une valeur. Sans clé (ou valeur vide/déjà chiffrée) → passthrough. */
export function encryptSecret(value: string | null | undefined): string | null | undefined {
  if (value == null || value === "") return value
  if (value.startsWith(PREFIX)) return value
  const key = getKey()
  if (!key) {
    warnOnce()
    return value
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64")
}

/** Déchiffre une valeur. Non préfixée → legacy en clair (renvoyée telle quelle). */
export function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (value == null || value === "") return value
  if (!value.startsWith(PREFIX)) return value
  const key = getKey()
  if (!key) throw new Error("SECRETS_ENCRYPTION_KEY absente : secret chiffré illisible.")
  const buf = Buffer.from(value.slice(PREFIX.length), "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}
