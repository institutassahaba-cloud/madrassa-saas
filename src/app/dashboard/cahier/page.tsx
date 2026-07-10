import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { ensureLessonLegacyPayrollBoundaryColumn } from "@/lib/lesson-schema"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"
import { getEffectiveUser } from "@/lib/view-as"
import { CahierClient } from "./cahier-client"

export default async function CahierPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  await ensureLessonLegacyPayrollBoundaryColumn()
  await ensureStudentPaymentColumns()

  const [students, lessonSessions, payments] = await Promise.all([
    prisma.student.findMany({
      where: {
        tenantId: user.tenantId,
        ...(user.role === "TEACHER"
          ? {
              status: "ACTIVE",
              OR: [
                { group: { teacherId: user.id } },
                { lessonSessions: { some: { teacherId: user.id } } },
              ],
            }
          : {}),
      },
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
        paymentGraceAllowed: true,
        status: true,
        group: { select: { name: true, teacherId: true, teacher: { select: { name: true } } } },
      },
      orderBy: { firstName: "asc" },
    }),
    prisma.lessonSession.findMany({
      where: {
        tenantId: user.tenantId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        teacher: { select: { id: true, name: true } },
        // ⚠️ pas d'include lessons ici : avec bcp de sessions, le IN(...) dépasse
        // la limite de variables SQLite. On charge les cours par lots ci-dessous.
      },
      orderBy: [{ studentId: "asc" }, { subject: "asc" }, { number: "asc" }],
    }),
    // Paiements par session → on n'expose QUE la date et l'état (jamais le montant), même pour le prof.
    prisma.payment.findMany({
      where: {
        tenantId: user.tenantId,
        sessionNumber: { not: null },
        status: { not: "REJECTED" },
        ...(user.role === "TEACHER"
          ? {
              lessonSession: { teacherId: user.id },
            }
          : {}),
      },
      select: { studentId: true, lessonSessionId: true, sessionNumber: true, paidDate: true },
    }),
  ])

  // Cours chargés par lots (évite le dépassement de la limite de variables SQLite),
  // puis rattachés à leur session.
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

  // Emploi du temps (jours + heures) regroupé par groupe, pour l'afficher à côté de l'élève.
  const slots = await prisma.timeSlot.findMany({
    where: {
      tenantId: user.tenantId,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      groupId: { not: null },
    },
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

  // map "session:id" -> date de paiement (fallback legacy "studentId:number")
  const paidBySession: Record<string, string> = {}
  const undatedPaymentBySession: Record<string, boolean> = {}
  for (const p of payments) {
    const key = p.lessonSessionId ? `session:${p.lessonSessionId}` : `${p.studentId}:${p.sessionNumber}`
    if (p.paidDate) {
      const iso = p.paidDate.toISOString()
      if (!paidBySession[key] || iso > paidBySession[key]) paidBySession[key] = iso
    } else {
      undatedPaymentBySession[key] = true
    }
  }

  const teachers = user.role === "DIRECTOR"
    ? await prisma.user.findMany({
        where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : [{ id: user.id, name: (user as any).name ?? "Moi" }]

  return (
    <CahierClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      students={students as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lessonSessions={lessonSessionsWithLessons as any}
      paidBySession={paidBySession}
      undatedPaymentBySession={undatedPaymentBySession}
      scheduleByGroup={scheduleByGroup}
      teachers={teachers}
      currentUserId={user.id}
      role={user.role}
      initialSearch={q ?? ""}
    />
  )
}
