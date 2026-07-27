import { prisma } from "@/lib/prisma"

let teacherPayrollSchemaReady: Promise<void> | null = null

async function execute(sql: string) {
  await prisma.$executeRawUnsafe(sql).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/already exists|duplicate/i.test(message)) return
    throw error
  })
}

// Turso n'est pas géré par `prisma db push` dans ce projet. Ces tables sont
// créées de façon idempotente au premier accès, comme les autres ajouts de
// schéma progressifs du SaaS.
export function ensureTeacherPayrollSchema() {
  teacherPayrollSchemaReady ??= (async () => {
    await execute(`CREATE TABLE IF NOT EXISTS "TeacherSalaryLine" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "salaryId" TEXT NOT NULL,
      "courseKey" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "studentNames" TEXT NOT NULL,
      "studentCount" INTEGER NOT NULL,
      "forfait" TEXT,
      "courseType" TEXT NOT NULL,
      "lessonsCount" INTEGER NOT NULL,
      "durationMinutes" INTEGER NOT NULL,
      "hourlyRate" REAL NOT NULL,
      "hoursWorked" REAL NOT NULL,
      "totalAmount" REAL NOT NULL,
      "firstLessonAt" DATETIME NOT NULL,
      "lastLessonAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeacherSalaryLine_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "TeacherSalary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`)
    await execute('CREATE UNIQUE INDEX IF NOT EXISTS "TeacherSalaryLine_salaryId_courseKey_key" ON "TeacherSalaryLine"("salaryId", "courseKey")')
    await execute('CREATE INDEX IF NOT EXISTS "TeacherSalaryLine_tenantId_salaryId_idx" ON "TeacherSalaryLine"("tenantId", "salaryId")')

    await execute(`CREATE TABLE IF NOT EXISTS "TeacherSalaryLesson" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "salaryId" TEXT NOT NULL,
      "lineId" TEXT NOT NULL,
      "lessonId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeacherSalaryLesson_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "TeacherSalary" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TeacherSalaryLesson_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "TeacherSalaryLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TeacherSalaryLesson_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`)
    await execute('CREATE UNIQUE INDEX IF NOT EXISTS "TeacherSalaryLesson_tenantId_lessonId_key" ON "TeacherSalaryLesson"("tenantId", "lessonId")')
    await execute('CREATE INDEX IF NOT EXISTS "TeacherSalaryLesson_salaryId_lineId_idx" ON "TeacherSalaryLesson"("salaryId", "lineId")')

    await execute(`CREATE TABLE IF NOT EXISTS "TeacherSalaryRevision" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "salaryId" TEXT NOT NULL,
      "revision" INTEGER NOT NULL,
      "totalAmount" REAL NOT NULL,
      "status" TEXT NOT NULL,
      "paidDate" DATETIME,
      "hoursWorked" REAL,
      "lessonsCount" INTEGER,
      "periodStart" DATETIME,
      "periodEnd" DATETIME,
      "notes" TEXT,
      "snapshotJson" TEXT NOT NULL,
      "createdById" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeacherSalaryRevision_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "TeacherSalary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`)
    await execute('CREATE UNIQUE INDEX IF NOT EXISTS "TeacherSalaryRevision_salaryId_revision_key" ON "TeacherSalaryRevision"("salaryId", "revision")')
    await execute('CREATE INDEX IF NOT EXISTS "TeacherSalaryRevision_tenantId_createdAt_idx" ON "TeacherSalaryRevision"("tenantId", "createdAt")')

    await execute('CREATE INDEX IF NOT EXISTS "TeacherSalary_tenantId_createdAt_idx" ON "TeacherSalary"("tenantId", "createdAt")')
    await execute('CREATE INDEX IF NOT EXISTS "TeacherSalary_tenantId_teacherId_periodEnd_idx" ON "TeacherSalary"("tenantId", "teacherId", "periodEnd")')
    await execute('CREATE INDEX IF NOT EXISTS "SecretaryCommission_tenantId_createdAt_idx" ON "SecretaryCommission"("tenantId", "createdAt")')
    await execute('CREATE INDEX IF NOT EXISTS "Payment_tenantId_status_confirmedAt_idx" ON "Payment"("tenantId", "status", "confirmedAt")')
    await execute('CREATE INDEX IF NOT EXISTS "Payment_tenantId_status_paidDate_idx" ON "Payment"("tenantId", "status", "paidDate")')
    await execute('CREATE INDEX IF NOT EXISTS "Payment_tenantId_studentId_status_idx" ON "Payment"("tenantId", "studentId", "status")')
    await execute('CREATE INDEX IF NOT EXISTS "PaymentMatch_tenantId_status_updatedAt_idx" ON "PaymentMatch"("tenantId", "status", "updatedAt")')
    await execute('CREATE INDEX IF NOT EXISTS "PaymentMatch_tenantId_status_confirmedAt_idx" ON "PaymentMatch"("tenantId", "status", "confirmedAt")')
    await execute('CREATE INDEX IF NOT EXISTS "LessonSession_tenantId_teacherId_isComplete_idx" ON "LessonSession"("tenantId", "teacherId", "isComplete")')
    await execute('CREATE INDEX IF NOT EXISTS "LessonSession_tenantId_studentId_idx" ON "LessonSession"("tenantId", "studentId")')
    await execute('CREATE INDEX IF NOT EXISTS "Lesson_tenantId_sessionId_date_idx" ON "Lesson"("tenantId", "sessionId", "date")')
    await execute('CREATE INDEX IF NOT EXISTS "Lesson_tenantId_status_date_idx" ON "Lesson"("tenantId", "status", "date")')
  })()
  return teacherPayrollSchemaReady
}
