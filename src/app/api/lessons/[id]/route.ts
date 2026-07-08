import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ensureLessonLegacyPayrollBoundaryColumn } from "@/lib/lesson-schema"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params

  const body = await req.json()
  await ensureLessonLegacyPayrollBoundaryColumn()
  const updatesLegacyBoundary = body.legacyPayrollBoundary !== undefined
  if (updatesLegacyBoundary && !["DIRECTOR", "SECRETARY"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const lesson = await prisma.lesson.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { session: { select: { studentId: true, teacherId: true } } },
  })
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && lesson.session.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = {
      status: body.status ?? lesson.status,
      content: body.content !== undefined ? body.content : lesson.content,
      date: body.date ? new Date(body.date) : lesson.date,
      duration: body.duration !== undefined ? body.duration : lesson.duration,
      makeupMinutes: body.makeupMinutes !== undefined ? body.makeupMinutes : lesson.makeupMinutes,
      makeupOnLessonId: body.makeupOnLessonId !== undefined ? body.makeupOnLessonId : lesson.makeupOnLessonId,
      legacyPayrollBoundary: updatesLegacyBoundary ? Boolean(body.legacyPayrollBoundary) : lesson.legacyPayrollBoundary,
  }

  const updated = updatesLegacyBoundary && body.legacyPayrollBoundary === true
    ? await prisma.$transaction(async (tx) => {
        await tx.lesson.updateMany({
          where: {
            tenantId: user.tenantId,
            legacyPayrollBoundary: true,
            session: {
              studentId: lesson.session.studentId,
            },
          },
          data: { legacyPayrollBoundary: false },
        })
        return tx.lesson.update({ where: { id }, data })
      })
    : await prisma.lesson.update({ where: { id }, data })

  return NextResponse.json(updated)
})

export const DELETE = wrap(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
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
})
