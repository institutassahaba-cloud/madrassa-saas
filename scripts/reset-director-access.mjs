import fs from "fs"
import path from "path"
import bcrypt from "bcryptjs"
import { createClient } from "@libsql/client"

const DEFAULT_PASSWORD = "admin1234"

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith("--")) continue
    const name = key.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) {
      args[name] = true
    } else {
      args[name] = next
      i++
    }
  }
  return args
}

function stripQuotes(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  const env = {}
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const index = trimmed.indexOf("=")
    env[trimmed.slice(0, index)] = stripQuotes(trimmed.slice(index + 1))
  }
  return env
}

function resolveEnv(args) {
  const explicitEnv = args.env ? [String(args.env)] : []
  const files = [
    ...explicitEnv,
    ".env.production.local",
    ".env.vercel",
    ".env.local",
    ".env",
  ]

  const merged = {}
  for (const file of files) Object.assign(merged, loadEnvFile(path.resolve(file)))
  return {
    ...merged,
    ...process.env,
    ...(args["db-url"] ? { DATABASE_URL: String(args["db-url"]) } : {}),
    ...(args["auth-token"] ? { TURSO_AUTH_TOKEN: String(args["auth-token"]) } : {}),
  }
}

function die(message) {
  console.error(`\nErreur: ${message}\n`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
const env = resolveEnv(args)
const databaseUrl = env.DATABASE_URL
const authToken = env.TURSO_AUTH_TOKEN
const password = String(args.password || DEFAULT_PASSWORD)
const contactEmail = args["contact-email"] ? String(args["contact-email"]).trim().toLowerCase() : null
const allowLocal = Boolean(args.local)

if (!databaseUrl) die("DATABASE_URL est manquant.")
if (!databaseUrl.startsWith("libsql://") && !allowLocal) {
  die("DATABASE_URL ne pointe pas vers Turso. Ajoutez --local pour tester en local.")
}
if (databaseUrl.startsWith("libsql://") && !authToken) {
  die("TURSO_AUTH_TOKEN est manquant pour modifier la base en ligne.")
}
if (password.length < 6) die("Le mot de passe doit contenir au moins 6 caractères.")

const client = createClient({
  url: databaseUrl,
  ...(authToken ? { authToken } : {}),
})

const director = await client.execute({
  sql: `
    SELECT id, name, email, contactEmail
    FROM User
    WHERE role = 'DIRECTOR'
    ORDER BY createdAt ASC
    LIMIT 1
  `,
  args: [],
})

if (director.rows.length === 0) die("Aucun compte directeur trouvé.")

const user = director.rows[0]
const hash = await bcrypt.hash(password, 12)

await client.execute({
  sql: `
    UPDATE User
    SET
      email = ?,
      password = ?,
      mustChangePassword = 1,
      hasOnboarded = 0,
      isActive = 1,
      ${contactEmail ? "contactEmail = ?," : ""}
      updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  args: contactEmail
    ? ["directeur36", hash, contactEmail, user.id]
    : ["directeur36", hash, user.id],
})

console.log("\nAccès directeur réinitialisé avec succès.")
console.log(`Compte: ${user.name}`)
console.log("Identifiant: directeur36")
console.log(`Mot de passe provisoire: ${password}`)
console.log("À la prochaine connexion, l'écran de bienvenue demandera l'email de contact.")
