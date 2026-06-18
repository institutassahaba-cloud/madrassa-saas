import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tenantId = (session.user as any).tenantId

  const payments = await prisma.payment.findMany({
    where: { tenantId },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(payments)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as any
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()

  const now = new Date()
  const invoiceNumber = `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

  const payment = await prisma.payment.create({
    data: {
      tenantId: user.tenantId,
      studentId: body.studentId,
      amount: Number(body.amount),
      status: body.status,
      method: body.method || null,
      month: Number(body.month),
      year: Number(body.year),
      reference: body.reference || null,
      paidDate: body.paidDate ? new Date(body.paidDate) : null,
      notes: body.notes || null,
      dueDate: new Date(Number(body.year), Number(body.month) - 1, 5),
      invoiceNumber,
    },
  })
  return NextResponse.json(payment, { status: 201 })
}
