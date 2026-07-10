"use client"

import { useState } from "react"
import type React from "react"
import {
  Users, BookOpen, UserCheck, ChevronDown, ChevronUp, Mail, Phone,
  MessageCircle, Plus, Check, Clock, X, CheckCircle2,
  Bell, Eye, Video, ExternalLink, Pencil, AlertTriangle, Archive, GraduationCap, Trash2, Search,
} from "lucide-react"
import { whatsappLink } from "@/lib/phone"
import { gmailComposeLink } from "@/lib/contact-links"
import { rateForSize } from "@/lib/group-rates"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lesson {
  id: string
  number: number
  date: string | null
  status: string
  content: string | null
  duration: number | null
  makeupMinutes: number | null
  makeupOnLessonId: string | null
  legacyPayrollBoundary: boolean
}

interface LessonSession {
  id: string
  number: number
  subject: string
  frequency: number | null
  duration: string | null
  isComplete: boolean
  paymentRequestedAt?: string | null
  notes: string | null
  student: { id: string; firstName: string; lastName: string }
  teacher: { id: string; name: string }
  lessons: Lesson[]
}

interface Student {
  id: string
  firstName: string
  lastName: string
  displayName: string | null
  subject: string | null
  phone: string | null
  parentPhone: string | null
  groupId: string | null
  lessonsPerWeek: number | null
  duration: string | null
  monthlyFee: number
  status: string
  group: { name: string; teacherId: string | null } | null
}

interface Group {
  id: string
  name: string
  level: string | null
  schedule: string | null
  maxStudents: number
  students: { id: string; firstName: string; lastName: string; status: string }[]
}

interface Teacher {
  id: string
  name: string
  email: string
  phone: string | null
  meetingLink: string | null
  individualRate: number | null
  binomeRate: number | null
  groupRate: number | null
  createdAt: string
  teacherGroups: Group[]
}

interface Slot {
  id: string
  day: number
  start: string
  end: string
  teacherId: string
  teacherTimezone: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
const DEFAULT_LESSON_COUNT = 8
const LAST_LESSON_NOT_VALIDATED_MESSAGE = "بارك الله فيك, la session n'est pas encore terminée : le dernier cours doit être validé présent ou absent avant d'envoyer la demande de paiement."
const SUBJECTS = ["Apprentissage du Coran", "Nouraniya", "Langue arabe", "Tajwid", "Fiqh", "Moutoun", "Autre"]

const STATUS_CYCLE: Record<string, string> = {
  PENDING: "PRESENT",
  PRESENT: "ABSENT",
  ABSENT: "PENDING",
}

const statusIcon = (s: string) => {
  if (s === "PRESENT") return <Check className="h-3.5 w-3.5 text-blue-600" />
  if (s === "ABSENT") return <X className="h-3.5 w-3.5 text-red-500" />
  return <Clock className="h-3.5 w-3.5 text-gray-300" />
}

const statusBg = (s: string) => {
  if (s === "PRESENT") return "bg-blue-50 border-blue-200"
  if (s === "ABSENT") return "bg-red-50 border-red-200"
  return "bg-gray-50 border-gray-200"
}

function formatMins(m: number): string {
  if (m >= 60 && m % 60 === 0) return `${m / 60}h`
  if (m >= 60) return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, "0")}`
  return `${m} min`
}

function initialFromName(name: string): string {
  return Array.from(name.trim()).find((char) => /[\p{L}\p{N}]/u.test(char))?.toUpperCase() ?? "?"
}

function applyLessonUpdate(sessions: LessonSession[], lessonId: string, data: Partial<Lesson>) {
  const targetSession = sessions.find((session) => session.lessons.some((lesson) => lesson.id === lessonId))
  return sessions.map((session) => {
    const sameFollowUp = Boolean(
      data.legacyPayrollBoundary &&
      targetSession &&
      session.student.id === targetSession.student.id
    )
    return {
      ...session,
      lessons: session.lessons.map((lesson) => {
        if (lesson.id === lessonId) return { ...lesson, ...data }
        if (sameFollowUp) return { ...lesson, legacyPayrollBoundary: false }
        return lesson
      }),
    }
  })
}

function studentHasLegacyBoundary(sessions: LessonSession[], studentId: string) {
  return sessions.some((session) =>
    session.student.id === studentId &&
    session.lessons.some((lesson) => lesson.legacyPayrollBoundary)
  )
}

function paymentKey(session: LessonSession): string {
  return `${session.student.id}:${session.number}`
}

function trackingKey(session: LessonSession): string {
  return `${session.student.id}:${session.teacher.id}:${session.subject}`
}

function latestSessionsOnly(sessions: LessonSession[]): LessonSession[] {
  const latestByTracking = new Map<string, LessonSession>()
  for (const session of sessions) {
    const key = trackingKey(session)
    const current = latestByTracking.get(key)
    if (!current || session.number > current.number) latestByTracking.set(key, session)
  }
  return Array.from(latestByTracking.values())
}

function latestSessionsWithoutPaymentDate(sessions: LessonSession[], paidBySession: Record<string, string>): LessonSession[] {
  return latestSessionsOnly(sessions).filter((session) => !paidBySession[paymentKey(session)])
}

function formatForfait(lessonsPerWeek: number | null, duration: string | null): string | null {
  if (!lessonsPerWeek) return null
  let dur = "?"
  if (duration) {
    if (/h|min/i.test(duration)) dur = duration
    else {
      const hours = parseFloat(duration.replace(",", "."))
      if (isFinite(hours) && hours > 0) {
        const mins = Math.round(hours * 60)
        dur = mins % 60 === 0 ? `${mins / 60}h` : `${mins} min`
      }
    }
  }
  return `${lessonsPerWeek} cours de ${dur} par semaine`
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":")
  if (!hours || !minutes) return time
  return minutes === "00" ? `${Number(hours)}h` : `${Number(hours)}h${minutes}`
}

function getUTCOffset(tz: string): number {
  try {
    const now = new Date()
    const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" })
    const tzStr = now.toLocaleString("en-US", { timeZone: tz })
    return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
  } catch { return 0 }
}

function convertTime(time: string, fromTz: string, toTz: string): string {
  const [h, m] = time.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time
  const diff = getUTCOffset(toTz) - getUTCOffset(fromTz || toTz)
  const total = h * 60 + m + diff
  const normalized = ((total % 1440) + 1440) % 1440
  return `${Math.floor(normalized / 60).toString().padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`
}

function scheduleLabel(slot: Slot): string {
  const start = convertTime(slot.start, slot.teacherTimezone, "Europe/Paris")
  const end = convertTime(slot.end, slot.teacherTimezone, "Europe/Paris")
  return `${DAYS_SHORT[slot.day]} ${formatTime(start)}-${formatTime(end)}`
}

function normalizeMeetingLink(value: string): string {
  const clean = value.trim()
  if (!clean) return ""
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`
}

function MeetingLinkControl({
  teacherId,
  link,
  onSaved,
}: {
  teacherId: string
  link: string | null
  onSaved: (link: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(link ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    const nextLink = normalizeMeetingLink(value)
    setSaving(true)
    const res = await fetch("/api/teachers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, meetingLink: nextLink }),
    })
    setSaving(false)
    if (!res.ok) return
    onSaved(nextLink || null)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="flex max-w-full flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Video className="h-3 w-3 text-amber-600" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Enter") save()
            if (e.key === "Escape") {
              setValue(link ?? "")
              setEditing(false)
            }
          }}
          placeholder="Lien Zoom ou Google Meet"
          className="h-7 w-56 text-xs"
          autoFocus
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          title="Enregistrer le lien visio"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(link ?? "")
            setEditing(false)
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          title="Annuler"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    )
  }

  if (link) {
    return (
      <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
        >
          <Video className="h-3 w-3" />
          Lien visio
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-0.5 text-gray-300 hover:bg-gray-50 hover:text-amber-700"
          title="Modifier lien Zoom / Google Meet"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
      title="Ajouter lien Zoom / Google Meet"
    >
      <Video className="h-3 w-3" />
      Ajouter lien visio
    </button>
  )
}

// ─── LessonRow ────────────────────────────────────────────────────────────────

