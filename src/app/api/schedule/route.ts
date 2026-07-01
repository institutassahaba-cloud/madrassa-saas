import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

export const GET = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get("teacherId")

  const slots = await prisma.timeSlot.findMany({
    where: {
      tenantId: user.tenantId,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : teacherId ? { teacherId } : {}),
    },
    include: {
      teacher: { select: { id: true, name: true, timezone: true } },
      group: { select: { id: true, name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  })

  return NextResponse.json(slots)
})

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const body = await req.json()
  const { dayOfWeek, startTime, endTime, label, color, groupId, teacherId } = body

  if (dayOfWeek === undefined || !startTime || !endTime) {
    return NextResponse.json({ error: "dayOfWeek, startTime, endTime requis" }, { status: 400 })
  }

  if (user.role !== "TEACHER" && !teacherId) {
    return NextResponse.json({ error: "Professeur requis" }, { status: 400 })
  }

  const resolvedTeacherId = user.role === "TEACHER" ? user.id : teacherId

  const teacher = await prisma.user.findFirst({
    where: { id: resolvedTeacherId, tenantId: user.tenantId, role: "TEACHER", isActive: true },
    select: { id: true },
  })
  if (!teacher) return NextResponse.json({ error: "Professeur introuvable" }, { status: 400 })

  if (groupId) {
    const group = await prisma.group.findFirst({
      where: { id: groupId, tenantId: user.tenantId, isActive: true },
      select: { teacherId: true },
    })
    if (!group) return NextResponse.json({ error: "Groupe introuvable" }, { status: 400 })
    if (group.teacherId !== resolvedTeacherId) {
      return NextResponse.json({ error: "Ce groupe n'appartient pas à ce professeur" }, { status: 403 })
    }
  }

  const slot = await prisma.timeSlot.create({
    data: {
      tenantId: user.tenantId,
      teacherId: resolvedTeacherId,
      dayOfWeek: Number(dayOfWeek),
      startTime,
      endTime,
      label: label || null,
      color: color || "#10b981",
      groupId: groupId || null,
    },
    include: {
      teacher: { select: { id: true, name: true, timezone: true } },
      group: { select: { id: true, name: true } },
      exceptions: { select: { id: true, date: true, reason: true } },
    },
  })

  return NextResponse.json(slot, { status: 201 })
})
