"use client"

import { useState } from "react"
import { Plus, X, Globe, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  return d.toISOString().slice(0, 10)
}

function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b)
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
}: {
  slot: TimeSlot
  date: Date
  viewTz: string
  onEdit: (slot: TimeSlot) => void
  onCancel: (slotId: string, date: Date) => void
  onDeleteSlot: (slotId: string) => void
  onColorChange: (slotId: string, color: string) => void
}) {
  const [showPalette, setShowPalette] = useState(false)

  const start = convertTime(slot.startTime, slot.teacher.timezone, viewTz)
  const end   = convertTime(slot.endTime,   slot.teacher.timezone, viewTz)
  const startMin = timeToMinutes(start)
  const endMin   = timeToMinutes(end)

  const top    = ((startMin - 7 * 60) / (14 * 60)) * 100
  const height = Math.max(((endMin - startMin) / (14 * 60)) * 100, 2)

  const isToday = isSameDay(date, new Date())

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-white text-xs overflow-hidden group ${isToday ? "ring-2 ring-yellow-300" : ""}`}
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
            {slot.label ?? slot.group?.name ?? slot.teacher.name}
          </p>
          <p className="opacity-80 text-[10px]">{start} – {end}</p>
        </div>
        <div className="mt-0.5 flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <button onClick={(e) => { e.stopPropagation(); setShowPalette(!showPalette) }} title="Couleur">
            <div className="h-3 w-3 rounded-full border border-white/60" style={{ backgroundColor: slot.color ?? "#10b981" }} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(slot) }} title="Modifier le créneau">
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(`Annuler ce cours du ${date.toLocaleDateString("fr-FR")} ?\nLes semaines suivantes ne seront pas affectées.`))
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
  const [eventDate, setEventDate] = useState(dateKey(date))
  const [startTime, setStart] = useState(slot?.startTime ?? "09:00")
  const [endTime,   setEnd]   = useState(slot?.endTime ?? "09:30")
  const [label,     setLabel] = useState(slot?.label ?? "")
  const [color,     setColor] = useState(slot?.color ?? COLORS[0])
  const [groupId,   setGroup] = useState(slot?.group?.id ?? "NONE")
  const [teacherId, setTeacher] = useState(defaultTeacherId)

  const availableGroups = groups.filter((g) => g.teacherId === teacherId)

  function submit() {
    if (!startTime || !endTime) return
    onSave({
      dayOfWeek: new Date(`${eventDate}T00:00:00`).getDay(),
      startTime,
      endTime,
      label,
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
      <Input placeholder="Libellé (ex: Coran débutants)" value={label} onChange={e => setLabel(e.target.value)} className="h-7 text-xs" />
      {role !== "TEACHER" && teachers.length > 0 && (
        <Select value={teacherId} onValueChange={(value) => { setTeacher(value); setGroup("NONE") }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Professeur" /></SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {availableGroups.length > 0 && (
        <Select value={groupId} onValueChange={setGroup}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Groupe (optionnel)" /></SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            <SelectItem value="NONE">Aucun groupe</SelectItem>
            {availableGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
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

// ─── Main ScheduleClient ──────────────────────────────────────────────────────

export function ScheduleClient({ slots: initialSlots, groups, teachers, currentUser, role, initialWeek }: Props) {
  const sortedTeachers = [...teachers].sort((a, b) => {
    const aIsSamia = a.name.toLowerCase().includes("samia") ? 0 : 1
    const bIsSamia = b.name.toLowerCase().includes("samia") ? 0 : 1
    if (aIsSamia !== bIsSamia) return aIsSamia - bIsSamia
    return a.name.localeCompare(b.name, "fr")
  })
  const [slots, setSlots] = useState<TimeSlot[]>(initialSlots)
  const [viewTz, setViewTz] = useState(currentUser.timezone)
  const [filterTeacher, setFilter] = useState(role === "TEACHER" ? currentUser.id : (sortedTeachers[0]?.id ?? ""))
  const [addingDate, setAddingDate] = useState<Date | null>(null)
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null)
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

  // For a given date, get slots that should appear (matching dayOfWeek, not cancelled)
  function getOccurrences(date: Date) {
    const dow = date.getDay()
    const dk = dateKey(date)
    return filteredSlots.filter(s => {
      if (s.dayOfWeek !== dow) return false
      const cancelled = s.exceptions.some(ex => ex.date.slice(0, 10) === dk)
      return !cancelled
    })
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
    if (!confirm("Supprimer ce créneau récurrent ? (toutes les semaines)")) return
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
          {role !== "TEACHER" && sortedTeachers.length > 0 && (
            <div className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 sm:w-auto">
              <span className="text-xs font-medium text-gray-500">Professeur</span>
              <Select value={filterTeacher} onValueChange={(value) => { setFilter(value); setAddingDate(null); setEditingSlot(null) }}>
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
                  onClick={() => { setFilter(t.id); setAddingDate(null); setEditingSlot(null) }}
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
                  >
                    {HOURS.map(h => (
                      <div key={h} className="border-b border-gray-50 absolute w-full" style={{ top: `${((h - 7) / 14) * 100}%`, height: "56px" }} />
                    ))}
                    {HOURS.map(h => (
                      <div key={`${h}h`} className="border-b border-dashed border-gray-50 absolute w-full opacity-50"
                        style={{ top: `${((h - 7 + 0.5) / 14) * 100}%` }} />
                    ))}

                    {daySlots.map(slot => (
                      <OccurrenceBlock
                        key={slot.id}
                        slot={slot}
                        date={d}
                        viewTz={viewTz}
                        onEdit={(slotToEdit) => { setEditingSlot(slotToEdit); setAddingDate(null) }}
                        onCancel={handleCancel}
                        onDeleteSlot={handleDeleteSlot}
                        onColorChange={handleColorChange}
                      />
                    ))}

                    {editingSlot && editingSlot.dayOfWeek === d.getDay() && (
                      <SlotForm
                        date={d}
                        slot={editingSlot}
                        groups={groups}
                        teachers={teachers.length > 0 ? teachers : [{ id: currentUser.id, name: currentUser.name, timezone: currentUser.timezone }]}
                        role="TEACHER"
                        currentUserId={editingSlot.teacher.id}
                        onSave={handleSaveSlot}
                        onClose={() => setEditingSlot(null)}
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
        Les créneaux se répètent chaque semaine. Annuler un cours (×) ne supprime que l&apos;occurrence de cette semaine.
      </p>
    </div>
  )
}
