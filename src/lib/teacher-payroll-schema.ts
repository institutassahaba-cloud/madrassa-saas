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
  })()
  return teacherPayrollSchemaReady
}
