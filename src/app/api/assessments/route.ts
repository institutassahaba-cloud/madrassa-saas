import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as any

  const body = await req.json()
  const assessment = await prisma.assessment.create({
    data: {
      tenantId: user.tenantId,
      groupId: body.groupId,
      teacherId: user.id,
      title: body.title,
      subject: body.subject || null,
      date: new Date(body.date),
      maxScore: body.maxScore ?? 20,
      description: body.description || null,
    },
  })
  return NextResponse.json(assessment, { status: 201 })
}
