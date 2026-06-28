import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { id } = await params
  const { grades } = await req.json()

  const assessment = await prisma.assessment.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { group: { select: { teacherId: true } } },
  })
  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && assessment.group.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rows = Array.isArray(grades) ? grades as { studentId: string; score: number | null; observation?: string }[] : []
  if (rows.length === 0) return NextResponse.json({ error: "No grades provided" }, { status: 400 })

  const studentIds = [...new Set(rows.map((g) => g.studentId).filter(Boolean))]
  const validStudents = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      tenantId: user.tenantId,
      groupId: assessment.groupId,
    },
    select: { id: true },
  })
  const validIds = new Set(validStudents.map((s) => s.id))
  if (studentIds.some((studentId) => !validIds.has(studentId))) {
    return NextResponse.json({ error: "Invalid student for this assessment" }, { status: 400 })
  }

  await prisma.$transaction(
    rows.map((g) =>
      prisma.grade.upsert({
        where: { assessmentId_studentId: { assessmentId: id, studentId: g.studentId } },
        create: { assessmentId: id, studentId: g.studentId, score: g.score, observation: g.observation },
        update: { score: g.score, observation: g.observation },
      })
    )
  )

  return NextResponse.json({ ok: true })
}
