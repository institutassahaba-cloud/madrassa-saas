import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { ensureLessonLegacyPayrollBoundaryColumn } from "@/lib/lesson-schema"
import { ensureUserMeetingLinkColumn } from "@/lib/user-schema"
import { getEffectiveUser } from "@/lib/view-as"
import { TeachersClient } from "./teachers-client"

export default async function TeachersPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) redirect("/dashboard")
  await ensureUserMeetingLinkColumn()
  await ensureLessonLegacyPayrollBoundaryColumn()

  const [teachers, students, lessonSessions, payments] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        meetingLink: true,
        individualRate: true,
        binomeRate: true,
        groupRate: true,
        createdAt: true,
        teacherGroups: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            level: true,
            schedule: true,
            maxStudents: true,
            students: {
              select: { id: true, firstName: true, lastName: true, status: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.student.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
        subject: true,
        phone: true,
        parentPhone: true,
        groupId: true,
        lessonsPerWeek: true,
        duration: true,
        monthlyFee: true,
        status: true,
        group: { select: { name: true, teacherId: true, teacher: { select: { name: true } } } },
      },
      orderBy: { firstName: "asc" },
    }),
    prisma.lessonSession.findMany({
      where: { tenantId: user.tenantId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        teacher: { select: { id: true, name: true } },
      },
      orderBy: [{ studentId: "asc" }, { subject: "asc" }, { number: "asc" }],
    }),
    prisma.payment.findMany({
      where: {
        tenantId: user.tenantId,
        sessionNumber: { not: null },
        status: { not: "REJECTED" },
      },
      select: { studentId: true, sessionNumber: true, paidDate: true },
    }),
  ])

  // Cours chargés par lots
  const sessionIds = lessonSessions.map((s) => s.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lessonsBySession: Record<string, any[]> = {}
  const CHUNK = 400
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const batch = await prisma.lesson.findMany({
      where: { sessionId: { in: sessionIds.slice(i, i + CHUNK) } },
      orderBy: { number: "asc" },
    })
    for (const l of batch) (lessonsBySession[l.sessionId] ||= []).push(l)
  }
  const lessonSessionsWithLessons = lessonSessions.map((s) => ({
    ...s,
    lessons: lessonsBySession[s.id] ?? [],
  }))

  // Emploi du temps par groupe
  const slots = await prisma.timeSlot.findMany({
    where: { tenantId: user.tenantId, groupId: { not: null } },
    select: {
      id: true,
      groupId: true,
      teacherId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      teacher: { select: { timezone: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  })
  const scheduleByGroup: Record<string, { id: string; day: number; start: string; end: string; teacherId: string; teacherTimezone: string }[]> = {}
  for (const s of slots) {
    if (!s.groupId) continue
    ;(scheduleByGroup[s.groupId] ||= []).push({
      id: s.id,
      day: s.dayOfWeek,
      start: s.startTime,
      end: s.endTime,
      teacherId: s.teacherId,
      teacherTimezone: s.teacher.timezone,
    })
  }

  // Paiements par session
  const paidBySession: Record<string, string> = {}
  const undatedPaymentBySession: Record<string, boolean> = {}
  for (const p of payments) {
    const key = `${p.studentId}:${p.sessionNumber}`
    if (p.paidDate) {
      const iso = p.paidDate.toISOString()
      if (!paidBySession[key] || iso > paidBySession[key]) paidBySession[key] = iso
    } else {
      undatedPaymentBySession[key] = true
    }
  }

  return (
    <TeachersClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      teachers={teachers as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      students={students as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lessonSessions={lessonSessionsWithLessons as any}
      paidBySession={paidBySession}
      undatedPaymentBySession={undatedPaymentBySession}
      scheduleByGroup={scheduleByGroup}
      currentUserId={user.id}
      currentRole={user.role}
    />
  )
}
