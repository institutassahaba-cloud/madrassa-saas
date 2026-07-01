"use client"

import { useMemo, useState } from "react"
import type React from "react"
import { Clock, Plus, X, Globe, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { encodeScheduleLabel, parseScheduleLabel, scheduleSlotOccursOn, type ScheduleRecurrence } from "@/lib/schedule-meta"

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

const TIMEZONES = [
  { value: "Europe/Paris",       label: "🇫🇷 France (Paris) UTC+1/+2" },
  { value: "Africa/Casablanca",  label: "🇲🇦 Maroc (Casablanca) UTC+1" },
  { value: "Africa/Algiers",     label: "🇩🇿 Algérie (Alger) UTC+1" },
  { value: "Africa/Tunis",       label: "🇹🇳 Tunisie (Tunis) UTC+1" },
  { value: "Africa/Cairo",       label: "🇪🇬 Égypte (Le Caire) UTC+2" },
  { value: "Asia/Riyadh",        label: "🇸🇦 Arabie Saoudite UTC+3" },
  { value: "Asia/Dubai",         label: "🇦🇪 Émirats (Dubaï) UTC+4" },
  { value: "Europe/London",      label: "🇬🇧 Royaume-Uni (Londres) UTC+0/+1" },
  { value: "Europe/Brussels",    label: "🇧🇪 Belgique (Bruxelles) UTC+1/+2" },
  { value: "America/Montreal",   label: "🇨🇦 Canada (Montréal) UTC-5/-4" },
]

const COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
]
const AVAILABILITY_LABEL = "Créneau disponible"
const RECURRENCE_LABELS: Record<ScheduleRecurrence, string> = {
  NONE: "Une seule fois",
  WEEKLY: "Chaque semaine",
  MONTHLY: "Chaque mois",
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7) // 7h → 21h

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, "0")
  const min = (m % 60).toString().padStart(2, "0")
  return `${h}:${min}`
}

function convertTime(time: string, fromTz: string, toTz: string): string {
  try {
    const [h, m] = time.split(":").map(Number)
    const fromOffset = getUTCOffset(fromTz)
    const toOffset   = getUTCOffset(toTz)
    const diff = toOffset - fromOffset
    const total = h * 60 + m + diff
    return minutesToTime(((total % 1440) + 1440) % 1440)
  } catch { return time }
}

function getUTCOffset(tz: string): number {
  try {
    const now = new Date()
    const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" })
    const tzStr  = now.toLocaleString("en-US", { timeZone: tz })
    return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
  } catch { return 0 }
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function dateKey(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b)
}

function slotTitle(slot: TimeSlot): string {
  return parseScheduleLabel(slot.label).label ?? slot.group?.name ?? slot.teacher.name
}

function getSlotDuration(slot: TimeSlot): number {
  return Math.max(timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime), 15)
}

