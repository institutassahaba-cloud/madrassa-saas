"use client"

import { useState } from "react"
import {
  BookOpen, Plus, ChevronDown, ChevronUp, Check, Clock,
  X, CheckCircle2, Search, Bell, MessageCircle, AlertTriangle,
} from "lucide-react"
import { whatsappLink } from "@/lib/phone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lesson {
  id: string
  number: number
  date: string | null
  status: string   // PENDING | PRESENT | ABSENT
  content: string | null
  duration: number | null       // durée réelle en minutes
  makeupMinutes: number | null  // minutes à rattraper
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
  paymentGraceAllowed: boolean
  status: string
  group: { name: string; teacherId: string | null } | null
}

interface Slot {
  id: string
  day: number
  start: string
  end: string
  teacherId: string
  teacherTimezone: string
}

interface Props {
  students: Student[]
  lessonSessions: LessonSession[]
  paidBySession: Record<string, string>
  scheduleByGroup: Record<string, Slot[]>
  teachers: { id: string; name: string }[]
  currentUserId: string
  role: string
  initialSearch?: string
}

const DAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
const DEFAULT_LESSON_COUNT = 8

// "1 cours de 1h par semaine", "2 cours de 30 min par semaine"
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SUBJECTS = ["Apprentissage du Coran", "Nouraniya", "Langue arabe", "Tajwid", "Fiqh", "Moutoun", "Autre"]

const STATUS_CYCLE: Record<string, string> = {
  PENDING: "PRESENT",
  PRESENT: "ABSENT",
  ABSENT: "PENDING",
}

const statusIcon = (s: string) => {
  if (s === "PRESENT") return <Check className="h-3.5 w-3.5 text-emerald-600" />
  if (s === "ABSENT")  return <X     className="h-3.5 w-3.5 text-red-500" />
  return                        <Clock className="h-3.5 w-3.5 text-gray-300" />
}

const statusBg = (s: string) => {
  if (s === "PRESENT") return "bg-emerald-50 border-emerald-200"
  if (s === "ABSENT")  return "bg-red-50 border-red-200"
  return "bg-gray-50 border-gray-200"
}

// ─── LessonRow ────────────────────────────────────────────────────────────────

