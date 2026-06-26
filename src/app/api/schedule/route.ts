import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
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
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const body = await req.json()
  const { dayOfWeek, startTime, endTime, label, color, groupId, teacherId } = body

  if (dayOfWeek === undefined || !startTime || !endTime) {
    return NextResponse.json({ error: "dayOfWeek, startTime, endTime requis" }, { status: 400 })
  }

  const resolvedTeacherId = user.role === "TEACHER" ? user.id : (teacherId ?? user.id)

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
    },
  })

  return NextResponse.json(slot, { status: 201 })
}
