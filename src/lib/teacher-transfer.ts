import { prisma } from "@/lib/prisma"
import { ensureTeacherPayrollSchema } from "@/lib/teacher-payroll-schema"
import { lessonOwner } from "@/lib/teacher-transfer-view"

// ─── Schéma (Turso n'est pas géré par `prisma db push` dans ce projet) ────────

let teacherTransferSchemaReady: Promise<void> | null = null

async function execute(sql: string) {
  await prisma.$executeRawUnsafe(sql).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/already exists|duplicate column|duplicate/i.test(message)) return
    throw error
  })
}

export function ensureTeacherTransferSchema() {
  teacherTransferSchemaReady ??= (async () => {
    await execute('ALTER TABLE "Lesson" ADD COLUMN "teacherId" TEXT')
    await execute('CREATE INDEX IF NOT EXISTS "Lesson_tenantId_teacherId_idx" ON "Lesson"("tenantId", "teacherId")')
    await execute(`CREATE TABLE IF NOT EXISTS "SessionTeacherTransfer" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "sessionId" TEXT NOT NULL,
      "fromTeacherId" TEXT NOT NULL,
      "fromTeacherName" TEXT NOT NULL,
      "toTeacherId" TEXT NOT NULL,
      "toTeacherName" TEXT NOT NULL,
      "boundaryLessonNumber" INTEGER NOT NULL,
      "reason" TEXT,
      "transferredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdById" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SessionTeacherTransfer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LessonSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`)
    await execute('CREATE INDEX IF NOT EXISTS "SessionTeacherTransfer_tenantId_sessionId_idx" ON "SessionTeacherTransfer"("tenantId", "sessionId")')
    await execute('CREATE INDEX IF NOT EXISTS "SessionTeacherTransfer_tenantId_fromTeacherId_idx" ON "SessionTeacherTransfer"("tenantId", "fromTeacherId")')
  })()
  return teacherTransferSchemaReady
}

// ─── Attribution d'un cours à un professeur ──────────────────────────────────

export type OwnedLesson = { teacherId?: string | null }
export type OwnedSession = { teacherId: string }

/**
 * Professeur créditeur d'un cours : celui épinglé sur le cours (transfert), sinon
 * le professeur courant de la session. Règle unique et exclusive : un cours n'a
 * qu'un seul propriétaire, donc il ne peut jamais être payé deux fois. La règle
 * vit dans `teacher-transfer-view` pour être partagée avec l'affichage.
 */
export function lessonOwnerId(lesson: OwnedLesson, session: OwnedSession): string {
  return lessonOwner(lesson, session.teacherId)
}

export function isLessonOwnedBy(lesson: OwnedLesson, session: OwnedSession, teacherId: string): boolean {
  return lessonOwnerId(lesson, session) === teacherId
}

/** Filtre Prisma : sessions que le professeur possède, en cours ou avant transfert. */
export function sessionsOwnedOrTaughtBy(teacherId: string) {
  return {
    OR: [{ teacherId }, { lessons: { some: { teacherId } } }],
  }
}

// ─── Transferts d'une session ────────────────────────────────────────────────

export type SessionTransfer = {
  id: string
  sessionId: string
  fromTeacherId: string
  fromTeacherName: string
  toTeacherId: string
  toTeacherName: string
  boundaryLessonNumber: number
  transferredAt: string
  /** Tous les cours de l'ancien professeur ont été payés : sa copie est archivée. */
  archived: boolean
}

type TransferRow = {
  id: string
  tenantId: string
  sessionId: string
  fromTeacherId: string
  fromTeacherName: string
  toTeacherId: string
  toTeacherName: string
  boundaryLessonNumber: number
  transferredAt: Date
}

/**
 * Un cours est considéré payé s'il est rattaché à une fiche de paie soldée
 * (lien exact `TeacherSalaryLesson`) ou s'il tombe dans la période d'une paie
 * soldée de son professeur — les deux voies de paie du SaaS.
 */