function snapMinutes(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

function minDateKey(a: string, b: string): string {
  return a < b ? a : b
}

function isAvailabilitySlot(slot: TimeSlot): boolean {
  return slot.group === null && parseScheduleLabel(slot.label).label === AVAILABILITY_LABEL
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotException {
  id: string
  date: string
  reason: string | null
}

interface TimeSlot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  label: string | null
  color: string | null
  teacher: { id: string; name: string; timezone: string }
  group: { id: string; name: string } | null
  exceptions: SlotException[]
}

interface Props {
  slots: TimeSlot[]
  groups: { id: string; name: string; teacherId: string | null }[]
  teachers: { id: string; name: string; timezone: string }[]
  currentUser: { id: string; name: string; timezone: string }
  role: string
  initialTeacherId: string
  initialWeek: string
}

// ─── OccurrenceBlock ─────────────────────────────────────────────────────────

function OccurrenceBlock({
  slot,
  date,
  viewTz,
  onEdit,
  onCancel,
  onDeleteSlot,
  onColorChange,
  onDragStart,
  onDragEnd,
}: {
  slot: TimeSlot
  date: Date
  viewTz: string
  onEdit: (slot: TimeSlot) => void
  onCancel: (slotId: string, date: Date) => void
  onDeleteSlot: (slotId: string) => void
  onColorChange: (slotId: string, color: string) => void
  onDragStart: (slot: TimeSlot, date: Date) => void
  onDragEnd: () => void
}) {
  const [showPalette, setShowPalette] = useState(false)
  const recurrence = parseScheduleLabel(slot.label).recurrence

  const start = convertTime(slot.startTime, slot.teacher.timezone, viewTz)
  const end   = convertTime(slot.endTime,   slot.teacher.timezone, viewTz)
  const startMin = timeToMinutes(start)
  const endMin   = timeToMinutes(end)

  const top    = ((startMin - 7 * 60) / (14 * 60)) * 100
  const height = Math.max(((endMin - startMin) / (14 * 60)) * 100, 2)

  const isToday = isSameDay(date, new Date())

  return (
    <div
      draggable
      onDragStart={() => onDragStart(slot, date)}
      onDragEnd={onDragEnd}
      className={`absolute left-0.5 right-0.5 cursor-move rounded-lg px-1.5 py-1 text-white text-xs overflow-hidden group ${isToday ? "ring-2 ring-yellow-300" : ""}`}
      style={{
        top: `${top}%`,
        height: `${height}%`,
        backgroundColor: slot.color ?? "#10b981",
        minHeight: "28px",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="font-semibold truncate leading-tight">
            {slotTitle(slot)}
          </p>
          <p className="opacity-80 text-[10px]">{start} – {end}</p>
          <p className="truncate text-[9px] opacity-70">{RECURRENCE_LABELS[recurrence]}</p>
        </div>
        <div className="mt-0.5 flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <button onClick={(e) => { e.stopPropagation(); setShowPalette(!showPalette) }} title="Couleur">
            <div className="h-3 w-3 rounded-full border border-white/60" style={{ backgroundColor: slot.color ?? "#10b981" }} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(slot) }} title="Modifier le créneau">
            <Pencil className="h-3 w-3" />
          </button>
          {!slot.group && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(slot) }}
              title="Associer à un élève ou une classe"
              className="rounded bg-white/20 px-1 text-[9px] font-semibold"
            >
              Associer
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(`Annuler ce cours du ${date.toLocaleDateString("fr-FR")} ?\nLes autres occurrences ne seront pas affectées.`))
                onCancel(slot.id, date)
            }}
            title="Annuler ce cours (cette semaine uniquement)"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteSlot(slot.id) }}
            title="Supprimer le créneau récurrent"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {showPalette && (
        <div className="flex gap-1 flex-wrap mt-1" onClick={(e) => e.stopPropagation()}>
          {COLORS.map(c => (
            <button
              key={c}
              className={`h-4 w-4 rounded-full border-2 ${(slot.color ?? "#10b981") === c ? "border-white scale-110" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              onClick={() => { onColorChange(slot.id, c); setShowPalette(false) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SlotForm ─────────────────────────────────────────────────────────────────

function SlotForm({
  date,
  slot,
  placement = "column",
  groups,
  teachers,
  role,
  currentUserId,
  onSave,
  onClose,
}: {
  date: Date
  slot?: TimeSlot
  placement?: "corner" | "column"
  groups: { id: string; name: string; teacherId: string | null }[]
  teachers: { id: string; name: string; timezone: string }[]
  role: string
  currentUserId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (data: any, slotId?: string) => void
  onClose: () => void
}) {
  const defaultTeacherId = role === "TEACHER" ? currentUserId : (slot?.teacher.id ?? teachers[0]?.id ?? currentUserId)
  const slotMeta = parseScheduleLabel(slot?.label)
  const [eventDate, setEventDate] = useState(dateKey(date))
  const [startTime, setStart] = useState(slot?.startTime ?? "09:00")
  const [endTime,   setEnd]   = useState(slot?.endTime ?? "09:30")
  const [label,     setLabel] = useState(slotMeta.label ?? "")
  const [color,     setColor] = useState(slot?.color ?? COLORS[0])
  const [groupId,   setGroup] = useState(slot?.group?.id ?? "NONE")
  const [teacherId, setTeacher] = useState(defaultTeacherId)
  const [hasRecurrence, setHasRecurrence] = useState(slotMeta.recurrence !== "NONE")
  const [recurrence, setRecurrence] = useState<Exclude<ScheduleRecurrence, "NONE">>(
    slotMeta.recurrence === "MONTHLY" ? "MONTHLY" : "WEEKLY"
  )

  const availableGroups = groups.filter((g) => g.teacherId === teacherId)

  function submit() {
    if (!startTime || !endTime) return
    onSave({
      dayOfWeek: new Date(`${eventDate}T00:00:00`).getDay(),
      startTime,
      endTime,
      label: encodeScheduleLabel(label, hasRecurrence ? recurrence : "NONE", eventDate),
      color,
      groupId: groupId === "NONE" ? null : groupId,
      teacherId,
    }, slot?.id)
    onClose()
  }

  return (
    <div className={
      "z-30 rounded-xl border border-emerald-300 bg-white p-3 shadow-xl space-y-2 " +
      (placement === "corner"
        ? "fixed inset-x-3 top-24 sm:absolute sm:left-0 sm:top-full sm:mt-2 sm:w-72"
        : "absolute inset-x-0 top-0")
    }>
      <p className="text-xs font-semibold text-gray-700">{slot ? "Modifier l'événement" : "Ajouter un événement"}</p>
      <div>
        <label className="text-xs text-gray-500">Date</label>
        <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="h-7 text-xs" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500">Début</label>
          <Input type="time" value={startTime} onChange={e => setStart(e.target.value)} className="h-7 text-xs" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500">Fin</label>
          <Input type="time" value={endTime} onChange={e => setEnd(e.target.value)} className="h-7 text-xs" />
        </div>
      </div>
      <Input placeholder="Libellé visible (ex: nom de l'élève)" value={label} onChange={e => setLabel(e.target.value)} className="h-7 text-xs" />
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
          <input
            type="checkbox"
            checked={hasRecurrence}
            onChange={(e) => setHasRecurrence(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Récurrence
        </label>
        {hasRecurrence ? (
          <Select value={recurrence} onValueChange={(value) => setRecurrence(value as Exclude<ScheduleRecurrence, "NONE">)}>
            <SelectTrigger className="mt-2 h-7 bg-white text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WEEKLY">Chaque semaine</SelectItem>
              <SelectItem value="MONTHLY">Chaque mois</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <p className="mt-1 text-xs text-gray-400">L&apos;événement apparaîtra uniquement à cette date.</p>
        )}
      </div>
      {role !== "TEACHER" && teachers.length > 0 && (
        <Select value={teacherId} onValueChange={(value) => { setTeacher(value); setGroup("NONE") }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Professeur" /></SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {availableGroups.length > 0 && (
        <div className="space-y-1">
        <label className="text-xs text-gray-500">Associer à un élève ou une classe</label>
        <Select value={groupId} onValueChange={setGroup}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Élève ou classe" /></SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            <SelectItem value="NONE">Aucune association</SelectItem>
            {availableGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {role !== "TEACHER" && (
          <div className="flex flex-wrap gap-2 text-xs">
            <a href="/dashboard/students" className="font-medium text-emerald-700 hover:underline">Créer une fiche élève</a>
            <span className="text-gray-300">·</span>
            <a href="/dashboard/groups" className="font-medium text-emerald-700 hover:underline">Créer une classe</a>
          </div>
        )}
        </div>
      )}
      {availableGroups.length === 0 && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">Aucun groupe actif pour ce professeur.</p>
      )}
      <div className="flex gap-1 flex-wrap">
        {COLORS.map(c => (
          <button
            key={c}
            className={`h-5 w-5 rounded-full border-2 transition-transform ${color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs flex-1" onClick={submit}>{slot ? "Enregistrer" : "Ajouter"}</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClose}>Annuler</Button>
      </div>
    </div>
  )
}

interface AvailabilityRange {
  startTime: string
  endTime: string
}

type AvailabilityDraft = Record<number, AvailabilityRange[]>

const AVAILABILITY_DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
]

function createEmptyAvailabilityDraft(): AvailabilityDraft {
  const draft: AvailabilityDraft = {}
  AVAILABILITY_DAYS.forEach((day) => { draft[day.value] = [] })
  return draft
}

function buildAvailabilityDraft(slots: TimeSlot[], teacherId: string): AvailabilityDraft {
  const draft = createEmptyAvailabilityDraft()
  slots
    .filter((slot) => slot.teacher.id === teacherId && isAvailabilitySlot(slot))
    .forEach((slot) => {
      draft[slot.dayOfWeek] = [
        ...(draft[slot.dayOfWeek] ?? []),
        { startTime: slot.startTime, endTime: slot.endTime },
      ].sort((a, b) => a.startTime.localeCompare(b.startTime))
    })
  return draft
}

function AvailabilityDialog({
  teacherName,
  initialDraft,
  onSave,
  onClose,
}: {
  teacherName: string
  initialDraft: AvailabilityDraft
  onSave: (draft: AvailabilityDraft) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<AvailabilityDraft>(initialDraft)
  const [saving, setSaving] = useState(false)

  function updateRange(day: number, index: number, field: keyof AvailabilityRange, value: string) {
    setDraft((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).map((range, i) => i === index ? { ...range, [field]: value } : range),
    }))
  }

  function addRange(day: number) {
    setDraft((prev) => ({
      ...prev,
      [day]: [...(prev[day] ?? []), { startTime: "14:00", endTime: "15:00" }],
    }))
  }

  function removeRange(day: number, index: number) {
    setDraft((prev) => ({
      ...prev,
      [day]: (prev[day] ?? []).filter((_, i) => i !== index),
    }))
  }

  async function submit() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-8">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Mes horaires disponibles</h2>
            <p className="mt-1 text-sm text-gray-500">
              Créneaux hebdomadaires affichés sur le planning de {teacherName}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {AVAILABILITY_DAYS.map((day) => (
            <div key={day.value} className="rounded-xl border border-gray-200 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-semibold text-gray-800">{day.label}</p>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => addRange(day.value)}>
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un créneau
                </Button>
              </div>

              {(draft[day.value] ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-400">
                  Aucun créneau disponible ce jour.
                </p>
              ) : (
                <div className="space-y-2">
                  {(draft[day.value] ?? []).map((range, index) => (
                    <div key={`${day.value}-${index}`} className="flex flex-col gap-2 rounded-lg bg-violet-50/60 p-2 sm:flex-row sm:items-center">
                      <span className="text-sm font-medium text-violet-900">Créneau</span>
                      <div className="grid flex-1 grid-cols-2 gap-2">
                        <Input type="time" value={range.startTime} onChange={(e) => updateRange(day.value, index, "startTime", e.target.value)} />
                        <Input type="time" value={range.endTime} onChange={(e) => updateRange(day.value, index, "endTime", e.target.value)} />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-red-600" onClick={() => removeRange(day.value, index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="button" className="gap-2" onClick={submit} disabled={saving}>
            <Clock className="h-4 w-4" />
            {saving ? "Enregistrement..." : "Valider les disponibilités"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ScheduleClient ──────────────────────────────────────────────────────

export function ScheduleClient({ slots: initialSlots, groups, teachers, currentUser, role, initialTeacherId, initialWeek }: Props) {
  const sortedTeachers = [...teachers].sort((a, b) => {
    const aIsSamia = a.name.toLowerCase().includes("samia") ? 0 : 1
    const bIsSamia = b.name.toLowerCase().includes("samia") ? 0 : 1
    if (aIsSamia !== bIsSamia) return aIsSamia - bIsSamia
    return a.name.localeCompare(b.name, "fr")
  })
  const [slots, setSlots] = useState<TimeSlot[]>(initialSlots)
  const [viewTz, setViewTz] = useState(currentUser.timezone)
  const [filterTeacher, setFilter] = useState(role === "TEACHER" ? currentUser.id : (initialTeacherId || sortedTeachers[0]?.id || ""))
  const [addingDate, setAddingDate] = useState<Date | null>(null)
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null)
  const [editingDate, setEditingDate] = useState<Date | null>(null)
  const [draggedOccurrence, setDraggedOccurrence] = useState<{ slot: TimeSlot; date: Date } | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    dateKey: string
    startTime: string
    endTime: string
    top: number
    height: number
  } | null>(null)
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false)
  const [savingTz, setSavingTz] = useState(false)
  const activeTeacherId = role === "TEACHER"
    ? currentUser.id
    : filterTeacher !== "ALL"
      ? filterTeacher
      : null

  // Week navigation
  const initialMonday = initialWeek ? getMonday(new Date(initialWeek)) : getMonday(new Date())
  const [weekStart, setWeekStart] = useState(initialMonday)

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  // Display order: Lun→Dim (index 0=Mon in weekDates)
  const displayOrder = [0, 1, 2, 3, 4, 5, 6] // Mon Tue Wed Thu Fri Sat Sun

  function prevWeek() { setWeekStart(addDays(weekStart, -7)) }
  function nextWeek() { setWeekStart(addDays(weekStart, 7)) }
  function goToday() { setWeekStart(getMonday(new Date())) }

  const filteredSlots = slots.filter(s =>
    role === "TEACHER" || (filterTeacher ? s.teacher.id === filterTeacher : false)
  )
  const selectedTeacher = sortedTeachers.find((t) => t.id === filterTeacher)
  const availabilityTeacher = role === "TEACHER"
    ? currentUser
    : selectedTeacher
  const availabilityDraft = useMemo(
    () => activeTeacherId ? buildAvailabilityDraft(slots, activeTeacherId) : createEmptyAvailabilityDraft(),
    [activeTeacherId, slots]
  )

  // For a given date, get slots that should appear (single, weekly, or monthly)
  function getOccurrences(date: Date) {
    return filteredSlots.filter(s => scheduleSlotOccursOn(s, date))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleAdd(data: any) {
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const slot = await res.json()
      slot.exceptions = []
      setSlots(prev => [...prev, slot])
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleSaveSlot(data: any, slotId?: string) {
    if (!slotId) {
      await handleAdd(data)
      return
    }

    const res = await fetch(`/api/schedule/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setSlots(prev => prev.map(s => s.id === slotId ? updated : s))
    }
  }

  async function handleMoveOccurrence(targetDate: Date, targetStartTime: string) {
    if (!draggedOccurrence) return

    const { slot, date: sourceDate } = draggedOccurrence
    const duration = getSlotDuration(slot)
    const targetStartMin = timeToMinutes(targetStartTime)
    const targetEndTime = minutesToTime(Math.min(targetStartMin + duration, 21 * 60))
    const targetDateKey = dateKey(targetDate)
    const sourceDateKey = dateKey(sourceDate)
    const targetDayOfWeek = targetDate.getDay()
    const meta = parseScheduleLabel(slot.label)

    setDraggedOccurrence(null)
    setDragPreview(null)

    if (
      targetDateKey === sourceDateKey &&
      targetStartTime === slot.startTime &&
      targetEndTime === slot.endTime
    ) return

    const moveSeries = meta.recurrence !== "NONE"
      ? confirm("Déplacer aussi les semaines suivantes ?\n\nOK = avec récurrence\nAnnuler = seulement cette séance")
      : true

    if (moveSeries) {
      const nextStartDate = meta.recurrence === "NONE"
        ? targetDateKey
        : minDateKey(meta.startDate ?? targetDateKey, targetDateKey)
      await handleSaveSlot({
        dayOfWeek: targetDayOfWeek,
        startTime: targetStartTime,
        endTime: targetEndTime,
        label: encodeScheduleLabel(meta.label ?? "", meta.recurrence, nextStartDate),
        color: slot.color,
        groupId: slot.group?.id ?? null,
        teacherId: slot.teacher.id,
      }, slot.id)
      return
    }

    await handleCancel(slot.id, sourceDate)
    await handleAdd({
      dayOfWeek: targetDayOfWeek,
      startTime: targetStartTime,
      endTime: targetEndTime,
      label: encodeScheduleLabel(meta.label ?? "", "NONE", targetDateKey),
      color: slot.color,
      groupId: slot.group?.id ?? null,
      teacherId: slot.teacher.id,
    })
  }

  function getDragTarget(date: Date, event: React.DragEvent<HTMLDivElement>) {
    if (!draggedOccurrence) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1)
    const duration = getSlotDuration(draggedOccurrence.slot)
    const minutes = snapMinutes(7 * 60 + ratio * (14 * 60))
    const latestStart = 21 * 60 - duration
    const startMin = Math.min(Math.max(minutes, 7 * 60), latestStart)
    const endMin = Math.min(startMin + duration, 21 * 60)
    return {
      dateKey: dateKey(date),
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(endMin),
      top: ((startMin - 7 * 60) / (14 * 60)) * 100,
      height: Math.max((duration / (14 * 60)) * 100, 2),
    }
  }

  async function handleCancel(slotId: string, date: Date) {
    const res = await fetch("/api/schedule/exceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, date: dateKey(date) }),
    })
    if (res.ok) {
      const exception = await res.json()
      setSlots(prev => prev.map(s => s.id === slotId
        ? { ...s, exceptions: [...s.exceptions, { id: exception.id, date: dateKey(date), reason: exception.reason }] }
        : s
      ))
    }
  }

  async function handleColorChange(slotId: string, color: string) {
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, color } : s))
    await fetch(`/api/schedule/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    })
  }

  async function handleDeleteSlot(slotId: string) {
    if (!confirm("Supprimer ce créneau et toutes ses occurrences ?")) return
    await fetch(`/api/schedule/${slotId}`, { method: "DELETE" })
    setSlots(prev => prev.filter(s => s.id !== slotId))
  }

  async function handleSaveTimezone(tz: string) {
    setSavingTz(true)
    setViewTz(tz)
    await fetch("/api/users/timezone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz }),
    })
    setSavingTz(false)
  }

  async function handleSaveAvailability(draft: AvailabilityDraft) {
    if (!activeTeacherId) return
    const ranges = AVAILABILITY_DAYS.flatMap((day) =>
      (draft[day.value] ?? [])
        .filter((range) => range.startTime && range.endTime && range.startTime < range.endTime)
        .map((range) => ({
          dayOfWeek: day.value,
          startTime: range.startTime,
          endTime: range.endTime,
        }))
    )

    const res = await fetch("/api/schedule/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: activeTeacherId, ranges }),
    })

    if (res.ok) {
      const updatedSlots = await res.json() as TimeSlot[]
      setSlots((prev) => [
        ...prev.filter((slot) => !(slot.teacher.id === activeTeacherId && isAvailabilitySlot(slot))),
        ...updatedSlots,
      ])
    }
  }

  // Week label
  const weekEnd = addDays(weekStart, 6)
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`
    : `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()].slice(0, 3)} – ${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()].slice(0, 3)} ${weekStart.getFullYear()}`

  const today = new Date()

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {role === "TEACHER" ? "Planning" : "Planning des professeurs"}
          </h1>
          <p className="text-sm text-gray-500">
            {role === "TEACHER"
              ? "Vue semaine — calendrier annuel"
              : selectedTeacher
                ? `Planning affiché pour ${selectedTeacher.name}`
                : "Choisissez un professeur pour afficher et modifier son planning"}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {activeTeacherId && availabilityTeacher && (
            <Button
              type="button"
              variant="outline"
              className="h-10 justify-center gap-2"
              onClick={() => setShowAvailabilityDialog(true)}
            >
              <Clock className="h-4 w-4 text-violet-600" />
              Mes horaires disponibles
            </Button>
          )}

          {role !== "TEACHER" && sortedTeachers.length > 0 && (
            <div className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 sm:w-auto">
              <span className="text-xs font-medium text-gray-500">Professeur</span>
              <Select value={filterTeacher} onValueChange={(value) => { setFilter(value); setAddingDate(null); setEditingSlot(null); setEditingDate(null) }}>
                <SelectTrigger className="h-8 flex-1 border-0 p-0 text-xs font-medium text-gray-700 shadow-none focus:ring-0 sm:w-56 sm:flex-none">
                  <SelectValue placeholder="Choisir un professeur" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {sortedTeachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Week navigation */}
          <div className="flex w-full items-center justify-between gap-1 rounded-lg border border-gray-200 bg-white px-1 py-1 sm:w-auto sm:justify-start">
            <button onClick={prevWeek} className="flex h-9 w-9 items-center justify-center rounded hover:bg-gray-100" aria-label="Semaine précédente"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={goToday} className="h-9 rounded px-3 text-xs font-medium hover:bg-gray-100">Aujourd&apos;hui</button>
            <button onClick={nextWeek} className="flex h-9 w-9 items-center justify-center rounded hover:bg-gray-100" aria-label="Semaine suivante"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <span className="text-sm font-medium text-gray-700 sm:min-w-48">{weekLabel}</span>

          {/* Timezone */}
          <div className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 sm:w-auto">
            <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
            <Select value={viewTz} onValueChange={handleSaveTimezone}>
              <SelectTrigger className="h-8 flex-1 border-0 p-0 text-xs font-medium text-gray-700 shadow-none focus:ring-0 sm:w-56 sm:flex-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {savingTz && <span className="text-xs text-gray-400">…</span>}
          </div>
        </div>
      </div>

      {/* Layout: sidebar + grid */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Teacher sidebar */}
        {role !== "TEACHER" && teachers.length > 0 && (
          <div className="shrink-0 lg:w-44">
            <p className="mb-2 px-1 text-xs font-medium text-gray-400">Choisir un professeur</p>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {sortedTeachers.map(t => {
              const count = slots.filter(s => s.teacher.id === t.id).length
              return (
                <button
                  key={t.id}
                  onClick={() => { setFilter(t.id); setAddingDate(null); setEditingSlot(null); setEditingDate(null) }}
                  className={`min-h-10 w-40 shrink-0 rounded-lg px-3 py-2 text-left text-sm transition-colors lg:w-full ${filterTeacher === t.id ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  <span className="block truncate">{t.name}</span>
                  <span className="text-xs text-gray-400">{count} créneaux</span>
                </button>
              )
            })}
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="min-w-[700px]">
            {/* Day headers with real dates */}
            <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
              <div className="relative border-r border-gray-100">
                <button
                  onClick={() => {
                    if (!activeTeacherId) return
                    setAddingDate(weekDates[0])
                    setEditingSlot(null)
                    setEditingDate(null)
                  }}
                  disabled={!activeTeacherId}
                  className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                  title={activeTeacherId ? `Ajouter un événement${selectedTeacher ? ` pour ${selectedTeacher.name}` : ""}` : "Choisir un professeur avant d'ajouter"}
                >
                  <Plus className="h-4 w-4" />
                </button>
                {addingDate && activeTeacherId && (
                  <SlotForm
                    date={addingDate}
                    placement="corner"
                    groups={groups}
                    teachers={teachers.length > 0 ? teachers : [{ id: currentUser.id, name: currentUser.name, timezone: currentUser.timezone }]}
                    role="TEACHER"
                    currentUserId={activeTeacherId}
                    onSave={handleSaveSlot}
                    onClose={() => setAddingDate(null)}
                  />
                )}
              </div>
              {displayOrder.map(i => {
                const d = weekDates[i]
                const isToday = isSameDay(d, today)
                return (
                  <div key={i} className={`border-r border-gray-100 last:border-0 px-2 py-2 text-center ${isToday ? "bg-emerald-50" : ""}`}>
                    <p className="text-xs font-semibold text-gray-700">{DAYS_SHORT[d.getDay()]}</p>
                    <p className={`text-lg font-bold ${isToday ? "text-emerald-600" : "text-gray-400"}`}>{d.getDate()}</p>
                  </div>
                )
              })}
            </div>

            {/* Time grid */}
            <div className="grid" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
              {/* Hour labels */}
              <div className="border-r border-gray-100">
                {HOURS.map(h => (
                  <div key={h} className="border-b border-gray-50 flex items-start justify-end pr-2 pt-0.5" style={{ height: "56px" }}>
                    <span className="text-[10px] text-gray-300">{h}h</span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {displayOrder.map(i => {
                const d = weekDates[i]
                const daySlots = getOccurrences(d)
                const isToday = isSameDay(d, today)
                return (
                  <div
                    key={i}
                    className={`border-r border-gray-100 last:border-0 relative ${isToday ? "bg-emerald-50/30" : ""}`}
                    style={{ height: `${HOURS.length * 56}px` }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      const target = getDragTarget(d, event)
                      if (target) setDragPreview(target)
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDragPreview(null)
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      const target = getDragTarget(d, event)
                      if (target) handleMoveOccurrence(d, target.startTime)
                    }}
                  >
                    {HOURS.map(h => (
                      <div key={h} className="border-b border-gray-50 absolute w-full" style={{ top: `${((h - 7) / 14) * 100}%`, height: "56px" }} />
                    ))}
                    {HOURS.map(h => (
                      <div key={`${h}h`} className="border-b border-dashed border-gray-50 absolute w-full opacity-50"
                        style={{ top: `${((h - 7 + 0.5) / 14) * 100}%` }} />
                    ))}

                    {draggedOccurrence && dragPreview?.dateKey === dateKey(d) && (
                      <div
                        className="pointer-events-none absolute left-1 right-1 z-20 rounded-lg border-2 border-emerald-500 bg-emerald-500/15 shadow-lg"
                        style={{
                          top: `${dragPreview.top}%`,
                          height: `${dragPreview.height}%`,
                          minHeight: "34px",
                        }}
                      >
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                          {dragPreview.startTime} – {dragPreview.endTime}
                        </div>
                      </div>
                    )}

                    {daySlots.map(slot => (
                      <OccurrenceBlock
                        key={slot.id}
                        slot={slot}
                        date={d}
                        viewTz={viewTz}
                        onEdit={(slotToEdit) => { setEditingSlot(slotToEdit); setEditingDate(d); setAddingDate(null) }}
                        onCancel={handleCancel}
                        onDeleteSlot={handleDeleteSlot}
                        onColorChange={handleColorChange}
                        onDragStart={(slotToMove, occurrenceDate) => {
                          setDraggedOccurrence({ slot: slotToMove, date: occurrenceDate })
                          setDragPreview(null)
                          setAddingDate(null)
                          setEditingSlot(null)
                          setEditingDate(null)
                        }}
                        onDragEnd={() => {
                          setDraggedOccurrence(null)
                          setDragPreview(null)
                        }}
                      />
                    ))}

                    {editingSlot && editingSlot.dayOfWeek === d.getDay() && (
                      <SlotForm
                        date={editingDate ?? d}
                        slot={editingSlot}
                        groups={groups}
                        teachers={teachers.length > 0 ? teachers : [{ id: currentUser.id, name: currentUser.name, timezone: currentUser.timezone }]}
                        role="TEACHER"
                        currentUserId={editingSlot.teacher.id}
                        onSave={handleSaveSlot}
                        onClose={() => { setEditingSlot(null); setEditingDate(null) }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Choisissez une récurrence lors de l&apos;ajout : une seule fois, chaque semaine ou chaque mois. Annuler un cours (×) ne supprime que l&apos;occurrence affichée.
      </p>

      {showAvailabilityDialog && activeTeacherId && availabilityTeacher && (
        <AvailabilityDialog
          key={activeTeacherId}
          teacherName={availabilityTeacher.name}
          initialDraft={availabilityDraft}
          onSave={handleSaveAvailability}
          onClose={() => setShowAvailabilityDialog(false)}
        />
      )}
    </div>
  )
}
