/**
 * Migration de l'historique des paiements (RECAP, période courante) → SaaS.
 * À lancer APRÈS migrate-google.mjs (qui crée élèves/profs/groupes).
 *
 * Source : prisma/data/recap-payments.json (extrait par _extract_payments.py).
 * Matching : chaque paiement → élève du prof concerné, par nom normalisé.
 * Idempotent : supprime les Payment du tenant avant import.
 *
 * Usage : node prisma/migrate-payments.mjs
 */
import { PrismaClient } from "@prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import path from "path"
import { fileURLToPath } from "url"
import { readFileSync } from "fs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const adapter = new PrismaLibSql({ url: `file://${path.resolve(__dirname, "dev.db")}` })
const prisma = new PrismaClient({ adapter })

const TENANT_SLUG = "assahaba"
const payments = JSON.parse(readFileSync(path.join(__dirname, "data/recap-payments.json"), "utf8"))

const HONORIFICS = new Set(["umm","oum","umu","ummu","bint","bin","ibn","ben","el","al","mme","mr","mlle","mle","m","de","du","des"])

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}
function tokens(s) {
  return norm(s).split(" ").filter(t => t.length >= 3 && !HONORIFICS.has(t))
}

// profCode -> teacher userId (via nom du prof migré : "<emoji> <name>")
const PROF_NAME_BY_CODE = {
  PR001: "Samia Umm Abderrahmen", PR002: "Samia umm Haroun", PR003: "Asma",
  PR004: "Fatima Oum abdirrahmane", PR005: "Lilia", PR006: "Maria",
  PR007: "Sarah Lamari", PR008: "Sirine", PR009: "Rahma Housni", PR010: "Djouher",
}

function bestMatch(studentRaw, candidates) {
  const target = tokens(studentRaw)
  if (!target.length) return null
  const targetSet = new Set(target)
  let best = null, bestScore = 0
  for (const c of candidates) {
    const ct = c.tokens
    if (!ct.length) continue
    const common = ct.filter(t => targetSet.has(t)).length
    if (common === 0) continue
    // score : nb tokens communs, bonus si inclusion totale, bonus si 1er prénom identique
    let score = common * 10
    const allInOther = target.every(t => c.tokenSet.has(t)) || ct.every(t => targetSet.has(t))
    if (allInOther) score += 15
    if (ct[0] === target[0]) score += 8
    if (score > bestScore) { bestScore = score; best = c }
  }
  // exiger au moins 1 token commun ; en cas d'égalité faible, on garde quand même (historique)
  return bestScore >= 10 ? best : null
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } })
  if (!tenant) throw new Error("Tenant assahaba introuvable — lance d'abord migrate-google.mjs")
  const tenantId = tenant.id

  // Index profs : code -> userId
  const teachers = await prisma.user.findMany({ where: { tenantId, role: "TEACHER" } })
  const teacherIdByCode = {}
  for (const code of Object.keys(PROF_NAME_BY_CODE)) {
    const wanted = norm(PROF_NAME_BY_CODE[code])
    const u = teachers.find(t => norm(t.name).includes(wanted))
    if (u) teacherIdByCode[code] = u.id
  }

  // Index élèves par prof (via group.teacherId)
  const students = await prisma.student.findMany({
    where: { tenantId },
    select: { id: true, displayName: true, firstName: true, lastName: true, group: { select: { teacherId: true } } },
  })
  const studentsByTeacher = {}
  for (const s of students) {
    const tid = s.group?.teacherId
    if (!tid) continue
    const name = s.displayName || `${s.firstName} ${s.lastName}`
    const tk = tokens(name)
    ;(studentsByTeacher[tid] ||= []).push({ id: s.id, tokens: tk, tokenSet: new Set(tk) })
  }

  // Reset paiements du tenant
  await prisma.paymentAllocation.deleteMany({ where: { payment: { tenantId } } })
  await prisma.payment.deleteMany({ where: { tenantId } })

  let matched = 0
  const unmatched = []
  for (const p of payments) {
    const teacherId = teacherIdByCode[p.profCode]
    const pool = teacherId ? studentsByTeacher[teacherId] : null
    const hit = pool ? bestMatch(p.studentRaw, pool) : null
    if (!hit) { unmatched.push(`${p.profCode || "?"} | ${p.studentRaw} | ${p.amount}€`); continue }
    const d = new Date(p.date + "T12:00:00")
    await prisma.payment.create({
      data: {
        tenantId,
        studentId: hit.id,
        amount: p.amount,
        dueDate: d,
        paidDate: d,
        confirmedAt: d,
        status: "CONFIRMED",
        source: p.paymentType || "MANUAL",
        method: p.paymentType === "PAYPAL" ? "PayPal" : p.paymentType === "WISE" ? "Virement" : null,
        sessionNumber: p.sessionNumber || null,
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        expectedAmount: p.amount,
        receivedAmount: p.amount,
        detectedPayerName: p.payerName,
        notes: p.note,
        reference: `RECAP:${p.studentRaw}${p.sessionNumber ? " S"+p.sessionNumber : ""}`,
      },
    })
    matched++
  }

  console.log(`✅ Paiements importés : ${matched} / ${payments.length}`)
  if (unmatched.length) {
    console.log(`⚠️ Non rattachés (${unmatched.length}) :`)
    unmatched.forEach(u => console.log("   -", u))
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
