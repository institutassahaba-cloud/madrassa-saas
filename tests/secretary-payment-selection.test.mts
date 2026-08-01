import assert from "node:assert/strict"
import test from "node:test"
import { selectSecretaryPayments } from "../src/lib/secretary-payment-selection.ts"

const payments = [
  { id: "a", validationDate: new Date("2026-07-01T10:00:00Z") },
  { id: "b", validationDate: new Date("2026-07-02T10:00:00Z") },
  { id: "c", validationDate: new Date("2026-07-03T10:00:00Z") },
  { id: "d", validationDate: new Date("2026-07-04T10:00:00Z") },
]

test("sélectionne les bornes incluses et permet une exclusion", () => {
  assert.deepEqual(
    selectSecretaryPayments(payments, { startPaymentId: "b", endPaymentId: "d", excludedPaymentIds: ["c"] }).map((payment) => payment.id),
    ["b", "d"],
  )
})

test("refuse des bornes inversées", () => {
  assert.throws(() => selectSecretaryPayments(payments, { startPaymentId: "d", endPaymentId: "b" }), /PAYMENT_BOUNDARIES_REVERSED/)
})
