/**
 * Sauvegarde COMPLÈTE de la base Turso vers un fichier .sql local horodaté.
 * Lecture seule côté Turso : n'écrit QUE le fichier de sauvegarde local.
 *
 * Utilisation :
 *   TURSO_DATABASE_URL="libsql://...turso.io" \
 *   TURSO_AUTH_TOKEN="eyJ..." \
 *   node scripts/backup-turso.mjs
 *
 * (récupère l'URL et le token dans Vercel → Settings → Environment Variables :
 *  DATABASE_URL = l'URL libsql, TURSO_AUTH_TOKEN = le token)
 */
import fs from "node:fs"
import path from "node:path"
import { createClient } from "@libsql/client"

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !url.startsWith("libsql://")) {
  console.error("❌ TURSO_DATABASE_URL (ou DATABASE_URL) doit être une URL libsql://… . Reçu:", url || "(vide)")
  process.exit(1)
}
if (!authToken) {
  console.error("❌ TURSO_AUTH_TOKEN manquant.")
  process.exit(1)
}

const client = createClient({ url, authToken })

function sqlValue(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL"
  if (typeof v === "bigint") return v.toString()
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer)
    return "X'" + Buffer.from(bytes).toString("hex") + "'"
  }
  return "'" + String(v).replace(/'/g, "''") + "'"
}

const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16)
const dir = path.resolve(process.cwd(), "backups")
fs.mkdirSync(dir, { recursive: true })
const outFile = path.join(dir, `turso-backup-${stamp}.sql`)
const out = fs.createWriteStream(outFile, { encoding: "utf8" })

out.write(`-- Sauvegarde Turso ${new Date().toISOString()}\n`)
out.write(`-- Source: ${url}\n`)
out.write("PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n")

const tablesRes = await client.execute(
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%' ORDER BY name",
)

const summary = []
for (const t of tablesRes.rows) {
  const table = t.name
  const createSql = t.sql
  out.write(`\n-- ==== ${table} ====\n`)
  out.write(`DROP TABLE IF EXISTS "${table}";\n`)
  out.write(`${createSql};\n`)

  const res = await client.execute(`SELECT * FROM "${table}"`)
  const cols = res.columns
  for (const row of res.rows) {
    const vals = cols.map((c) => sqlValue(row[c]))
    out.write(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${vals.join(",")});\n`)
  }
  summary.push({ table, rows: res.rows.length })
}

// Index / triggers éventuels
const idxRes = await client.execute(
  "SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
)
for (const r of idxRes.rows) out.write(`${r.sql};\n`)

out.write("COMMIT;\nPRAGMA foreign_keys=ON;\n")
await new Promise((resolve) => out.end(resolve))

const bytes = fs.statSync(outFile).size
console.log("\n✅ Sauvegarde terminée :", outFile, `(${(bytes / 1024).toFixed(1)} Ko)`)
console.log("Contenu (table → lignes) :")
for (const s of summary.sort((a, b) => b.rows - a.rows)) console.log(`  ${s.table.padEnd(22)} ${s.rows}`)
console.log("\nVérifie que les nombres correspondent (ex. Payment ~484, Student ~131).")
await client.close()
