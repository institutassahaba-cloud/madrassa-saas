export type ScheduleRecurrence = "NONE" | "WEEKLY" | "MONTHLY"

const META_PREFIX = "[MADRASSA_SCHEDULE:"
const META_END = "]"

interface ScheduleMeta {
  recurrence: ScheduleRecurrence
  startDate: string | null
}

function normalizeRecurrence(value: unknown): ScheduleRecurrence {
  return value === "NONE" || value === "MONTHLY" || value === "WEEKLY" ? value : "WEEKLY"
}

export function parseScheduleLabel(value: string | null | undefined): { label: string | null; recurrence: ScheduleRecurrence; startDate: string | null } {
  if (!value?.startsWith(META_PREFIX)) {
    return { label: value ?? null, recurrence: "WEEKLY", startDate: null }
  }

  const end = value.indexOf(META_END)
  if (end === -1) return { label: value, recurrence: "WEEKLY", startDate: null }

  try {
    const encoded = value.slice(META_PREFIX.length, end)
    const meta = JSON.parse(decodeURIComponent(encoded)) as Partial<ScheduleMeta>
    const label = value.slice(end + META_END.length).trim()
    return {
      label: label || null,
      recurrence: normalizeRecurrence(meta.recurrence),
      startDate: typeof meta.startDate === "string" ? meta.startDate : null,
    }
  } catch {
    return { label: value, recurrence: "WEEKLY", startDate: null }
  }
}

export function encodeScheduleLabel(label: string, recurrence: ScheduleRecurrence, startDate: string): string | null {
  const cleanLabel = label.trim()
  const meta: ScheduleMeta = { recurrence, startDate }
  return `${META_PREFIX}${encodeURIComponent(JSON.stringify(meta))}${META_END}${cleanLabel}` || null
}

export function scheduleDateKey(date: Date | string): string {
  if (date instanceof Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  return date.slice(0, 10)
}

export function scheduleSlotOccursOn(
  slot: { dayOfWeek: number; label: string | null; exceptions?: { date: Date | string }[] },
  date: Date
): boolean {
  const key = scheduleDateKey(date)
  const cancelled = slot.exceptions?.some((ex) => scheduleDateKey(ex.date) === key) ?? false
  if (cancelled) return false

  const meta = parseScheduleLabel(slot.label)
  const startsAt = meta.startDate
  if (startsAt && key < startsAt) return false

  if (meta.recurrence === "NONE") return startsAt === key

  if (meta.recurrence === "MONTHLY") {
    if (!startsAt) return false
    return date.getDate() === new Date(`${startsAt}T00:00:00`).getDate()
  }

  return slot.dayOfWeek === date.getDay()
}
