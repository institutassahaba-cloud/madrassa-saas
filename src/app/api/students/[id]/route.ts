import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateForSize } from "@/lib/group-rates"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"
import { replaceStudentPaymentAliases } from "@/lib/student-payment-aliases"

async function recalcGroupRate(groupId: string, tenantId: string) {
  const count = await prisma.student.count({
    where: { groupId, tenantId, status: "ACTIVE" },
  })
  if (count > 0) {
    await prisma.student.updateMany({
      where: { groupId, tenantId, status: "ACTIVE" },
      data: { hourlyRate: rateForSize(count) },
    })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureStudentPaymentColumns()

  const { id } = await params
  const body = await req.json()

  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const oldGroupId = student.groupId
  const newGroupId = body.groupId || null

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
      groupId: newGroupId,
      level: body.level || null,
      subject: body.subject || null,
      monthlyFee: Number(body.monthlyFee),
      paymentGraceAllowed: user.role === "DIRECTOR" ? body.paymentGraceAllowed === true : undefined,
      hourlyRate: body.hourlyRate === "" || body.hourlyRate == null ? null : Number(body.hourlyRate),
      lessonsPerWeek: body.lessonsPerWeek === "" || body.lessonsPerWeek == null ? null : Number(body.lessonsPerWeek),
      duration: body.duration || null,
      status: body.status || "ACTIVE",
      recontactDate: body.recontactDate ? new Date(body.recontactDate) : null,
      parentName: body.parentName || null,
      parentPhone: body.parentPhone || null,
      parentEmail: body.parentEmail || null,
      notes: body.notes || null,
    },
  })

  await replaceStudentPaymentAliases(user.tenantId, id, body.paymentAliases)

  if (oldGroupId !== newGroupId) {
    if (oldGroupId) await recalcGroupRate(oldGroupId, user.tenantId)
    if (newGroupId) await recalcGroupRate(newGroupId, user.tenantId)
    if (!newGroupId) {
      await prisma.student.update({ where: { id }, data: { hourlyRate: rateForSize(1) } })
    }
  }

  return NextResponse.json(updated)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureStudentPaymentColumns()

  const { id } = await params
  const body = await req.json()
  if (body.paymentGraceAllowed !== undefined && user.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })
  }

  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.student.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      recontactDate: body.recontactDate ? new Date(body.recontactDate) : undefined,
      notes: body.notes ?? undefined,
      monthlyFee: body.monthlyFee !== undefined ? Number(body.monthlyFee) : undefined,
      paymentGraceAllowed: body.paymentGraceAllowed !== undefined ? Boolean(body.paymentGraceAllowed) : undefined,
      groupId: body.groupId ?? undefined,
    },
  })
  if (body.status && body.status !== student.status && student.groupId) {
    await recalcGroupRate(student.groupId, user.tenantId)
  }
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const student = await prisma.student.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const groupId = student.groupId
  await prisma.student.delete({ where: { id } })
  if (groupId) await recalcGroupRate(groupId, user.tenantId)
  return NextResponse.json({ ok: true })
}
