/**
 * Liste les élèves dont le tarif enregistré (`monthlyFee`) diffère de son forfait
 * (tarif horaire × durée × cours/semaine × 4), et permet de marquer les écarts voulus.
 *
 * Depuis que le serveur redérive le tarif du forfait, un écart non marqué « tarif
 * personnalisé » sera corrigé à la prochaine écriture sur la fiche ou au prochain
 * changement de taille de classe. Certains écarts sont pourtant volontaires : fratrie
 * regroupée sur une seule fiche, remise, montant négocié. Ce script sert à les trier.
 *
 * SÛR PAR DÉFAUT :
 *   - MODE TEST par défaut (n'écrit RIEN, se contente de lister).
 *   - --mark-all protège TOUS les écarts actuels : plus aucun tarif ne bouge, on trie ensuite.
 *   - --mark <id,id> protège une sélection précise.
 *   - --unmark <id,id> retire la protection (le forfait reprendra la main).
 *   - Aucun montant n'est modifié : seul l'indicateur customFee change.
 *
 * Usage :
 *   node --experimental-strip-types scripts/ecarts-forfait.mjs
 *   node --experimental-strip-types scripts/ecarts-forfait.mjs --mark-all
 *   node --experimental-strip-types scripts/ecarts-forfait.mjs --mark cmq...,cmq...
 */
import fs from "fs"
import path from "path"
import { createClient } from "@libsql/client"
import { computeExpectedFee, formatDuration } from "../src/lib/forfait.ts"

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
if (!env.DATABASE_URL) die("DATABASE_URL est manquant.")

const client = createClient({
  url: env.DATABASE_URL,
  ...(env.TURSO_AUTH_TOKEN ? { authToken: env.TURSO_AUTH_TOKEN } : {}),
})

const markAll = Boolean(args["mark-all"])
const toMark = typeof args.mark === "string" ? args.mark.split(",").map(s => s.trim()).filter(Boolean) : []
const toUnmark = typeof args.unmark === "string" ? args.unmark.split(",").map(s => s.trim()).filter(Boolean) : []

async function main() {
  const result = await client.execute(
    `SELECT id, firstName, lastName, monthlyFee, customFee, hourlyRate, duration, lessonsPerWeek, groupId
     FROM Student WHERE status = 'ACTIVE'`,
  )

  const gaps = []
  for (const row of result.rows) {
    const expected = computeExpectedFee({
      hourlyRate: row.hourlyRate,
      duration: row.duration,
      lessonsPerWeek: row.lessonsPerWeek,
    })
    if (expected == null) continue
    if (Math.abs(expected - Number(row.monthlyFee)) < 0.01) continue
    gaps.push({ ...row, expected })
  }
  gaps.sort((a, b) => Math.abs(b.monthlyFee - b.expected) - Math.abs(a.monthlyFee - a.expected))

  console.log(`\n${gaps.length} écart(s) entre le tarif enregistré et le forfait :\n`)
  for (const row of gaps) {
    const nom = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim()
    const protege = row.customFee ? "PROTÉGÉ" : "sera recalculé"
    console.log(
      `  ${nom.padEnd(26)} ${String(row.monthlyFee).padStart(7)} €  ->  ${String(row.expected).padStart(7)} €` +
      `   (${row.hourlyRate} €/h × ${formatDuration(row.duration)} × ${row.lessonsPerWeek}/sem)   [${protege}]`,
    )
    console.log(`  ${" ".repeat(26)} ${row.id}`)
  }

  if (!gaps.length) { console.log("Aucun écart. Tous les tarifs suivent leur forfait.\n"); return }

  const ids = markAll ? gaps.filter(g => !g.customFee).map(g => g.id) : toMark
  if (!ids.length && !toUnmark.length) {
    console.log(`\n👉 MODE TEST. Pour protéger tous les écarts ci-dessus (aucun tarif ne bougera) :`)
    console.log(`   node --experimental-strip-types scripts/ecarts-forfait.mjs --mark-all`)
    console.log(`   Puis décochez au cas par cas « Tarif personnalisé » dans la fiche élève.\n`)
    return
  }

  for (const id of ids) {
    await client.execute({ sql: "UPDATE Student SET customFee = 1 WHERE id = ?", args: [id] })
  }
  for (const id of toUnmark) {
    await client.execute({ sql: "UPDATE Student SET customFee = 0 WHERE id = ?", args: [id] })
  }
  console.log(`\n✅ ${ids.length} tarif(s) protégé(s), ${toUnmark.length} remis sous le forfait.`)
  console.log("   Aucun montant n'a été modifié.\n")
}

main().catch(e => die(e.message))