function buildPaidChecker(
  paidLessonIds: Set<string>,
  paidPeriodsByTeacher: Map<string, { start: Date; end: Date }[]>,
) {
  return (lessonId: string, teacherId: string, date: Date | null) => {
    if (paidLessonIds.has(lessonId)) return true
    if (!date) return false
    const periods = paidPeriodsByTeacher.get(teacherId)
    if (!periods) return false
    return periods.some((period) => date > period.start && date <= period.end)
  }
}

/**
 * Charge les changements de professeur du tenant et indique, pour chacun, si la
 * copie de l'ancien professeur est archivée (tous ses cours payés).
 */
export async function getSessionTransfers(
  tenantId: string,
  sessionIds?: string[],
): Promise<Map<string, SessionTransfer[]>> {
  await ensureTeacherTransferSchema()
  if (sessionIds && sessionIds.length === 0) return new Map()

  const transfers = (await prisma.sessionTeacherTransfer.findMany({
    where: { tenantId, ...(sessionIds ? { sessionId: { in: sessionIds } } : {}) },
    orderBy: [{ sessionId: "asc" }, { boundaryLessonNumber: "asc" }],
  })) as TransferRow[]
  if (transfers.length === 0) return new Map()

  // L'état « archivé » se lit dans les fiches de paie : leurs tables doivent exister.
  await ensureTeacherPayrollSchema()
  const transferSessionIds = Array.from(new Set(transfers.map((transfer) => transfer.sessionId)))
  const fromTeacherIds = Array.from(new Set(transfers.map((transfer) => transfer.fromTeacherId)))

  // Cours réellement donnés (présent/absent) qui appartiennent aux anciens professeurs.
  const taughtLessons = await prisma.lesson.findMany({
    where: {
      tenantId,
      sessionId: { in: transferSessionIds },
      teacherId: { in: fromTeacherIds },
      status: { in: ["PRESENT", "ABSENT"] },
    },
    select: { id: true, sessionId: true, number: true, date: true, teacherId: true },
  })

  const [salaryLessons, paidSalaries] = await Promise.all([
    taughtLessons.length > 0
      ? prisma.teacherSalaryLesson.findMany({
          where: { tenantId, lessonId: { in: taughtLessons.map((lesson) => lesson.id) } },
          select: { lessonId: true, salary: { select: { status: true } } },
        })
      : Promise.resolve([]),
    prisma.teacherSalary.findMany({
      where: { tenantId, teacherId: { in: fromTeacherIds }, status: "PAID", periodEnd: { not: null } },
      select: { teacherId: true, periodStart: true, periodEnd: true },
    }),
  ])

  const paidLessonIds = new Set(
    salaryLessons.filter((item) => item.salary?.status === "PAID").map((item) => item.lessonId),
  )
  const paidPeriodsByTeacher = new Map<string, { start: Date; end: Date }[]>()
  for (const salary of paidSalaries) {
    if (!salary.periodEnd) continue
    const periods = paidPeriodsByTeacher.get(salary.teacherId) ?? []
    periods.push({ start: salary.periodStart ?? new Date(0), end: salary.periodEnd })
    paidPeriodsByTeacher.set(salary.teacherId, periods)
  }
  const isPaid = buildPaidChecker(paidLessonIds, paidPeriodsByTeacher)

  const result = new Map<string, SessionTransfer[]>()
  for (const transfer of transfers) {
    const owned = taughtLessons.filter(
      (lesson) => lesson.sessionId === transfer.sessionId
        && lesson.teacherId === transfer.fromTeacherId
        && lesson.number <= transfer.boundaryLessonNumber,
    )
    // Sans cours donné, rien à payer : la copie de l'ancien professeur est
    // archivable immédiatement.
    const archived = owned.every((lesson) => isPaid(lesson.id, transfer.fromTeacherId, lesson.date))
    const list = result.get(transfer.sessionId) ?? []
    list.push({
      id: transfer.id,
      sessionId: transfer.sessionId,
      fromTeacherId: transfer.fromTeacherId,
      fromTeacherName: transfer.fromTeacherName,
      toTeacherId: transfer.toTeacherId,
      toTeacherName: transfer.toTeacherName,
      boundaryLessonNumber: transfer.boundaryLessonNumber,
      transferredAt: transfer.transferredAt.toISOString(),
      archived,
    })
    result.set(transfer.sessionId, list)
  }
  return result
}
