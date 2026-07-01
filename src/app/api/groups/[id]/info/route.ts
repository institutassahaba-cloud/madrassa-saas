import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateForSize } from "@/lib/group-rates"
import { wrap } from "@/lib/api"

export const GET = wrap(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params

  const students = await prisma.student.findMany({
    where: { groupId: id, tenantId: user.tenantId, status: "ACTIVE" },
    select: { subject: true, lessonsPerWeek: true, duration: true },
  })

  if (students.length === 0) {
    return NextResponse.json({ count: 0 })
  }

  const first = students[0]
  const newCount = students.length + 1
  return NextResponse.json({
    count: students.length,
    subject: first.subject,
    lessonsPerWeek: first.lessonsPerWeek,
    duration: first.duration,
    newRate: rateForSize(newCount),
  })
})
