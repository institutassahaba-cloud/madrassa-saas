/**
 * Lecture du forfait d'un élève (durée d'un cours, tarif attendu).
 *
 * Le champ `Student.duration` n'a pas un format unique en base : la saisie récente
 * enregistre des heures décimales ("1", "0,5", "0,75"), mais les fiches importées des
 * anciens Sheets contiennent du texte libre ("30 min", "1h", "45 min"). Un simple
 * `parseFloat("30 min")` renvoie 30 — soit 30 heures de cours. Ce module centralise une
 * lecture qui accepte les deux écritures.
 */

/** Durée d'un cours convertie en heures, ou null si illisible. */
export function parseDurationHours(duration: string | null | undefined): number | null {
  if (duration == null) return null
  const raw = String(duration).trim().toLowerCase().replace(",", ".")
  if (!raw) return null

  // "45 min", "45min", "45 minutes"
  const minutes = raw.match(/^(\d+(?:\.\d+)?)\s*(?:min|minute|minutes|mn)$/)
  if (minutes) {
    const value = Number(minutes[1])
    return value > 0 ? value / 60 : null
  }

  // "1h", "1 h", "1h30", "1h30min"
  const hoursMinutes = raw.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)?\s*(?:min|minute|minutes|mn)?$/)
  if (hoursMinutes) {
    const total = Number(hoursMinutes[1]) + (hoursMinutes[2] ? Number(hoursMinutes[2]) / 60 : 0)
    return total > 0 ? total : null
  }

  // Nombre nu : convention de saisie = heures décimales. Au-delà de 12 la valeur ne peut
  // pas être des heures de cours, on la relit comme des minutes ("30" -> 30 min).
  const bare = raw.match(/^\d+(?:\.\d+)?$/)
  if (bare) {
    const value = Number(raw)
    if (value <= 0) return null
    return value > 12 ? value / 60 : value
  }

  return null
}

/** Durée affichable ("30 min", "1h", "1h30") à partir du champ brut. */
export function formatDuration(duration: string | null | undefined): string | null {
  const hours = parseDurationHours(duration)
  if (hours == null) return null
  const minutes = Math.round(hours * 60)
  if (minutes % 60 === 0) return `${minutes / 60}h`
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`
}

/**
 * Tarif à enregistrer pour un élève.
 *
 * Le forfait fait foi, sauf tarif personnalisé (`customFee`) : fratrie regroupée sur une
 * seule fiche, remise, montant négocié. Un forfait incomplet ne remet jamais le tarif à
 * zéro — on conserve la valeur en place plutôt que d'effacer une facturation réelle.
 */
export function resolveMonthlyFee({
  customFee,
  current,
  hourlyRate,
  duration,
  lessonsPerWeek,
}: {
  customFee: boolean | null | undefined
  current: number | null | undefined
  hourlyRate: number | null | undefined
  duration: string | null | undefined
  lessonsPerWeek: number | null | undefined
}): number {
  const fallback = Number.isFinite(Number(current)) ? Number(current) : 0
  if (customFee) return fallback
  return computeExpectedFee({ hourlyRate, duration, lessonsPerWeek }) ?? fallback
}

/**
 * Tarif attendu pour 4 semaines = tarif horaire × durée d'un cours (h) × cours/semaine × 4.
 * Renvoie null dès qu'une des trois données manque : on ne devine pas un tarif.
 */
export function computeExpectedFee({
  hourlyRate,
  duration,
  lessonsPerWeek,
}: {
  hourlyRate: number | null | undefined
  duration: string | null | undefined
  lessonsPerWeek: number | null | undefined
}): number | null {
  const hours = parseDurationHours(duration)
  if (hours == null || hours <= 0) return null
  // Les appelants passent souvent le contenu brut d'un champ de saisie : un NaN doit
  // sortir par null, jamais glisser jusqu'à la multiplication.
  const rate = Number(hourlyRate)
  const perWeek = Number(lessonsPerWeek)
  if (!Number.isFinite(rate) || !Number.isFinite(perWeek)) return null
  if (rate <= 0 || perWeek <= 0) return null
  return Math.round(rate * hours * perWeek * 4 * 100) / 100
}
