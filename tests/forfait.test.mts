import assert from "node:assert/strict"
import test from "node:test"
import { computeExpectedFee, formatDuration, parseDurationHours, resolveMonthlyFee } from "../src/lib/forfait.ts"

// Les huit écritures réellement présentes en base (saisie récente + import Sheets).
test("les heures décimales sont lues telles quelles", () => {
  assert.equal(parseDurationHours("1"), 1)
  assert.equal(parseDurationHours("0,5"), 0.5)
  assert.equal(parseDurationHours("0.5"), 0.5)
  assert.equal(parseDurationHours("0,75"), 0.75)
})

test("le texte libre des anciennes fiches est converti, pas lu comme des heures", () => {
  assert.equal(parseDurationHours("30 min"), 0.5)
  assert.equal(parseDurationHours("45 min"), 0.75)
  assert.equal(parseDurationHours("1h"), 1)
  assert.equal(parseDurationHours("1h30"), 1.5)
})

test("un nombre nu supérieur à 12 est relu comme des minutes", () => {
  assert.equal(parseDurationHours("90"), 1.5)
  assert.equal(parseDurationHours("30"), 0.5)
  assert.equal(parseDurationHours("12"), 12)
})

test("une durée illisible ou nulle ne devient jamais zéro heure", () => {
  assert.equal(parseDurationHours(null), null)
  assert.equal(parseDurationHours(""), null)
  assert.equal(parseDurationHours("   "), null)
  assert.equal(parseDurationHours("abc"), null)
  assert.equal(parseDurationHours("0"), null)
  assert.equal(parseDurationHours("-1"), null)
})

test("l'affichage d'une durée est stable quelle que soit son écriture", () => {
  assert.equal(formatDuration("0,5"), "30 min")
  assert.equal(formatDuration("30 min"), "30 min")
  assert.equal(formatDuration("1"), "1h")
  assert.equal(formatDuration("1h"), "1h")
  assert.equal(formatDuration("1h30"), "1h30")
  assert.equal(formatDuration("0,34"), "20 min")
  assert.equal(formatDuration("abc"), null)
})

// Le cas qui a fait envoyer 14 € au lieu de 28 € : même tarif horaire, même nombre de
// cours, seule la durée change.
test("le forfait suit la durée d'un cours", () => {
  const base = { hourlyRate: 7, lessonsPerWeek: 1 }
  assert.equal(computeExpectedFee({ ...base, duration: "0,5" }), 14)
  assert.equal(computeExpectedFee({ ...base, duration: "1" }), 28)
  assert.equal(computeExpectedFee({ ...base, duration: "0,75" }), 21)
})

test("le texte libre ne produit plus un forfait à quatre chiffres", () => {
  // Avant : parseFloat("30 min") = 30 heures -> 7 × 30 × 1 × 4 = 840 €.
  assert.equal(computeExpectedFee({ hourlyRate: 7, duration: "30 min", lessonsPerWeek: 1 }), 14)
  assert.equal(computeExpectedFee({ hourlyRate: 11, duration: "45 min", lessonsPerWeek: 1 }), 33)
  assert.equal(computeExpectedFee({ hourlyRate: 42, duration: "30 min", lessonsPerWeek: 3 }), 252)
})

test("un forfait incomplet ne renvoie pas un montant inventé", () => {
  assert.equal(computeExpectedFee({ hourlyRate: null, duration: "1", lessonsPerWeek: 1 }), null)
  assert.equal(computeExpectedFee({ hourlyRate: 7, duration: null, lessonsPerWeek: 1 }), null)
  assert.equal(computeExpectedFee({ hourlyRate: 7, duration: "1", lessonsPerWeek: null }), null)
  assert.equal(computeExpectedFee({ hourlyRate: 0, duration: "1", lessonsPerWeek: 1 }), null)
})

test("un champ de saisie vide ou illisible ne produit pas NaN", () => {
  assert.equal(computeExpectedFee({ hourlyRate: Number(""), duration: "1", lessonsPerWeek: 1 }), null)
  assert.equal(computeExpectedFee({ hourlyRate: Number("abc"), duration: "1", lessonsPerWeek: 1 }), null)
  assert.equal(computeExpectedFee({ hourlyRate: 7, duration: "1", lessonsPerWeek: Number("abc") }), null)
})

test("les tarifs de groupe tombent juste au centime", () => {
  // 5,25 €/h en binôme, cours d'1h, 1 fois par semaine.
  assert.equal(computeExpectedFee({ hourlyRate: 5.25, duration: "1", lessonsPerWeek: 1 }), 21)
  assert.equal(computeExpectedFee({ hourlyRate: 4, duration: "0,5", lessonsPerWeek: 2 }), 16)
})

// ─── resolveMonthlyFee : ce que le serveur enregistre réellement ───────────────

test("le forfait fait foi quand le tarif n'est pas personnalisé", () => {
  // Le cas Sarah Makri : la fiche porte 14 €, la durée dit 1h -> 28 € l'emporte.
  assert.equal(resolveMonthlyFee({
    customFee: false, current: 14, hourlyRate: 7, duration: "1", lessonsPerWeek: 1,
  }), 28)
})

test("un tarif personnalisé n'est jamais recalculé", () => {
  // Deux sœurs sur une seule fiche : 42 € doit survivre à un changement de classe.
  assert.equal(resolveMonthlyFee({
    customFee: true, current: 42, hourlyRate: 5.25, duration: "1", lessonsPerWeek: 1,
  }), 42)
})

test("un forfait incalculable ne remet pas le tarif à zéro", () => {
  assert.equal(resolveMonthlyFee({
    customFee: false, current: 28, hourlyRate: null, duration: "1", lessonsPerWeek: 1,
  }), 28)
  assert.equal(resolveMonthlyFee({
    customFee: false, current: 28, hourlyRate: 7, duration: null, lessonsPerWeek: 1,
  }), 28)
  assert.equal(resolveMonthlyFee({
    customFee: false, current: 28, hourlyRate: 7, duration: "1", lessonsPerWeek: null,
  }), 28)
})

test("un changement de taille de classe entraîne le forfait", () => {
  // Binôme (5,25 €/h) -> solo (7 €/h), cours d'1h une fois par semaine.
  assert.equal(resolveMonthlyFee({
    customFee: false, current: 21, hourlyRate: 7, duration: "1", lessonsPerWeek: 1,
  }), 28)
})

test("un tarif absent au départ ne devient pas NaN", () => {
  assert.equal(resolveMonthlyFee({
    customFee: true, current: null, hourlyRate: 7, duration: "1", lessonsPerWeek: 1,
  }), 0)
  assert.equal(resolveMonthlyFee({
    customFee: false, current: undefined, hourlyRate: null, duration: null, lessonsPerWeek: null,
  }), 0)
})
