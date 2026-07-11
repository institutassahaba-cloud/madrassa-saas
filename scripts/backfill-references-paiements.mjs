/**
 * Backfill de la colonne `paymentReference` des PaymentMatch.
 *
 * L'ancien parser rangeait le n° de transaction PayPal / transfert Wise dans la
 * clé technique `gmailMessageId` au lieu de la colonne `paymentReference` (restée
 * vide). Ce script recopie ce numéro dans le bon champ quand la clé ressemble à
 * une vraie référence (majuscules + chiffres, ≥ 12 caractères) — donc PAS pour
 * les clés « gmail:… », ni les mots comme « VIREMENT » / « Nouranya ».
 *
 * SÛR : mode TEST par défaut (rien écrit), --apply pour écrire. Ne remplit QUE
 * les références vides, ne touche à aucun autre champ. Réversible.
 *
 * Usage :
 *   node scripts/backfill-references-paiements.mjs           # liste (test)
 *   node scripts/backfill-references-paiements.mjs --apply   # écrit
 */
import fs from "fs"
import path from "path"
import { createClient } from "@libsql/client"

function parseArgs(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith("--")) continue
    const n = k.slice(2), next = argv[i + 1]
    if (!next || next.startsWith("--")) a[n] = true; else { a[n] = next; i++ }
  }
  return a
}
function loadEnv(f) {
  const e = {}
  if (!fs.existsSync(f)) return e
  for (const l of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const t = l.trim()
    if (!t || t.startsWith("#") || !t.includes("=")) continue
    const i = t.indexOf("="); let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    e[t.slice(0, i)] = v
  }
  return e
}
function die(m) { console.error(`\nErreur: ${m}\n`); process.exit(1) }

const args = parseArgs(process.argv.slice(2))
const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...loadEnv(".env.production.local"), ...process.env }
const apply = Boolean(args.apply)
if (!env.DATABASE_URL) die("DATABASE_URL manquant.")
if (env.DATABASE_URL.startsWith("libsql://") && !env.TURSO_AUTH_TOKEN) die("TURSO_AUTH_TOKEN manquant.")

// Une vraie référence de transaction : majuscules + chiffres, 12–24 caractères,
// pas de « : » (exclut « gmail:… »). Exclut les mots courts (VIREMENT, Virement…).
function looksLikeReference(key) {
  return /^[A-Z0-9]{12,24}$/.test(String(key || ""))
}

async function main() {
  const c = createClient(env.DATABASE_URL.startsWith("libsql://")
    ? { url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN }
    : { url: env.DATABASE_URL })

  const res = await c.execute(
    "SELECT id, gmailMessageId, source, receivedAmount, detectedPayerName, status FROM PaymentMatch WHERE paymentReference IS NULL",
  )
  const targets = res.rows.filter(r => looksLikeReference(r.gmailMessageId))
  const skipped = res.rows.filter(r => !looksLikeReference(r.gmailMessageId))

  console.log(`\n===== BACKFILL RÉFÉRENCES ${apply ? "(ÉCRITURE)" : "(MODE TEST)"} =====`)
  console.log(`Lignes sans référence : ${res.rows.length}`)
  console.log(`  • Référence récupérable depuis la clé : ${targets.length}`)
  console.log(`  • Sans référence exploitable (ignorées) : ${skipped.length}\n`)

  console.log(`--- ${apply ? "RÉFÉRENCES ÉCRITES" : "seraient écrites"} ---`)
  targets.forEach(r => console.log(`  ${r.source} | ${r.receivedAmount}€ | ${r.detectedPayerName || "(aucun)"} | réf → ${r.gmailMessageId}`))

  if (skipped.length) {
    console.log(`\n--- Ignorées (clé non exploitable : gmail:… / VIREMENT / mot) ---`)
    skipped.forEach(r => console.log(`  ${r.source} | ${r.receivedAmount}€ | ${r.detectedPayerName || "(aucun)"} | clé=${r.gmailMessageId}`))
  }

  if (!apply) { console.log(`\n👉 MODE TEST. Pour écrire : node scripts/backfill-references-paiements.mjs --apply\n`); return }

  let n = 0
  for (const r of targets) {
    await c.execute({ sql: "UPDATE PaymentMatch SET paymentReference = ? WHERE id = ?", args: [r.gmailMessageId, r.id] })
    n++
  }
  console.log(`\n✅ ${n} référence(s) écrite(s).\n`)
}
main().catch(e => die(e.message))
