import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { encodeScheduleLabel } from "@/lib/schedule-meta"

const AVAILABILITY_LABEL = "Créneau disponible"
const AVAILABILITY_COLOR = "#7c3aed"
const WEEKLY_AVAILABILITY_START_DATE = "1970-01-05"

interface AvailabilityRangeInput {
  dayOfWeek: unknown
  startTime: unknown
  endTime: unknown
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value)
}

function normalizeRange(range: AvailabilityRangeInput) {
  const dayOfWeek = Number(range.dayOfWeek)
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null
  if (!isValidTime(range.startTime) || !isValidTime(range.endTime)) return null
  if (range.startTime >= range.endTime) return null
  return {
    dayOfWeek,
    startTime: range.startTime,
    endTime: range.endTime,
  }
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const body = (await req.json()) as { teacherId?: unknown; ranges?: unknown }

  const requestedTeacherId = typeof body.teacherId === "string" ? body.teacherId : null
  const teacherId = user.role === "TEACHER" ? user.id : requestedTeacherId
  if (!teacherId) return NextResponse.json({ error: "Professeur requis" }, { status: 400 })

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, tenantId: user.tenantId, role: "TEACHER", isActive: true },
    select: { id: true },
  })
  if (!teacher) return NextResponse.json({ error: "Professeur introuvable" }, { status: 404 })

  const rawRanges: unknown[] = Array.isArray(body.ranges) ? body.ranges : []
  const ranges = rawRanges
    .map((range) => normalizeRange(range as AvailabilityRangeInput))
    .filter((range): range is NonNullable<ReturnType<typeof normalizeRange>> => Boolean(range))

  await prisma.timeSlot.deleteMany({
    where: {
      tenantId: user.tenantId,
      teacherId,
      groupId: null,
      label: { contains: AVAILABILITY_LABEL },
    },
  })

  if (ranges.length === 0) return NextResponse.json([])

  await prisma.timeSlot.createMany({
    data: ranges.map((range) => ({
      tenantId: user.tenantId,
      teacherId,
      dayOfWeek: range.dayOfWeek,
      startTime: range.startTime,
      endTime: range.endTime,
      label: encodeScheduleLabel(AVAILABILITY_LABEL, "WEEKLY", WEEKLY_AVAILABILITY_START_DATE),
      color: AVAILABILITY_COLOR,
      groupId: null,
    })),
  })

  const slots = await prisma.timeSlot.findMany({
    where: {
      tenantId: user.tenantId,
      teacherId,
      groupId: null,
      label: { contains: AVAILABILITY_LABEL },
    },
    include: {
      teacher: { select: { id: true, name: true, timezone: true } },
      group: { select: { id: true, name: true } },
      exceptions: { select: { id: true, date: true, reason: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  })

  return NextResponse.json(slots)
}
