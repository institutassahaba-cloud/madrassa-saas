import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params
  const body = await req.json()

  const slot = await prisma.timeSlot.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && slot.teacherId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const updated = await prisma.timeSlot.update({
    where: { id },
    data: {
      dayOfWeek: body.dayOfWeek ?? slot.dayOfWeek,
      startTime: body.startTime ?? slot.startTime,
      endTime:   body.endTime   ?? slot.endTime,
      label:     body.label     ?? slot.label,
      color:     body.color     ?? slot.color,
      groupId:   body.groupId !== undefined ? body.groupId : slot.groupId,
    },
    include: {
      teacher: { select: { id: true, name: true, timezone: true } },
      group:   { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
}
