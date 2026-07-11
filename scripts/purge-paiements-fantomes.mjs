/**
 * Purge des paiements FANTÔMES (PaymentMatch sans email réel derrière).
 *
 * Contexte : d'anciens scans buggés ont créé des lignes de paiement à partir de
 * mails qui ne sont PAS des encaissements PayPal/Wise (mails de récap internes,
 * PayPal sortants, virements). Le parser est corrigé, mais ces vieilles lignes
 * restent en base. Ce script les repère et peut les supprimer.
 *
 * SÛR PAR DÉFAUT :
 *   - MODE TEST par défaut (n'efface RIEN, se contente de lister).
 *   - Ajouter --apply pour supprimer réellement.
 *   - Ne touche JAMAIS aux statuts validés : CONFIRMED, AUTO_CONFIRMED, DIRECTOR.
 *   - Ne touche JAMAIS à une ligne qui a une allocation (déjà rattachée à un paiement).
 *   - Sauvegarde les lignes supprimées dans backups/ avant suppression.
 *
 * Critère « fantôme » (conservateur) : ligne NON validée (TO_VERIFY / TRASHED)
 * ET (aucun nom de payeur détecté  OU  sujet = mail de récap interne).
 * → Les lignes avec un vrai nom de payeur (ex. « Lionel Zilevu ») sont GARDÉES
 *   et listées à part pour vérification manuelle.
 *
 * Usage :
 *   node scripts/purge-paiements-fantomes.mjs                 # liste (mode test)
 *   node scripts/purge-paiements-fantomes.mjs --apply         # supprime
 *   node scripts/purge-paiements-fantomes.mjs --tenant <id>   # limiter à un institut
 */
import fs from "fs"
import path from "path"
import { createClient } from "@libsql/client"

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
  // Du moins prioritaire au plus prioritaire : la prod (.env.production.local)
  // doit l'emporter sur la base locale de .env pour viser Turso.
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
const allowLocal = Boolean(args.local)
const onlyTenant = args.tenant ? String(args.tenant) : null

if (!databaseUrl) die("DATABASE_URL est manquant.")
if (!databaseUrl.startsWith("libsql://") && !allowLocal) die("DATABASE_URL ne pointe pas vers Turso. Ajoutez --local pour tester en local.")
if (databaseUrl.startsWith("libsql://") && !authToken) die("TURSO_AUTH_TOKEN est manquant.")

const PROTECTED_STATUSES = ["CONFIRMED", "AUTO_CONFIRMED", "DIRECTOR", "PAID"]

function isRecapSubject(s) { return /r[ée]capitulatif\s+paiements/i.test(String(s || "")) }
// Sortants : PayPal « Vous avez envoyé », Wise « Transfert envoyé » — jamais des
// encaissements. À supprimer même si le nom a été mal extrait (« bicubic »).
function isOutgoingSubject(s) { return /vous\s+avez\s+envoy[ée]|transfert\s+envoy[ée]/i.test(String(s || "")) }
// Entrants RÉELS : « Argent reçu de <nom> » / « Vous avez reçu de l'argent ».
// On les GARDE même si le nom a été mal lu (le rescan corrigera le nom).
function isIncomingSubject(s) { return /argent\s+re[çc]u\s+de|vous\s+avez\s+re[çc]u/i.test(String(s || "")) }
function hasPayerName(v) { return String(v || "").trim().length >= 3 }
function fmt(row) {
  const d = row.paymentDate ? new Date(row.paymentDate).toLocaleDateString("fr-FR") : "?"
  const ref = row.paymentReference || "—"
  const payer = row.detectedPayerName || "(aucun)"
  return `  [${row.status}] ${d} | ${row.source} | ${row.receivedAmount} € | payeur: ${payer} | réf: ${ref} | sujet: ${String(row.rawSubject || "").slice(0, 50)}`
}

async function main() {
  const client = createClient(databaseUrl.startsWith("libsql://") ? { url: databaseUrl, authToken } : { url: databaseUrl })

  const where = onlyTenant ? "WHERE pm.tenantId = ?" : ""
  const bind = onlyTenant ? [onlyTenant] : []
  const res = await client.execute({
    sql: `
      SELECT pm.id, pm.tenantId, pm.status, pm.source, pm.receivedAmount, pm.detectedPayerName,
             pm.paymentReference, pm.rawSubject, pm.paymentDate,
             (SELECT COUNT(*) FROM PaymentAllocation pa WHERE pa.paymentMatchId = pm.id) AS allocCount
      FROM PaymentMatch pm ${where}
      ORDER BY pm.paymentDate DESC
    `,
    args: bind,
  })
  const rows = res.rows

  const validated = rows.filter(r => PROTECTED_STATUSES.includes(r.status) || Number(r.allocCount) > 0)
  const candidates = rows.filter(r => !validated.includes(r))

  // Fantôme si : récap interne, OU sortant, OU (ni entrant identifié ni nom de
  // payeur). Un entrant réel (« Argent reçu de … ») est TOUJOURS gardé.
  const isPhantom = (r) => {
    if (isRecapSubject(r.rawSubject) || isOutgoingSubject(r.rawSubject)) return true
    if (isIncomingSubject(r.rawSubject)) return false
    return !hasPayerName(r.detectedPayerName)
  }
  const phantoms = candidates.filter(isPhantom)
  // Non validés gardés (entrants réels / avec nom) → vérification manuelle.
  const keptForReview = candidates.filter(r => !isPhantom(r))

  console.log(`\n================ PURGE PAIEMENTS FANTÔMES ${apply ? "(SUPPRESSION RÉELLE)" : "(MODE TEST — rien supprimé)"} ================`)
  console.log(`Total PaymentMatch : ${rows.length}`)
  console.log(`  • Protégés (validés / directeur / alloués) : ${validated.length}  ← jamais touchés`)
  console.log(`  • Non validés avec vrai nom (GARDÉS, à vérifier) : ${keptForReview.length}`)
  console.log(`  • FANTÔMES à supprimer : ${phantoms.length}`)

  if (keptForReview.length) {
    console.log(`\n--- GARDÉS (non validés mais nom présent — vérifie qu'aucun vrai paiement n'est ici) ---`)
    keptForReview.forEach(r => console.log(fmt(r)))
  }
  console.log(`\n--- FANTÔMES ${apply ? "SUPPRIMÉS" : "qui seraient supprimés"} (${phantoms.length}) ---`)
  phantoms.forEach(r => console.log(fmt(r)))

  if (!phantoms.length) { console.log("\nRien à supprimer.\n"); return }

  if (!apply) {
    console.log(`\n👉 MODE TEST. Pour supprimer réellement : node scripts/purge-paiements-fantomes.mjs --apply\n`)
    return
  }

  // Sauvegarde avant suppression.
  const backupDir = path.resolve("backups")
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir)
  const backupFile = path.join(backupDir, `paiements-fantomes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  fs.writeFileSync(backupFile, JSON.stringify(phantoms, null, 2))
  console.log(`\n💾 Sauvegarde : ${backupFile}`)

  let deleted = 0
  for (const r of phantoms) {
    await client.execute({ sql: "DELETE FROM PaymentMatch WHERE id = ?", args: [r.id] })
    deleted += 1
  }
  console.log(`\n✅ ${deleted} paiement(s) fantôme(s) supprimé(s).\n`)
}

main().catch(e => die(e.message))
