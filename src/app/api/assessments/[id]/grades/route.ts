import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { id } = await params
  const { grades } = await req.json()

  const assessment = await prisma.assessment.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.$transaction(
    (grades as { studentId: string; score: number | null; observation?: string }[]).map((g) =>
      prisma.grade.upsert({
        where: { assessmentId_studentId: { assessmentId: id, studentId: g.studentId } },
        create: { assessmentId: id, studentId: g.studentId, score: g.score, observation: g.observation },
        update: { score: g.score, observation: g.observation },
      })
    )
  )

  return NextResponse.json({ ok: true })
}