function LessonRow({
  lesson, sessionDuration, siblingLessons, canSetLegacyBoundary, studentHasLegacyBoundary, onUpdate, onDelete,
}: {
  lesson: Lesson
  sessionDuration: string | null
  siblingLessons: Lesson[]
  canSetLegacyBoundary: boolean
  studentHasLegacyBoundary: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (id: string, data: any) => void
  onDelete: (id: string) => void
}) {
  // Durée attendue selon le forfait de l'élève (en minutes).
  const expectedMin = (() => {
    if (!sessionDuration) return null
    if (/min/i.test(sessionDuration)) return parseInt(sessionDuration)
    const h = parseFloat(sessionDuration.replace(",", "."))
    return isFinite(h) ? Math.round(h * 60) : null
  })()

  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(lesson.content ?? "")
  const [date, setDate] = useState(lesson.date ? new Date(lesson.date).toISOString().slice(0, 10) : "")
  // Pré-rempli avec la durée du forfait (jamais 0/vide), modifiable.
  const [durationMin, setDurationMin] = useState(
    lesson.duration != null ? String(lesson.duration) : (expectedMin != null ? String(expectedMin) : "")
  )
  const [makeupOn, setMakeupOn] = useState(lesson.makeupOnLessonId ?? "")

  const actualMin = lesson.duration ?? expectedMin
  const diff = expectedMin != null && actualMin != null ? expectedMin - actualMin : 0
  const isShort = diff > 0

  function cycleStatus() {
    const next = STATUS_CYCLE[lesson.status] ?? "PENDING"
    onUpdate(lesson.id, { status: next })
  }

  function saveContent() {
    const dur = durationMin ? parseInt(durationMin) : null
    const makeup = dur != null && expectedMin != null && expectedMin > dur ? expectedMin - dur : null
    onUpdate(lesson.id, {
      content,
      date: date || undefined,
      duration: dur,
      makeupMinutes: makeup,
      makeupOnLessonId: makeup && makeupOn ? makeupOn : null,
    })
    setEditing(false)
  }

  const futureLessons = siblingLessons.filter(l => l.number > lesson.number)
  const showLegacyBoundaryControl = canSetLegacyBoundary && (!studentHasLegacyBoundary || lesson.legacyPayrollBoundary)

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${statusBg(lesson.status)}`}>
      <button
        onClick={cycleStatus}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm hover:shadow transition-shadow"
        title="Changer le statut"
      >
        {statusIcon(lesson.status)}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500">Cours {lesson.number}</span>
          {date && (
            <span className="text-xs text-gray-400">
              {new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
            </span>
          )}
          {actualMin != null && (
            <span className={`text-xs ${isShort ? "text-amber-600 font-medium" : "text-gray-400"}`}>
              {formatMins(actualMin)}{isShort && ` (−${diff} min)`}
            </span>
          )}
          {lesson.status === "PRESENT" && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">Présente</span>}
          {lesson.status === "ABSENT" && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">Absente</span>}
          {lesson.legacyPayrollBoundary && <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">Ancien système</span>}
          <button
            onClick={() => { if (confirm(`Supprimer le Cours ${lesson.number} ?`)) onDelete(lesson.id) }}
            className="ml-auto text-gray-300 hover:text-red-500"
            title="Supprimer ce cours"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {showLegacyBoundaryControl && (
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
            <input
              type="checkbox"
              checked={lesson.legacyPayrollBoundary}
              onChange={(e) => onUpdate(lesson.id, { legacyPayrollBoundary: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
            />
            Dernier cours comptabilisé sur l&apos;ancien système
          </label>
        )}
        {lesson.makeupMinutes != null && lesson.makeupMinutes > 0 && !editing && (
          <div className="mt-1 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-700">
            {formatMins(lesson.makeupMinutes)} à rattraper
            {lesson.makeupOnLessonId && (() => {
              const target = siblingLessons.find(l => l.id === lesson.makeupOnLessonId)
              return target ? ` → Cours ${target.number}` : ""
            })()}
          </div>
        )}
        {editing ? (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 text-xs flex-1" />
              <div className="flex items-center gap-1">
                <Input type="number" min="5" step="5" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className="h-7 text-xs w-20" placeholder={expectedMin ? String(expectedMin) : "min"} />
                <span className="text-xs text-gray-400">min</span>
              </div>
            </div>
            <Input placeholder="Contenu du cours…" value={content} onChange={(e) => setContent(e.target.value)} className="h-7 text-xs" onKeyDown={(e) => e.key === "Enter" && saveContent()} autoFocus />
            {durationMin && expectedMin && parseInt(durationMin) < expectedMin && (
              <div className="rounded bg-amber-50 border border-amber-200 px-2 py-2 space-y-1">
                <p className="text-xs text-amber-700 font-medium">{expectedMin - parseInt(durationMin)} min à rattraper</p>
                {futureLessons.length > 0 && (
                  <select value={makeupOn} onChange={(e) => setMakeupOn(e.target.value)} className="h-6 rounded border border-amber-300 bg-white px-2 text-xs text-amber-800 w-full">
                    <option value="">Rattrapage non planifié</option>
                    {futureLessons.map(l => <option key={l.id} value={l.id}>Rattraper au Cours {l.number}</option>)}
                  </select>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="h-6 text-xs px-2" onClick={saveContent}>Enregistrer</Button>
              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setEditing(false)}>Annuler</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="mt-0.5 block w-full text-left text-xs text-gray-600 hover:text-gray-900">
            {lesson.content ? <span className="italic">{lesson.content}</span> : <span className="text-gray-300">Cliquer pour ajouter le contenu…</span>}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── SessionCard ──────────────────────────────────────────────────────────────

// Champ « date de paiement » : marquage initial ou modification d'une date déjà enregistrée
// (directeur/secrétaire). Remonté (via `key`) quand `paidAt` change pour repartir à jour.
function PaymentDateEditor({
  paidAt, onSave,
}: {
  paidAt?: string | null
  onSave: (paidDate: string) => Promise<boolean>
}) {
  const [date, setDate] = useState(() => paidAt ? new Date(paidAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const ok = await onSave(date)
    setSaving(false)
    if (!ok) setError("La date n'a pas pu être enregistrée.")
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {paidAt ? "Modifier la date du paiement" : "Marquer la date du paiement"}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 bg-white text-xs sm:w-40" />
        <Button size="sm" className="h-8 bg-blue-600 px-3 text-xs text-white hover:bg-blue-700" disabled={saving || !date} onClick={save}>
          {saving ? "Enregistrement..." : (paidAt ? "Mettre à jour" : "OK")}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 sm:basis-full">{error}</p>}
    </div>
  )
}

function PaidDateBadgeEditor({
  paidAt, onSave,
}: {
  paidAt: string
  onSave: (paidDate: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(() => new Date(paidAt).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function stopHeaderToggle(e: React.MouseEvent) {
    e.stopPropagation()
  }

  async function save() {
    setSaving(true)
    setError(null)
    const ok = await onSave(date)
    setSaving(false)
    if (ok) setEditing(false)
    else setError("Date non enregistrée.")
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={stopHeaderToggle}>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 w-36 bg-white text-xs"
          autoFocus
        />
        <Button
          size="sm"
          className="h-7 bg-blue-600 px-2 text-xs text-white hover:bg-blue-700"
          disabled={saving || !date}
          onClick={save}
        >
          {saving ? "..." : "OK"}
        </Button>
        <button
          type="button"
          onClick={() => { setDate(new Date(paidAt).toISOString().slice(0, 10)); setError(null); setEditing(false) }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Annuler"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
      <CheckCircle2 className="h-3 w-3" />
      Payé le {new Date(paidAt).toLocaleDateString("fr-FR")}
      <button
        type="button"
        onClick={(e) => {
          stopHeaderToggle(e)
          setDate(new Date(paidAt).toISOString().slice(0, 10))
          setError(null)
          setEditing(true)
        }}
        className="-mr-0.5 ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-blue-500 hover:bg-blue-200 hover:text-blue-700"
        title="Modifier la date de paiement"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  )
}

// Renumérotation d'une session (directeur/secrétaire) : les paiements déjà enregistrés
// pour cette session suivent le nouveau numéro, et les prochaines sessions créées
// reprendront l'auto-incrément à partir de lui.
function SessionNumberEditor({
  currentNumber, onSave,
}: {
  currentNumber: number
  onSave: (newNumber: number) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(currentNumber))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setValue(String(currentNumber)); setError(null); setEditing(true) }}
        className="text-gray-300 hover:text-blue-600"
        title="Modifier le numéro de cette session"
      >
        <Pencil className="h-3 w-3" />
      </button>
    )
  }

  async function save() {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("Numéro invalide.")
      return
    }
    if (parsed === currentNumber) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    const err = await onSave(parsed)
    setSaving(false)
    if (err) setError(err)
    // succès : la page est rechargée par l'appelant, pas besoin de fermer l'éditeur ici
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      <Input type="number" min="1" step="1" value={value} onChange={(e) => setValue(e.target.value)} className="h-7 w-16 bg-white text-xs" />
      <Button size="sm" className="h-7 px-2 text-xs" disabled={saving} onClick={save}>{saving ? "…" : "OK"}</Button>
      <button type="button" onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600" title="Annuler">
        <X className="h-3.5 w-3.5" />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

function SessionCard({
  session, paidAt, hasUndatedPayment, nextPaidAt, nextHasPaymentRequest, canSetLegacyBoundary, canMarkPaymentDate,
  studentHasLegacyBoundary, onUpdateLesson, onAddLesson, onCloseSession, onDeleteLesson, onMarkPaymentDate, onRenumberSession,
}: {
  session: LessonSession
  paidAt?: string | null
  hasUndatedPayment?: boolean
  nextPaidAt?: string | null
  nextHasPaymentRequest?: boolean
  canSetLegacyBoundary: boolean
  canMarkPaymentDate: boolean
  studentHasLegacyBoundary: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onDeleteLesson: (lessonId: string) => void
  onMarkPaymentDate: (session: LessonSession, paidDate: string) => Promise<boolean>
  onRenumberSession: (sessionId: string, newNumber: number) => Promise<string | null>
}) {
  const [notes, setNotes] = useState(session.notes ?? "")
  const [editingNotes, setEditingNotes] = useState(false)
  const [deletingSession, setDeletingSession] = useState(false)
  const [resettingPayment, setResettingPayment] = useState(false)

  const done = session.lessons.filter((l) => l.status !== "PENDING").length
  const total = session.lessons.length
  const present = session.lessons.filter((l) => l.status === "PRESENT").length
  const totalMakeup = session.lessons.reduce((sum, l) => sum + (l.makeupMinutes ?? 0), 0)
  const nextSessionNumber = session.number + 1
  const canRequestNextPayment = !nextPaidAt && !nextHasPaymentRequest
  const canEnterMissingPaymentDate = canMarkPaymentDate && !paidAt
  // Le dernier cours de la session doit être validé (présent/absent) pour terminer.
  const lastLessonValidated = session.lessons.length > 0 &&
    session.lessons.reduce((a, b) => (b.number > a.number ? b : a)).status !== "PENDING"
  const canSendNextPaymentRequest = session.isComplete || lastLessonValidated

  function requestNextPayment() {
    if (!canSendNextPaymentRequest) {
      alert(LAST_LESSON_NOT_VALIDATED_MESSAGE)
      return
    }
    onCloseSession(session.id)
  }

  async function handleDeleteSession() {
    const hasTaughtLessons = session.lessons.some((l) => l.status !== "PENDING")
    const payrollWarning = hasTaughtLessons
      ? "\n\n⚠️ Des cours de cette session sont déjà marqués présent/absent : ils seront perdus, y compris pour le calcul de la paie du professeur s'ils n'ont pas encore été comptabilisés."
      : ""
    if (!confirm(`Supprimer définitivement la Session ${session.number} et tous ses cours ? Les paiements liés sont conservés mais dissociés.${payrollWarning}\n\nAction irréversible.`)) return
    setDeletingSession(true)
    const res = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" })
    if (res.ok) window.location.reload()
    else {
      const data = await res.json().catch(() => ({}))
      alert(data.error || `Suppression impossible (erreur ${res.status}). Réessayez ou contactez le support.`)
      setDeletingSession(false)
    }
  }

  async function handleResetPaymentClick() {
    if (!confirm(`Réinitialiser le paiement de la Session ${session.number} ?\nLa session repassera « non payée ». Le(s) paiement(s) concerné(s) passeront en « Rejeté » (trace conservée, supprimables dans l'onglet Paiements).`)) return
    setResettingPayment(true)
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPayment: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Réinitialisation impossible.")
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Réinitialisation impossible.")
      setResettingPayment(false)
    }
  }

  return (
    <div className={`rounded-xl border ${session.isComplete ? "border-gray-200 bg-gray-50 opacity-70" : "border-blue-200 bg-white shadow-sm"}`}>
      <div className="flex w-full items-center gap-3 p-4 text-left">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${session.isComplete ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-700"}`}>
          {session.number}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">Session {session.number}</span>
            {session.isComplete && <span className="flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600"><CheckCircle2 className="h-3 w-3" /> Terminée</span>}
            {paidAt && canMarkPaymentDate && (
              <PaidDateBadgeEditor key={paidAt} paidAt={paidAt} onSave={(date) => onMarkPaymentDate(session, date)} />
            )}
            {paidAt && !canMarkPaymentDate && <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"><CheckCircle2 className="h-3 w-3" /> Payé le {new Date(paidAt).toLocaleDateString("fr-FR")}</span>}
            {paidAt && canSetLegacyBoundary && (
              <button
                type="button"
                onClick={handleResetPaymentClick}
                disabled={resettingPayment}
                className="text-xs font-medium text-red-500 underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-50"
                title="Erreur d'attribution : repasser cette session en « non payée » (le paiement passe en Rejeté, supprimable ensuite dans Paiements)"
              >
                {resettingPayment ? "Réinitialisation…" : "Réinitialiser le paiement"}
              </button>
            )}
            {!paidAt && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                {hasUndatedPayment ? "Paiement à dater" : "Paiement non renseigné"}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex gap-3 text-xs text-gray-400">
            {session.duration && <span>{session.duration}</span>}
            {session.frequency && <span>{session.frequency}x/semaine</span>}
            <span>{done}/{total} cours · {present} présence{present > 1 ? "s" : ""}</span>
            {totalMakeup > 0 && <span className="text-amber-600 font-medium">{formatMins(totalMakeup)} à rattraper</span>}
          </div>
        </div>
        <div className="hidden w-24 sm:block">
          <div className="h-1.5 rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full bg-blue-400 transition-all" style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }} />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 p-4 space-y-3">
        {session.lessons.map((lesson) => (
          <LessonRow
            key={`${lesson.id}:${lesson.date ?? ""}:${lesson.content ?? ""}:${lesson.duration ?? ""}:${lesson.makeupOnLessonId ?? ""}`}
            lesson={lesson}
            sessionDuration={session.duration}
            siblingLessons={session.lessons}
            canSetLegacyBoundary={canSetLegacyBoundary}
            studentHasLegacyBoundary={studentHasLegacyBoundary}
            onUpdate={onUpdateLesson}
            onDelete={onDeleteLesson}
          />
        ))}
        {!session.isComplete && (
          <Button variant="outline" size="sm" className="w-full border-dashed text-xs" onClick={() => onAddLesson(session.id)}>
            <Plus className="h-3 w-3" /> Ajouter un cours
          </Button>
        )}
        <div className="pt-1">
          {editingNotes ? (
            <div className="space-y-2">
              <Input placeholder="Appréciation de session / Notes…" value={notes} onChange={(e) => setNotes(e.target.value)} className="text-xs" autoFocus />
              <div className="flex gap-2">
                <Button size="sm" className="h-6 text-xs px-2" onClick={() => {
                  fetch(`/api/sessions/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) })
                  setEditingNotes(false)
                }}>Enregistrer</Button>
                <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setEditingNotes(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingNotes(true)} className="text-xs text-gray-400 hover:text-gray-600 italic text-left w-full">
              {notes || "Ajouter une appréciation de session…"}
            </button>
          )}
        </div>
        {canSetLegacyBoundary && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>N° de session :</span>
              <SessionNumberEditor
                currentNumber={session.number}
                onSave={async (n) => {
                  const err = await onRenumberSession(session.id, n)
                  if (!err) window.location.reload()
                  return err
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleDeleteSession}
              disabled={deletingSession}
              className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
              title="Supprimer cette session (directeur/secrétaire)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deletingSession ? "Suppression…" : "Supprimer la session"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-gray-100 p-4">
        {canEnterMissingPaymentDate && (
          <PaymentDateEditor key={paidAt ?? "unpaid"} paidAt={paidAt} onSave={(date) => onMarkPaymentDate(session, date)} />
        )}
        {nextPaidAt ? (
          <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-blue-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Session {nextSessionNumber} déjà payée
            </div>
          </div>
        ) : nextHasPaymentRequest ? (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <Bell className="h-3.5 w-3.5" />
              Demande de paiement déjà envoyée pour la Session {nextSessionNumber}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <Bell className="h-3.5 w-3.5" />
              {`Envoyer la demande de paiement de la Session ${nextSessionNumber} à l'élève`}
            </div>
            <Button
              size="sm"
              className={`h-7 px-3 text-xs text-white ${canSendNextPaymentRequest ? "bg-amber-500 hover:bg-amber-600" : "cursor-not-allowed bg-amber-300"}`}
              aria-disabled={!canSendNextPaymentRequest}
              onClick={requestNextPayment}
              title={!canSendNextPaymentRequest ? LAST_LESSON_NOT_VALIDATED_MESSAGE : `Envoie la demande de paiement pour la Session ${nextSessionNumber}`}
            >
              Envoyer la demande
            </Button>
          </div>
        )}
        {canRequestNextPayment && !canSendNextPaymentRequest && (
          <p className="text-[11px] text-gray-400">Validez le dernier cours de la session (présent/absent) pour activer l&apos;envoi.</p>
        )}
      </div>
    </div>
  )
}

// ─── Classe fusionnée (binôme / groupe) ───────────────────────────────────────
// Les élèves d'une même classe partagent UN seul tableau de sessions : présence
// par élève (contenu/date communs) et paiement affiché/marqué par élève.

function shortName(student: Student) {
  return (student.displayName || student.firstName || student.lastName || "?").trim()
}

// Ligne « Cours N » fusionnée : contenu partagé + un rond de présence par élève.
function MergedLessonRow({
  lessonNumber, cells, sessionDuration, canSetLegacyBoundary, studentsWithLegacyBoundary, onToggleStatus, onEnsureStatus, onSaveShared, onToggleLegacy, onDelete,
}: {
  lessonNumber: number
  cells: { student: Student; lesson: Lesson | undefined }[]
  sessionDuration: string | null
  canSetLegacyBoundary: boolean
  studentsWithLegacyBoundary: Set<string>
  onToggleStatus: (lessonId: string, current: string) => void
  onEnsureStatus: (studentId: string) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSaveShared: (data: any) => void
  onToggleLegacy: (checked: boolean, lessonIds: string[]) => void
  onDelete: () => void
}) {
  const expectedMin = (() => {
    if (!sessionDuration) return null
    if (/min/i.test(sessionDuration)) return parseInt(sessionDuration)
    const h = parseFloat(sessionDuration.replace(",", "."))
    return isFinite(h) ? Math.round(h * 60) : null
  })()

  const ref = cells.find((c) => c.lesson)?.lesson
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(ref?.content ?? "")
  const [date, setDate] = useState(ref?.date ? new Date(ref.date).toISOString().slice(0, 10) : "")
  const [durationMin, setDurationMin] = useState(
    ref?.duration != null ? String(ref.duration) : (expectedMin != null ? String(expectedMin) : "")
  )

  const actualMin = ref?.duration ?? expectedMin
  const diff = expectedMin != null && actualMin != null ? expectedMin - actualMin : 0
  const isShort = diff > 0
  const anyLegacy = cells.some((c) => c.lesson?.legacyPayrollBoundary)
  const legacyToggleLessons = cells
    .filter((c) => c.lesson && (!studentsWithLegacyBoundary.has(c.student.id) || c.lesson.legacyPayrollBoundary))
    .map((c) => c.lesson!.id)
  const showLegacyBoundaryControl = canSetLegacyBoundary && legacyToggleLessons.length > 0

  function saveShared() {
    const dur = durationMin ? parseInt(durationMin) : null
    const makeup = dur != null && expectedMin != null && expectedMin > dur ? expectedMin - dur : null
    onSaveShared({ content, date: date || undefined, duration: dur, makeupMinutes: makeup })
    setEditing(false)
  }

  return (
    <div className={`rounded-lg border p-3 ${ref ? statusBg(ref.status) : "bg-gray-50 border-gray-200"}`}>
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 gap-2">
          {cells.map(({ student, lesson }) => (
            <div key={student.id} className="flex flex-col items-center gap-1">
              <button
                onClick={() => lesson ? onToggleStatus(lesson.id, lesson.status) : onEnsureStatus(student.id)}
                className="flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-sm transition-shadow hover:shadow sm:h-7 sm:w-7"
                title={lesson ? `${shortName(student)} — changer le statut` : `${shortName(student)} — ajouter ce cours et marquer présent`}
              >
                {lesson ? statusIcon(lesson.status) : <Plus className="h-3.5 w-3.5 text-gray-300" />}
              </button>
              <span className="max-w-[3.5rem] truncate text-[10px] text-gray-500" title={shortName(student)}>
                {shortName(student)}
              </span>
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500">Cours {lessonNumber}</span>
            {date && (
              <span className="text-xs text-gray-400">
                {new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
              </span>
            )}
            {actualMin != null && (
              <span className={`text-xs ${isShort ? "text-amber-600 font-medium" : "text-gray-400"}`}>
                {formatMins(actualMin)}{isShort && ` (−${diff} min)`}
              </span>
            )}
            {anyLegacy && (
              <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">Ancien système</span>
            )}
            <button
              onClick={() => { if (confirm(`Supprimer le Cours ${lessonNumber} pour toute la classe ?`)) onDelete() }}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 sm:h-6 sm:w-6"
              title="Supprimer ce cours"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {showLegacyBoundaryControl && (
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
              <input
                type="checkbox"
                checked={anyLegacy}
                onChange={(e) => onToggleLegacy(e.target.checked, legacyToggleLessons)}
                className="h-3.5 w-3.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
              />
              Dernier cours comptabilisé sur l&apos;ancien système
            </label>
          )}

          {editing ? (
            <div className="mt-2 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 flex-1 text-xs sm:h-7" />
                <div className="flex items-center gap-1 sm:w-auto">
                  <Input type="number" min="5" step="5" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className="h-9 w-full text-xs sm:h-7 sm:w-20" placeholder={expectedMin ? String(expectedMin) : "min"} />
                  <span className="text-xs text-gray-400">min</span>
                </div>
              </div>
              <Input placeholder="Contenu du cours (commun à la classe)…" value={content} onChange={(e) => setContent(e.target.value)} className="h-9 text-xs sm:h-7" onKeyDown={(e) => e.key === "Enter" && saveShared()} autoFocus />
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button size="sm" className="h-8 text-xs sm:h-6 sm:px-2" onClick={saveShared}>Enregistrer</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs sm:h-6 sm:px-2" onClick={() => setEditing(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="mt-1 block min-h-8 w-full rounded-md text-left text-xs text-gray-600 hover:text-gray-900">
              {content ? <span className="italic">{content}</span> : <span className="text-gray-300">Cliquer pour ajouter le contenu…</span>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Ligne de paiement d'un élève : statut + marquage/modification de la date (directeur/secrétaire).
function StudentPaymentRow({
  student, session, paidAt, hasUndated, canMarkPaymentDate, onMarkPaymentDate,
}: {
  student: Student
  session: LessonSession | undefined
  paidAt: string | undefined
  hasUndated: boolean
  canMarkPaymentDate: boolean
  onMarkPaymentDate: (session: LessonSession, paidDate: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(() => paidAt ? new Date(paidAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const hasSeparatePayment = student.monthlyFee > 0

  const showEditor = canMarkPaymentDate && session && (editing || !paidAt)

  async function save() {
    if (!session) return
    setSaving(true)
    const ok = await onMarkPaymentDate(session, date)
    setSaving(false)
    if (ok) setEditing(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-gray-700">{shortName(student)}</span>
      {!hasSeparatePayment ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
          Paiement familial
        </span>
      ) : paidAt ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            <CheckCircle2 className="h-3 w-3" /> Payé le {new Date(paidAt).toLocaleDateString("fr-FR")}
          </span>
          {canMarkPaymentDate && session && (
            <button
              onClick={() => { setDate(new Date(paidAt).toISOString().slice(0, 10)); setEditing((v) => !v) }}
              className="text-gray-300 hover:text-blue-600"
              title="Modifier la date de paiement"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </>
      ) : session ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3 w-3" /> {hasUndated ? "Paiement à dater" : "Paiement non renseigné"}
        </span>
      ) : (
        <span className="text-xs text-gray-300 italic">Pas de session</span>
      )}
      {showEditor && (
        <span className="ml-auto flex items-center gap-1">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 w-36 bg-white text-xs" />
          <Button
            size="sm"
            className="h-7 bg-blue-600 px-2 text-xs text-white hover:bg-blue-700"
            disabled={saving || !date}
            onClick={save}
            title="Enregistrer la date de paiement de cet élève"
          >
            {saving ? "…" : (paidAt ? "OK" : "Payé")}
          </Button>
        </span>
      )}
    </div>
  )
}

// Tableau de sessions fusionné pour une classe (binôme/groupe).
function MergedGroupCahier({
  students, sessions, paidBySession, undatedPaymentBySession, canSetLegacyBoundary, canMarkPaymentDate,
  onUpdateLesson, onAddLesson, onCloseSession, onNewSession, onDeleteLesson, onMarkPaymentDate, onEnsureLesson, onRenumberSession,
}: {
  students: Student[]
  sessions: LessonSession[]
  paidBySession: Record<string, string>
  undatedPaymentBySession: Record<string, boolean>
  canSetLegacyBoundary: boolean
  canMarkPaymentDate: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onNewSession: (studentId: string, subject: string, teacherId: string, lessonCount: number, frequency: number | null, duration: string | null) => Promise<string | null>
  onDeleteLesson: (lessonId: string) => void
  onMarkPaymentDate: (session: LessonSession, paidDate: string) => Promise<boolean>
  onEnsureLesson: (studentId: string, subject: string, teacherId: string, sessionNumber: number, lessonNumber: number, frequency: number | null, duration: string | null, lessonCount: number) => Promise<string | null>
  onRenumberSession: (sessionId: string, newNumber: number) => Promise<string | null>
}) {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)

  const sessionsByStudent = new Map<string, LessonSession[]>()
  for (const st of students) sessionsByStudent.set(st.id, sessions.filter((s) => s.student.id === st.id))
  const allSessions = students.flatMap((st) => sessionsByStudent.get(st.id) ?? [])
  const numbers = Array.from(new Set(allSessions.map((s) => s.number))).sort((a, b) => b - a)
  const incompleteNums = allSessions.filter((s) => !s.isComplete).map((s) => s.number)
  const defaultNumber = incompleteNums.length > 0 ? Math.min(...incompleteNums) : numbers[0]
  const selNum = selectedNumber != null && numbers.includes(selectedNumber) ? selectedNumber : defaultNumber

  const sessionByStudent = new Map<string, LessonSession>()
  for (const st of students) {
    const s = (sessionsByStudent.get(st.id) ?? []).find((x) => x.number === selNum)
    if (s) sessionByStudent.set(st.id, s)
  }
  const sessList = students.map((st) => sessionByStudent.get(st.id)).filter(Boolean) as LessonSession[]
  const template = sessList[0]
  const sessionDuration = allSessions.find((s) => s.number === selNum)?.duration ?? null
  const subjectLabel = allSessions.find((s) => s.number === selNum)?.subject ?? null
  const allComplete = sessList.length > 0 && sessList.every((s) => s.isComplete)
  const lessonNumbers = Array.from(new Set(sessList.flatMap((s) => s.lessons.map((l) => l.number)))).sort((a, b) => a - b)
  const studentsWithLegacyBoundary = new Set(
    allSessions
      .filter((session) => session.lessons.some((lesson) => lesson.legacyPayrollBoundary))
      .map((session) => session.student.id)
  )

  async function ensureAndPresent(studentId: string, lessonNumber: number) {
    if (!template) return
    const lessonId = await onEnsureLesson(
      studentId, template.subject, template.teacher.id, selNum, lessonNumber,
      template.frequency, template.duration, Math.max(lessonNumbers.length, lessonNumber),
    )
    if (lessonId) onUpdateLesson(lessonId, { status: "PRESENT" })
  }

  // Demande de paiement pour toute la classe : quand la Session N se termine,
  // on demande la Session N+1 aux élèves qui n'ont pas encore une demande ouverte.
  const nextSessionNumber = selNum + 1
  const billableStudentIds = new Set(students.filter((student) => student.monthlyFee > 0).map((student) => student.id))
  const sessionsNeedingNextPaymentRequest = sessList.filter((s) => (
    billableStudentIds.has(s.student.id) &&
    !paidBySession[`${s.student.id}:${nextSessionNumber}`] &&
    !undatedPaymentBySession[`${s.student.id}:${nextSessionNumber}`]
  ))
  const anyIncomplete = sessList.some((s) => !s.isComplete)
  // Le dernier cours de la session doit être validé (présent/absent) pour tous les élèves.
  const lastLessonValidated = sessList.length > 0 && sessList.every((s) => {
    if (s.lessons.length === 0) return false
    const last = s.lessons.reduce((a, b) => (b.number > a.number ? b : a))
    return last.status !== "PENDING"
  })
  const canSendNextPaymentRequestForClass = !anyIncomplete || lastLessonValidated
  function requestPaymentForClass() {
    if (sessionsNeedingNextPaymentRequest.length === 0) return
    if (!canSendNextPaymentRequestForClass) {
      alert(LAST_LESSON_NOT_VALIDATED_MESSAGE)
      return
    }
    const billedNames = students.filter((student) => billableStudentIds.has(student.id)).map(shortName)
    if (!confirm(`${anyIncomplete ? `Terminer la Session ${selNum} et demander` : "Demander"} le paiement de la Session ${nextSessionNumber} pour la classe (${billedNames.join(", ")}) ?`)) return
    sessionsNeedingNextPaymentRequest.forEach((s) => onCloseSession(s.id))
  }

  // Renuméroter la session pour TOUS les élèves de la classe (garde le tableau unifié).
  async function renumberClassSession(newNumber: number): Promise<string | null> {
    for (const s of sessList) {
      const err = await onRenumberSession(s.id, newNumber)
      if (err) return err
    }
    window.location.reload()
    return null
  }

  const [deletingSession, setDeletingSession] = useState(false)
  // Supprime la session pour TOUS les élèves de la classe (garde le tableau unifié).
  async function deleteClassSession() {
    if (sessList.length === 0) return
    const hasTaughtLessons = sessList.some((s) => s.lessons.some((l) => l.status !== "PENDING"))
    const payrollWarning = hasTaughtLessons
      ? "\n\n⚠️ Des cours de cette session sont déjà marqués présent/absent : ils seront perdus, y compris pour le calcul de la paie du professeur s'ils n'ont pas encore été comptabilisés."
      : ""
    if (!confirm(`Supprimer définitivement la Session ${selNum} pour toute la classe (${students.map(shortName).join(", ")}) et tous ses cours ? Les paiements liés sont conservés mais dissociés.${payrollWarning}\n\nAction irréversible.`)) return
    setDeletingSession(true)
    const results = await Promise.all(sessList.map((s) => fetch(`/api/sessions/${s.id}`, { method: "DELETE" })))
    if (results.every((r) => r.ok)) window.location.reload()
    else setDeletingSession(false)
  }

  // Nouvelle session pour toute la classe : réplique le modèle de la dernière session.
  const maxNumber = numbers[0]
  async function createSessionForClass() {
    setCreatingSession(true)
    const tmpl = students.map((st) => (sessionsByStudent.get(st.id) ?? []).find((s) => s.number === maxNumber)).find(Boolean) ?? template
    if (tmpl) {
      const count = tmpl.lessons.length || DEFAULT_LESSON_COUNT
      for (const st of students) {
        await onNewSession(st.id, tmpl.subject, tmpl.teacher.id, count, tmpl.frequency, tmpl.duration)
      }
      setSelectedNumber(maxNumber + 1)
    }
    setCreatingSession(false)
  }

  if (numbers.length === 0) {
    return <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-400">Aucune session pour cette classe.</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {numbers.map((num) => {
          const isSel = selNum === num
          return (
            <button
              key={num}
              onClick={() => setSelectedNumber(num)}
              className={"shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:py-1.5 " + (isSel ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
            >
              Session {num}
            </button>
          )
        })}
      </div>
      {subjectLabel && <p className="text-xs text-gray-400">Matière : {subjectLabel}</p>}

      <div className={`rounded-xl border ${allComplete ? "border-gray-200 bg-gray-50" : "border-blue-200 bg-white shadow-sm"}`}>
        <div className="flex items-center gap-3 border-b border-gray-100 p-4">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${allComplete ? "bg-gray-200 text-gray-500" : "bg-blue-100 text-blue-700"}`}>
            {selNum}
          </div>
          <span className="font-semibold text-gray-900">Session {selNum}</span>
          {canSetLegacyBoundary && <SessionNumberEditor currentNumber={selNum} onSave={renumberClassSession} />}
          {allComplete && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">Terminée</span>}
          {canSetLegacyBoundary && (
            <button
              type="button"
              onClick={deleteClassSession}
              disabled={deletingSession}
              className="ml-auto flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
              title="Supprimer cette session pour toute la classe (directeur/secrétaire)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deletingSession ? "Suppression…" : "Supprimer"}
            </button>
          )}
        </div>

        <div className="space-y-3 p-4">
          {lessonNumbers.map((num) => {
            const cells = students.map((student) => ({
              student,
              lesson: sessionByStudent.get(student.id)?.lessons.find((l) => l.number === num),
            }))
            return (
              <MergedLessonRow
                key={`${num}:${cells.map((cell) => `${cell.lesson?.id ?? cell.student.id}:${cell.lesson?.date ?? ""}:${cell.lesson?.content ?? ""}:${cell.lesson?.duration ?? ""}`).join("|")}`}
                lessonNumber={num}
                cells={cells}
                sessionDuration={sessionDuration}
                canSetLegacyBoundary={canSetLegacyBoundary}
                studentsWithLegacyBoundary={studentsWithLegacyBoundary}
                onToggleStatus={(lessonId, current) => onUpdateLesson(lessonId, { status: STATUS_CYCLE[current] ?? "PENDING" })}
                onEnsureStatus={(studentId) => ensureAndPresent(studentId, num)}
                onSaveShared={(data) => cells.forEach((c) => c.lesson && onUpdateLesson(c.lesson.id, data))}
                onToggleLegacy={(checked, lessonIds) => lessonIds.forEach((lessonId) => onUpdateLesson(lessonId, { legacyPayrollBoundary: checked }))}
                onDelete={() => cells.forEach((c) => c.lesson && onDeleteLesson(c.lesson.id))}
              />
            )
          })}

          {!allComplete && (
            <Button
              variant="ghost"
              className="w-full border border-dashed border-gray-200 text-gray-500 hover:text-gray-700"
              onClick={() => sessList.forEach((s) => { if (!s.isComplete) onAddLesson(s.id) })}
            >
              <Plus className="h-4 w-4" /> Ajouter un cours à la classe
            </Button>
          )}

          <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-500">Paiement par élève</p>
            {students.map((student) => (
              <StudentPaymentRow
                key={student.id}
                student={student}
                session={sessionByStudent.get(student.id)}
                paidAt={paidBySession[`${student.id}:${selNum}`]}
                hasUndated={Boolean(undatedPaymentBySession[`${student.id}:${selNum}`])}
                canMarkPaymentDate={canMarkPaymentDate}
                onMarkPaymentDate={onMarkPaymentDate}
              />
            ))}
          </div>

          {sessList.length > 0 && (
            <Button
              className={`w-full text-white disabled:cursor-not-allowed disabled:opacity-50 ${canSendNextPaymentRequestForClass ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-blue-400 hover:bg-blue-400"}`}
              disabled={sessionsNeedingNextPaymentRequest.length === 0}
              aria-disabled={!canSendNextPaymentRequestForClass}
              onClick={requestPaymentForClass}
              title={
                sessionsNeedingNextPaymentRequest.length === 0
                  ? `La Session ${nextSessionNumber} est déjà payée ou déjà demandée pour tous les élèves`
                  : !lastLessonValidated
                    ? "Validez la présence/absence du dernier cours pour activer"
                    : `Termine la session et envoie la demande de paiement de la Session ${nextSessionNumber}`
              }
            >
              <Bell className="h-4 w-4" /> {anyIncomplete ? `Terminer et demander Session ${nextSessionNumber}` : `Demander paiement Session ${nextSessionNumber}`}
            </Button>
          )}
          {sessList.length > 0 && !lastLessonValidated && (
            <p className="text-center text-[11px] text-gray-400">Validez le dernier cours de la session (présent/absent) pour activer l&apos;envoi.</p>
          )}
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full border-dashed"
        disabled={creatingSession}
        onClick={createSessionForClass}
      >
        <Plus className="h-4 w-4" /> {creatingSession ? "Création…" : "Nouvelle session pour la classe"}
      </Button>
    </div>
  )
}

// ─── StudentCahier ────────────────────────────────────────────────────────────

function StudentCahier({
  student, sessions, paidBySession, undatedPaymentBySession, schedule, teachers, currentUserId,
  canSetLegacyBoundary, canMarkPaymentDate,
  onUpdateLesson, onAddLesson, onCloseSession, onNewSession, onDeleteLesson, onMarkPaymentDate, onRenumberSession,
}: {
  student: Student
  sessions: LessonSession[]
  paidBySession: Record<string, string>
  undatedPaymentBySession: Record<string, boolean>
  schedule: Slot[] | undefined
  teachers: { id: string; name: string }[]
  currentUserId: string
  canSetLegacyBoundary: boolean
  canMarkPaymentDate: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onNewSession: (studentId: string, subject: string, teacherId: string, lessonCount: number, frequency: number | null, duration: string | null) => Promise<string | null>
  onDeleteLesson: (lessonId: string) => void
  onMarkPaymentDate: (session: LessonSession, paidDate: string) => Promise<boolean>
  onRenumberSession: (sessionId: string, newNumber: number) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [newSubject, setNewSubject] = useState("")
  const [newTeacher, setNewTeacher] = useState(currentUserId)
  const [newLessonCount, setNewLessonCount] = useState(String(DEFAULT_LESSON_COUNT))
  const [choosingSessionModel, setChoosingSessionModel] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creationError, setCreationError] = useState<string | null>(null)

  const sortedSessions = [...sessions].sort((a, b) => b.number - a.number)
  const hasLegacyBoundary = studentHasLegacyBoundary(sessions, student.id)
  const selected =
    sortedSessions.find((s) => s.id === selectedId) ??
    sortedSessions.find((s) => !s.isComplete) ??
    sortedSessions[0]
  const name = student.displayName || `${student.firstName} ${student.lastName}`.trim()
  const forfait = formatForfait(student.lessonsPerWeek, student.duration)
  const planning = schedule && schedule.length > 0

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50">
      <div
        onClick={() => setOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center gap-3 p-4 text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
          {initialFromName(name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm">{name}</p>
          <p className="text-xs text-gray-400">
            {student.group?.name ?? "Aucun groupe"}
            {student.subject && ` · ${student.subject}`}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {forfait && <span className="font-medium text-gray-600">{forfait}</span>}
            {planning && schedule?.map((slot) => (
              <a
                key={slot.id}
                href={`/dashboard/schedule?teacherId=${slot.teacherId}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-gray-700 hover:bg-blue-100"
                title="Modifier ce créneau dans le planning"
              >
                <Clock className="h-3 w-3 text-blue-600" />
                🇫🇷 {scheduleLabel(slot)}
              </a>
            ))}
          </div>
        </div>
        {sessions.length > 0 && (
          <span className="text-xs text-gray-400">{sessions.length} session{sessions.length > 1 ? "s" : ""}</span>
        )}
        {sessions.length === 0 && <span className="text-xs text-gray-300 italic">Aucun cours</span>}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((current) => !current)
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title={open ? "Masquer les sessions" : "Afficher les sessions"}
          aria-label={open ? `Masquer les sessions de ${name}` : `Afficher les sessions de ${name}`}
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {(student.phone || student.parentPhone) && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 -mt-1">
          {[
            { label: "Élève", num: student.phone },
            { label: "Parent", num: student.parentPhone },
          ].map(({ label, num }) => {
            const wa = whatsappLink(num)
            if (!wa) return null
            return (
              <a key={label} href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
                <MessageCircle className="h-3.5 w-3.5" />
                {label} · {num}
              </a>
            )
          })}
        </div>
      )}

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {sortedSessions.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {sortedSessions.map((s) => {
                const isSel = selected?.id === s.id
                return (
                  <button key={s.id} onClick={() => setSelectedId(s.id)} className={"shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " + (isSel ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                    Session {s.number}
                  </button>
                )
              })}
            </div>
          )}
          {selected && (
            <SessionCard
              key={selected.id}
              session={selected}
              paidAt={paidBySession[`${student.id}:${selected.number}`]}
              hasUndatedPayment={undatedPaymentBySession[`${student.id}:${selected.number}`]}
              nextPaidAt={paidBySession[`${student.id}:${selected.number + 1}`]}
              nextHasPaymentRequest={undatedPaymentBySession[`${student.id}:${selected.number + 1}`]}
              canSetLegacyBoundary={canSetLegacyBoundary}
              canMarkPaymentDate={canMarkPaymentDate}
              studentHasLegacyBoundary={hasLegacyBoundary}
              onUpdateLesson={onUpdateLesson}
              onAddLesson={onAddLesson}
              onCloseSession={onCloseSession}
              onDeleteLesson={onDeleteLesson}
              onMarkPaymentDate={onMarkPaymentDate}
              onRenumberSession={onRenumberSession}
            />
          )}
          {choosingSessionModel ? (
            <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-medium text-blue-700">Choisir le type de session</p>
              {creationError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {creationError}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selected}
                  className="h-auto justify-start border-blue-200 bg-white px-3 py-3 text-left"
                  onClick={async () => {
                    if (!selected) return
                    setCreationError(null)
                    const newSessionId = await onNewSession(
                      student.id,
                      selected.subject,
                      selected.teacher.id,
                      selected.lessons.length || DEFAULT_LESSON_COUNT,
                      selected.frequency,
                      selected.duration
                    )
                    if (!newSessionId) {
                      setCreationError("La session n'a pas pu être créée. Réessayez dans un instant.")
                      return
                    }
                    setSelectedId(newSessionId)
                    setChoosingSessionModel(false)
                  }}
                >
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">Continuer avec le même modèle</span>
                    <span className="mt-0.5 block text-xs font-normal text-gray-500">
                      Même matière, même professeur et même nombre de cours.
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto justify-start border-blue-200 bg-white px-3 py-3 text-left"
                  onClick={() => {
                    setCreationError(null)
                    setNewSubject(selected?.subject ?? student.subject ?? "")
                    setNewTeacher(selected?.teacher.id ?? currentUserId)
                    setNewLessonCount(String(selected?.lessons.length || DEFAULT_LESSON_COUNT))
                    setChoosingSessionModel(false)
                    setCreating(true)
                  }}
                >
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">Créer une session personnalisée</span>
                    <span className="mt-0.5 block text-xs font-normal text-gray-500">
                      Modifier la matière ou le nombre de cours.
                    </span>
                  </span>
                </Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                setChoosingSessionModel(false)
                setCreationError(null)
              }}>Annuler</Button>
            </div>
          ) : creating ? (
            <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-medium text-blue-700">Nouvelle session</p>
              <Select value={newSubject} onValueChange={setNewSubject}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Choisir la matière…" /></SelectTrigger>
                <SelectContent>{SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              {teachers.length > 1 && (
                <Select value={newTeacher} onValueChange={setNewTeacher}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Professeur…" /></SelectTrigger>
                  <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-blue-700" htmlFor={`teacher-lesson-count-${student.id}`}>
                  Nombre de cours
                </label>
                <Input
                  id={`teacher-lesson-count-${student.id}`}
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={newLessonCount}
                  onChange={(e) => setNewLessonCount(e.target.value)}
                  className="bg-white"
                />
              </div>
              {creationError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {creationError}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={!newSubject || !newLessonCount} onClick={async () => {
                  setCreationError(null)
                  const count = Number(newLessonCount)
                  if (!Number.isInteger(count) || count < 1 || count > 100) {
                    setCreationError("Le nombre de cours doit être entre 1 et 100.")
                    return
                  }
                  const newSessionId = await onNewSession(student.id, newSubject, newTeacher, count, student.lessonsPerWeek, student.duration)
                  if (!newSessionId) {
                    setCreationError("La session n'a pas pu être créée. Réessayez dans un instant.")
                    return
                  }
                  setSelectedId(newSessionId)
                  setCreating(false)
                  setNewSubject("")
                  setNewLessonCount(String(DEFAULT_LESSON_COUNT))
                }}>Créer</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setCreating(false)
                  setCreationError(null)
                }}>Annuler</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full border-dashed" onClick={() => {
              setCreationError(null)
              setChoosingSessionModel(true)
            }}>
              <Plus className="h-4 w-4" /> Nouvelle session
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AddMemberForm ────────────────────────────────────────────────────────────

function AddMemberForm({ onAdded, canAddSecretary }: { onAdded: () => void; canAddSecretary: boolean }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<"TEACHER" | "SECRETARY">("TEACHER")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [form, setForm] = useState({ name: "", email: "", phone: "" })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    setSuccessMsg("")
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || "Erreur")
      setSaving(false)
      return
    }
    const data = await res.json()
    if (data.emailSent) {
      setSuccessMsg(`Compte créé ! Un email avec le mot de passe provisoire a été envoyé à ${form.email}.`)
    } else if (data.tempPassword) {
      setSuccessMsg(`Compte créé ! Email non envoyé — mot de passe provisoire : ${data.tempPassword}`)
    } else {
      setSuccessMsg("Compte créé !")
    }
    setForm({ name: "", email: "", phone: "" })
    setSaving(false)
    onAdded()
  }

  if (!open) {
    return (
      <div className="grid gap-2 sm:flex">
        <button onClick={() => { setRole("TEACHER"); setOpen(true) }} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:justify-start">
          + Ajouter un professeur
        </button>
        {canAddSecretary && (
          <button onClick={() => { setRole("SECRETARY"); setOpen(true) }} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:justify-start">
            + Ajouter une secrétaire
          </button>
        )}
      </div>
    )
  }

  const isSecretary = role === "SECRETARY"

  return (
    <form onSubmit={handleSubmit} className={`rounded-2xl border p-5 space-y-3 ${isSecretary ? "border-blue-200 bg-blue-50" : "border-blue-200 bg-blue-50"}`}>
      <h3 className="font-semibold text-gray-900">{isSecretary ? "Nouvelle secrétaire" : "Nouveau professeur"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nom complet *</label>
          <input required className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
          <input required type="email" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
          <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="flex items-end">
          <p className="text-xs text-gray-400 pb-2">Un mot de passe provisoire sera généré et envoyé par email.</p>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMsg && <p className="text-sm text-blue-700 bg-blue-100 rounded-lg px-3 py-2">{successMsg}</p>}
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {!successMsg ? (
          <>
            <button type="submit" disabled={saving} className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${isSecretary ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-600 hover:bg-blue-700"}`}>
              {saving ? "Enregistrement…" : "Créer le compte"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          </>
        ) : (
          <button type="button" onClick={() => { setOpen(false); setSuccessMsg("") }} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Fermer</button>
        )}
      </div>
    </form>
  )
}

// ─── TeacherCard ──────────────────────────────────────────────────────────────

function GroupCard({
  group,
  activeStudents,
  groupType,
  rate,
  sessions,
  paidBySession,
  undatedPaymentBySession,
  scheduleByGroup,
  teachers,
  currentUserId,
  canRemoveStudent,
  canArchive,
  canSetLegacyBoundary,
  canMarkPaymentDate,
  filteringSessionsWithoutPaymentDate,
  onUpdateLesson,
  onAddLesson,
  onCloseSession,
  onNewSession,
  onDeleteLesson,
  onMarkPaymentDate,
  onEnsureLesson,
  onRenumberSession,
  currentTeacherId,
  canEditGroup,
}: {
  group: Group
  activeStudents: Student[]
  groupType: string
  rate: number
  sessions: LessonSession[]
  paidBySession: Record<string, string>
  undatedPaymentBySession: Record<string, boolean>
  scheduleByGroup: Record<string, Slot[]>
  teachers: { id: string; name: string }[]
  currentUserId: string
  canRemoveStudent: boolean
  canArchive: boolean
  canSetLegacyBoundary: boolean
  canMarkPaymentDate: boolean
  filteringSessionsWithoutPaymentDate: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onNewSession: (studentId: string, subject: string, teacherId: string, lessonCount: number, frequency: number | null, duration: string | null) => Promise<string | null>
  onDeleteLesson: (lessonId: string) => void
  onMarkPaymentDate: (session: LessonSession, paidDate: string) => Promise<boolean>
  onEnsureLesson: (studentId: string, subject: string, teacherId: string, sessionNumber: number, lessonNumber: number, frequency: number | null, duration: string | null, lessonCount: number) => Promise<string | null>
  onRenumberSession: (sessionId: string, newNumber: number) => Promise<string | null>
  currentTeacherId: string
  canEditGroup: boolean
}) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)
  const [archivingClass, setArchivingClass] = useState(false)
  const [deletingClass, setDeletingClass] = useState(false)
  const [editingGroup, setEditingGroup] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)
  const [groupError, setGroupError] = useState<string | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupForm, setGroupForm] = useState({
    name: group.name,
    level: group.level ?? "",
    teacherId: currentTeacherId,
    duration: activeStudents[0]?.duration ?? "",
    lessonsPerWeek: activeStudents[0]?.lessonsPerWeek != null ? String(activeStudents[0].lessonsPerWeek) : "",
  })

  async function handleSaveGroup() {
    setSavingGroup(true)
    setGroupError(null)
    const res = await fetch(`/api/groups/${group.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: groupForm.name,
        level: groupForm.level || null,
        teacherId: groupForm.teacherId || null,
        maxStudents: group.maxStudents,
      }),
    })
    if (!res.ok) {
      setGroupError("La mise à jour de la classe a échoué.")
      setSavingGroup(false)
      return
    }
    // Applique durée/nb de cours par semaine à tous les élèves actifs de la classe.
    await Promise.all(activeStudents.map((student) =>
      fetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration: groupForm.duration || null,
          lessonsPerWeek: groupForm.lessonsPerWeek === "" ? null : Number(groupForm.lessonsPerWeek),
        }),
      })
    ))
    window.location.reload()
  }

  async function handleRemoveStudent(studentId: string) {
    setRemoving(studentId)
    const res = await fetch(`/api/groups/${group.id}/update-students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeStudentIds: [studentId] }),
    })
    if (res.ok) {
      window.location.reload()
    }
    setRemoving(null)
  }

  async function handleArchiveStudent(studentId: string, name: string) {
    if (!confirm(`Marquer ${name} comme arrêté ? L'élève quitte les listes actives et rejoint « Anciens élèves » (fiche conservée).`)) return
    setArchiving(studentId)
    const res = await fetch(`/api/students/${studentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    })
    if (res.ok) window.location.reload()
    else setArchiving(null)
  }

  async function handleArchiveClass() {
    if (!confirm(`Fin de la classe « ${group.name} » ? Les ${activeStudents.length} élève(s) actif(s) seront archivés dans « Anciens élèves ». Réversible depuis Fiches élèves.`)) return
    setArchivingClass(true)
    const res = await fetch(`/api/groups/${group.id}/archive-students`, { method: "POST" })
    if (res.ok) window.location.reload()
    else setArchivingClass(false)
  }

  async function handleDeleteClass() {
    if (!confirm(
      `Supprimer définitivement la classe « ${group.name} » ?\n\n` +
      `Les élèves NE sont PAS supprimés (ils sont détachés de la classe). En revanche les présences, contrôles/notes et créneaux de cette classe seront effacés. Action irréversible.`
    )) return
    setDeletingClass(true)
    const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" })
    if (res.ok) window.location.reload()
    else {
      const err = await res.json().catch(() => null)
      alert(`Suppression impossible : ${err?.error ?? res.status}`)
      setDeletingClass(false)
    }
  }

  function getStudentSessions(studentId: string) {
    return sessions.filter(s => s.student.id === studentId)
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 text-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-gray-900">{group.name}</p>
          {group.level && <p className="text-xs text-gray-400">{group.level}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            activeStudents.length <= 1 ? "bg-blue-50 text-blue-700" :
            activeStudents.length === 2 ? "bg-amber-50 text-amber-700" :
            "bg-blue-50 text-blue-700"
          }`}>
            {groupType} · {rate}€/h
          </span>
          <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
            {activeStudents.length} élève{activeStudents.length > 1 ? "s" : ""}
          </span>
          {canEditGroup && (
            <button
              type="button"
              onClick={() => setEditingGroup((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              title="Modifier la classe"
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </button>
          )}
          {canArchive && activeStudents.length > 0 && (
            <button
              type="button"
              onClick={handleArchiveClass}
              disabled={archivingClass}
              className="flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
              title="Terminer la classe : archiver tous les élèves actifs"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              {archivingClass ? "…" : "Fin de classe"}
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              onClick={handleDeleteClass}
              disabled={deletingClass}
              className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
              title="Supprimer la classe (les élèves sont conservés, détachés)"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deletingClass ? "…" : "Supprimer"}
            </button>
          )}
          {activeStudents.length >= 2 && (
            <button
              type="button"
              onClick={() => setGroupOpen((open) => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              title={groupOpen ? "Masquer les sessions de la classe" : "Afficher les sessions de la classe"}
              aria-label={groupOpen ? `Masquer les sessions de ${group.name}` : `Afficher les sessions de ${group.name}`}
            >
              {groupOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {editingGroup && (
        <div className="mb-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Nom de la classe</label>
              <Input value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} className="h-8 bg-white text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Niveau</label>
              <Input value={groupForm.level} onChange={(e) => setGroupForm((f) => ({ ...f, level: e.target.value }))} className="h-8 bg-white text-sm" placeholder="ex: Débutant, A1..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Professeur</label>
              <Select value={groupForm.teacherId} onValueChange={(v) => setGroupForm((f) => ({ ...f, teacherId: v }))}>
                <SelectTrigger className="h-8 bg-white text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Cours par semaine</label>
              <Input type="number" min="0" step="1" value={groupForm.lessonsPerWeek} onChange={(e) => setGroupForm((f) => ({ ...f, lessonsPerWeek: e.target.value }))} className="h-8 bg-white text-sm" placeholder="ex: 1, 2..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Durée d&apos;un cours</label>
              <Select value={groupForm.duration} onValueChange={(v) => setGroupForm((f) => ({ ...f, duration: v }))}>
                <SelectTrigger className="h-8 bg-white text-sm"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0,5">30 min</SelectItem>
                  <SelectItem value="1">1h</SelectItem>
                  <SelectItem value="1,5">1h30</SelectItem>
                  <SelectItem value="2">2h</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {groupForm.teacherId !== currentTeacherId && (
            <p className="text-xs text-amber-700">⚠️ Changer de professeur déplace toute la classe ({activeStudents.length} élève{activeStudents.length > 1 ? "s" : ""}) vers ce professeur.</p>
          )}
          {groupError && <p className="text-xs text-red-600">{groupError}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs" disabled={savingGroup} onClick={handleSaveGroup}>
              {savingGroup ? "Enregistrement..." : "Enregistrer"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditingGroup(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {activeStudents.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-400">
          {filteringSessionsWithoutPaymentDate ? "Aucune session à vérifier dans cette classe." : "Aucun élève actif dans cette classe."}
        </p>
      ) : activeStudents.length >= 2 ? (
        <div className="space-y-2">
          {/* Contrôles par élève (archiver / retirer) */}
          <div className="flex flex-wrap gap-1.5">
            {activeStudents.map((student) => (
              <span key={student.id} className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                {shortName(student)}
                {canArchive && (
                  <button
                    onClick={() => handleArchiveStudent(student.id, student.displayName || `${student.firstName} ${student.lastName}`)}
                    disabled={archiving === student.id}
                    className="text-gray-300 hover:text-orange-500 disabled:opacity-50"
                    title="Arrêter cet élève (→ Anciens élèves)"
                  >
                    {archiving === student.id ? "…" : <Archive className="h-3 w-3" />}
                  </button>
                )}
                {canRemoveStudent && (
                  <button
                    onClick={() => handleRemoveStudent(student.id)}
                    disabled={removing === student.id}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-50"
                    title="Retirer de la classe"
                  >
                    {removing === student.id ? "…" : <X className="h-3 w-3" />}
                  </button>
                )}
              </span>
            ))}
          </div>
          {groupOpen && (
            <MergedGroupCahier
              students={activeStudents}
              sessions={sessions}
              paidBySession={paidBySession}
              undatedPaymentBySession={undatedPaymentBySession}
              canSetLegacyBoundary={canSetLegacyBoundary}
              canMarkPaymentDate={canMarkPaymentDate}
              onUpdateLesson={onUpdateLesson}
              onAddLesson={onAddLesson}
              onCloseSession={onCloseSession}
              onNewSession={onNewSession}
              onDeleteLesson={onDeleteLesson}
              onMarkPaymentDate={onMarkPaymentDate}
              onEnsureLesson={onEnsureLesson}
              onRenumberSession={onRenumberSession}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {activeStudents.map((student) => (
            <div key={student.id} className="relative">
              <div className="absolute right-3 top-4 z-10 flex items-center gap-1">
                {canArchive && (
                  <button
                    onClick={() => handleArchiveStudent(student.id, student.displayName || `${student.firstName} ${student.lastName}`)}
                    disabled={archiving === student.id}
                    className="rounded-full p-1 text-gray-300 hover:bg-orange-50 hover:text-orange-500 disabled:opacity-50"
                    title="Arrêter cet élève (→ Anciens élèves)"
                  >
                    {archiving === student.id ? "…" : <Archive className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              <StudentCahier
                student={student}
                sessions={getStudentSessions(student.id)}
                paidBySession={paidBySession}
                undatedPaymentBySession={undatedPaymentBySession}
                schedule={student.groupId ? scheduleByGroup[student.groupId] : undefined}
                teachers={teachers}
                currentUserId={currentUserId}
                canSetLegacyBoundary={canSetLegacyBoundary}
                canMarkPaymentDate={canMarkPaymentDate}
                onUpdateLesson={onUpdateLesson}
                onAddLesson={onAddLesson}
                onCloseSession={onCloseSession}
                onNewSession={onNewSession}
                onDeleteLesson={onDeleteLesson}
                onMarkPaymentDate={onMarkPaymentDate}
                onRenumberSession={onRenumberSession}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TeacherCard({
  teacher, teacherStudents, sessions, paidBySession, undatedPaymentBySession, scheduleByGroup, teachers, currentUserId, currentRole,
  showSessionsWithoutPaymentDate, studentSearch = "",
  onUpdateLesson, onAddLesson, onCloseSession, onNewSession, onDeleteLesson, onMarkPaymentDate, onEnsureLesson, onRenumberSession, onUpdateRates,
}: {
  teacher: Teacher
  teacherStudents: Student[]
  sessions: LessonSession[]
  paidBySession: Record<string, string>
  undatedPaymentBySession: Record<string, boolean>
  scheduleByGroup: Record<string, Slot[]>
  teachers: { id: string; name: string }[]
  currentUserId: string
  currentRole: string
  showSessionsWithoutPaymentDate: boolean
  studentSearch?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onNewSession: (studentId: string, subject: string, teacherId: string, lessonCount: number, frequency: number | null, duration: string | null) => Promise<string | null>
  onDeleteLesson: (lessonId: string) => void
  onMarkPaymentDate: (session: LessonSession, paidDate: string) => Promise<boolean>
  onEnsureLesson: (studentId: string, subject: string, teacherId: string, sessionNumber: number, lessonNumber: number, frequency: number | null, duration: string | null, lessonCount: number) => Promise<string | null>
  onRenumberSession: (sessionId: string, newNumber: number) => Promise<string | null>
  onUpdateRates: (teacherId: string, rates: { individualRate?: number; binomeRate?: number; groupRate?: number }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [classesOpen, setClassesOpen] = useState(false)
  const [salaryOpen, setSalaryOpen] = useState(false)
  const [editingRates, setEditingRates] = useState(false)
  const [meetingLink, setMeetingLink] = useState(teacher.meetingLink)
  const [rates, setRates] = useState({
    individualRate: teacher.individualRate ?? "",
    binomeRate: teacher.binomeRate ?? "",
    groupRate: teacher.groupRate ?? "",
  })
  const totalStudents = teacher.teacherGroups.reduce((sum, g) => sum + g.students.filter(s => s.status === "ACTIVE").length, 0)
  const totalGroups = teacher.teacherGroups.length

  const visibleSessions = showSessionsWithoutPaymentDate
    ? latestSessionsWithoutPaymentDate(sessions, paidBySession)
    : sessions
  const visibleStudentIds = new Set(visibleSessions.map((session) => session.student.id))
  // Filtre de recherche (nom d'élève) venant de la barre du haut.
  const q = studentSearch.trim().toLowerCase()
  const searchActive = q.length > 0
  const matchesQuery = (s: Student) =>
    !q || `${s.firstName} ${s.lastName} ${s.displayName ?? ""}`.toLowerCase().includes(q)
  const visibleTeacherStudents = (showSessionsWithoutPaymentDate
    ? teacherStudents.filter((student) => visibleStudentIds.has(student.id))
    : teacherStudents
  ).filter(matchesQuery)

  const activeStudents = visibleTeacherStudents.filter(s => s.status === "ACTIVE")
  const pausedStudents = visibleTeacherStudents.filter(s => s.status === "PAUSED")
  const stoppedStudents = visibleTeacherStudents.filter(s => s.status === "STOPPED")
  const visibleGroupEntries = teacher.teacherGroups
    .map((group) => ({
      group,
      activeInGroup: activeStudents.filter((student) => student.groupId === group.id),
    }))
    .filter((entry) => !searchActive || entry.activeInGroup.length > 0)
  // Déplie automatiquement la fiche quand une recherche est active.
  const isOpen = expanded || searchActive
  const areClassesOpen = classesOpen || searchActive

  function getStudentSessions(studentId: string) {
    return visibleSessions.filter(s => s.student.id === studentId)
  }

  async function startTeacherView() {
    await fetch("/api/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId: teacher.id }),
    })
    window.location.href = "/dashboard"
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-4 p-5 text-left"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
          {initialFromName(teacher.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{teacher.name}</p>
          <div className="flex flex-wrap gap-3 mt-0.5">
            {(() => {
              const mail = gmailComposeLink(teacher.email)
              return mail ? (
                <a href={mail} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Mail className="h-3 w-3" /> {teacher.email}
                </a>
              ) : null
            })()}
            {teacher.phone && (() => {
              const wa = whatsappLink(teacher.phone)
              return wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-green-700 hover:underline">
                  <MessageCircle className="h-3 w-3" /> {teacher.phone}
                </a>
              ) : (
                <span className="flex items-center gap-1 text-xs text-gray-500"><Phone className="h-3 w-3" /> {teacher.phone}</span>
              )
            })()}
            <MeetingLinkControl teacherId={teacher.id} link={meetingLink} onSaved={setMeetingLink} />
          </div>
        </div>
        <div className="flex gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-blue-600">{totalGroups}</p>
            <p className="text-xs text-gray-400">{totalGroups > 1 ? "classes" : "classe"}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-blue-600">{totalStudents}</p>
            <p className="text-xs text-gray-400">élèves</p>
          </div>
          {currentRole === "DIRECTOR" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                startTeacherView()
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              title="Déclencher le mode prof"
              aria-label={`Déclencher le mode prof pour ${teacher.name}`}
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((open) => !open)
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title={isOpen ? "Masquer les élèves" : "Afficher les élèves"}
          aria-label={isOpen ? `Masquer les élèves de ${teacher.name}` : `Afficher les élèves de ${teacher.name}`}
        >
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {/* Tarifs horaires (directeur uniquement) */}
          {currentRole === "DIRECTOR" && !searchActive && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <button type="button" onClick={() => setSalaryOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
                <p className="text-sm font-semibold text-gray-700">Salaire à l&apos;heure</p>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  {salaryOpen ? "Masquer" : "Afficher"}
                  {salaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>
              {salaryOpen && (<div className="mt-3">
              <div className="mb-2 flex items-center justify-end">
                {!editingRates ? (
                  <button onClick={() => setEditingRates(true)} className="text-xs text-blue-600 hover:underline">Modifier</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingRates(false); setRates({ individualRate: teacher.individualRate ?? "", binomeRate: teacher.binomeRate ?? "", groupRate: teacher.groupRate ?? "" }) }} className="text-xs text-gray-500 hover:underline">Annuler</button>
                    <button onClick={() => {
                      onUpdateRates(teacher.id, {
                        individualRate: rates.individualRate !== "" ? Number(rates.individualRate) : undefined,
                        binomeRate: rates.binomeRate !== "" ? Number(rates.binomeRate) : undefined,
                        groupRate: rates.groupRate !== "" ? Number(rates.groupRate) : undefined,
                      })
                      setEditingRates(false)
                    }} className="text-xs text-white bg-blue-600 rounded px-2 py-0.5 hover:bg-blue-700">Enregistrer</button>
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs text-gray-500">Individuel</label>
                  {editingRates ? (
                    <input type="number" step="0.5" min="0" className="w-full mt-0.5 rounded border border-gray-200 bg-white px-2 py-1 text-sm" value={rates.individualRate} onChange={e => setRates(r => ({ ...r, individualRate: e.target.value }))} placeholder="€/h" />
                  ) : (
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{teacher.individualRate != null ? `${teacher.individualRate} €/h` : "—"}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">Binôme</label>
                  {editingRates ? (
                    <input type="number" step="0.5" min="0" className="w-full mt-0.5 rounded border border-gray-200 bg-white px-2 py-1 text-sm" value={rates.binomeRate} onChange={e => setRates(r => ({ ...r, binomeRate: e.target.value }))} placeholder="€/h" />
                  ) : (
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{teacher.binomeRate != null ? `${teacher.binomeRate} €/h` : "—"}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">Groupe</label>
                  {editingRates ? (
                    <input type="number" step="0.5" min="0" className="w-full mt-0.5 rounded border border-gray-200 bg-white px-2 py-1 text-sm" value={rates.groupRate} onChange={e => setRates(r => ({ ...r, groupRate: e.target.value }))} placeholder="€/h" />
                  ) : (
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{teacher.groupRate != null ? `${teacher.groupRate} €/h` : "—"}</p>
                  )}
                </div>
              </div>
              </div>)}
            </div>
          )}

          {searchActive && visibleTeacherStudents.length > 0 && (
            <div className="space-y-3">
              {visibleTeacherStudents.map((student) => (
                <StudentCahier
                  key={student.id}
                  student={student}
                  sessions={getStudentSessions(student.id)}
                  paidBySession={paidBySession}
                  undatedPaymentBySession={undatedPaymentBySession}
                  schedule={student.groupId ? scheduleByGroup[student.groupId] : undefined}
                  teachers={teachers}
                  currentUserId={currentUserId}
                  canSetLegacyBoundary={currentRole === "DIRECTOR" || currentRole === "SECRETARY"}
                  canMarkPaymentDate={["DIRECTOR", "SECRETARY"].includes(currentRole)}
                  onUpdateLesson={onUpdateLesson}
                  onAddLesson={onAddLesson}
                  onCloseSession={onCloseSession}
                  onNewSession={onNewSession}
                  onDeleteLesson={onDeleteLesson}
                  onMarkPaymentDate={onMarkPaymentDate}
                  onRenumberSession={onRenumberSession}
                />
              ))}
            </div>
          )}

          {/* Classes et élèves actifs */}
          {!searchActive && visibleGroupEntries.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setClassesOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-gray-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Users className="h-4 w-4 text-blue-600" />
                  Classes ({visibleGroupEntries.length})
                </span>
                {areClassesOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </button>
              {areClassesOpen && (
                <div className="space-y-2">
                  {visibleGroupEntries.map(({ group, activeInGroup }) => {
                    const groupType = activeInGroup.length <= 1 ? "Solo" : activeInGroup.length === 2 ? "Binôme" : `Groupe (${activeInGroup.length})`
                    const rate = rateForSize(activeInGroup.length)
                    return (
                      <GroupCard
                        key={group.id}
                        group={group}
                        activeStudents={activeInGroup}
                        groupType={groupType}
                        rate={rate}
                        sessions={visibleSessions}
                        paidBySession={paidBySession}
                        undatedPaymentBySession={undatedPaymentBySession}
                        scheduleByGroup={scheduleByGroup}
                        teachers={teachers}
                        currentUserId={currentUserId}
                        canRemoveStudent={currentRole === "DIRECTOR"}
                        canArchive={currentRole === "DIRECTOR" || currentRole === "SECRETARY"}
                        canSetLegacyBoundary={currentRole === "DIRECTOR" || currentRole === "SECRETARY"}
                        canMarkPaymentDate={["DIRECTOR", "SECRETARY"].includes(currentRole)}
                        filteringSessionsWithoutPaymentDate={showSessionsWithoutPaymentDate}
                        onUpdateLesson={onUpdateLesson}
                        onAddLesson={onAddLesson}
                        onCloseSession={onCloseSession}
                        onNewSession={onNewSession}
                        onDeleteLesson={onDeleteLesson}
                        onMarkPaymentDate={onMarkPaymentDate}
                        onEnsureLesson={onEnsureLesson}
                        onRenumberSession={onRenumberSession}
                        currentTeacherId={teacher.id}
                        canEditGroup={currentRole === "DIRECTOR" || currentRole === "SECRETARY"}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* En pause */}
          {!searchActive && pausedStudents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-amber-200" />
                <span className="text-xs font-medium text-amber-600">En pause ({pausedStudents.length})</span>
                <div className="h-px flex-1 bg-amber-200" />
              </div>
              {pausedStudents.map((student) => (
                <div key={student.id} className="opacity-70">
                  <StudentCahier
                    student={student}
                    sessions={getStudentSessions(student.id)}
                    paidBySession={paidBySession}
                    undatedPaymentBySession={undatedPaymentBySession}
                    schedule={student.groupId ? scheduleByGroup[student.groupId] : undefined}
                    teachers={teachers}
                    currentUserId={currentUserId}
                    canSetLegacyBoundary={currentRole === "DIRECTOR" || currentRole === "SECRETARY"}
                    canMarkPaymentDate={["DIRECTOR", "SECRETARY"].includes(currentRole)}
                    onUpdateLesson={onUpdateLesson}
                    onAddLesson={onAddLesson}
                    onCloseSession={onCloseSession}
                    onNewSession={onNewSession}
                    onDeleteLesson={onDeleteLesson}
                    onMarkPaymentDate={onMarkPaymentDate}
                    onRenumberSession={onRenumberSession}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Arrêt */}
          {!searchActive && stoppedStudents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-red-200" />
                <span className="text-xs font-medium text-red-500">Arrêt définitif ({stoppedStudents.length})</span>
                <div className="h-px flex-1 bg-red-200" />
              </div>
              {stoppedStudents.map((student) => (
                <div key={student.id} className="opacity-50">
                  <StudentCahier
                    student={student}
                    sessions={getStudentSessions(student.id)}
                    paidBySession={paidBySession}
                    undatedPaymentBySession={undatedPaymentBySession}
                    schedule={student.groupId ? scheduleByGroup[student.groupId] : undefined}
                    teachers={teachers}
                    currentUserId={currentUserId}
                    canSetLegacyBoundary={currentRole === "DIRECTOR" || currentRole === "SECRETARY"}
                    canMarkPaymentDate={["DIRECTOR", "SECRETARY"].includes(currentRole)}
                    onUpdateLesson={onUpdateLesson}
                    onAddLesson={onAddLesson}
                    onCloseSession={onCloseSession}
                    onNewSession={onNewSession}
                    onDeleteLesson={onDeleteLesson}
                    onMarkPaymentDate={onMarkPaymentDate}
                    onRenumberSession={onRenumberSession}
                  />
                </div>
              ))}
            </div>
          )}

          {visibleTeacherStudents.length === 0 && (
            <p className="text-sm text-gray-400 italic">
              {showSessionsWithoutPaymentDate ? "Aucune session à vérifier pour ce professeur" : "Aucun élève assigné"}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TeachersClient({
  teachers: initialTeachers,
  students,
  lessonSessions,
  paidBySession: initialPaidBySession,
  undatedPaymentBySession: initialUndatedPaymentBySession,
  scheduleByGroup,
  currentUserId,
  currentRole,
}: {
  teachers: Teacher[]
  students: Student[]
  lessonSessions: LessonSession[]
  paidBySession: Record<string, string>
  undatedPaymentBySession: Record<string, boolean>
  scheduleByGroup: Record<string, Slot[]>
  currentUserId: string
  currentRole: string
}) {
  const [teachers, setTeachers] = useState(initialTeachers)
  const [sessions, setSessions] = useState<LessonSession[]>(lessonSessions)
  const [paidBySession, setPaidBySession] = useState(initialPaidBySession)
  const [undatedPaymentBySession, setUndatedPaymentBySession] = useState(initialUndatedPaymentBySession)
  const [showSessionsWithoutPaymentDate, setShowSessionsWithoutPaymentDate] = useState(false)
  const [search, setSearch] = useState("")

  const totalStudents = teachers.reduce(
    (sum, t) => sum + t.teacherGroups.reduce((s, g) => s + g.students.filter(st => st.status === "ACTIVE").length, 0), 0
  )
  const sessionsWithoutPaymentDate = latestSessionsWithoutPaymentDate(sessions, paidBySession).length

  async function reload() {
    const res = await fetch("/api/teachers")
    if (res.ok) setTeachers(await res.json())
  }

  function getTeacherStudents(teacherId: string) {
    return students.filter((student) =>
      student.group?.teacherId === teacherId ||
      sessions.some((session) => session.teacher.id === teacherId && session.student.id === student.id)
    )
  }

  function getTeacherSessions(teacherId: string) {
    return sessions.filter(s => s.teacher.id === teacherId)
  }

  async function handleUpdateLesson(lessonId: string, data: Partial<Lesson>) {
    const res = await fetch(`/api/lessons/${lessonId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    if (!res.ok) return
    const updatedLesson = await res.json()
    setSessions((prev) => applyLessonUpdate(prev, lessonId, updatedLesson))
  }

  async function handleAddLesson(sessionId: string) {
    const res = await fetch(`/api/sessions/${sessionId}/lessons`, { method: "POST" })
    const newLesson = await res.json()
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, lessons: [...s.lessons, newLesson] } : s))
  }

  async function handleDeleteLesson(lessonId: string) {
    await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" })
    setSessions((prev) => prev.map((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== lessonId) })))
  }

  async function handleCloseSession(sessionId: string) {
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isComplete: true, requestPayment: true }),
    })
    if (!res.ok) return
    const data = await res.json()
    const { nextSession, ...updatedSession } = data as LessonSession & { nextSession?: LessonSession }
    setSessions((prev) => {
      const withoutNext = nextSession ? prev.filter((s) => s.id !== nextSession.id) : prev
      const mapped = withoutNext.map((s) => s.id === sessionId ? { ...s, ...updatedSession } : s)
      return nextSession ? [...mapped, nextSession] : mapped
    })
    if (nextSession) {
      setUndatedPaymentBySession((prev) => ({
        ...prev,
        [`${nextSession.student.id}:${nextSession.number}`]: true,
      }))
    }
  }

  async function handleNewSession(studentId: string, subject: string, teacherId: string, lessonCount: number, frequency: number | null, duration: string | null) {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, subject, teacherId, lessonCount, frequency, duration }),
    })
    if (!res.ok) return null
    const newSession = await res.json()
    setSessions((prev) => [...prev, newSession])
    return newSession.id ?? null
  }

  // Garantit qu'un élève a bien un cours (session + Cours N) pour marquer sa présence
  // dans une classe fusionnée. Crée la session et/ou les cours manquants, renvoie l'id du cours.
  async function handleEnsureLesson(
    studentId: string, subject: string, teacherId: string, sessionNumber: number,
    lessonNumber: number, frequency: number | null, duration: string | null, lessonCount: number,
  ): Promise<string | null> {
    let target = sessions.find((s) => s.student.id === studentId && s.number === sessionNumber && s.subject === subject)
    if (!target) {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, subject, teacherId, number: sessionNumber, frequency, duration, lessonCount: Math.max(lessonCount, lessonNumber) }),
      })
      if (!res.ok) return null
      target = await res.json()
      const created = target!
      setSessions((prev) => (prev.some((s) => s.id === created.id) ? prev : [...prev, created]))
    }
    let current = target!
    let lesson = current.lessons.find((l) => l.number === lessonNumber)
    while (!lesson) {
      const res = await fetch(`/api/sessions/${current.id}/lessons`, { method: "POST" })
      if (!res.ok) return null
      const newLesson = await res.json()
      current = { ...current, lessons: [...current.lessons, newLesson] }
      const snapshot = current
      setSessions((prev) => prev.map((s) => (s.id === snapshot.id ? snapshot : s)))
      if (newLesson.number >= lessonNumber) {
        lesson = current.lessons.find((l) => l.number === lessonNumber)
        break
      }
    }
    return lesson?.id ?? null
  }

  async function handleMarkPaymentDate(session: LessonSession, paidDate: string) {
    const res = await fetch(`/api/sessions/${session.id}/payment-date`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paidDate }),
    })
    if (!res.ok) return false
    const data = await res.json()
    const key = `${session.student.id}:${session.number}`
    setPaidBySession((prev) => ({ ...prev, [key]: data.paidDate }))
    setUndatedPaymentBySession((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    return true
  }

  // Renumérote une session (directeur/secrétaire). Le rechargement de page (côté appelant)
  // rafraîchit paidBySession/undatedPaymentBySession, mis à jour côté serveur en cascade.
  async function handleRenumberSession(sessionId: string, newNumber: number): Promise<string | null> {
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: newNumber }),
    })
    if (res.ok) return null
    const err = await res.json().catch(() => null)
    return err?.error ?? "La renumérotation a échoué."
  }

  async function handleUpdateRates(teacherId: string, ratesData: { individualRate?: number; binomeRate?: number; groupRate?: number }) {
    await fetch("/api/teachers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherId, ...ratesData }) })
    setTeachers((prev) => prev.map((t) => t.id === teacherId ? { ...t, ...ratesData } : t))
  }

  const teachersList = teachers.map(t => ({ id: t.id, name: t.name }))

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Professeurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {teachers.length} professeur{teachers.length > 1 ? "s" : ""} · {totalStudents} élèves au total
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-5 grid gap-3 sm:mb-6 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-500">Professeurs</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{teachers.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-500">Classes actives</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {teachers.reduce((sum, t) => sum + t.teacherGroups.length, 0)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-medium text-gray-500">Élèves encadrés</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
        </div>
      </div>

      {/* Add member */}
      <div className="mb-4">
        <AddMemberForm onAdded={reload} canAddSecretary={currentRole === "DIRECTOR"} />
      </div>

      {currentRole === "DIRECTOR" && (
        <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <input
            type="checkbox"
            checked={showSessionsWithoutPaymentDate}
            onChange={(e) => setShowSessionsWithoutPaymentDate(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
          />
          <span>
            <span className="block font-semibold">Afficher les sessions sans date de paiement</span>
            <span className="block text-xs text-amber-700">
              {sessionsWithoutPaymentDate} session{sessionsWithoutPaymentDate > 1 ? "s" : ""} à vérifier
            </span>
          </span>
        </label>
      )}

      {/* Recherche élève */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un élève (nom)…"
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Effacer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Teacher list */}
      {teachers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500">Aucun professeur enregistré</p>
        </div>
      ) : (() => {
        const q = search.trim().toLowerCase()
        const shownTeachers = q
          ? teachers.filter((t) =>
              getTeacherStudents(t.id).some((s) =>
                `${s.firstName} ${s.lastName} ${s.displayName ?? ""}`.toLowerCase().includes(q)
              )
            )
          : teachers
        if (shownTeachers.length === 0) {
          return (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-gray-500">Aucun élève ne correspond à « {search} ».</p>
            </div>
          )
        }
        return (
        <div className="space-y-3">
          {shownTeachers.map((teacher) => (
            <TeacherCard
              key={teacher.id}
              teacher={teacher}
              teacherStudents={getTeacherStudents(teacher.id)}
              sessions={getTeacherSessions(teacher.id)}
              paidBySession={paidBySession}
              undatedPaymentBySession={undatedPaymentBySession}
              scheduleByGroup={scheduleByGroup}
              teachers={teachersList}
              currentUserId={currentUserId}
              currentRole={currentRole}
              showSessionsWithoutPaymentDate={showSessionsWithoutPaymentDate}
              studentSearch={search}
              onUpdateLesson={handleUpdateLesson}
              onAddLesson={handleAddLesson}
              onCloseSession={handleCloseSession}
              onNewSession={handleNewSession}
              onDeleteLesson={handleDeleteLesson}
              onMarkPaymentDate={handleMarkPaymentDate}
              onEnsureLesson={handleEnsureLesson}
              onRenumberSession={handleRenumberSession}
              onUpdateRates={handleUpdateRates}
            />
          ))}
        </div>
        )
      })()}
    </div>
  )
}
