import assert from "node:assert/strict"
import test from "node:test"
import { appendSecretaryPaymentDetails, readSecretaryPaymentDetails } from "../src/lib/secretary-salary-details.ts"

test("conserve un détail structuré des paiements de la secrétaire", () => {
  const notes = appendSecretaryPaymentDetails("Commission secrétaire", [{
    id: "p1", paymentDate: "2026-07-01T10:00:00.000Z", student: "Élève Test", session: "Arabe · session 3",
    amount: 21, method: "PayPal", validated: true, validationDate: "2026-07-03T11:00:00.000Z",
  }])
  const result = readSecretaryPaymentDetails(notes)
  assert.equal(result.displayNotes, "Commission secrétaire")
  assert.equal(result.payments[0].session, "Arabe · session 3")
  assert.equal(result.payments[0].validated, true)
})

test("convertit les anciennes lignes de texte en détail affichable", () => {
  const result = readSecretaryPaymentDetails("Résumé\nDétail :\n09/06/2026 · Oumou Diarra · 42.00 € · PayPal · réf. ABC · validé le 03/07/2026 11:32:20")
  assert.equal(result.payments[0].student, "Oumou Diarra")
  assert.equal(result.payments[0].method, "PayPal")
  assert.equal(result.payments[0].validationDate, "03/07/2026 11:32:20")
})
