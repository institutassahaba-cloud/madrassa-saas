import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendComptaMail, sessionEndEmailHtml } from "@/lib/mail"
import { PAYMENT_AWAITING_STATUSES } from "@/lib/payment-status"
import { wrap } from "@/lib/api"

const PAYPAL_LINK = process.env.PAYPAL_LINK ?? ""
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL ?? process.env.PAYMENT_EMAIL ?? process.env.FACTURATION_EMAIL ?? "facturation.institutassahaba@gmail.com"
const WHATSAPP_LINK = process.env.WHATSAPP_LINK ?? ""
const COMPTA_EMAIL = process.env.GMAIL_COMPTA_USER ?? "comptabilite.institutassahaba@gmail.com"

function paymentMethodFromStudent(type?: string | null) {
  if (type === "PAYPAL") return "PayPal"
  if (type === "WISE") return "Virement"
  return null
}

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
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

  // Renumérotation d'une session : réservée au directeur/secrétaire (impacte le suivi
  // des paiements). Les paiements déjà enregistrés pour cette session suivent le nouveau
  // numéro ; les prochaines sessions créées reprendront l'auto-incrément à partir de lui.
  let newNumber: number | null = null
  if (body.number !== undefined) {
    if (!["DIRECTOR", "SECRETARY"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const parsed = Number(body.number)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
      return NextResponse.json({ error: "Numéro de session invalide." }, { status: 400 })
    }
    if (parsed !== existing.number) {
      const conflict = await prisma.lessonSession.findFirst({
        where: { tenantId: user.tenantId, studentId: existing.studentId, subject: existing.subject, number: parsed },
        select: { id: true },
      })
      if (conflict) {
        return NextResponse.json({ error: `La Session ${parsed} existe déjà pour cet élève.` }, { status: 409 })
      }
      newNumber = parsed
    }
  }

  const isClosing = body.isComplete === true && !existing.isComplete
  const shouldRequestPayment = isClosing || body.requestPayment === true
  const closingAt = new Date()

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.lessonSession.update({
      where: { id },
      data: {
        isComplete: body.isComplete ?? existing.isComplete,
        notes: body.notes ?? existing.notes,
        frequency: body.frequency != null ? Number(body.frequency) : existing.frequency,
        duration: body.duration ?? existing.duration,
        ...(newNumber != null ? { number: newNumber } : {}),
        ...(isClosing ? { endedAt: closingAt } : {}),
      },
      include: { lessons: { orderBy: { number: "asc" } } },
    })
    if (newNumber != null) {
      await tx.payment.updateMany({
        where: { tenantId: user.tenantId, lessonSessionId: id },
        data: { sessionNumber: newNumber },
      })
    }
    return result
  })

  let nextSessionForResponse = null

  if (shouldRequestPayment) {
    const [student, teacher] = await Promise.all([
      prisma.student.findUnique({ where: { id: existing.studentId } }),
      prisma.user.findUnique({ where: { id: existing.teacherId } }),
    ])
    // Le paiement demandé règle la session suivante : quand la session N se termine,
    // l'élève reçoit la demande pour la session N+1, qui est ouverte dans la foulée.
    const requestedSessionNumber = updated.number + 1
    if (student) {
      const nextSession = await prisma.lessonSession.upsert({
        where: {
          studentId_subject_number: {
            studentId: existing.studentId,
            subject: existing.subject,
            number: requestedSessionNumber,
          },
        },
        create: {
          tenantId: existing.tenantId,
          studentId: existing.studentId,
          teacherId: existing.teacherId,
          subject: existing.subject,
          number: requestedSessionNumber,
          frequency: existing.frequency,
          duration: existing.duration,
          paymentRequestedAt: closingAt,
        },
        update: { paymentRequestedAt: closingAt },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          teacher: { select: { id: true, name: true } },
          lessons: { orderBy: { number: "asc" } },
        },
      })
      nextSessionForResponse = nextSession
      const amount = student.monthlyFee || 0
      const requestData = {
        amount,
        dueDate: closingAt,
        month: closingAt.getMonth() + 1,
        year: closingAt.getFullYear(),
        status: student.email ? "EMAIL_SENT" : "EXPECTED",
        method: paymentMethodFromStudent(student.paymentType),
        source: "MANUAL",
        lessonSessionId: nextSession.id,
        sessionNumber: nextSession.number,
        expectedAmount: amount,
        expectedPayerName: student.payerName,
        emailSentAt: student.email ? closingAt : null,
        notes: student.email
          ? `Demande de paiement envoyée pour la session ${nextSession.number}, après fin de la session ${updated.number}.`
          : `Demande de paiement créée pour la session ${nextSession.number}, sans email élève renseigné.`,
      }
      const existingPaymentRequest = await prisma.payment.findFirst({
        where: {
          tenantId: existing.tenantId,
          lessonSessionId: nextSession.id,
          status: { in: [...PAYMENT_AWAITING_STATUSES] },
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
        completedSessionNumber: updated.number,
        requestedSessionNumber,
        amount,
        paypalLink: PAYPAL_LINK,
        paypalEmail: PAYPAL_EMAIL,
        whatsappLink: WHATSAPP_LINK,
        comptaEmail: COMPTA_EMAIL,
      })
      sendComptaMail({
        to: student.email,
        subject: `Demande de paiement — Session ${requestedSessionNumber} — ${existing.subject}`,
        html,
      }).catch((err) => console.error("[mail] Erreur envoi demande de paiement:", err))
    }
  }

  return NextResponse.json(nextSessionForResponse ? { ...updated, nextSession: nextSessionForResponse } : updated)
})

export const DELETE = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params

  const existing = await prisma.lessonSession.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // libSQL n'applique pas les cascades : on supprime explicitement les cours,
  // et on dissocie (sans supprimer) les paiements liés pour préserver la compta.
  await prisma.$transaction([
    prisma.lesson.deleteMany({ where: { sessionId: id } }),
    prisma.payment.updateMany({ where: { lessonSessionId: id, tenantId: user.tenantId }, data: { lessonSessionId: null } }),
    prisma.lessonSession.delete({ where: { id } }),
  ])
  return NextResponse.json({ ok: true })
})
