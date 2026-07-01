import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendComptaMail, sessionEndEmailHtml } from "@/lib/mail"

const PAYPAL_LINK = process.env.PAYPAL_LINK ?? ""
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL ?? process.env.PAYMENT_EMAIL ?? process.env.FACTURATION_EMAIL ?? "facturation.institutassahaba@gmail.com"
const WHATSAPP_LINK = process.env.WHATSAPP_LINK ?? ""
const COMPTA_EMAIL = process.env.GMAIL_COMPTA_USER ?? "comptabilite.institutassahaba@gmail.com"

function paymentMethodFromStudent(type?: string | null) {
  if (type === "PAYPAL") return "PayPal"
  if (type === "WISE") return "Virement"
  return null
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params

  const body = await req.json()

  const existing = await prisma.lessonSession.findFirst({
    where: { id, tenantId: user.tenantId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && existing.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const isClosing = body.isComplete === true && !existing.isComplete
  const shouldRequestPayment = isClosing || body.requestPayment === true
  const closingAt = new Date()

  const updated = await prisma.lessonSession.update({
    where: { id },
    data: {
      isComplete: body.isComplete ?? existing.isComplete,
      notes: body.notes ?? existing.notes,
      frequency: body.frequency != null ? Number(body.frequency) : existing.frequency,
      duration: body.duration ?? existing.duration,
      ...(isClosing ? { endedAt: closingAt } : {}),
      ...(shouldRequestPayment ? { paymentRequestedAt: closingAt } : {}),
    },
    include: { lessons: { orderBy: { number: "asc" } } },
  })

  if (shouldRequestPayment) {
    const [student, teacher] = await Promise.all([
      prisma.student.findUnique({ where: { id: existing.studentId } }),
      prisma.user.findUnique({ where: { id: existing.teacherId } }),
    ])
    let paymentSessionNumber = existing.number + 1
    if (student) {
      const nextSessionNumber = existing.number + 1
      const paymentSession = await prisma.lessonSession.upsert({
        where: {
          studentId_subject_number: {
            studentId: existing.studentId,
            subject: existing.subject,
            number: nextSessionNumber,
          },
        },
        create: {
          tenantId: existing.tenantId,
          studentId: existing.studentId,
          teacherId: existing.teacherId,
          subject: existing.subject,
          number: nextSessionNumber,
          frequency: existing.frequency,
          duration: existing.duration,
          paymentRequestedAt: closingAt,
        },
        update: { paymentRequestedAt: closingAt },
      })
      paymentSessionNumber = paymentSession.number
      const amount = student.monthlyFee || 0
      const requestData = {
        amount,
        dueDate: closingAt,
        month: closingAt.getMonth() + 1,
        year: closingAt.getFullYear(),
        status: student.email ? "EMAIL_SENT" : "EXPECTED",
        method: paymentMethodFromStudent(student.paymentType),
        source: "MANUAL",
        lessonSessionId: paymentSession.id,
        sessionNumber: paymentSession.number,
        expectedAmount: amount,
        expectedPayerName: student.payerName,
        emailSentAt: student.email ? closingAt : null,
        notes: student.email
          ? "Demande de paiement envoyée après fin de session."
          : "Demande de paiement créée après fin de session, sans email élève renseigné.",
      }
      const existingPaymentRequest = await prisma.payment.findFirst({
        where: {
          tenantId: existing.tenantId,
          lessonSessionId: paymentSession.id,
          status: { in: ["EXPECTED", "EMAIL_SENT", "REMINDED", "PENDING"] },
        },
        select: { id: true },
      })
      if (existingPaymentRequest) {
        await prisma.payment.update({
          where: { id: existingPaymentRequest.id },
          data: requestData,
        })
      } else {
        await prisma.payment.create({
          data: {
            tenantId: existing.tenantId,
            studentId: existing.studentId,
            ...requestData,
          },
        })
      }
    }

    if (student?.email) {
      const studentName = student.displayName || `${student.firstName} ${student.lastName}`
      const teacherName = teacher?.name || "—"
      const amount = String(student.monthlyFee || 0)
      const html = sessionEndEmailHtml({
        studentName,
        teacherName,
        subject: existing.subject,
        completedSessionNumber: existing.number,
        paymentSessionNumber,
        amount,
        paypalLink: PAYPAL_LINK,
        paypalEmail: PAYPAL_EMAIL,
        whatsappLink: WHATSAPP_LINK,
        comptaEmail: COMPTA_EMAIL,
      })
      sendComptaMail({
        to: student.email,
        subject: `Demande de paiement — Session ${paymentSessionNumber} — ${existing.subject}`,
        html,
      }).catch((err) => console.error("[mail] Erreur envoi demande de paiement:", err))
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params

  const existing = await prisma.lessonSession.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.lessonSession.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
