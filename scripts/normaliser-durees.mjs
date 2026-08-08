/**
 * Normalise le champ `duration` (Student et LessonSession) en heures décimales.
 *
 * Contexte : deux écritures cohabitent en base. La saisie de la fiche élève enregistre
 * des heures décimales ("1", "0.5", "0,75") ; les fiches importées des anciens Sheets
 * contiennent du texte libre ("30 min", "1h", "45 min"). Tant que personne n'y touche,
 * rien ne casse — mais `computeMonthlyFee` lisait "30 min" comme 30 HEURES de cours :
 * rouvrir puis enregistrer une de ces fiches réécrivait le forfait à 840 € au lieu de
 * 14 €, montant ensuite envoyé tel quel dans la demande de paiement.
 *
 * Le code applicatif est désormais protégé (src/lib/forfait.ts). Ce script aligne les
 * données déjà en base pour qu'il ne reste qu'une seule écriture.
 *
 * SÛR PAR DÉFAUT :
 *   - MODE TEST par défaut (n'écrit RIEN, se contente de lister).
 *   - Ajouter --apply pour écrire réellement.
 *   - Sauvegarde JSON des valeurs d'origine dans backups/ avant toute écriture.
 *   - Ne touche JAMAIS une durée illisible : elle est listée pour correction manuelle.
 *   - N'invente jamais une durée absente (NULL ou vide reste NULL ou vide).
 *   - Le parser est importé de l'application : aucune divergence possible.
 *
 * Usage :
 *   node --experimental-strip-types scripts/normaliser-durees.mjs              # liste
 *   node --experimental-strip-types scripts/normaliser-durees.mjs --apply      # écrit
 *   node --experimental-strip-types scripts/normaliser-durees.mjs --all        # + virgules -> points
 *   node --experimental-strip-types scripts/normaliser-durees.mjs --tenant <id>
 */
import fs from "fs"
import path from "path"
import { createClient } from "@libsql/client"
import { parseDurationHours } from "../src/lib/forfait.ts"

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith("--")) continue
    const name = key.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) { args[name] = true } else { args[name] = next; i++ }
  }
  return args
}
function stripQuotes(v) {
  const t = v.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  const env = {}
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#") || !t.includes("=")) continue
    const i = t.indexOf("=")
    env[t.slice(0, i)] = stripQuotes(t.slice(i + 1))
  }
  return env
}
function resolveEnv(args) {
  const files = [".env", ".env.local", ".env.vercel", ".env.production.local", args.env && String(args.env)].filter(Boolean)
  const merged = {}
  for (const f of files) Object.assign(merged, loadEnvFile(path.resolve(f)))
  return {
    ...merged,
    ...process.env,
    ...(args["db-url"] ? { DATABASE_URL: String(args["db-url"]) } : {}),
    ...(args["auth-token"] ? { TURSO_AUTH_TOKEN: String(args["auth-token"]) } : {}),
  }
}
function die(m) { console.error(`\nErreur: ${m}\n`); process.exit(1) }

const args = parseArgs(process.argv.slice(2))
const env = resolveEnv(args)
const databaseUrl = env.DATABASE_URL
const authToken = env.TURSO_AUTH_TOKEN
const apply = Boolean(args.apply)
const includeCommas = Boolean(args.all)
const onlyTenant = args.tenant ? String(args.tenant) : null

if (!databaseUrl) die("DATABASE_URL est manquant.")

const client = createClient({ url: databaseUrl, ...(authToken ? { authToken } : {}) })

/** Écriture canonique d'une durée : heures décimales, séparateur point. */
function canonical(hours) {
  return String(Math.round(hours * 1e6) / 1e6)
}

/** Une valeur est « texte libre » dès qu'elle contient une lettre ("30 min", "1h"). */
function isFreeText(value) {
  return /[a-z]/i.test(value)
}

