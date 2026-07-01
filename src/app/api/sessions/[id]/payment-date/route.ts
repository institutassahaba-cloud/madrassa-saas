import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

function parsePaidDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function invoiceNumber(now: Date) {
  return `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

function paymentMethodFromStudent(type?: string | null) {
  if (type === "PAYPAL") return "PayPal"
  return "Virement"
}

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const paidDate = parsePaidDate(body.paidDate)
  if (!paidDate) return NextResponse.json({ error: "Date de paiement invalide." }, { status: 400 })

  const lessonSession = await prisma.lessonSession.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      student: { select: { id: true, monthlyFee: true, payerName: true, paymentType: true } },
    },
  })
  if (!lessonSession) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })

  const paymentMonth = paidDate.getMonth() + 1
  const paymentYear = paidDate.getFullYear()
  const now = new Date()
  const existingPayment = await prisma.payment.findFirst({
    where: {
      tenantId: user.tenantId,
      studentId: lessonSession.studentId,
      sessionNumber: lessonSession.number,
      status: { not: "REJECTED" },
      paidDate: null,
    },
    orderBy: { createdAt: "desc" },
  })

  const baseData = {
    paidDate,
    status: "CONFIRMED",
    method: existingPayment?.method ?? paymentMethodFromStudent(lessonSession.student.paymentType),
    month: paymentMonth,
    year: paymentYear,
    dueDate: new Date(paymentYear, paymentMonth - 1, 5),
    source: existingPayment?.source ?? "MANUAL",
    lessonSessionId: lessonSession.id,
    sessionNumber: lessonSession.number,
    expectedAmount: lessonSession.student.monthlyFee,
    receivedAmount: existingPayment?.receivedAmount ?? existingPayment?.amount ?? lessonSession.student.monthlyFee,
    expectedPayerName: lessonSession.student.payerName,
    confirmedAt: now,
    notes: existingPayment?.notes ?? "Date de paiement renseignée manuellement depuis la fiche professeur.",
  }

  const payment = existingPayment
    ? await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          ...baseData,
          amount: existingPayment.amount || lessonSession.student.monthlyFee,
        },
      })
    : await prisma.payment.create({
        data: {
          tenantId: user.tenantId,
          studentId: lessonSession.studentId,
          amount: lessonSession.student.monthlyFee,
          invoiceNumber: invoiceNumber(now),
          ...baseData,
        },
      })

  return NextResponse.json({
    ok: true,
    paymentId: payment.id,
    paidDate: payment.paidDate?.toISOString() ?? null,
  })
})
