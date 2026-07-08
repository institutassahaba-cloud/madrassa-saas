import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendPaymentThanks } from "@/lib/payment-thanks"
import { wrap } from "@/lib/api"

export const PUT = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const payment = await prisma.payment.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 })
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
    include: {
      teacher: { select: { name: true } },
      student: { select: { firstName: true, lastName: true, email: true, monthlyFee: true, payerName: true } },
    },
  })
  if (!lessonSession) return NextResponse.json({ error: "Session introuvable pour ce professeur et cet élève." }, { status: 404 })
  if (amount !== lessonSession.student.monthlyFee && !body.amountOverrideReason) {
    return NextResponse.json({ error: "La raison de modification du montant est requise." }, { status: 400 })
  }

  const paidDate = new Date(body.paidDate)
  const paymentMonth = paidDate.getMonth() + 1
  const paymentYear = paidDate.getFullYear()

  const updated = await prisma.payment.update({
    where: { id },
    data: {
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
      source: "MANUAL",
      lessonSessionId: lessonSession.id,
      sessionNumber: lessonSession.number,
      expectedAmount: lessonSession.student.monthlyFee,
      receivedAmount: amount,
      expectedPayerName: lessonSession.student.payerName,
      confirmedAt: new Date(),
    },
  })
  if (payment.status !== "CONFIRMED") {
    sendPaymentThanks({
      studentEmail: lessonSession.student.email,
      studentName: `${lessonSession.student.firstName} ${lessonSession.student.lastName}`,
      teacherName: lessonSession.teacher.name,
      subject: lessonSession.subject,
      amount: updated.amount,
      paidDate: updated.paidDate,
      method: updated.method,
    }).catch((err) => console.error("[mail] Erreur envoi remerciement paiement:", err))
  }
  return NextResponse.json(updated)
})

// Suppression définitive d'un paiement (erreur de saisie, test) — directeur
// uniquement. L'allocation éventuelle vers un PaymentMatch est supprimée en
// cascade ; la session liée repasse « non payée » (statut dérivé des Payment).
export const DELETE = wrap(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })

  const { id } = await params
  const payment = await prisma.payment.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } })
  if (!payment) return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 })

  await prisma.payment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
})