async function collect(table, extraColumns) {
  const columns = ["id", "duration", ...extraColumns].join(", ")
  const where = onlyTenant ? " AND tenantId = ?" : ""
  const result = await client.execute({
    sql: `SELECT ${columns} FROM ${table} WHERE duration IS NOT NULL AND trim(duration) <> ''${where}`,
    args: onlyTenant ? [onlyTenant] : [],
  })

  const toRewrite = []
  const unreadable = []
  for (const row of result.rows) {
    const current = String(row.duration)
    const hours = parseDurationHours(current)
    if (hours == null) { unreadable.push({ ...row, duration: current }); continue }
    const target = canonical(hours)
    if (target === current) continue
    // Par défaut on ne touche qu'au texte libre : les décimales à virgule sont lues
    // correctement partout, les réécrire n'apporte rien et élargit le risque.
    if (!isFreeText(current) && !includeCommas) continue
    toRewrite.push({ ...row, duration: current, target, hours })
  }
  return { toRewrite, unreadable }
}

async function main() {
  const isLocal = databaseUrl.startsWith("file:")
  console.log(`\nBase : ${isLocal ? "locale" : "distante"} — ${apply ? "MODE ÉCRITURE" : "MODE TEST (aucune écriture)"}`)
  if (includeCommas) console.log("Option --all : les décimales à virgule seront aussi réécrites avec un point.")

  const students = await collect("Student", ["firstName", "lastName", "hourlyRate", "lessonsPerWeek", "monthlyFee"])
  const sessions = await collect("LessonSession", ["studentId", "number", "subject"])

  console.log(`\n─── Fiches élèves à normaliser : ${students.toRewrite.length} ───`)
  for (const row of students.toRewrite) {
    const rate = Number(row.hourlyRate)
    const perWeek = Number(row.lessonsPerWeek)
    const risque = Number.isFinite(rate) && Number.isFinite(perWeek) && rate > 0 && perWeek > 0
      ? Math.round(rate * Number.parseFloat(String(row.duration).replace(",", ".")) * perWeek * 4 * 100) / 100
      : null
    const nom = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim()
    console.log(
      `  ${nom.padEnd(26)} "${row.duration}" -> "${row.target}"` +
      (risque != null && risque !== Number(row.monthlyFee)
        ? `   [forfait ${row.monthlyFee} € ; un ré-enregistrement donnait ${risque} €]`
        : ""),
    )
  }

  console.log(`\n─── Sessions à normaliser : ${sessions.toRewrite.length} ───`)
  for (const row of sessions.toRewrite) {
    console.log(`  session ${String(row.number).padEnd(3)} ${String(row.subject ?? "").padEnd(16)} "${row.duration}" -> "${row.target}"`)
  }

  const unreadable = [...students.unreadable, ...sessions.unreadable]
  if (unreadable.length) {
    console.log(`\n⚠️  ${unreadable.length} durée(s) illisible(s), laissées intactes — à corriger à la main :`)
    for (const row of unreadable) console.log(`  ${row.id} : "${row.duration}"`)
  }

  const total = students.toRewrite.length + sessions.toRewrite.length
  if (!total) { console.log("\nRien à normaliser.\n"); return }

  if (!apply) {
    console.log(`\n👉 MODE TEST. Pour écrire réellement : node --experimental-strip-types scripts/normaliser-durees.mjs --apply\n`)
    return
  }

  const backupDir = path.resolve("backups")
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir)
  const backupFile = path.join(backupDir, `durees-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  fs.writeFileSync(backupFile, JSON.stringify({ students: students.toRewrite, sessions: sessions.toRewrite }, null, 2))
  console.log(`\n💾 Sauvegarde des valeurs d'origine : ${backupFile}`)

  let written = 0
  for (const [table, rows] of [["Student", students.toRewrite], ["LessonSession", sessions.toRewrite]]) {
    for (const row of rows) {
      await client.execute({ sql: `UPDATE ${table} SET duration = ? WHERE id = ?`, args: [row.target, row.id] })
      written += 1
    }
  }
  console.log(`\n✅ ${written} durée(s) normalisée(s).`)
  console.log("   Les forfaits (monthlyFee) ne sont PAS touchés : ils restent à leur valeur actuelle.\n")
}

main().catch(e => die(e.message))
