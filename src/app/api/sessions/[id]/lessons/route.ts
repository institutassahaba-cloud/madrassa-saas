import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id: sessionId } = await params

  const existing = await prisma.lessonSession.findFirst({
    where: { id: sessionId, tenantId: user.tenantId },
    include: { lessons: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && existing.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const nextNumber = (existing.lessons.length > 0
    ? Math.max(...existing.lessons.map((l) => l.number))
    : 0) + 1

  const lesson = await prisma.lesson.create({
    data: {
      tenantId: user.tenantId,
      sessionId,
      number: nextNumber,
      status: "PENDING",
      date: new Date(), // date du jour par défaut (le prof remplit souvent le jour même)
    },
  })

  return NextResponse.json(lesson, { status: 201 })
}
