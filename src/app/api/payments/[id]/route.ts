import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const payment = await prisma.payment.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.payment.update({
    where: { id },
    data: {
      studentId: body.studentId,
      amount: Number(body.amount),
      status: body.status,
      method: body.method || null,
      month: Number(body.month),
      year: Number(body.year),
      reference: body.reference || null,
      paidDate: body.paidDate ? new Date(body.paidDate) : null,
      notes: body.notes || null,
    },
  })
  return NextResponse.json(updated)
}
