import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const body = await req.json()
  if (!body.groupId || !body.title || !body.date) {
    return NextResponse.json({ error: "groupId, title and date required" }, { status: 400 })
  }

  const group = await prisma.group.findFirst({
    where: { id: body.groupId, tenantId: user.tenantId },
    select: { id: true, teacherId: true },
  })
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (user.role === "TEACHER" && group.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const assessment = await prisma.assessment.create({
    data: {
      tenantId: user.tenantId,
      groupId: body.groupId,
      teacherId: user.role === "TEACHER" ? user.id : group.teacherId,
      title: body.title,
      subject: body.subject || null,
      date: new Date(body.date),
      maxScore: body.maxScore ?? 20,
      description: body.description || null,
    },
  })
  return NextResponse.json(assessment, { status: 201 })
}
