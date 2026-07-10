import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateForSize } from "@/lib/group-rates"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"
import { ensureStudentContactColumns } from "@/lib/student-contact-schema"
import { replaceStudentPaymentAliases } from "@/lib/student-payment-aliases"
import { encodeScheduleLabel } from "@/lib/schedule-meta"
import { wrap } from "@/lib/api"
import { syncStudentGoogleContact } from "@/lib/google-contacts"

const DEFAULT_SLOT_COLOR = "#10b981"

function addDurationToTime(time: string, duration: string | null | undefined): string {
  const [h, m] = time.split(":").map(Number)
  const hours = parseFloat((duration || "1").replace(",", "."))
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(hours)) return time
  const total = h * 60 + m + Math.round(hours * 60)
  const normalized = ((total % 1440) + 1440) % 1440
  return `${Math.floor(normalized / 60).toString().padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`
}

function nextDateForDay(dayOfWeek: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  const diff = (dayOfWeek - date.getDay() + 7) % 7
  date.setDate(date.getDate() + diff)
  return date.toISOString().slice(0, 10)
}

function normalizeScheduleSlots(value: unknown): { dayOfWeek: number; startTime: string }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((slot) => {
    if (!slot || typeof slot !== "object") return []
    const raw = slot as { dayOfWeek?: unknown; startTime?: unknown }
    const dayOfWeek = Number(raw.dayOfWeek)
    const startTime = typeof raw.startTime === "string" ? raw.startTime : ""
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !/^\d{2}:\d{2}$/.test(startTime)) return []
    return [{ dayOfWeek, startTime }]
  })
}

async function createStudentScheduleSlots({
  tenantId,
  teacherId,
  groupId,
  studentName,
  subject,
  duration,
  slots,
}: {
  tenantId: string
  teacherId: string
  groupId: string
  studentName: string
  subject: string
  duration?: string | null
  slots: { dayOfWeek: number; startTime: string }[]
}) {
  if (slots.length === 0) return

  const label = `Créneau ${subject || "cours"} - ${studentName}`.trim()
  await prisma.timeSlot.createMany({
    data: slots.map((slot) => ({
      tenantId,
      teacherId,
      groupId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: addDurationToTime(slot.startTime, duration),
      label: encodeScheduleLabel(label, "WEEKLY", nextDateForDay(slot.dayOfWeek)),
      color: DEFAULT_SLOT_COLOR,
    })),
  })
}

async function recalcGroupRate(groupId: string, tenantId: string) {
  const count = await prisma.student.count({
    where: { groupId, tenantId, status: "ACTIVE" },
  })
  if (count > 0) {
    await prisma.student.updateMany({
      where: { groupId, tenantId, status: "ACTIVE" },
      data: { hourlyRate: rateForSize(count) },
    })
  }
}

