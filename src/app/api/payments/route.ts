import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type ManualAllocationInput = {
  studentId: string
  teacherId: string
  lessonSessionId: string
  amount: number
  amountOverrideReason?: string
}

type ValidatedManualAllocation = {
  item: ManualAllocationInput
  amount: number
  lessonSession: {
    id: string
    number: number
    student: {
      monthlyFee: number
      payerName: string | null
    }
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tenantId = (session.user).tenantId

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
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  if (Array.isArray(body.allocations)) {
    const allocations = body.allocations as ManualAllocationInput[]
    if (allocations.length === 0) return NextResponse.json({ error: "Ajoutez au moins une session à valider." }, { status: 400 })
    if (!body.paidDate || !body.method) {
      return NextResponse.json({ error: "Date et moyen de paiement requis." }, { status: 400 })
    }
    if (!["Virement", "PayPal"].includes(body.method)) {
      return NextResponse.json({ error: "Moyen de paiement invalide." }, { status: 400 })
    }

    const paidDate = new Date(body.paidDate)
    const paymentMonth = paidDate.getMonth() + 1
    const paymentYear = paidDate.getFullYear()
    const validated: ValidatedManualAllocation[] = []

    for (const item of allocations) {
      const amount = Number(item.amount)
      if (!item.studentId || !item.teacherId || !item.lessonSessionId || Number.isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: "Chaque ligne doit contenir professeur, élève, session et montant." }, { status: 400 })
      }

      const lessonSession = await prisma.lessonSession.findFirst({
        where: {
          id: item.lessonSessionId,
          tenantId: user.tenantId,
          studentId: item.studentId,
          teacherId: item.teacherId,
        },
        include: { student: { select: { monthlyFee: true, payerName: true } } },
      })
      if (!lessonSession) return NextResponse.json({ error: "Une session sélectionnée est introuvable." }, { status: 404 })
      if (amount !== lessonSession.student.monthlyFee && !item.amountOverrideReason) {
        return NextResponse.json({ error: "La raison de modification du montant est requise sur chaque ligne modifiée." }, { status: 400 })
      }
      validated.push({ item, amount, lessonSession })
    }

    const createdPayments = await prisma.$transaction(async (tx) => {
      const payments = []
      for (const { item, amount, lessonSession } of validated) {
        const now = new Date()
        const invoiceNumber = `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
        const payment = await tx.payment.create({
          data: {
            tenantId: user.tenantId,
            studentId: item.studentId,
            amount,
            status: "CONFIRMED",
            method: body.method || null,
            month: paymentMonth,
            year: paymentYear,
            reference: body.reference || null,
            paidDate,
            notes: item.amountOverrideReason || null,
            dueDate: new Date(paymentYear, paymentMonth - 1, 5),
            invoiceNumber,
            source: "MANUAL",
            lessonSessionId: lessonSession.id,
            sessionNumber: lessonSession.number,
            expectedAmount: lessonSession.student.monthlyFee,
            receivedAmount: amount,
            expectedPayerName: lessonSession.student.payerName,
            confirmedAt: new Date(),
          },
        })
        payments.push(payment)
      }
      return payments
    })

    return NextResponse.json({ ok: true, paymentCount: createdPayments.length }, { status: 201 })
  }

  const amount = Number(body.amount)
  if (!body.studentId || !body.lessonSessionId || !body.paidDate || !body.method || Number.isNaN(amount)) {
    return NextResponse.json({ error: "Élève, session, date, moyen et montant requis." }, { status: 400 })
  }
  if (!["Virement", "PayPal"].includes(body.method)) {
    return NextResponse.json({ error: "Moyen de paiement invalide." }, { status: 400 })
  }

  const lessonSession = await prisma.lessonSession.findFirst({
    where: {
      id: body.lessonSessionId,
      tenantId: user.tenantId,
      studentId: body.studentId,
      teacherId: body.teacherId,
    },
    include: { student: { select: { monthlyFee: true, payerName: true } } },
  })
  if (!lessonSession) return NextResponse.json({ error: "Session introuvable pour ce professeur et cet élève." }, { status: 404 })
  if (amount !== lessonSession.student.monthlyFee && !body.amountOverrideReason) {
    return NextResponse.json({ error: "La raison de modification du montant est requise." }, { status: 400 })
  }

  const paidDate = new Date(body.paidDate)
  const paymentMonth = paidDate.getMonth() + 1
  const paymentYear = paidDate.getFullYear()

  const now = new Date()
  const invoiceNumber = `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

  const payment = await prisma.payment.create({
    data: {
      tenantId: user.tenantId,
      studentId: body.studentId,
      amount,
      status: "CONFIRMED",
      method: body.method || null,
      month: paymentMonth,
      year: paymentYear,
      reference: body.reference || null,
      paidDate,
      notes: body.amountOverrideReason || null,
      dueDate: new Date(paymentYear, paymentMonth - 1, 5),
      invoiceNumber,
      source: "MANUAL",
      lessonSessionId: lessonSession.id,
      sessionNumber: lessonSession.number,
      expectedAmount: lessonSession.student.monthlyFee,
      receivedAmount: amount,
      expectedPayerName: lessonSession.student.payerName,
      confirmedAt: new Date(),
    },
  })
  return NextResponse.json(payment, { status: 201 })
}
