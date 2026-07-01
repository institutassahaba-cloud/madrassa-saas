/**
 * Source unique de vérité pour le cycle de vie d'un `Payment`.
 *
 * Cycle canonique :
 *   EXPECTED → EMAIL_SENT → REMINDED → MATCHED → CONFIRMED
 *   REJECTED  = paiement refusé / annulé
 *
 * Statuts hérités (anciens Sheets / imports) tolérés EN LECTURE uniquement :
 *   PENDING ≈ EXPECTED   (en attente)
 *   PAID    ≈ CONFIRMED  (encaissé)
 *
 * ⚠️ Ne jamais filtrer un revenu sur "PAID" seul : les données réelles
 * utilisent "CONFIRMED". Passer par les constantes ci-dessous.
 */

/** Statuts considérés comme « encaissé » (comptent dans le chiffre d'affaires). */
export const PAYMENT_PAID_STATUSES = ["CONFIRMED", "PAID"] as const

/** Statuts « en attente de règlement » (relance / demande en cours). */
export const PAYMENT_AWAITING_STATUSES = ["EXPECTED", "EMAIL_SENT", "REMINDED", "PENDING"] as const

export function isPaidStatus(status: string | null | undefined): boolean {
  return status != null && (PAYMENT_PAID_STATUSES as readonly string[]).includes(status)
}

export function isAwaitingStatus(status: string | null | undefined): boolean {
  return status != null && (PAYMENT_AWAITING_STATUSES as readonly string[]).includes(status)
}
