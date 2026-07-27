import assert from "node:assert/strict"
import test from "node:test"
import {
  getBillingCycleStart,
  resolveValidatedPaymentPeriodStart,
  validateRequestedPaymentPeriodStart,
} from "../src/lib/payment-period-rules.ts"

test("le cycle courant commence le 25 du mois après le 25", () => {
  const now = new Date(2026, 6, 26, 12)
  assert.equal(getBillingCycleStart(now).getTime(), new Date(2026, 6, 25).getTime())
})

test("avant le 25, le cycle commence le 25 du mois précédent", () => {
  const now = new Date(2026, 6, 12, 12)
  assert.equal(getBillingCycleStart(now).getTime(), new Date(2026, 5, 25).getTime())
})

test("une clôture récente neutralise un ancien début manuel", () => {
  const result = resolveValidatedPaymentPeriodStart({
    now: new Date(2026, 6, 26, 18),
    scanStartedAt: new Date(2026, 5, 1),
    manualStartAt: new Date(2026, 6, 1),
    latestClosureAt: new Date(2026, 6, 26, 10),
  })
  assert.equal(result.getTime(), new Date(2026, 6, 26, 10).getTime())
})

test("un nouveau début manuel postérieur à la clôture reste possible", () => {
  const result = resolveValidatedPaymentPeriodStart({
    now: new Date(2026, 6, 27, 18),
    latestClosureAt: new Date(2026, 6, 26, 10),
    manualStartAt: new Date(2026, 6, 27, 9),
  })
  assert.equal(result.getTime(), new Date(2026, 6, 27, 9).getTime())
})

test("une date manuelle antérieure à la borne définitive est refusée", () => {
  const result = validateRequestedPaymentPeriodStart({
    requestedAt: new Date(2026, 6, 25),
    minimumStartAt: new Date(2026, 6, 26, 10),
    now: new Date(2026, 6, 27),
  })
  assert.equal(result, "before-minimum")
})

test("une date manuelle égale ou postérieure à la borne est acceptée", () => {
  const result = validateRequestedPaymentPeriodStart({
    requestedAt: new Date(2026, 6, 26, 10),
    minimumStartAt: new Date(2026, 6, 26, 10),
    now: new Date(2026, 6, 27),
  })
  assert.equal(result, null)
})
