import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendPaymentThanks } from "@/lib/payment-thanks"
import { learnPaymentAliasFromConfirmation } from "@/lib/student-payment-aliases"
import { DIRECTOR_REMAINDER_SUFFIX } from "@/lib/director-payer-alias"
import { paymentProviderReference } from "@/lib/payment-reference"
import { wrap } from "@/lib/api"

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

  const match = await prisma.paymentMatch.findFirst({
    where: { id, tenantId: user.tenantId, status: { in: ["TO_VERIFY", "AUTO_CONFIRMED"] } },
    include: { allocations: { include: { payment: true } } },
  })
  if (!match) return NextResponse.json({ error: "Paiement à vérifier introuvable." }, { status: 404 })

  const totalAllocated = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  if (totalAllocated <= 0) return NextResponse.json({ error: "Montant alloué invalide." }, { status: 400 })
  if (totalAllocated - match.receivedAmount > 0.01) {
    return NextResponse.json({ error: "Le total validé dépasse le montant reçu." }, { status: 400 })
  }

  const paymentDate = match.paymentDate ?? new Date()
  const paymentMonth = paymentDate.getMonth() + 1
  const paymentYear = paymentDate.getFullYear()
  const method = match.source === "PAYPAL" ? "PayPal" : "Virement"
  const providerReference = paymentProviderReference(match)
  const createdPayments = []
  const methodChangeNotifications: Array<{ studentName: string; previous: string | null; next: string }> = []

  if (match.status === "AUTO_CONFIRMED" && match.allocations.length > 0) {
    for (const allocation of match.allocations) {
      await prisma.payment.update({
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
    await prisma.paymentAllocation.deleteMany({ where: { paymentMatchId: match.id } })
  }

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
      include: {
        teacher: { select: { name: true } },
        student: { select: { firstName: true, lastName: true, email: true, monthlyFee: true, payerName: true, paymentType: true } },
      },
    })
    if (!lessonSession) return NextResponse.json({ error: "Une session sélectionnée est introuvable." }, { status: 404 })

    const now = new Date()
    const invoiceNumber = `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    const payment = await prisma.payment.create({
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
        confirmedAt: new Date(),
        notes: body.note || null,
      },
    })
    createdPayments.push(payment)
    sendPaymentThanks({
      studentEmail: lessonSession.student.email,
      studentName: `${lessonSession.student.firstName} ${lessonSession.student.lastName}`,
      teacherName: lessonSession.teacher.name,
      subject: lessonSession.subject,
      amount: payment.amount,
      paidDate: payment.paidDate,
      method: payment.method,
    }).catch((err) => console.error("[mail] Erreur envoi remerciement paiement:", err))

    await prisma.paymentAllocation.create({
      data: {
        paymentMatchId: match.id,
        paymentId: payment.id,
        amount,
      },
    })

    if (lessonSession.student.paymentType && lessonSession.student.paymentType !== match.source) {
      methodChangeNotifications.push({
        studentName: `${lessonSession.student.firstName} ${lessonSession.student.lastName}`,
        previous: lessonSession.student.paymentType,
        next: match.source,
      })
    }
    if (lessonSession.student.paymentType !== match.source) {
      await prisma.student.update({
        where: { id: item.studentId },
        data: { paymentType: match.source },
      })
    }

    // Apprentissage : mémorise le payeur → alias de l'élève pour que le
    // prochain paiement du même payeur soit suggéré à 100 %.
    await learnPaymentAliasFromConfirmation(
      user.tenantId,
      item.studentId,
      match.detectedPayerName,
      match.source,
    ).catch((err) => console.error("[alias] apprentissage échoué:", err))
  }

  // Part « directeur » : le reste non alloué du virement est tracé comme un
  // PaymentMatch DIRECTOR séparé (trouvable, jamais compté dans les revenus).
  // Le nom du payeur n'est PAS appris comme payeur directeur : il paie aussi
  // des sessions d'élèves.
  const remainder = +(match.receivedAmount - totalAllocated).toFixed(2)
  if (body.remainderForDirector === true && remainder > 0.01) {
    await prisma.paymentMatch.upsert({
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
        reason: `Part pour le directeur du virement ${providerReference} (${match.receivedAmount.toFixed(2)} € reçus, ${totalAllocated.toFixed(2)} € validés pour les sessions).`,
        rawSubject: match.rawSubject,
      },
      update: {
        receivedAmount: remainder,
        paymentReference: match.paymentReference,
        status: "DIRECTOR",
        reason: `Part pour le directeur du virement ${providerReference} (${match.receivedAmount.toFixed(2)} € reçus, ${totalAllocated.toFixed(2)} € validés pour les sessions).`,
      },
    })
  }

  await prisma.paymentMatch.update({
    where: { id: match.id },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  })

  for (const change of methodChangeNotifications) {
    await prisma.notification.create({
      data: {
        tenantId: user.tenantId,
        type: "PAYMENT_METHOD_CHANGED",
        title: "Mode de paiement modifié",
        body: `${change.studentName} a payé par ${change.next}, alors que le mode attendu était ${change.previous}.`,
        recipient: null,
        channel: "APP",
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, paymentCount: createdPayments.length })
})
