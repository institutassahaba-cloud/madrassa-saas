import { prisma } from "@/lib/prisma"
import { ensureTeacherPayrollSchema } from "@/lib/teacher-payroll-schema"
import { GROUP_RATES } from "@/lib/group-rates"

export type PayrollLessonEvent = {
  key: string
  lessonIds: string[]
  date: string
  status: "PRESENT" | "ABSENT"
  durationMinutes: number
  sessionNumber: number
  lessonNumber: number
  alreadyPaid: boolean
  paidLabel: string | null
}

export type PayrollCourseRow = {
  key: string
  label: string
  subject: string
  studentNames: string[]
  studentCount: number
  activeStudentCount: number
  forfait: string | null
  courseType: "INDIVIDUAL" | "BINOME" | "GROUP"
  hourlyRate: number
  lessons: PayrollLessonEvent[]
  savedFirstKey: string | null
  savedLastKey: string | null
}

export type TeacherPayrollData = {
  teacher: { id: string; name: string }
  activeStudentCount: number
  rows: PayrollCourseRow[]
  currentSalary: { id: string; status: string; bonus: number } | null
}

function durationToMinutes(duration: string | null | undefined) {
  if (!duration) return 60
  if (/min/i.test(duration)) return Number.parseInt(duration, 10) || 60
  const hours = Number.parseFloat(duration.replace(",", "."))
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 60
}

function formatForfait(frequency: number | null, duration: string | null) {
  if (!frequency && !duration) return null
  const durationLabel = duration
    ? /h|min/i.test(duration) ? duration : `${Number.parseFloat(duration.replace(",", ".")) * 60} min`
    : "durée non renseignée"
  return `${frequency ?? "?"} cours de ${durationLabel} / semaine`
}

function salaryLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}

type MutableEvent = Omit<PayrollLessonEvent, "alreadyPaid" | "paidLabel"> & {
  statuses: Set<string>
  alreadyPaid?: boolean
  paidLabel?: string | null
}

type MutableRow = {
  key: string
  label: string
  subject: string
  groupName: string | null
  studentNames: Map<string, { name: string; active: boolean }>
  forfait: string | null
  events: Map<string, MutableEvent>
}

