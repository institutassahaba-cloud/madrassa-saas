import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ensureLessonLegacyPayrollBoundaryColumn } from "@/lib/lesson-schema"
import { prisma } from "@/lib/prisma"

function parseDurationToMinutes(d: string | null): number {
  if (!d) return 60
  if (/min/i.test(d)) return parseInt(d) || 60
  const h = parseFloat(d.replace(",", "."))
  return isFinite(h) && h > 0 ? Math.round(h * 60) : 60
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureLessonLegacyPayrollBoundaryColumn()

  const body = await req.json()
  const bonuses: Record<string, number> = body.bonuses || {}

  const tenantId = user.tenantId

  const teachers = await prisma.user.findMany({
    where: { tenantId, role: "TEACHER", isActive: true },
    select: { id: true, name: true, individualRate: true, binomeRate: true, groupRate: true },
  })

  const results: {
    teacherId: string
    teacherName: string
    lessonsCount: number
    details: { type: string; count: number; hours: number; rate: number; subtotal: number }[]
    totalHours: number
    totalAmount: number
    bonus: number
    grandTotal: number
    periodStart: string
    periodEnd: string
  }[] = []

  const now = new Date()

  for (const teacher of teachers) {
    const lastSalary = await prisma.teacherSalary.findFirst({
      where: { tenantId, teacherId: teacher.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    })

    const periodStart = lastSalary?.periodEnd ?? new Date(2000, 0, 1)
    const periodEnd = now

    const lessonSessions = await prisma.lessonSession.findMany({
      where: { tenantId, teacherId: teacher.id },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
        subject: true,
        number: true,
        duration: true,
        student: { select: { groupId: true } },
        lessons: {
          where: {
            OR: [
              { legacyPayrollBoundary: true },
              {
                status: { in: ["PRESENT", "ABSENT"] },
                date: { not: null, gt: periodStart, lte: periodEnd },
              },
            ],
          },
          select: { id: true, date: true, duration: true, status: true, number: true, legacyPayrollBoundary: true },
        },
      },
    })

    const legacyBoundaries: Record<string, { sessionNumber: number; lessonNumber: number }> = {}
    for (const ls of lessonSessions) {
      const key = `${ls.studentId}:${ls.teacherId}:${ls.subject}`
      for (const lesson of ls.lessons) {
        if (!lesson.legacyPayrollBoundary) continue
        const current = legacyBoundaries[key]
        if (
          !current ||
          ls.number > current.sessionNumber ||
          (ls.number === current.sessionNumber && lesson.number > current.lessonNumber)
        ) {
          legacyBoundaries[key] = { sessionNumber: ls.number, lessonNumber: lesson.number }
        }
      }
    }

    const groupSizes: Record<string, number> = {}
    const groupIds = new Set<string>()
    for (const ls of lessonSessions) {
      if (ls.student.groupId) groupIds.add(ls.student.groupId)
    }
    if (groupIds.size > 0) {
      const groups = await prisma.group.findMany({
        where: { id: { in: Array.from(groupIds) } },
        select: { id: true, students: { where: { status: "ACTIVE" }, select: { id: true } } },
      })
      for (const g of groups) groupSizes[g.id] = g.students.length
    }

    let individualCount = 0, binomeCount = 0, groupCount = 0
    let individualMins = 0, binomeMins = 0, groupMins = 0

    for (const ls of lessonSessions) {
      const defaultMin = parseDurationToMinutes(ls.duration)
      const gid = ls.student.groupId
      const size = gid ? (groupSizes[gid] ?? 1) : 1
      const legacyBoundary = legacyBoundaries[`${ls.studentId}:${ls.teacherId}:${ls.subject}`]

      for (const lesson of ls.lessons) {
        if (lesson.legacyPayrollBoundary) continue
        if (!lesson.date || !["PRESENT", "ABSENT"].includes(lesson.status)) continue
        if (lesson.date <= periodStart || lesson.date > periodEnd) continue
        if (
          legacyBoundary &&
          (ls.number < legacyBoundary.sessionNumber ||
            (ls.number === legacyBoundary.sessionNumber && lesson.number <= legacyBoundary.lessonNumber))
        ) continue
        const mins = lesson.duration ?? defaultMin
        if (size === 1) { individualCount++; individualMins += mins }
        else if (size === 2) { binomeCount++; binomeMins += mins }
        else { groupCount++; groupMins += mins }
      }
    }

    const indRate = teacher.individualRate ?? 0
    const binRate = teacher.binomeRate ?? 0
    const grpRate = teacher.groupRate ?? 0

    const details: typeof results[0]["details"] = []
    if (individualCount > 0) details.push({ type: "Individuel", count: individualCount, hours: +(individualMins / 60).toFixed(2), rate: indRate, subtotal: +(individualMins / 60 * indRate).toFixed(2) })
    if (binomeCount > 0) details.push({ type: "Binôme", count: binomeCount, hours: +(binomeMins / 60).toFixed(2), rate: binRate, subtotal: +(binomeMins / 60 * binRate).toFixed(2) })
    if (groupCount > 0) details.push({ type: "Groupe", count: groupCount, hours: +(groupMins / 60).toFixed(2), rate: grpRate, subtotal: +(groupMins / 60 * grpRate).toFixed(2) })

    const totalHours = +((individualMins + binomeMins + groupMins) / 60).toFixed(2)
    const totalAmount = details.reduce((s, d) => s + d.subtotal, 0)
    const bonus = bonuses[teacher.id] ?? 0
    const lessonsCount = individualCount + binomeCount + groupCount

    results.push({
      teacherId: teacher.id,
      teacherName: teacher.name,
      lessonsCount,
      details,
      totalHours,
      totalAmount: +totalAmount.toFixed(2),
      bonus,
      grandTotal: +(totalAmount + bonus).toFixed(2),
      periodStart: periodStart instanceof Date ? periodStart.toISOString() : new Date(periodStart).toISOString(),
      periodEnd: periodEnd.toISOString(),
    })
  }

  if (body.confirm) {
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    for (const r of results) {
      if (r.lessonsCount === 0 && r.bonus === 0) continue
      const existing = await prisma.teacherSalary.findUnique({
        where: { teacherId_month_year: { teacherId: r.teacherId, month, year } },
      })
      if (existing) {
        await prisma.teacherSalary.update({
          where: { id: existing.id },
          data: {
            hoursWorked: r.totalHours,
            lessonsCount: r.lessonsCount,
            totalAmount: r.grandTotal,
            periodStart: new Date(r.periodStart),
            periodEnd: new Date(r.periodEnd),
            notes: r.bonus > 0 ? `Prime : ${r.bonus} €` : null,
          },
        })
      } else {
        await prisma.teacherSalary.create({
          data: {
            tenantId,
            teacherId: r.teacherId,
            month,
            year,
            hoursWorked: r.totalHours,
            lessonsCount: r.lessonsCount,
            totalAmount: r.grandTotal,
            periodStart: new Date(r.periodStart),
            periodEnd: new Date(r.periodEnd),
            status: "PENDING",
            notes: r.bonus > 0 ? `Prime : ${r.bonus} €` : null,
          },
        })
      }
    }
  }

  return NextResponse.json(results)
}
