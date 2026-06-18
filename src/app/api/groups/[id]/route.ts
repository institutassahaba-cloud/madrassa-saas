import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as any
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const group = await prisma.group.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.group.update({
    where: { id },
    data: {
      name: body.name,
      level: body.level || null,
      teacherId: body.teacherId || null,
      maxStudents: body.maxStudents,
      description: body.description || null,
      schedule: body.schedule ?? null,
    },
  })
  return NextResponse.json(updated)
}
