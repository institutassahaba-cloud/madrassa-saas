import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get("studentId")

  const sessions = await prisma.lessonSession.findMany({
    where: {
      tenantId: user.tenantId,
      ...(studentId ? { studentId } : {}),
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      teacher: { select: { id: true, name: true } },
      lessons: { orderBy: { number: "asc" } },
    },
    orderBy: [{ studentId: "asc" }, { subject: "asc" }, { number: "asc" }],
  })

  return NextResponse.json(sessions)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const body = await req.json()
  const { studentId, teacherId, subject, number, frequency, duration } = body

  if (!studentId || !subject) {
    return NextResponse.json({ error: "studentId and subject required" }, { status: 400 })
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: user.tenantId },
    include: { group: { select: { teacherId: true } } },
  })
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 })
  if (user.role === "TEACHER" && student.group?.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const resolvedTeacherId = user.role === "TEACHER" ? user.id : (teacherId ?? student.group?.teacherId)
  if (!resolvedTeacherId) {
    return NextResponse.json({ error: "teacherId required" }, { status: 400 })
  }

  const teacher = await prisma.user.findFirst({
    where: {
      id: resolvedTeacherId,
      tenantId: user.tenantId,
      role: "TEACHER",
      isActive: true,
    },
    select: { id: true },
  })
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 })

  // Auto-increment session number if not provided
  let sessionNumber = number
  if (!sessionNumber) {
    const last = await prisma.lessonSession.findFirst({
      where: { tenantId: user.tenantId, studentId, subject },
      orderBy: { number: "desc" },
    })
    sessionNumber = (last?.number ?? 0) + 1
  }

  const newSession = await prisma.lessonSession.create({
    data: {
      tenantId: user.tenantId,
      studentId,
      teacherId: resolvedTeacherId,
      subject,
      number: sessionNumber,
      frequency: frequency ? Number(frequency) : null,
      duration: duration || null,
      lessons: {
        create: Array.from({ length: 8 }, (_, i) => ({
          tenantId: user.tenantId,
          number: i + 1,
          status: "PENDING",
        })),
      },
    },
    include: { lessons: { orderBy: { number: "asc" } } },
  })

  return NextResponse.json(newSession, { status: 201 })
}