export const PUT = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureStudentPaymentColumns()
  await ensureStudentContactColumns()

  const { id } = await params
  const body = await req.json()

  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const oldGroupId = student.groupId
  const newGroupId = body.groupId || null

  const updated = await prisma.student.update({
    where: { id },
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      gender: body.gender,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      city: body.city || null,
      groupId: newGroupId,
      level: body.level || null,
      subject: body.subject || null,
      monthlyFee: Number(body.monthlyFee),
      paymentGraceAllowed: user.role === "DIRECTOR" ? body.paymentGraceAllowed === true : undefined,
      hourlyRate: body.hourlyRate === "" || body.hourlyRate == null ? null : Number(body.hourlyRate),
      lessonsPerWeek: body.lessonsPerWeek === "" || body.lessonsPerWeek == null ? null : Number(body.lessonsPerWeek),
      duration: body.duration || null,
      status: body.status || "ACTIVE",
      recontactDate: body.recontactDate ? new Date(body.recontactDate) : null,
      parentName: body.parentName || null,
      parentPhone: body.parentPhone || null,
      parentEmail: body.parentEmail || null,
      notes: body.notes || null,
    },
  })

  await replaceStudentPaymentAliases(user.tenantId, id, body.paymentAliases)

  const scheduleSlots = normalizeScheduleSlots(body.scheduleSlots)
  if (newGroupId && scheduleSlots.length > 0) {
    const group = await prisma.group.findFirst({
      where: { id: newGroupId, tenantId: user.tenantId },
      select: { teacherId: true },
    })
    if (group?.teacherId) {
      const subject = body.subject || "Coran"
      await prisma.lessonSession.upsert({
        where: { studentId_subject_number: { studentId: id, subject, number: 1 } },
        update: {
          teacherId: group.teacherId,
          frequency: body.lessonsPerWeek === "" || body.lessonsPerWeek == null ? null : Number(body.lessonsPerWeek),
          duration: body.duration || null,
        },
        create: {
          tenantId: user.tenantId,
          studentId: id,
          teacherId: group.teacherId,
          subject,
          number: 1,
          frequency: body.lessonsPerWeek === "" || body.lessonsPerWeek == null ? null : Number(body.lessonsPerWeek),
          duration: body.duration || null,
          lessons: {
            create: Array.from({ length: 8 }, (_, i) => ({
              tenantId: user.tenantId,
              number: i + 1,
              status: "PENDING",
            })),
          },
        },
      })
      await createStudentScheduleSlots({
        tenantId: user.tenantId,
        teacherId: group.teacherId,
        groupId: newGroupId,
        studentName: `${updated.firstName} ${updated.lastName}`,
        subject,
        duration: body.duration || null,
        slots: scheduleSlots,
      })
    }
  }

  if (oldGroupId !== newGroupId) {
    if (oldGroupId) await recalcGroupRate(oldGroupId, user.tenantId)
    if (newGroupId) await recalcGroupRate(newGroupId, user.tenantId)
    if (!newGroupId) {
      await prisma.student.update({ where: { id }, data: { hourlyRate: rateForSize(1) } })
    }
  }

  await syncStudentGoogleContact(updated.id).catch((error) => {
    console.error("[contacts] student update sync failed:", error)
  })

  return NextResponse.json(updated)
})

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureStudentPaymentColumns()
  await ensureStudentContactColumns()

  const { id } = await params
  const body = await req.json()
  if (body.paymentGraceAllowed !== undefined && user.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })
  }

  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.student.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      recontactDate: body.recontactDate ? new Date(body.recontactDate) : undefined,
      notes: body.notes ?? undefined,
      monthlyFee: body.monthlyFee !== undefined ? Number(body.monthlyFee) : undefined,
      paymentGraceAllowed: body.paymentGraceAllowed !== undefined ? Boolean(body.paymentGraceAllowed) : undefined,
      groupId: body.groupId ?? undefined,
      duration: body.duration !== undefined ? (body.duration || null) : undefined,
      lessonsPerWeek: body.lessonsPerWeek !== undefined ? (body.lessonsPerWeek === "" || body.lessonsPerWeek == null ? null : Number(body.lessonsPerWeek)) : undefined,
    },
  })
  if (body.status && body.status !== student.status && student.groupId) {
    await recalcGroupRate(student.groupId, user.tenantId)
  }

  await syncStudentGoogleContact(updated.id).catch((error) => {
    console.error("[contacts] student patch sync failed:", error)
  })

  return NextResponse.json(updated)
})

export const DELETE = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  await ensureStudentContactColumns()
  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const groupId = student.groupId
  // Effacement RGPD complet. L'adaptateur libSQL n'applique pas les cascades FK :
  // on efface donc explicitement chaque table liée, des feuilles vers la racine,
  // sans dépendre d'aucun ON DELETE. Les PaymentMatch (relevés PayPal/Wise) sont
  // conservés mais dissociés (studentId → null) car ils relèvent de la compta.
  await prisma.$transaction([
    prisma.paymentAllocation.deleteMany({
      where: { OR: [{ payment: { studentId: id } }, { paymentMatch: { studentId: id } }] },
    }),
    prisma.grade.deleteMany({ where: { studentId: id } }),
    prisma.attendance.deleteMany({ where: { studentId: id } }),
    prisma.lesson.deleteMany({ where: { session: { studentId: id } } }),
    prisma.payment.deleteMany({ where: { studentId: id } }),
    prisma.lessonSession.deleteMany({ where: { studentId: id } }),
    prisma.paymentAlias.deleteMany({ where: { studentId: id } }),
    prisma.paymentMatch.updateMany({ where: { studentId: id }, data: { studentId: null } }),
    prisma.student.delete({ where: { id } }),
  ])
  if (groupId) await recalcGroupRate(groupId, user.tenantId)
  return NextResponse.json({ ok: true })
})
