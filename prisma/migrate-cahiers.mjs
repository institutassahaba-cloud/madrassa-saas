/**
 * Migration des cahiers de cours (sessions + cours + présences) → SaaS.
 * À lancer APRÈS migrate-google.mjs.
 *
 * Source : prisma/data/cahier-PR*.json (extraits par _extract_cahier.py).
 * Rattachement : par legacyId (EL###) à l'élève migré du prof concerné.
 * Idempotent : supprime les LessonSession des élèves du prof avant import.
 *
 * Usage : node prisma/migrate-cahiers.mjs           (tous les cahier-PR*.json)
 *         node prisma/migrate-cahiers.mjs PR003      (un seul prof)
 */
import { PrismaClient } from "@prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import path from "path"
import { fileURLToPath } from "url"
import { readFileSync, readdirSync } from "fs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const adapter = new PrismaLibSql({ url: `file://${path.resolve(__dirname, "dev.db")}` })
const prisma = new PrismaClient({ adapter })

const TENANT_SLUG = "assahaba"
const only = process.argv[2] || null

const PROF_NAME_BY_CODE = {
  PR001: "Samia Umm Abderrahmen", PR002: "Samia umm Haroun", PR003: "Asma",
  PR004: "Fatima Oum abdirrahmane", PR005: "Lilia", PR006: "Maria",
  PR007: "Sarah Lamari", PR008: "Sirine", PR009: "Rahma Housni", PR010: "Djouher",
}
const norm = (s) => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim()

// Normalisation matière (miroir de src/lib/subjects.ts) pour matcher EL + matière.
function normSubject(raw) {
  if (!raw) return null
  const t = norm(raw)
  if (t.includes("coran") || t.includes("quran")) return "Coran"
  if (t.includes("tajwid") || t.includes("tajweed")) return "Tajwid"
  if (t.includes("nouraniy") || t.includes("nuraniy") || t.includes("nourani")) return "Nouraniyah"
  if (t.includes("moutoun") || t.includes("matn") || t.includes("mutun")) return "Moutoun"
  if (t.includes("anglais") || t.includes("english")) return "Anglais"
  if (t.includes("arabe")) return "Arabe"
  return null
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } })
  if (!tenant) throw new Error("Tenant assahaba introuvable")
  const tenantId = tenant.id

  const teachers = await prisma.user.findMany({ where: { tenantId, role: "TEACHER" } })
  const teacherIdByCode = {}
  for (const [code, name] of Object.entries(PROF_NAME_BY_CODE)) {
    const u = teachers.find(t => norm(t.name).includes(norm(name)))
    if (u) teacherIdByCode[code] = u.id
  }

  const dataDir = path.join(__dirname, "data")
  let files = readdirSync(dataDir).filter(f => /^cahier-PR\d+\.json$/.test(f))
  if (only) files = files.filter(f => f.includes(only))
  if (!files.length) { console.log("Aucun fichier cahier-PR*.json"); return }

  for (const file of files) {
    const cahier = JSON.parse(readFileSync(path.join(dataDir, file), "utf8"))
    const profCode = cahier.profCode
    const teacherId = teacherIdByCode[profCode]
    if (!teacherId) { console.log(`⚠️ ${file}: prof ${profCode} introuvable`); continue }

    // Élèves migrés de ce prof, indexés par legacyId et par legacyId+matière
    const students = await prisma.student.findMany({
      where: { tenantId, group: { teacherId } },
      select: { id: true, legacyId: true, subject: true },
    })
    const byLegacy = {}
    const byLegacySubject = {}
    for (const s of students) {
      if (!s.legacyId) continue
      ;(byLegacy[s.legacyId] ||= []).push(s)
      byLegacySubject[`${s.legacyId}|${normSubject(s.subject)}`] = s
    }

    // Supporte les 2 formats : nouveau (enrollments EL+matière) ou ancien (students par EL)
    const enrollments = cahier.enrollments
      ? cahier.enrollments
      : Object.entries(cahier.students || {}).map(([el, d]) => ({ el, subject: null, sessions: d.sessions }))

    // Reset : supprime les sessions existantes des élèves de ce prof
    await prisma.lessonSession.deleteMany({ where: { tenantId, teacherId } })

    // Regroupe les sessions par fiche élève cible (EL + matière en priorité)
    const targetSessions = new Map() // studentId -> {student, sessions:[]}
    const unmatched = []
    for (const enr of enrollments) {
      // Le titre de l'onglet encode souvent la matière ("Hamza - Coran") et est plus fiable
      // que la colonne Matière (parfois décalée) ; fallback sur subject extrait.
      const sub = normSubject(enr.tab) || normSubject(enr.subject)
      let student = (sub && byLegacySubject[`${enr.el}|${sub}`]) || null
      if (!student) {
        const cands = byLegacy[enr.el]
        if (cands && cands.length === 1) student = cands[0]       // une seule fiche → sans ambiguïté
        else if (cands && cands.length) student = cands[0]        // plusieurs mais matière inconnue → 1ère
      }
      if (!student) { unmatched.push(enr.subject ? `${enr.el}/${enr.subject}` : enr.el); continue }
      const bucket = targetSessions.get(student.id) || { student, sessions: [] }
      bucket.sessions.push(...enr.sessions)
      targetSessions.set(student.id, bucket)
    }

    let nbSessions = 0, nbLessons = 0
    for (const { student, sessions } of targetSessions.values()) {
      const subject = student.subject || "Coran"
      // On garde le VRAI numéro de session lu dans le fichier (Session 06 → number 6),
      // et on ignore les sessions placeholder entièrement vides (aucun cours daté) :
      // elles seront créées à la demande via le bouton « Nouvelle session ».
      const ordered = [...sessions]
        .filter(s => (s.lessons || []).some(l => l.date))
        .sort((a, b) => a.number - b.number)
      const seen = new Set()
      for (const sess of ordered) {
        if (seen.has(sess.number)) continue // évite les collisions de numéro sur une même fiche
        seen.add(sess.number)
        const lessons = sess.lessons
        const ended = lessons.length && lessons.every(l => l.date)
        const created = await prisma.lessonSession.create({
          data: {
            tenantId, studentId: student.id, teacherId, subject,
            number: sess.number,
            isComplete: ended,
            endedAt: ended ? new Date(lessons[lessons.length-1].date + "T12:00:00") : null,
          },
        })
        nbSessions++
        await prisma.lesson.createMany({
          data: lessons.map(l => ({
            tenantId, sessionId: created.id, number: l.number,
            date: l.date ? new Date(l.date + "T12:00:00") : null,
            status: l.status, content: l.content || null,
          })),
        })
        nbLessons += lessons.length
      }
    }
    console.log(`✅ ${file} (${profCode}) : ${targetSessions.size} élèves, ${nbSessions} sessions, ${nbLessons} cours` +
      (unmatched.length ? ` | non rattachés: ${unmatched.join(",")}` : ""))
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