export async function getTeacherPayrollData(tenantId: string, teacherId: string): Promise<TeacherPayrollData | null> {
  await ensureTeacherPayrollSchema()
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [teacher, sessions, salaries] = await Promise.all([
    prisma.user.findFirst({
      where: { id: teacherId, tenantId, role: "TEACHER", isActive: true },
      select: { id: true, name: true, individualRate: true, binomeRate: true, groupRate: true },
    }),
    prisma.lessonSession.findMany({
      where: { tenantId, teacherId },
      select: {
        id: true,
        subject: true,
        number: true,
        frequency: true,
        duration: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            lessonsPerWeek: true,
            duration: true,
            groupId: true,
            group: { select: { name: true } },
          },
        },
        lessons: {
          where: { date: { not: null }, status: { in: ["PRESENT", "ABSENT"] } },
          select: { id: true, number: true, date: true, status: true, duration: true, legacyPayrollBoundary: true },
          orderBy: { date: "asc" },
        },
      },
      orderBy: [{ student: { lastName: "asc" } }, { subject: "asc" }, { number: "asc" }],
    }),
    prisma.teacherSalary.findMany({
      where: { tenantId, teacherId },
      select: {
        id: true,
        month: true,
        year: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        notes: true,
        lines: { select: { courseKey: true, firstLessonAt: true, lastLessonAt: true } },
        salaryLessons: { select: { lessonId: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ])
  if (!teacher) return null

  const currentSalary = salaries.find((salary) => salary.month === month && salary.year === year) ?? null
  const previousSalaries = salaries.filter((salary) => salary.id !== currentSalary?.id)
  const exactlyPaid = new Map<string, string>()
  for (const salary of previousSalaries) {
    for (const item of salary.salaryLessons) exactlyPaid.set(item.lessonId, salaryLabel(salary.month, salary.year))
  }

  const rows = new Map<string, MutableRow>()
  const legacyDates = new Map<string, number>()
  const activeStudentIds = new Set<string>()

  for (const session of sessions) {
    const studentName = `${session.student.firstName} ${session.student.lastName}`.trim()
    if (session.student.status === "ACTIVE") activeStudentIds.add(session.student.id)
    const rowKey = session.student.groupId
      ? `group:${session.student.groupId}:${session.subject}`
      : `student:${session.student.id}:${session.subject}`
    const existing = rows.get(rowKey)
    const row: MutableRow = existing ?? {
      key: rowKey,
      label: studentName,
      subject: session.subject,
      groupName: session.student.group?.name ?? null,
      studentNames: new Map(),
      forfait: formatForfait(session.frequency ?? session.student.lessonsPerWeek, session.duration ?? session.student.duration),
      events: new Map(),
    }
    row.studentNames.set(session.student.id, { name: studentName, active: session.student.status === "ACTIVE" })
    if (!row.forfait) row.forfait = formatForfait(session.frequency ?? session.student.lessonsPerWeek, session.duration ?? session.student.duration)
    rows.set(rowKey, row)

    for (const lesson of session.lessons) {
      if (!lesson.date) continue
      const dateKey = lesson.date.toISOString().slice(0, 10)
      const eventKey = session.student.groupId ? `${rowKey}:${dateKey}` : lesson.id
      const fallbackMinutes = durationToMinutes(session.duration ?? session.student.duration)
      const event = row.events.get(eventKey) ?? {
        key: eventKey,
        lessonIds: [],
        date: lesson.date.toISOString(),
        status: lesson.status === "ABSENT" ? "ABSENT" : "PRESENT",
        durationMinutes: lesson.duration ?? fallbackMinutes,
        sessionNumber: session.number,
        lessonNumber: lesson.number,
        statuses: new Set<string>(),
      }
      event.lessonIds.push(lesson.id)
      event.statuses.add(lesson.status)
      event.status = event.statuses.has("PRESENT") ? "PRESENT" : "ABSENT"
      event.durationMinutes = Math.max(event.durationMinutes, lesson.duration ?? fallbackMinutes)
      event.sessionNumber = Math.min(event.sessionNumber, session.number)
      event.lessonNumber = Math.min(event.lessonNumber, lesson.number)
      row.events.set(eventKey, event)
      if (lesson.legacyPayrollBoundary) {
        legacyDates.set(rowKey, Math.max(legacyDates.get(rowKey) ?? 0, lesson.date.getTime()))
      }
    }
  }

  const savedLines = new Map((currentSalary?.lines ?? []).map((line) => [line.courseKey, line]))
  const resultRows: PayrollCourseRow[] = []
  for (const row of rows.values()) {
    const students = Array.from(row.studentNames.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"))
    const activeCount = students.filter((student) => student.active).length
    const studentCount = students.length
    const courseType = studentCount <= 1 ? "INDIVIDUAL" : studentCount === 2 ? "BINOME" : "GROUP"
    const hourlyRate = courseType === "INDIVIDUAL"
      ? teacher.individualRate ?? GROUP_RATES.solo
      : courseType === "BINOME" ? teacher.binomeRate ?? GROUP_RATES.binome : teacher.groupRate ?? GROUP_RATES.groupe
    const legacyDate = legacyDates.get(row.key) ?? 0
    const lessons = Array.from(row.events.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((event): PayrollLessonEvent => {
        let paidLabel: string | null = null
        for (const lessonId of event.lessonIds) {
          const exact = exactlyPaid.get(lessonId)
          if (exact) { paidLabel = exact; break }
        }
        if (!paidLabel && new Date(event.date).getTime() <= legacyDate) paidLabel = "ancienne paie"
        if (!paidLabel) {
          const covering = previousSalaries.find((salary) => salary.periodStart && salary.periodEnd && new Date(event.date) > salary.periodStart && new Date(event.date) <= salary.periodEnd)
          if (covering) paidLabel = salaryLabel(covering.month, covering.year)
        }
        return {
          key: event.key,
          lessonIds: event.lessonIds,
          date: event.date,
          status: event.status,
          durationMinutes: event.durationMinutes,
          sessionNumber: event.sessionNumber,
          lessonNumber: event.lessonNumber,
          alreadyPaid: Boolean(paidLabel),
          paidLabel,
        }
      })

    const saved = savedLines.get(row.key)
    const firstSaved = saved ? lessons.find((lesson) => new Date(lesson.date).getTime() === saved.firstLessonAt.getTime()) : null
    const lastSaved = saved ? [...lessons].reverse().find((lesson) => new Date(lesson.date).getTime() === saved.lastLessonAt.getTime()) : null
    resultRows.push({
      key: row.key,
      label: row.groupName ? `${row.groupName} — ${row.subject}` : `${students[0]?.name ?? row.label} — ${row.subject}`,
      subject: row.subject,
      studentNames: students.map((student) => student.name),
      studentCount,
      activeStudentCount: activeCount,
      forfait: row.forfait,
      courseType,
      hourlyRate,
      lessons,
      savedFirstKey: firstSaved?.key ?? null,
      savedLastKey: lastSaved?.key ?? null,
    })
  }

  resultRows.sort((a, b) => a.label.localeCompare(b.label, "fr"))
  const bonusMatch = currentSalary?.notes?.match(/Prime\s*:\s*([\d.,]+)/i)
  return {
    teacher: { id: teacher.id, name: teacher.name },
    activeStudentCount: activeStudentIds.size,
    rows: resultRows,
    currentSalary: currentSalary ? { id: currentSalary.id, status: currentSalary.status, bonus: bonusMatch ? Number(bonusMatch[1].replace(",", ".")) : 0 } : null,
  }
}
