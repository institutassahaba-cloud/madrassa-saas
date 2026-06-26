import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const groups = await prisma.group.findMany({
    where: {
      tenantId: user.tenantId,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    include: { teacher: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(groups)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const group = await prisma.group.create({
    data: {
      tenantId: user.tenantId,
      name: body.name,
      level: body.level || null,
      teacherId: body.teacherId || null,
      maxStudents: body.maxStudents ?? 20,
      description: body.description || null,
      schedule: body.schedule ?? null,
    },
  })
  return NextResponse.json(group, { status: 201 })
}