function formatMins(m: number): string {
  if (m >= 60 && m % 60 === 0) return `${m / 60}h`
  if (m >= 60) return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, "0")}`
  return `${m} min`
}

function applyLessonUpdate(sessions: LessonSession[], lessonId: string, data: Partial<Lesson>) {
  const targetSession = sessions.find((session) => session.lessons.some((lesson) => lesson.id === lessonId))
  return sessions.map((session) => {
    const sameFollowUp = Boolean(
      data.legacyPayrollBoundary &&
      targetSession &&
      session.student.id === targetSession.student.id &&
      session.teacher.id === targetSession.teacher.id &&
      session.subject === targetSession.subject
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

function LessonRow({
  lesson, sessionDuration, siblingLessons, canSetLegacyBoundary, onUpdate, onDelete,
}: {
  lesson: Lesson
  sessionDuration: string | null
  siblingLessons: Lesson[]
  canSetLegacyBoundary: boolean
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

  // Future lessons in same session for makeup target
  const futureLessons = siblingLessons.filter(l => l.number > lesson.number)

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${statusBg(lesson.status)}`}>
      <button
        onClick={cycleStatus}
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white shadow-sm transition-shadow hover:shadow sm:h-7 sm:w-7"
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
          {lesson.status === "PRESENT" && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Présente</span>
          )}
          {lesson.status === "ABSENT" && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">Absente</span>
          )}
          {lesson.legacyPayrollBoundary && (
            <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">Ancien système</span>
          )}
          <button
            onClick={() => { if (confirm(`Supprimer le Cours ${lesson.number} ?`)) onDelete(lesson.id) }}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 sm:h-6 sm:w-6"
            title="Supprimer ce cours"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {canSetLegacyBoundary && (
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

        {/* Makeup reminder badge */}
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 flex-1 text-xs sm:h-7"
              />
              <div className="flex items-center gap-1 sm:w-auto">
                <Input
                  type="number"
                  min="5"
                  step="5"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  className="h-9 w-full text-xs sm:h-7 sm:w-20"
                  placeholder={expectedMin ? String(expectedMin) : "min"}
                />
                <span className="text-xs text-gray-400">min</span>
              </div>
            </div>
            <Input
              placeholder="Contenu du cours (ex: révision jusqu'à Annasr…)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="h-9 text-xs sm:h-7"
              onKeyDown={(e) => e.key === "Enter" && saveContent()}
              autoFocus
            />
            {/* Makeup option if course is shorter than expected */}
            {durationMin && expectedMin && parseInt(durationMin) < expectedMin && (
              <div className="rounded bg-amber-50 border border-amber-200 px-2 py-2 space-y-1">
                <p className="text-xs text-amber-700 font-medium">
                  {expectedMin - parseInt(durationMin)} min à rattraper
                </p>
                {futureLessons.length > 0 && (
                  <select
                    value={makeupOn}
                    onChange={(e) => setMakeupOn(e.target.value)}
                    className="h-6 rounded border border-amber-300 bg-white px-2 text-xs text-amber-800 w-full"
                  >
                    <option value="">Rattrapage non planifié</option>
                    {futureLessons.map(l => (
                      <option key={l.id} value={l.id}>Rattraper au Cours {l.number}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button size="sm" className="h-8 text-xs sm:h-6 sm:px-2" onClick={saveContent}>Enregistrer</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs sm:h-6 sm:px-2" onClick={() => setEditing(false)}>Annuler</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="mt-1 block min-h-8 w-full rounded-md text-left text-xs text-gray-600 hover:text-gray-900"
          >
            {lesson.content
              ? <span className="italic">{lesson.content}</span>
              : <span className="text-gray-300">Cliquer pour ajouter le contenu…</span>}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── SessionCard ──────────────────────────────────────────────────────────────

function SessionCard({
  session,
  paidAt,
  canSetLegacyBoundary,
  onUpdateLesson,
  onAddLesson,
  onCloseSession,
  onDeleteLesson,
}: {
  session: LessonSession
  paidAt?: string | null
  canSetLegacyBoundary: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onDeleteLesson: (lessonId: string) => void
}) {
  const [open, setOpen] = useState(!session.isComplete)
  const [notes, setNotes] = useState(session.notes ?? "")
  const [editingNotes, setEditingNotes] = useState(false)

  const done    = session.lessons.filter((l) => l.status !== "PENDING").length
  const total   = session.lessons.length
  const present = session.lessons.filter((l) => l.status === "PRESENT").length
  const totalMakeup = session.lessons.reduce((sum, l) => sum + (l.makeupMinutes ?? 0), 0)
  const canRequestPayment = !paidAt
  // Le dernier cours de la session doit être validé (présent/absent) pour terminer.
  const lastLessonValidated = session.lessons.length > 0 &&
    session.lessons.reduce((a, b) => (b.number > a.number ? b : a)).status !== "PENDING"

  return (
    <div className={`rounded-xl border ${session.isComplete ? "border-gray-200 bg-gray-50 opacity-70" : "border-emerald-200 bg-white shadow-sm"}`}>
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 p-3 text-left sm:p-4"
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${session.isComplete ? "bg-gray-200 text-gray-500" : "bg-emerald-100 text-emerald-700"}`}>
          {session.number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">Session {session.number}</span>
            {session.isComplete && (
              <span className="flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                <CheckCircle2 className="h-3 w-3" /> Terminée
              </span>
            )}
            {paidAt && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Payé le {new Date(paidAt).toLocaleDateString("fr-FR")}
              </span>
            )}
            {!paidAt && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Session pas encore payée
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
            {session.duration && <span>{session.duration}</span>}
            {session.frequency && <span>{session.frequency}x/semaine</span>}
            <span>{done}/{total} cours · {present} présence{present > 1 ? "s" : ""}</span>
            {totalMakeup > 0 && (
              <span className="text-amber-600 font-medium">{formatMins(totalMakeup)} à rattraper</span>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="hidden w-24 sm:block">
          <div className="h-1.5 rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full bg-emerald-400 transition-all"
              style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }}
            />
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-gray-100 p-3 sm:p-4">
          {session.lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              sessionDuration={session.duration}
              siblingLessons={session.lessons}
              canSetLegacyBoundary={canSetLegacyBoundary}
              onUpdate={onUpdateLesson}
              onDelete={onDeleteLesson}
            />
          ))}

          {!session.isComplete && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed text-xs"
              onClick={() => onAddLesson(session.id)}
            >
              <Plus className="h-3 w-3" /> Ajouter un cours
            </Button>
          )}

          {/* Notes */}
          <div className="pt-1">
            {editingNotes ? (
              <div className="space-y-2">
                <Input
                  placeholder="Appréciation de session / Notes…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs"
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button size="sm" className="h-8 text-xs sm:h-6 sm:px-2" onClick={() => {
                    fetch(`/api/sessions/${session.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ notes }),
                    })
                    setEditingNotes(false)
                  }}>Enregistrer</Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs sm:h-6 sm:px-2" onClick={() => setEditingNotes(false)}>Annuler</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditingNotes(true)} className="text-xs text-gray-400 hover:text-gray-600 italic text-left w-full">
                {notes || "Ajouter une appréciation de session…"}
              </button>
            )}
          </div>

        </div>
      )}

      {/* Fin de session / demande de paiement — toujours visible (même carte repliée) */}
      {canRequestPayment && (
        <div className="border-t border-gray-100 p-3 sm:p-4">
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <Bell className="h-3.5 w-3.5" />
              {session.isComplete
                ? "Envoyer la demande de paiement à l'élève"
                : "Terminer la session et envoyer la demande de paiement à l'élève"}
            </div>
            <Button
              size="sm"
              className="h-8 bg-amber-500 px-3 text-xs text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-7"
              disabled={!session.isComplete && !lastLessonValidated}
              onClick={() => onCloseSession(session.id)}
              title={!session.isComplete && !lastLessonValidated ? "Validez la présence/absence du dernier cours pour activer" : "Envoie la demande de paiement à l'élève"}
            >
              {session.isComplete ? "Envoyer la demande" : "Terminer et envoyer"}
            </Button>
          </div>
          {!session.isComplete && !lastLessonValidated && (
            <p className="mt-1 text-[11px] text-gray-400">Validez le dernier cours (présent/absent) pour activer l&apos;envoi.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── StudentCahier ────────────────────────────────────────────────────────────

function StudentCahier({
  student,
  sessions,
  paidBySession,
  schedule,
  teachers,
  currentUserId,
  canSetLegacyBoundary,
  onUpdateLesson,
  onAddLesson,
  onCloseSession,
  onNewSession,
  onDeleteLesson,
}: {
  student: Student
  sessions: LessonSession[]
  paidBySession: Record<string, string>
  schedule: Slot[] | undefined
  teachers: { id: string; name: string }[]
  currentUserId: string
  canSetLegacyBoundary: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onNewSession: (studentId: string, subject: string, teacherId: string, lessonCount: number, frequency: number | null, duration: string | null) => Promise<string | null>
  onDeleteLesson: (lessonId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [newSubject, setNewSubject] = useState("")
  const [newTeacher, setNewTeacher] = useState(currentUserId)
  const [newLessonCount, setNewLessonCount] = useState(String(DEFAULT_LESSON_COUNT))
  const [choosingSessionModel, setChoosingSessionModel] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creationError, setCreationError] = useState<string | null>(null)

  // Sessions triées de la plus récente à la plus ancienne, navigation par onglets.
  const sortedSessions = [...sessions].sort((a, b) => b.number - a.number)
  const selected =
    sortedSessions.find((s) => s.id === selectedId) ??
    sortedSessions.find((s) => !s.isComplete) ??
    sortedSessions[0]
  const name = student.displayName || `${student.firstName} ${student.lastName}`.trim()
  const forfait  = formatForfait(student.lessonsPerWeek, student.duration)
  const planning = schedule && schedule.length > 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm sm:rounded-2xl">
      {/* Student header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 p-4 text-left sm:items-center sm:gap-4 sm:p-5"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 sm:h-10 sm:w-10">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{name}</p>
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
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-gray-700 hover:bg-emerald-100"
                title="Modifier ce créneau dans le planning"
              >
                <Clock className="h-3 w-3 text-emerald-600" />
                🇫🇷 {scheduleLabel(slot)}
              </a>
            ))}
            {student.paymentGraceAllowed && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                Cours autorisé malgré paiement
              </span>
            )}
          </div>
        </div>
        {sessions.length === 0 && (
          <span className="text-xs text-gray-300 italic">Aucun cours</span>
        )}
        {open ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>

      {(student.phone || student.parentPhone) && (
        <div className="-mt-1 flex flex-wrap items-center gap-2 px-4 pb-4 sm:-mt-2 sm:px-5">
          {[
            { label: "Élève", num: student.phone },
            { label: "Parent", num: student.parentPhone },
          ].map(({ label, num }) => {
            const wa = whatsappLink(num)
            if (!wa) return null
            return (
              <a
                key={label}
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {label} · {num}
              </a>
            )
          })}
        </div>
      )}

      {open && (
        <div className="space-y-4 border-t border-gray-100 p-4 sm:p-5">
          {/* Onglets de sessions (de la plus récente à la plus ancienne) */}
          {sortedSessions.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {sortedSessions.map((s) => {
                const isSel = selected?.id === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={
                      "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:py-1.5 " +
                      (isSel
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200")
                    }
                    title={s.isComplete ? "Session terminée" : "Session en cours"}
                  >
                    Session {s.number}
                  </button>
                )
              })}
            </div>
          )}

          {/* Session sélectionnée */}
          {selected && (
            <SessionCard
              key={selected.id}
              session={selected}
              paidAt={paidBySession[`${student.id}:${selected.number}`]}
              canSetLegacyBoundary={canSetLegacyBoundary}
              onUpdateLesson={onUpdateLesson}
              onAddLesson={onAddLesson}
              onCloseSession={onCloseSession}
              onDeleteLesson={onDeleteLesson}
            />
          )}

          {/* New session choice / form */}
          {choosingSessionModel ? (
            <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4 space-y-3">
              <p className="text-sm font-medium text-emerald-700">Choisir le type de session</p>
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
                  className="h-auto justify-start border-emerald-200 bg-white px-3 py-3 text-left"
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
                  className="h-auto justify-start border-emerald-200 bg-white px-3 py-3 text-left"
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
            <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4 space-y-3">
              <p className="text-sm font-medium text-emerald-700">Nouvelle session</p>
              <Select value={newSubject} onValueChange={setNewSubject}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Choisir la matière…" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {teachers.length > 1 && (
                <Select value={newTeacher} onValueChange={setNewTeacher}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Professeur…" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="space-y-1">
                <label className="text-xs font-medium text-emerald-700" htmlFor={`lesson-count-${student.id}`}>
                  Nombre de cours
                </label>
                <Input
                  id={`lesson-count-${student.id}`}
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
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  size="sm"
                  disabled={!newSubject || !newLessonCount}
                  onClick={async () => {
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
                  }}
                >
                  Créer
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setCreating(false)
                  setCreationError(null)
                }}>Annuler</Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => {
                setCreationError(null)
                setChoosingSessionModel(true)
              }}
            >
              <Plus className="h-4 w-4" /> Nouvelle session
            </Button>
          )}

        </div>
      )}
    </div>
  )
}

