import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as any
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const target = await prisma.user.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.user.update({ where: { id }, data: body })
  return NextResponse.json(updated)
}
