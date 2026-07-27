import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendPaymentThanks } from "@/lib/payment-thanks"
import { learnPaymentAliasFromConfirmation } from "@/lib/student-payment-aliases"
import { DIRECTOR_REMAINDER_SUFFIX } from "@/lib/director-payer-alias"
import { paymentProviderReference } from "@/lib/payment-reference"
import { ApiError, wrap } from "@/lib/api"

type AllocationInput = {
  studentId: string
  teacherId: string
  lessonSessionId: string
  amount: number
}

export const POST = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const allocations = Array.isArray(body.allocations) ? body.allocations as AllocationInput[] : []
  if (allocations.length === 0) return NextResponse.json({ error: "Ajoutez au moins une session à valider." }, { status: 400 })

  const duplicateSession = new Set(allocations.map((item) => item.lessonSessionId)).size !== allocations.length
  if (duplicateSession) return NextResponse.json({ error: "Une même session ne peut être validée qu'une fois." }, { status: 400 })

  for (const item of allocations) {
    const amount = Number(item.amount)
    if (!item.studentId || !item.teacherId || !item.lessonSessionId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Chaque ligne doit contenir professeur, élève, session et montant." }, { status: 400 })
    }
  }

  const match = await prisma.paymentMatch.findFirst({
    where: { id, tenantId: user.tenantId, status: { in: ["TO_VERIFY", "AUTO_CONFIRMED"] } },
    include: { allocations: { include: { payment: true } } },
  })
  if (!match) return NextResponse.json({ error: "Paiement à vérifier introuvable." }, { status: 404 })

  const totalAllocated = +allocations.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2)
  if (totalAllocated <= 0) return NextResponse.json({ error: "Montant alloué invalide." }, { status: 400 })
  if (totalAllocated - match.receivedAmount > 0.01) {
    return NextResponse.json({ error: "Le total validé dépasse le montant reçu." }, { status: 400 })
  }

  const sessionRows = await prisma.lessonSession.findMany({
    where: { id: { in: allocations.map((item) => item.lessonSessionId) }, tenantId: user.tenantId },
    include: {
      teacher: { select: { name: true } },
      student: { select: { id: true, firstName: true, lastName: true, email: true, monthlyFee: true, payerName: true, paymentType: true } },
    },
  })
  const sessionsById = new Map(sessionRows.map((row) => [row.id, row]))
  for (const item of allocations) {
    const lessonSession = sessionsById.get(item.lessonSessionId)
    if (!lessonSession || lessonSession.studentId !== item.studentId || lessonSession.teacherId !== item.teacherId) {
      return NextResponse.json({ error: "Une session sélectionnée est introuvable." }, { status: 404 })
    }
  }

  const paymentDate = match.paymentDate ?? new Date()
  const paymentMonth = paymentDate.getMonth() + 1
  const paymentYear = paymentDate.getFullYear()
  const method = match.source === "PAYPAL" ? "PayPal" : "Virement"
  const providerReference = paymentProviderReference(match)
  const confirmedAt = new Date()

  const transactionResult = await prisma.$transaction(async (tx) => {
    // Verrou optimiste : une seule requête peut faire passer ce match en cours
    // de traitement. Toute erreur suivante annule aussi ce verrou.
    const claimed = await tx.paymentMatch.updateMany({
      where: { id: match.id, tenantId: user.tenantId, status: { in: ["TO_VERIFY", "AUTO_CONFIRMED"] } },
      data: { status: "PROCESSING" },
    })
    if (claimed.count !== 1) throw new ApiError(409, "Ce paiement vient déjà d'être traité. Actualisez la liste.")

    if (match.status === "AUTO_CONFIRMED" && match.allocations.length > 0) {
      for (const allocation of match.allocations) {
        await tx.payment.update({
          where: { id: allocation.paymentId },
          data: {
            status: allocation.payment.emailSentAt ? "EMAIL_SENT" : "EXPECTED",
            paidDate: null,
            method: null,
            reference: null,
            source: "MANUAL",
            receivedAmount: null,
            detectedPayerName: null,
            confirmedAt: null,
            notes: "Validation automatique annulée puis corrigée manuellement.",
          },
        })
      }
      await tx.paymentAllocation.deleteMany({ where: { paymentMatchId: match.id } })
    }

    const thanks: Array<{
      studentEmail: string | null
      studentName: string
      teacherName: string
      subject: string
      amount: number
      paidDate: Date | null
      method: string | null
    }> = []
    const aliasStudentIds = new Set<string>()

    for (const item of allocations) {
      const lessonSession = sessionsById.get(item.lessonSessionId)!
      const amount = Number(item.amount)
      const invoiceNumber = `FAC-${confirmedAt.getFullYear()}${String(confirmedAt.getMonth() + 1).padStart(2, "0")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`
      const payment = await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          studentId: item.studentId,
          amount,
          dueDate: new Date(paymentYear, paymentMonth - 1, 5),
          paidDate: paymentDate,
          status: "CONFIRMED",
          method,
          reference: providerReference,
          month: paymentMonth,
          year: paymentYear,
          invoiceNumber,
          source: match.source,
          lessonSessionId: lessonSession.id,
          sessionNumber: lessonSession.number,
          expectedAmount: lessonSession.student.monthlyFee,
          receivedAmount: amount,
          expectedPayerName: lessonSession.student.payerName,
          detectedPayerName: match.detectedPayerName,
          confirmedAt,
          notes: body.note || null,
        },
      })

      await tx.paymentAllocation.create({
        data: { paymentMatchId: match.id, paymentId: payment.id, amount },
      })

      if (lessonSession.student.paymentType && lessonSession.student.paymentType !== match.source) {
        await tx.notification.create({
          data: {
            tenantId: user.tenantId,
            type: "PAYMENT_METHOD_CHANGED",
            title: "Mode de paiement modifié",
            body: `${lessonSession.student.firstName} ${lessonSession.student.lastName} a payé par ${match.source}, alors que le mode attendu était ${lessonSession.student.paymentType}.`,
            recipient: null,
            channel: "APP",
          },
        })
      }
      if (lessonSession.student.paymentType !== match.source) {
        await tx.student.update({ where: { id: item.studentId }, data: { paymentType: match.source } })
      }

      aliasStudentIds.add(item.studentId)
      thanks.push({
        studentEmail: lessonSession.student.email,
        studentName: `${lessonSession.student.firstName} ${lessonSession.student.lastName}`,
        teacherName: lessonSession.teacher.name,
        subject: lessonSession.subject,
        amount: payment.amount,
        paidDate: payment.paidDate,
        method: payment.method,
      })
    }

    const remainder = +(match.receivedAmount - totalAllocated).toFixed(2)
    if (body.remainderForDirector === true && remainder > 0.01) {
      const reason = `Part élèves du directeur du virement ${providerReference} (${match.receivedAmount.toFixed(2)} € reçus, ${totalAllocated.toFixed(2)} € validés pour les sessions).`
      await tx.paymentMatch.upsert({
        where: { tenantId_gmailMessageId: { tenantId: user.tenantId, gmailMessageId: `${match.gmailMessageId}${DIRECTOR_REMAINDER_SUFFIX}` } },
        create: {
          tenantId: user.tenantId,
          source: match.source,
          gmailMessageId: `${match.gmailMessageId}${DIRECTOR_REMAINDER_SUFFIX}`,
          paymentReference: match.paymentReference,
          receivedAmount: remainder,
          detectedPayerName: match.detectedPayerName,
          paymentLabel: match.paymentLabel,
          paymentDate: match.paymentDate,
          status: "DIRECTOR",
          reason,
          rawSubject: match.rawSubject,
        },
        update: { receivedAmount: remainder, paymentReference: match.paymentReference, status: "DIRECTOR", reason },
      })
    }

    await tx.paymentMatch.update({ where: { id: match.id }, data: { status: "CONFIRMED", confirmedAt } })
    return { paymentCount: allocations.length, thanks, aliasStudentIds: [...aliasStudentIds] }
  })

  // Ces effets externes ne doivent ni ralentir ni annuler l'écriture financière.
  for (const studentId of transactionResult.aliasStudentIds) {
    learnPaymentAliasFromConfirmation(user.tenantId, studentId, match.detectedPayerName, match.source)
      .catch((error) => console.error("[alias] apprentissage échoué:", error))
  }
  for (const message of transactionResult.thanks) {
    sendPaymentThanks(message).catch((error) => console.error("[mail] Erreur envoi remerciement paiement:", error))
  }

  return NextResponse.json({ ok: true, paymentCount: transactionResult.paymentCount })
})
