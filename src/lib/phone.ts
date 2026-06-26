// Normalisation des numéros de téléphone au format international.
// Reprend la logique des Apps Script (normaliserTelephoneInternational).
// Pays gérés : France, Belgique, Maroc, Algérie, Tunisie, Djibouti.

export function normalizePhoneInternational(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  let raw = String(value).trim()
  if (!raw) return ""

  raw = raw.replace(/[^\d+]/g, "")
  raw = raw.replace(/(?!^)\+/g, "") // un seul + autorisé, en tête
  if (!raw) return ""

  if (raw.startsWith("00")) raw = "+" + raw.slice(2)
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "")

  // France
  if ((raw.startsWith("06") || raw.startsWith("07")) && raw.length === 10) return "+33" + raw.slice(1)
  if ((raw.startsWith("6") || raw.startsWith("7")) && raw.length === 9) return "+33" + raw
  if (raw.startsWith("33")) return "+" + raw

  // Belgique
  if (raw.startsWith("04") && raw.length === 10) return "+32" + raw.slice(1)
  if (raw.startsWith("4") && raw.length === 9) return "+32" + raw
  if (raw.startsWith("32")) return "+" + raw

  // Indicatifs connus
  if (raw.startsWith("253")) return "+" + raw // Djibouti
  if (raw.startsWith("212")) return "+" + raw // Maroc
  if (raw.startsWith("213")) return "+" + raw // Algérie
  if (raw.startsWith("216")) return "+" + raw // Tunisie

  return raw
}

/** Lien WhatsApp direct (wa.me) à partir d'un numéro. */
export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = normalizePhoneInternational(phone).replace(/\D/g, "")
  return digits ? `https://wa.me/${digits}` : null
}
