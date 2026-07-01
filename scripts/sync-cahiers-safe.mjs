import fs from "fs"
import path from "path"
import crypto from "crypto"
import { createClient } from "@libsql/client"

const TENANT_SLUG = "assahaba"

const PROF_NAME_BY_CODE = {
  PR001: "Samia Umm Abderrahmen",
  PR002: "Samia umm Haroun",
  PR003: "Asma",
  PR004: "Fatima Oum abdirrahmane",
  PR005: "Lilia",
  PR006: "Maria",
  PR007: "Sarah Lamari",
  PR008: "Sirine",
  PR009: "Rahma Housni",
  PR010: "Djouher",
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith("--")) {
      args._.push(key)
      continue
    }
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
  const files = [
    ".env.local",
    ".env",
    ...(args.env ? [String(args.env)] : []),
  ]
  const merged = {}
  for (const file of files) Object.assign(merged, loadEnvFile(path.resolve(file)))
  return {
    ...process.env,
    ...merged,
    ...(args["db-url"] ? { DATABASE_URL: String(args["db-url"]) } : {}),
    ...(args["auth-token"] ? { TURSO_AUTH_TOKEN: String(args["auth-token"]) } : {}),
  }
}

function normalizeDatabaseUrl(url) {
  if (!url || !url.startsWith("libsql://")) return url
  const parsed = new URL(url)
  parsed.search = ""
  return parsed.toString()
}

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function normSubject(raw) {
  if (!raw) return null
  const text = norm(raw)
  if (text.includes("coran") || text.includes("quran")) return "Coran"
  if (text.includes("tajwid") || text.includes("tajweed")) return "Tajwid"
  if (text.includes("nouraniy") || text.includes("nuraniy") || text.includes("nourani")) return "Nouraniyah"
  if (text.includes("moutoun") || text.includes("matn") || text.includes("mutun")) return "Moutoun"
  if (text.includes("anglais") || text.includes("english")) return "Anglais"
  if (text.includes("arabe")) return "Arabe"
  return null
}

function sqlDate(value) {
  if (!value) return null
  return `${value}T12:00:00.000Z`
}

function nowIso() {
  return new Date().toISOString()
}

function newId() {
  return crypto.randomUUID()
}

function getEnrollments(cahier) {
  if (Array.isArray(cahier.enrollments)) return cahier.enrollments
  return Object.entries(cahier.students || {}).map(([el, data]) => ({
    el,
    subject: null,
    tab: null,
    sessions: data.sessions || [],
  }))
}

function lessonChanged(existing, source) {
  const existingDate = existing.date ? String(existing.date).slice(0, 10) : null
  return (
    existingDate !== (source.date || null) ||
    String(existing.status || "PENDING") !== String(source.status || "PENDING") ||
    String(existing.content || "").trim() !== String(source.content || "").trim()
  )
}

async function execute(client, sql, args = []) {
  return client.execute({ sql, args })
}

