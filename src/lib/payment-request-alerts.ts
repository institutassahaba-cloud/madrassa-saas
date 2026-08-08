/**
 * Alertes « demande de paiement non envoyée ».
 *
 * La clôture d'une session (voir src/app/api/sessions/[id]/route.ts) peut échouer
 * silencieusement : fiche élève sans e-mail, forfait à 0 €, SMTP compta en panne. Le
 * professeur voit alors un succès et personne n'apprend que la demande n'est jamais
 * partie. Ces fonctions déposent une notification lue par le directeur et la secrétaire
 * (`recipient: null`, cf. notificationVisibilityWhere).
 */

import { prisma } from "@/lib/prisma"
import { computeExpectedFee, formatDuration } from "@/lib/forfait"

export const PAYMENT_REQUEST_FAILED = "PAYMENT_REQUEST_FAILED"
export const PAYMENT_REQUEST_AMOUNT_WARNING = "PAYMENT_REQUEST_AMOUNT_WARNING"

export type PaymentRequestBlocker =
  | { code: "NO_EMAIL" }
  | { code: "NO_AMOUNT" }
  | { code: "NO_FORFAIT"; missing: string[] }
  | { code: "SEND_FAILED"; detail: string }

type AlertContext = {
  tenantId: string
  studentName: string
  teacherName: string
  subject: string
  requestedSessionNumber: number
}

function blockerLine(blocker: PaymentRequestBlocker): string {
  switch (blocker.code) {
    case "NO_EMAIL":
      return "• Aucune adresse e-mail sur la fiche élève (champ « Email »). À renseigner dans Élèves → fiche → Contact."
    case "NO_AMOUNT":
      return "• Le forfait de l'élève est à 0 €. Aucun montant à demander : renseignez le tarif horaire, la durée et le nombre de cours par semaine."
    case "NO_FORFAIT":
      return `• Forfait incomplet : ${blocker.missing.join(", ")} manquant(s) sur la fiche élève.`
    case "SEND_FAILED":
      return `• L'envoi par l'adresse de comptabilité a échoué (${blocker.detail}). Vérifiez la connexion dans Connexions → Adresse compta.`
  }
}

/**
 * Dépose une notification « demande non envoyée ». Une seule par élève et par jour :
 * un professeur qui reclique ne doit pas remplir la boîte du directeur.
 */
export async function alertPaymentRequestFailed(
  context: AlertContext,
  blockers: PaymentRequestBlocker[],
) {
  if (blockers.length === 0) return
  const title = `Demande de paiement non envoyée — ${context.studentName}`

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const existing = await prisma.notification.findFirst({
    where: {
      tenantId: context.tenantId,
      type: PAYMENT_REQUEST_FAILED,
      title,
      recipient: null,
      createdAt: { gte: dayStart },
    },
    select: { id: true },
  })
  if (existing) return

  const body = [
    `La demande de paiement de la Session ${context.requestedSessionNumber} (${context.subject}) n'a pas pu être envoyée à ${context.studentName}.`,
    `Professeur : ${context.teacherName}.`,
    "",
    "Motif(s) :",
    ...blockers.map(blockerLine),
    "",
    "Le professeur a vu sa session se clôturer normalement : il ignore que l'e-mail n'est pas parti.",
  ].join("\n")

  await prisma.notification.create({
    data: {
      tenantId: context.tenantId,
      type: PAYMENT_REQUEST_FAILED,
      title,
      body,
      recipient: null,
      channel: "APP",
      status: "PENDING",
    },
  })
}

/**
 * Alerte distincte : l'e-mail est bien parti, mais le montant demandé ne correspond pas
 * au forfait de la fiche (tarif horaire × durée × cours/semaine × 4). C'est le cas d'un
 * `monthlyFee` figé qui n'a pas suivi un changement de durée ou de taille de classe.
 */
export async function alertPaymentAmountMismatch(
  context: AlertContext,
  student: {
    monthlyFee: number
    hourlyRate: number | null
    duration: string | null
    lessonsPerWeek: number | null
  },
) {
  const expected = computeExpectedFee(student)
  const missing = missingForfaitFields(student)
  // Forfait complet et conforme au montant demandé : rien à signaler.
  if (expected != null && Math.abs(expected - student.monthlyFee) < 0.01) return
  // Forfait complet mais illisible d'aucune façon : rien de fiable à dire.
  if (expected == null && missing.length === 0) return

  const title = expected == null
    ? `Montant non vérifiable — ${context.studentName}`
    : `Montant incohérent avec le forfait — ${context.studentName}`
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const existing = await prisma.notification.findFirst({
    where: {
      tenantId: context.tenantId,
      type: PAYMENT_REQUEST_AMOUNT_WARNING,
      title,
      recipient: null,
      createdAt: { gte: dayStart },
    },
    select: { id: true },
  })
  if (existing) return

  const body = [
    `La demande de paiement de la Session ${context.requestedSessionNumber} (${context.subject}) a été envoyée à ${context.studentName} pour ${student.monthlyFee} €.`,
    expected == null
      ? `Ce montant n'a pas pu être vérifié : ${missing.join(", ")} manquant(s) sur la fiche élève.`
      : `Or son forfait donne ${expected} € : ${student.hourlyRate} €/h × ${formatDuration(student.duration)} × ${student.lessonsPerWeek} cours/semaine × 4 semaines.`,
    `Professeur : ${context.teacherName}.`,
    "",
    expected == null
      ? "Complétez la fiche élève pour que le tarif demandé soit contrôlable."
      : "Le tarif enregistré sur la fiche n'a pas suivi un changement de durée ou de classe. Corrigez la fiche élève, puis régularisez le paiement demandé.",
  ].join("\n")

  await prisma.notification.create({
    data: {
      tenantId: context.tenantId,
      type: PAYMENT_REQUEST_AMOUNT_WARNING,
      title,
      body,
      recipient: null,
      channel: "APP",
      status: "PENDING",
    },
  })
}

/** Données de forfait absentes de la fiche, pour le motif NO_FORFAIT. */
export function missingForfaitFields(student: {
  hourlyRate: number | null
  duration: string | null
  lessonsPerWeek: number | null
}): string[] {
  const missing: string[] = []
  if (student.hourlyRate == null || student.hourlyRate <= 0) missing.push("tarif horaire")
  if (!student.duration) missing.push("durée d'un cours")
  if (student.lessonsPerWeek == null || student.lessonsPerWeek <= 0) missing.push("cours par semaine")
  return missing
}
