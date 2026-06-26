export const GROUP_RATES = { solo: 7, binome: 5.25, groupe: 4 }

export function rateForSize(count: number): number {
  if (count <= 1) return GROUP_RATES.solo
  if (count === 2) return GROUP_RATES.binome
  return GROUP_RATES.groupe
}
