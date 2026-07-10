// Matières canoniques de l'institut (issues du système Google).
// Toute variante d'écriture est normalisée vers l'une de ces valeurs.

export const SUBJECTS = [
  "Coran",
  "Langue arabe",
  "Tajwid",
  "Nouraniyah",
  "Moutoun",
  "Anglais",
] as const

export type Subject = (typeof SUBJECTS)[number]

/**
 * Normalise une matière écrite librement vers une matière canonique.
 * Reprend la logique des Apps Script (normaliserMatiereCanonique_).
 */
export function normalizeSubject(raw: string | null | undefined): Subject | null {
  if (!raw) return null
  const t = String(raw)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()

  if (t.includes("coran") || t.includes("quran") || t.includes("qur an")) return "Coran"
  if (t.includes("tajwid") || t.includes("tajweed")) return "Tajwid"
  if (
    t.includes("nouraniyah") || t.includes("nouraniya") || t.includes("nourania") ||
    t.includes("nouraniyyah") || t.includes("nurania") || t.includes("nuraniya")
  ) return "Nouraniyah"
  if (t.includes("moutoun") || t.includes("moutoune") || t.includes("matn") || t.includes("mutun")) return "Moutoun"
  if (t.includes("anglais") || t.includes("english")) return "Anglais"
  if (t.includes("arabe")) return "Langue arabe"

  return null
}
