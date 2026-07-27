CREATE TABLE IF NOT EXISTS "TeacherSalaryRevision" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherSalaryRevision_salaryId_revision_key" ON "TeacherSalaryRevision"("salaryId", "revision");
CREATE INDEX IF NOT EXISTS "TeacherSalaryRevision_tenantId_createdAt_idx" ON "TeacherSalaryRevision"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "TeacherSalary_tenantId_createdAt_idx" ON "TeacherSalary"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "TeacherSalary_tenantId_teacherId_periodEnd_idx" ON "TeacherSalary"("tenantId", "teacherId", "periodEnd");
CREATE INDEX IF NOT EXISTS "SecretaryCommission_tenantId_createdAt_idx" ON "SecretaryCommission"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_tenantId_status_confirmedAt_idx" ON "Payment"("tenantId", "status", "confirmedAt");
CREATE INDEX IF NOT EXISTS "Payment_tenantId_status_paidDate_idx" ON "Payment"("tenantId", "status", "paidDate");
CREATE INDEX IF NOT EXISTS "Payment_tenantId_studentId_status_idx" ON "Payment"("tenantId", "studentId", "status");
CREATE INDEX IF NOT EXISTS "PaymentMatch_tenantId_status_updatedAt_idx" ON "PaymentMatch"("tenantId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "PaymentMatch_tenantId_status_confirmedAt_idx" ON "PaymentMatch"("tenantId", "status", "confirmedAt");
CREATE INDEX IF NOT EXISTS "LessonSession_tenantId_teacherId_isComplete_idx" ON "LessonSession"("tenantId", "teacherId", "isComplete");
CREATE INDEX IF NOT EXISTS "LessonSession_tenantId_studentId_idx" ON "LessonSession"("tenantId", "studentId");
CREATE INDEX IF NOT EXISTS "Lesson_tenantId_sessionId_date_idx" ON "Lesson"("tenantId", "sessionId", "date");
CREATE INDEX IF NOT EXISTS "Lesson_tenantId_status_date_idx" ON "Lesson"("tenantId", "status", "date");
