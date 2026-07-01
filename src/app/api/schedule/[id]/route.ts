import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params
  const body = await req.json()

  const slot = await prisma.timeSlot.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && slot.teacherId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const nextTeacherId = user.role === "TEACHER" ? user.id : (body.teacherId ?? slot.teacherId)
  if (nextTeacherId !== slot.teacherId) {
    const teacher = await prisma.user.findFirst({
      where: { id: nextTeacherId, tenantId: user.tenantId, role: "TEACHER", isActive: true },
      select: { id: true },
    })
    if (!teacher) return NextResponse.json({ error: "Professeur introuvable" }, { status: 400 })
  }

  const nextGroupId = body.groupId !== undefined ? body.groupId : slot.groupId
  if (nextGroupId) {
    const group = await prisma.group.findFirst({
      where: { id: nextGroupId, tenantId: user.tenantId, isActive: true },
      select: { teacherId: true },
    })
    if (!group) return NextResponse.json({ error: "Groupe introuvable" }, { status: 400 })
    if (group.teacherId !== nextTeacherId) {
      return NextResponse.json({ error: "Ce groupe n'appartient pas à ce professeur" }, { status: 403 })
    }
  }

  const updated = await prisma.timeSlot.update({
    where: { id },
    data: {
      dayOfWeek: body.dayOfWeek ?? slot.dayOfWeek,
      startTime: body.startTime ?? slot.startTime,
      endTime:   body.endTime   ?? slot.endTime,
      label:     body.label     ?? slot.label,
      color:     body.color     ?? slot.color,
      teacherId: nextTeacherId,
      groupId:   nextGroupId,
    },
    include: {
      teacher: { select: { id: true, name: true, timezone: true } },
      group:   { select: { id: true, name: true } },
      exceptions: { select: { id: true, date: true, reason: true } },
    },
  })
  return NextResponse.json(updated)
})

export const DELETE = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params

  const slot = await prisma.timeSlot.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && slot.teacherId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await prisma.timeSlot.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
