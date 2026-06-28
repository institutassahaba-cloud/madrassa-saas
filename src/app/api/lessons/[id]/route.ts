import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params

  const body = await req.json()

  const lesson = await prisma.lesson.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { session: { select: { teacherId: true } } },
  })
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && lesson.session.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const updated = await prisma.lesson.update({
    where: { id },
    data: {
      status: body.status ?? lesson.status,
      content: body.content !== undefined ? body.content : lesson.content,
      date: body.date ? new Date(body.date) : lesson.date,
      duration: body.duration !== undefined ? body.duration : lesson.duration,
      makeupMinutes: body.makeupMinutes !== undefined ? body.makeupMinutes : lesson.makeupMinutes,
      makeupOnLessonId: body.makeupOnLessonId !== undefined ? body.makeupOnLessonId : lesson.makeupOnLessonId,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params

  const lesson = await prisma.lesson.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { session: { select: { teacherId: true } } },
  })
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && lesson.session.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.lesson.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
