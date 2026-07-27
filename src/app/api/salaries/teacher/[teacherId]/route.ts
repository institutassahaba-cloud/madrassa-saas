import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"
import { getTeacherPayrollData, type PayrollCourseRow, type PayrollLessonEvent } from "@/lib/teacher-payroll"
import { snapshotTeacherSalary } from "@/lib/salary-history"

type Selection = { courseKey: string; firstLessonKey: string; lastLessonKey: string }
type CalculatedLine = {
  row: PayrollCourseRow
  lessons: PayrollLessonEvent[]
  durationMinutes: number
  hoursWorked: number
  totalAmount: number
}

export const POST = wrap(async (req: Request, { params }: { params: Promise<{ teacherId: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "DIRECTOR") return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })

  const { teacherId } = await params
  const body = await req.json().catch(() => ({}))
  const selections: Selection[] = Array.isArray(body.selections) ? body.selections : []
  const bonus = Number(body.bonus ?? 0)
  if (!Number.isFinite(bonus) || bonus < 0) return NextResponse.json({ error: "Prime invalide." }, { status: 400 })

  const payroll = await getTeacherPayrollData(session.user.tenantId, teacherId)
  if (!payroll) return NextResponse.json({ error: "Professeur introuvable." }, { status: 404 })

  const calculatedLines: CalculatedLine[] = []
  for (const selection of selections) {
    const row = payroll.rows.find((item) => item.key === selection.courseKey)
    if (!row) return NextResponse.json({ error: `Ligne de paie introuvable : ${selection.courseKey}` }, { status: 400 })
    const firstIndex = row.lessons.findIndex((lesson) => lesson.key === selection.firstLessonKey)
    const lastIndex = row.lessons.findIndex((lesson) => lesson.key === selection.lastLessonKey)
    if (firstIndex < 0 || lastIndex < firstIndex) return NextResponse.json({ error: `Bornes invalides pour ${row.label}.` }, { status: 400 })
    const lessons = row.lessons.slice(firstIndex, lastIndex + 1)
    if (lessons.some((lesson) => lesson.alreadyPaid)) {
      return NextResponse.json({ error: `${row.label} contient un cours déjà payé. Actualisez la fiche puis recommencez.` }, { status: 409 })
    }
    if (lessons.length === 0) continue
    const durationMinutes = lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0)
    const hoursWorked = +(durationMinutes / 60).toFixed(2)
    const totalAmount = +(durationMinutes / 60 * row.hourlyRate).toFixed(2)
    calculatedLines.push({ row, lessons, durationMinutes, hoursWorked, totalAmount })
  }

  if (calculatedLines.length === 0 && bonus === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins un cours à payer." }, { status: 400 })
  }

  const allLessons = calculatedLines.flatMap((line) => line.lessons)
  const periodStart = allLessons.length ? new Date(Math.min(...allLessons.map((lesson) => new Date(lesson.date).getTime()))) : new Date()
  const periodEnd = allLessons.length ? new Date(Math.max(...allLessons.map((lesson) => new Date(lesson.date).getTime()))) : new Date()
  const lessonsCount = allLessons.length
  const hoursWorked = +calculatedLines.reduce((sum, line) => sum + line.hoursWorked, 0).toFixed(2)
  const courseTotal = +calculatedLines.reduce((sum, line) => sum + line.totalAmount, 0).toFixed(2)
  const totalAmount = +(courseTotal + bonus).toFixed(2)
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const saved = await prisma.$transaction(async (tx) => {
    const existing = await tx.teacherSalary.findUnique({ where: { teacherId_month_year: { teacherId, month, year } } })
    const revision = existing ? `Recalcul validé le ${now.toLocaleString("fr-FR")}.` : `Calcul validé le ${now.toLocaleString("fr-FR")}.`
    const notes = [bonus > 0 ? `Prime : ${bonus.toFixed(2)} €` : null, revision].filter(Boolean).join("\n")
    if (existing) await snapshotTeacherSalary(tx, existing.id, session.user.id)
    const salary = existing
      ? await tx.teacherSalary.update({
          where: { id: existing.id },
          data: { lessonsCount, hoursWorked, totalAmount, periodStart, periodEnd, status: "CONFIRMED", notes },
        })
      : await tx.teacherSalary.create({
          data: { tenantId: session.user.tenantId, teacherId, month, year, lessonsCount, hoursWorked, totalAmount, periodStart, periodEnd, status: "CONFIRMED", notes },
        })

    await tx.teacherSalaryLesson.deleteMany({ where: { salaryId: salary.id } })
    await tx.teacherSalaryLine.deleteMany({ where: { salaryId: salary.id } })

    for (const item of calculatedLines) {
      const line = await tx.teacherSalaryLine.create({
        data: {
          tenantId: session.user.tenantId,
          salaryId: salary.id,
          courseKey: item.row.key,
          label: item.row.label,
          studentNames: item.row.studentNames.join(", "),
          studentCount: item.row.studentCount,
          forfait: item.row.forfait,
          courseType: item.row.courseType,
          lessonsCount: item.lessons.length,
          durationMinutes: item.durationMinutes,
          hourlyRate: item.row.hourlyRate,
          hoursWorked: item.hoursWorked,
          totalAmount: item.totalAmount,
          firstLessonAt: new Date(item.lessons[0].date),
          lastLessonAt: new Date(item.lessons[item.lessons.length - 1].date),
        },
      })
      await tx.teacherSalaryLesson.createMany({
        data: item.lessons.flatMap((lesson) => lesson.lessonIds.map((lessonId) => ({
          tenantId: session.user.tenantId,
          salaryId: salary.id,
          lineId: line.id,
          lessonId,
        }))),
      })
    }
    return salary
  })

  return NextResponse.json({
    id: saved.id,
    lessonsCount,
    hoursWorked,
    courseTotal,
    bonus,
    totalAmount,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    status: saved.status,
  })
})