async function backupTeacher(client, teacherId, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  const sessions = await execute(
    client,
    `
      SELECT ls.*
      FROM LessonSession ls
      WHERE ls.teacherId = ?
      ORDER BY ls.studentId, ls.subject, ls.number
    `,
    [teacherId],
  )
  const lessons = await execute(
    client,
    `
      SELECT l.*
      FROM Lesson l
      JOIN LessonSession ls ON ls.id = l.sessionId
      WHERE ls.teacherId = ?
      ORDER BY l.sessionId, l.number
    `,
    [teacherId],
  )
  const file = path.join(outDir, `${teacherId}.json`)
  fs.writeFileSync(file, JSON.stringify({ sessions: sessions.rows, lessons: lessons.rows }, null, 2))
  return file
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const apply = Boolean(args.apply)
  const updateExisting = Boolean(args["update-existing"])
  const dataDir = path.resolve(String(args.dir || "prisma/data"))
  const only = args._[0] || null
  const env = resolveEnv(args)
  const databaseUrl = normalizeDatabaseUrl(env.DATABASE_URL || `file://${path.resolve("prisma/dev.db")}`)

  if (databaseUrl.startsWith("libsql://") && !env.TURSO_AUTH_TOKEN) {
    throw new Error("TURSO_AUTH_TOKEN est manquant pour la base en ligne.")
  }

  const client = createClient({
    url: databaseUrl,
    ...(env.TURSO_AUTH_TOKEN ? { authToken: env.TURSO_AUTH_TOKEN } : {}),
  })

  const tenant = await execute(client, "SELECT id FROM Tenant WHERE slug = ? LIMIT 1", [TENANT_SLUG])
  if (!tenant.rows.length) throw new Error("Tenant assahaba introuvable.")
  const tenantId = tenant.rows[0].id

  let files = fs.readdirSync(dataDir).filter((file) => /^cahier-PR\d+\.json$/.test(file))
  if (only) files = files.filter((file) => file.includes(only))
  files.sort()
  if (!files.length) {
    console.log("Aucun fichier cahier-PR*.json trouvé.")
    return
  }

  const teachers = await execute(
    client,
    "SELECT id, name FROM User WHERE tenantId = ? AND role = 'TEACHER'",
    [tenantId],
  )

  const backupDir = path.join(
    "/private/tmp",
    `madrassa-cahiers-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  )

  let totals = {
    sessionsToCreate: 0,
    lessonsToCreate: 0,
    lessonsToUpdate: 0,
    sessionsMarkedComplete: 0,
    skippedPlaceholders: 0,
    unmatched: 0,
  }

  for (const file of files) {
    const cahier = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"))
    const teacherName = PROF_NAME_BY_CODE[cahier.profCode]
    const teacher = teachers.rows.find((row) => norm(row.name).includes(norm(teacherName)))
    if (!teacher) {
      console.log(`${file}: professeur introuvable (${cahier.profCode}).`)
      continue
    }

    const students = await execute(
      client,
      `
        SELECT s.id, s.legacyId, s.subject
        FROM Student s
        LEFT JOIN "Group" g ON g.id = s.groupId
        WHERE s.tenantId = ? AND g.teacherId = ?
      `,
      [tenantId, teacher.id],
    )

    const byLegacy = new Map()
    const byLegacySubject = new Map()
    for (const student of students.rows) {
      if (!student.legacyId) continue
      const legacy = String(student.legacyId)
      if (!byLegacy.has(legacy)) byLegacy.set(legacy, [])
      byLegacy.get(legacy).push(student)
      byLegacySubject.set(`${legacy}|${normSubject(student.subject)}`, student)
    }

    const currentSessions = await execute(
      client,
      `
        SELECT ls.*
        FROM LessonSession ls
        WHERE ls.tenantId = ? AND ls.teacherId = ?
      `,
      [tenantId, teacher.id],
    )
    const sessionByKey = new Map()
    for (const session of currentSessions.rows) {
      sessionByKey.set(`${session.studentId}|${session.subject}|${session.number}`, session)
    }

    const lessons = await execute(
      client,
      `
        SELECT l.*
        FROM Lesson l
        JOIN LessonSession ls ON ls.id = l.sessionId
        WHERE ls.tenantId = ? AND ls.teacherId = ?
      `,
      [tenantId, teacher.id],
    )
    const lessonByKey = new Map()
    for (const lesson of lessons.rows) lessonByKey.set(`${lesson.sessionId}|${lesson.number}`, lesson)

    const plan = {
      sessionsToCreate: [],
      lessonsToCreate: [],
      lessonsToUpdate: [],
      sessionsToComplete: [],
      unmatched: [],
      skippedPlaceholders: 0,
    }

    for (const enrollment of getEnrollments(cahier)) {
      const subject = normSubject(enrollment.tab) || normSubject(enrollment.subject)
      let student = subject ? byLegacySubject.get(`${enrollment.el}|${subject}`) : null
      const candidates = byLegacy.get(enrollment.el) || []
      if (!student && candidates.length === 1) student = candidates[0]
      if (!student && candidates.length > 1) student = candidates[0]
      if (!student) {
        plan.unmatched.push(`${enrollment.el}${enrollment.tab ? ` (${enrollment.tab})` : ""}`)
        continue
      }

      const effectiveSubject = subject || student.subject || "Coran"
      for (const sourceSession of enrollment.sessions || []) {
        const sourceLessons = (sourceSession.lessons || []).filter((lesson) => lesson.date)
        if (!sourceLessons.length) {
          plan.skippedPlaceholders++
          continue
        }

        const sessionKey = `${student.id}|${effectiveSubject}|${sourceSession.number}`
        let session = sessionByKey.get(sessionKey)
        if (!session) {
          session = {
            id: newId(),
            tenantId,
            studentId: student.id,
            teacherId: teacher.id,
            subject: effectiveSubject,
            number: sourceSession.number,
          }
          sessionByKey.set(sessionKey, session)
          plan.sessionsToCreate.push(session)
        }

        const ended = sourceLessons.every((lesson) => lesson.date)
        const endedAt = ended ? sqlDate(sourceLessons[sourceLessons.length - 1].date) : null
        if (ended && !session.isComplete) {
          plan.sessionsToComplete.push({ session, endedAt })
        }

        for (const sourceLesson of sourceLessons) {
          const lessonKey = `${session.id}|${sourceLesson.number}`
          const existingLesson = lessonByKey.get(lessonKey)
          if (!existingLesson) {
            const createdLesson = {
              id: newId(),
              tenantId,
              sessionId: session.id,
              number: sourceLesson.number,
              date: sqlDate(sourceLesson.date),
              status: sourceLesson.status || "PENDING",
              content: sourceLesson.content || null,
            }
            lessonByKey.set(lessonKey, createdLesson)
            plan.lessonsToCreate.push(createdLesson)
            continue
          }
          if (lessonChanged(existingLesson, sourceLesson)) {
            const hasBlankCurrent = !existingLesson.date || !existingLesson.content
            if (updateExisting || hasBlankCurrent) {
              plan.lessonsToUpdate.push({
                id: existingLesson.id,
                date: sqlDate(sourceLesson.date),
                status: sourceLesson.status || "PENDING",
                content: sourceLesson.content || null,
              })
            }
          }
        }
      }
    }

    console.log(
      `${file} ${apply ? "application" : "aperçu"}: ` +
        `${plan.sessionsToCreate.length} sessions à créer, ` +
        `${plan.lessonsToCreate.length} cours à créer, ` +
        `${plan.lessonsToUpdate.length} cours à compléter/mettre à jour, ` +
        `${plan.sessionsToComplete.length} sessions à marquer terminées, ` +
        `${plan.unmatched.length} non rattachés.`,
    )

    totals.sessionsToCreate += plan.sessionsToCreate.length
    totals.lessonsToCreate += plan.lessonsToCreate.length
    totals.lessonsToUpdate += plan.lessonsToUpdate.length
    totals.sessionsMarkedComplete += plan.sessionsToComplete.length
    totals.skippedPlaceholders += plan.skippedPlaceholders
    totals.unmatched += plan.unmatched.length

    if (!apply) continue

    const backupFile = await backupTeacher(client, teacher.id, backupDir)
    console.log(`Sauvegarde: ${backupFile}`)

    await execute(client, "BEGIN")
    try {
      for (const session of plan.sessionsToCreate) {
        await execute(
          client,
          `
            INSERT INTO LessonSession (
              id, tenantId, studentId, teacherId, subject, number,
              isComplete, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
          `,
          [
            session.id,
            session.tenantId,
            session.studentId,
            session.teacherId,
            session.subject,
            session.number,
            nowIso(),
            nowIso(),
          ],
        )
      }
      for (const lesson of plan.lessonsToCreate) {
        await execute(
          client,
          `
            INSERT INTO Lesson (
              id, tenantId, sessionId, number, date, status, content, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            lesson.id,
            lesson.tenantId,
            lesson.sessionId,
            lesson.number,
            lesson.date,
            lesson.status,
            lesson.content,
            nowIso(),
            nowIso(),
          ],
        )
      }
      for (const lesson of plan.lessonsToUpdate) {
        await execute(
          client,
          `
            UPDATE Lesson
            SET date = ?, status = ?, content = ?, updatedAt = ?
            WHERE id = ?
          `,
          [lesson.date, lesson.status, lesson.content, nowIso(), lesson.id],
        )
      }
      for (const { session, endedAt } of plan.sessionsToComplete) {
        await execute(
          client,
          `
            UPDATE LessonSession
            SET isComplete = 1, endedAt = COALESCE(endedAt, ?), updatedAt = ?
            WHERE id = ?
          `,
          [endedAt, nowIso(), session.id],
        )
      }
      await execute(client, "COMMIT")
    } catch (error) {
      await execute(client, "ROLLBACK")
      throw error
    }
  }

  console.log(
    `Total ${apply ? "appliqué" : "prévu"}: ` +
      `${totals.sessionsToCreate} sessions, ` +
      `${totals.lessonsToCreate} cours créés, ` +
      `${totals.lessonsToUpdate} cours complétés/actualisés, ` +
      `${totals.sessionsMarkedComplete} sessions terminées, ` +
      `${totals.unmatched} non rattachés.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
