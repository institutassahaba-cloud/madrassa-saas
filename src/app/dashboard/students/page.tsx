import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { ensurePaymentAliasSchema } from "@/lib/payment-alias-schema"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"
import { ensureStudentContactColumns } from "@/lib/student-contact-schema"
import { ensureUserMeetingLinkColumn } from "@/lib/user-schema"
import { ensureCanonicalSubjects } from "@/lib/subject-canonicalization"
import { StudentsClient } from "./students-client"

export default async function StudentsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (user.role === "TEACHER") redirect("/dashboard")
  await ensurePaymentAliasSchema()
  await ensureStudentPaymentColumns()
  await ensureStudentContactColumns()
  await ensureUserMeetingLinkColumn()
  await ensureCanonicalSubjects(user.tenantId)

  const [students, groups, teachers, slots, paymentMatches] = await Promise.all([
    prisma.student.findMany({
      where: { tenantId: user.tenantId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            teacher: { select: { id: true, name: true } },
          },
        },
        paymentAliases: {
          select: { id: true, type: true, alias: true, source: true },
          orderBy: [{ type: "asc" }, { alias: "asc" }],
        },
      },
      orderBy: { lastName: "asc" },
    }),
    prisma.group.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, name: true, level: true, teacherId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
      select: { id: true, name: true, phone: true, meetingLink: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeSlot.findMany({
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
    }),
    // Paiements détectés non traités : proposés comme « 1er paiement » à l'ajout d'un élève.
    prisma.paymentMatch.findMany({
      where: { tenantId: user.tenantId, status: "TO_VERIFY" },
      select: { id: true, source: true, receivedAmount: true, detectedPayerName: true, paymentDate: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])

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

  // Type de cours (Individuel/Binôme/Groupe) = nombre d'élèves ACTIFS partageant le groupe.
  const activePerGroup: Record<string, number> = {}
  for (const s of students) {
    if (s.status === "ACTIVE" && s.groupId) {
      activePerGroup[s.groupId] = (activePerGroup[s.groupId] ?? 0) + 1
    }
  }
  const enriched = students.map((s) => ({
    ...s,
    teacherName: s.group?.teacher?.name ?? null,
    groupSize: s.groupId ? (activePerGroup[s.groupId] ?? 0) : 0,
    schedule: s.groupId ? (scheduleByGroup[s.groupId] ?? []) : [],
  }))

  const paymentMatchOptions = paymentMatches.map((m) => ({
    id: m.id,
    source: m.source,
    receivedAmount: m.receivedAmount,
    detectedPayerName: m.detectedPayerName,
    paymentDate: m.paymentDate?.toISOString() ?? null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <StudentsClient students={enriched as any} groups={groups as any} teachers={teachers} role={user.role} paymentMatches={paymentMatchOptions} />
}