// ─── Classe fusionnée (binôme / groupe) ───────────────────────────────────────
// Plusieurs élèves d'un même groupe partagent UN seul tableau de sessions.
// Le contenu/date/durée d'un cours est commun ; seule la présence est par élève.
// Le paiement est affiché par élève (chacun garde son propre suivi).

function shortName(student: Student) {
  return (student.displayName || student.firstName || student.lastName || "?").trim()
}

// Une ligne « Cours N » dans le tableau de classe : contenu partagé + un rond de présence par élève.
function MergedLessonRow({
  lessonNumber, cells, sessionDuration, canSetLegacyBoundary, onToggleStatus, onEnsureStatus, onSaveShared, onToggleLegacy, onDelete,
}: {
  lessonNumber: number
  cells: { student: Student; lesson: Lesson | undefined }[]
  sessionDuration: string | null
  canSetLegacyBoundary: boolean
  onToggleStatus: (lessonId: string, current: string) => void
  onEnsureStatus: (studentId: string) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSaveShared: (data: any) => void
  onToggleLegacy: (checked: boolean) => void
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

  function saveShared() {
    const dur = durationMin ? parseInt(durationMin) : null
    const makeup = dur != null && expectedMin != null && expectedMin > dur ? expectedMin - dur : null
    onSaveShared({ content, date: date || undefined, duration: dur, makeupMinutes: makeup })
    setEditing(false)
  }

  return (
    <div className={`rounded-lg border p-3 ${ref ? statusBg(ref.status) : "bg-gray-50 border-gray-200"}`}>
      <div className="flex items-start gap-3">
        {/* Ronds de présence : un par élève */}
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

          {canSetLegacyBoundary && (
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
              <input
                type="checkbox"
                checked={anyLegacy}
                onChange={(e) => onToggleLegacy(e.target.checked)}
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

// Carte d'une session (numéro N) partagée par la classe.
function MergedSessionCard({
  sessionNumber, students, sessionByStudent, paidBySession, sessionDuration, canSetLegacyBoundary,
  onUpdateLesson, onAddLesson, onCloseSession, onDeleteLesson, onEnsureLesson,
}: {
  sessionNumber: number
  students: Student[]
  sessionByStudent: Map<string, LessonSession>
  paidBySession: Record<string, string>
  sessionDuration: string | null
  canSetLegacyBoundary: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onDeleteLesson: (lessonId: string) => void
  onEnsureLesson: (studentId: string, subject: string, teacherId: string, sessionNumber: number, lessonNumber: number, frequency: number | null, duration: string | null, lessonCount: number) => Promise<string | null>
}) {
  const sessions = students.map((st) => sessionByStudent.get(st.id)).filter(Boolean) as LessonSession[]
  const allComplete = sessions.length > 0 && sessions.every((s) => s.isComplete)
  const template = sessions[0]

  // Union des numéros de cours présents chez au moins un élève.
  const lessonNumbers = Array.from(
    new Set(sessions.flatMap((s) => s.lessons.map((l) => l.number)))
  ).sort((a, b) => a - b)

  function lessonsForNumber(num: number) {
    return students.map((student) => ({
      student,
      lesson: sessionByStudent.get(student.id)?.lessons.find((l) => l.number === num),
    }))
  }

  // Case vide (élève sans cours pour ce numéro) → crée le cours manquant puis marque présent.
  async function ensureAndPresent(studentId: string, lessonNumber: number) {
    if (!template) return
    const lessonId = await onEnsureLesson(
      studentId, template.subject, template.teacher.id, sessionNumber, lessonNumber,
      template.frequency, template.duration, Math.max(lessonNumbers.length, lessonNumber),
    )
    if (lessonId) onUpdateLesson(lessonId, { status: "PRESENT" })
  }

  // Demande de paiement pour toute la classe : cible les élèves non encore payés
  // (termine leur session si besoin, puis envoie l'email de demande à chacun).
  const unpaidSessions = sessions.filter((s) => !paidBySession[`${s.student.id}:${sessionNumber}`])
  const anyIncomplete = sessions.some((s) => !s.isComplete)
  // Le dernier cours de la session doit être validé (présent/absent) pour tous les élèves.
  const lastLessonValidated = sessions.length > 0 && sessions.every((s) => {
    if (s.lessons.length === 0) return false
    const last = s.lessons.reduce((a, b) => (b.number > a.number ? b : a))
    return last.status !== "PENDING"
  })
  function requestPaymentForClass() {
    if (unpaidSessions.length === 0) return
    if (!confirm(`${anyIncomplete ? "Terminer la Session" : "Envoyer la demande de paiement de la Session"} ${sessionNumber} pour la classe (${students.map(shortName).join(", ")}) ?`)) return
    unpaidSessions.forEach((s) => onCloseSession(s.id))
  }

  return (
    <div className={`rounded-xl border ${allComplete ? "border-gray-200 bg-gray-50" : "border-emerald-200 bg-white shadow-sm"}`}>
      <div className="flex items-center gap-3 border-b border-gray-100 p-4">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${allComplete ? "bg-gray-200 text-gray-500" : "bg-emerald-100 text-emerald-700"}`}>
          {sessionNumber}
        </div>
        <span className="font-semibold text-gray-900">Session {sessionNumber}</span>
        {allComplete && (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">Terminée</span>
        )}
      </div>

      <div className="space-y-3 p-4">
        {/* Cours partagés */}
        {lessonNumbers.map((num) => {
          const cells = lessonsForNumber(num)
          return (
            <MergedLessonRow
              key={num}
              lessonNumber={num}
              cells={cells}
              sessionDuration={sessionDuration}
              canSetLegacyBoundary={canSetLegacyBoundary}
              onToggleStatus={(lessonId, current) => onUpdateLesson(lessonId, { status: STATUS_CYCLE[current] ?? "PENDING" })}
              onEnsureStatus={(studentId) => ensureAndPresent(studentId, num)}
              onSaveShared={(data) => cells.forEach((c) => c.lesson && onUpdateLesson(c.lesson.id, data))}
              onToggleLegacy={(checked) => cells.forEach((c) => c.lesson && onUpdateLesson(c.lesson.id, { legacyPayrollBoundary: checked }))}
              onDelete={() => cells.forEach((c) => c.lesson && onDeleteLesson(c.lesson.id))}
            />
          )
        })}

        {!allComplete && (
          <Button
            variant="ghost"
            className="w-full border border-dashed border-gray-200 text-gray-500 hover:text-gray-700"
            onClick={() => sessions.forEach((s) => { if (!s.isComplete) onAddLesson(s.id) })}
          >
            <Plus className="h-4 w-4" /> Ajouter un cours à la classe
          </Button>
        )}

        {/* Paiement par élève */}
        <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-500">Paiement par élève</p>
          {students.map((student) => {
            const paidAt = paidBySession[`${student.id}:${sessionNumber}`]
            const session = sessionByStudent.get(student.id)
            return (
              <div key={student.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-gray-700">{shortName(student)}</span>
                {paidAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> Payé le {new Date(paidAt).toLocaleDateString("fr-FR")}
                  </span>
                ) : session ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> Pas encore payé
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 italic">Pas de session</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Fin de session / demande de paiement pour toute la classe */}
        {sessions.length > 0 && (
          <Button
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={unpaidSessions.length === 0 || (anyIncomplete && !lastLessonValidated)}
            onClick={requestPaymentForClass}
            title={
              unpaidSessions.length === 0
                ? "Tous les élèves ont déjà payé cette session"
                : !lastLessonValidated
                  ? "Validez la présence/absence du dernier cours pour activer"
                  : "Termine la session et envoie la demande de paiement aux élèves non payés"
            }
          >
            <Bell className="h-4 w-4" /> {anyIncomplete ? "Terminer la session et prévenir les élèves" : "Envoyer la demande de paiement à la classe"}
          </Button>
        )}
        {sessions.length > 0 && !lastLessonValidated && (
          <p className="text-center text-[11px] text-gray-400">Validez le dernier cours (présent/absent) pour activer l&apos;envoi.</p>
        )}
      </div>
    </div>
  )
}

function GroupCahier({
  groupName, students, sessionsByStudent, paidBySession, schedule, canSetLegacyBoundary,
  onUpdateLesson, onAddLesson, onCloseSession, onNewSession, onDeleteLesson, onEnsureLesson,
}: {
  groupName: string
  students: Student[]
  sessionsByStudent: Map<string, LessonSession[]>
  paidBySession: Record<string, string>
  schedule: Slot[] | undefined
  canSetLegacyBoundary: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateLesson: (lessonId: string, data: any) => void
  onAddLesson: (sessionId: string) => void
  onCloseSession: (sessionId: string) => void
  onNewSession: (studentId: string, subject: string, teacherId: string, lessonCount: number, frequency: number | null, duration: string | null) => Promise<string | null>
  onDeleteLesson: (lessonId: string) => void
  onEnsureLesson: (studentId: string, subject: string, teacherId: string, sessionNumber: number, lessonNumber: number, frequency: number | null, duration: string | null, lessonCount: number) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)

  const allSessions = students.flatMap((st) => sessionsByStudent.get(st.id) ?? [])
  const numbers = Array.from(new Set(allSessions.map((s) => s.number))).sort((a, b) => b - a)
  // Session par défaut : la première non terminée (numéro le plus bas), sinon la plus récente.
  const incompleteNums = allSessions.filter((s) => !s.isComplete).map((s) => s.number)
  const defaultNumber = incompleteNums.length > 0 ? Math.min(...incompleteNums) : numbers[0]
  const selNum = selectedNumber != null && numbers.includes(selectedNumber) ? selectedNumber : defaultNumber

  // Nouvelle session pour toute la classe : réplique le modèle de la dernière session.
  const maxNumber = numbers[0]
  async function createSessionForClass() {
    setCreatingSession(true)
    const tmpl = students.map((st) => (sessionsByStudent.get(st.id) ?? []).find((s) => s.number === maxNumber)).find(Boolean)
      ?? allSessions.find((s) => s.number === maxNumber)
    if (tmpl) {
      const count = tmpl.lessons.length || DEFAULT_LESSON_COUNT
      for (const st of students) {
        await onNewSession(st.id, tmpl.subject, tmpl.teacher.id, count, tmpl.frequency, tmpl.duration)
      }
      setSelectedNumber(maxNumber + 1)
    }
    setCreatingSession(false)
  }

  // Map élève -> sa session pour le numéro sélectionné.
  const sessionByStudent = new Map<string, LessonSession>()
  for (const st of students) {
    const s = (sessionsByStudent.get(st.id) ?? []).find((x) => x.number === selNum)
    if (s) sessionByStudent.set(st.id, s)
  }
  const sessionDuration = allSessions.find((s) => s.number === selNum)?.duration ?? null
  const subjectLabel = allSessions.find((s) => s.number === selNum)?.subject ?? null
  const planning = schedule && schedule.length > 0

  return (
    <div className="rounded-xl border border-emerald-200 bg-white shadow-sm sm:rounded-2xl">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left sm:items-center sm:gap-4 sm:p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 sm:h-10 sm:w-10">
          {students.length}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">{groupName}</p>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {students.length === 2 ? "Binôme" : `Classe de ${students.length}`}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-400">{students.map(shortName).join(" · ")}</p>
          {planning && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {schedule?.map((slot) => (
                <a key={slot.id} href={`/dashboard/schedule?teacherId=${slot.teacherId}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-gray-700 hover:bg-emerald-100" title="Modifier ce créneau dans le planning">
                  <Clock className="h-3 w-3 text-emerald-600" /> 🇫🇷 {scheduleLabel(slot)}
                </a>
              ))}
            </div>
          )}
        </div>
        {allSessions.length === 0 && <span className="text-xs text-gray-300 italic">Aucun cours</span>}
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 p-4 sm:p-5">
          {numbers.length > 0 ? (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {numbers.map((num) => {
                  const isSel = selNum === num
                  return (
                    <button
                      key={num}
                      onClick={() => setSelectedNumber(num)}
                      className={"shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:py-1.5 " + (isSel ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
                    >
                      Session {num}
                    </button>
                  )
                })}
              </div>
              {subjectLabel && <p className="text-xs text-gray-400">Matière : {subjectLabel}</p>}
              <MergedSessionCard
                key={selNum}
                sessionNumber={selNum}
                students={students}
                sessionByStudent={sessionByStudent}
                paidBySession={paidBySession}
                sessionDuration={sessionDuration}
                canSetLegacyBoundary={canSetLegacyBoundary}
                onUpdateLesson={onUpdateLesson}
                onAddLesson={onAddLesson}
                onCloseSession={onCloseSession}
                onDeleteLesson={onDeleteLesson}
                onEnsureLesson={onEnsureLesson}
              />
              <Button
                variant="outline"
                className="w-full border-dashed"
                disabled={creatingSession}
                onClick={createSessionForClass}
              >
                <Plus className="h-4 w-4" /> {creatingSession ? "Création…" : "Nouvelle session pour la classe"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-gray-400">Aucune session pour cette classe.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main CahierClient ────────────────────────────────────────────────────────

export function CahierClient({ students, lessonSessions, paidBySession, scheduleByGroup, teachers, currentUserId, role, initialSearch = "" }: Props) {
  const [sessions, setSessions]   = useState<LessonSession[]>(lessonSessions)
  const [search, setSearch]       = useState(initialSearch)
  const [subjectFilter, setSubjectFilter] = useState("ALL")
  const [teacherFilter, setTeacherFilter] = useState("ALL")
  const canSetLegacyBoundary = role === "DIRECTOR" || role === "SECRETARY"

  const filteredStudents = students.filter((s) => {
    const name = `${s.displayName ?? ""} ${s.firstName} ${s.lastName}`.toLowerCase()
    if (!name.includes(search.toLowerCase())) return false
    if (
      teacherFilter !== "ALL" &&
      s.group?.teacherId !== teacherFilter &&
      !sessions.some((session) => session.teacher.id === teacherFilter && session.student.id === s.id)
    ) return false
    return true
  })

  const activeStudents  = filteredStudents.filter((s) => s.status === "ACTIVE")
  const pausedStudents  = filteredStudents.filter((s) => s.status === "PAUSED")
  const stoppedStudents = filteredStudents.filter((s) => s.status === "STOPPED")

  function getStudentSessions(studentId: string) {
    let s = sessions.filter((s) => s.student.id === studentId)
    if (subjectFilter !== "ALL") s = s.filter((s) => s.subject === subjectFilter)
    return s
  }

  async function handleUpdateLesson(lessonId: string, data: Partial<Lesson>) {
    await fetch(`/api/lessons/${lessonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    setSessions((prev) =>
      applyLessonUpdate(prev, lessonId, data)
    )
  }

  async function handleAddLesson(sessionId: string) {
    const res = await fetch(`/api/sessions/${sessionId}/lessons`, { method: "POST" })
    const newLesson = await res.json()
    setSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, lessons: [...s.lessons, newLesson] } : s)
    )
  }

  async function handleDeleteLesson(lessonId: string) {
    await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" })
    setSessions((prev) =>
      prev.map((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== lessonId) }))
    )
  }

  async function handleCloseSession(sessionId: string) {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isComplete: true, requestPayment: true }),
    })
    setSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, isComplete: true } : s)
    )
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

  // Garantit qu'un élève a bien un cours (session + Cours N) pour pouvoir marquer sa présence
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

  // All unique subjects across sessions
  const allSubjects = Array.from(new Set(sessions.map((s) => s.subject)))

  // Regroupe les élèves d'un même groupe (≥ 2) en une seule « classe » ; les autres restent solo.
  type Unit =
    | { type: "solo"; student: Student }
    | { type: "group"; groupId: string; students: Student[] }

  function buildUnits(list: Student[]): Unit[] {
    const counts = new Map<string, number>()
    for (const st of list) if (st.groupId) counts.set(st.groupId, (counts.get(st.groupId) ?? 0) + 1)
    const emitted = new Set<string>()
    const units: Unit[] = []
    for (const st of list) {
      if (st.groupId && (counts.get(st.groupId) ?? 0) >= 2) {
        if (emitted.has(st.groupId)) continue
        emitted.add(st.groupId)
        units.push({ type: "group", groupId: st.groupId, students: list.filter((x) => x.groupId === st.groupId) })
      } else {
        units.push({ type: "solo", student: st })
      }
    }
    return units
  }

  const unitKey = (u: Unit) => (u.type === "solo" ? u.student.id : `g:${u.groupId}`)

  function renderUnit(u: Unit) {
    if (u.type === "solo") {
      return (
        <StudentCahier
          key={u.student.id}
          student={u.student}
          sessions={getStudentSessions(u.student.id)}
          paidBySession={paidBySession}
          schedule={u.student.groupId ? scheduleByGroup[u.student.groupId] : undefined}
          teachers={teachers}
          currentUserId={currentUserId}
          canSetLegacyBoundary={canSetLegacyBoundary}
          onUpdateLesson={handleUpdateLesson}
          onAddLesson={handleAddLesson}
          onCloseSession={handleCloseSession}
          onNewSession={handleNewSession}
          onDeleteLesson={handleDeleteLesson}
        />
      )
    }
    const sessionsByStudent = new Map<string, LessonSession[]>()
    for (const st of u.students) sessionsByStudent.set(st.id, getStudentSessions(st.id))
    return (
      <GroupCahier
        key={`g:${u.groupId}`}
        groupName={u.students[0].group?.name ?? "Classe"}
        students={u.students}
        sessionsByStudent={sessionsByStudent}
        paidBySession={paidBySession}
        schedule={scheduleByGroup[u.groupId]}
        canSetLegacyBoundary={canSetLegacyBoundary}
        onUpdateLesson={handleUpdateLesson}
        onAddLesson={handleAddLesson}
        onCloseSession={handleCloseSession}
        onNewSession={handleNewSession}
        onDeleteLesson={handleDeleteLesson}
        onEnsureLesson={handleEnsureLesson}
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Cahier de cours</h1>
        <p className="text-sm text-gray-500 mt-0.5">Suivi séance par séance, contenu enseigné et présences</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Rechercher un élève…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {teachers.length > 1 && (
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Tous les profs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les profs</SelectItem>
              {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {allSubjects.length > 1 && (
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Toutes matières" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes matières</SelectItem>
              {allSubjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Student list */}
      {filteredStudents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-400">Aucun élève trouvé</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Actifs */}
          {activeStudents.length > 0 && (
            <div className="space-y-3">
              {buildUnits(activeStudents).map((u) => renderUnit(u))}
            </div>
          )}

          {/* En pause */}
          {pausedStudents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-amber-200" />
                <span className="text-xs font-medium text-amber-600">En pause ({pausedStudents.length})</span>
                <div className="h-px flex-1 bg-amber-200" />
              </div>
              {buildUnits(pausedStudents).map((u) => (
                <div key={unitKey(u)} className="opacity-70">
                  {renderUnit(u)}
                </div>
              ))}
            </div>
          )}

          {/* Arrêt définitif */}
          {stoppedStudents.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-red-200" />
                <span className="text-xs font-medium text-red-500">Arrêt définitif ({stoppedStudents.length})</span>
                <div className="h-px flex-1 bg-red-200" />
              </div>
              {buildUnits(stoppedStudents).map((u) => (
                <div key={unitKey(u)} className="opacity-50">
                  {renderUnit(u)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
