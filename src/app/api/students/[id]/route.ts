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

  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.student.update({
    where: { id },
    data: {
      firstName: body.firstName,
      lastName: body.lastName,
      gender: body.gender,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      city: body.city || null,
      groupId: body.groupId || null,
      level: body.level || null,
      monthlyFee: Number(body.monthlyFee),
      parentName: body.parentName || null,
      parentPhone: body.parentPhone || null,
      parentEmail: body.parentEmail || null,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(updated)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as any
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.student.update({ where: { id }, data: body })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as any
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.student.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
