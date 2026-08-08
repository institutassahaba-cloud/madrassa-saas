"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightLeft, Archive, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatTransferDate, type SessionTransferView } from "@/lib/teacher-transfer-view"

/**
 * Le trait tiré sous le dernier cours de l'ancien professeur. Le texte s'adapte
 * à qui regarde : l'ancien voit la fin de son suivi, le nouveau voit d'où il
 * reprend, la direction voit les deux noms.
 */
export function TransferDivider({
  transfer,
  viewerTeacherId,
  scope = "student",
}: {
  transfer: SessionTransferView
  viewerTeacherId?: string | null
  /** « class » dans le tableau fusionné d'un binôme/groupe : toute la classe a suivi. */
  scope?: "student" | "class"
}) {
  const date = formatTransferDate(transfer.transferredAt)
  const resumesAt = transfer.boundaryLessonNumber + 1
  const moved = scope === "class" ? "Classe transférée" : "Élève transféré"
  const message = viewerTeacherId === transfer.fromTeacherId
    ? `${moved} à ${transfer.toTeacherName} le ${date} — fin de votre suivi après le cours ${transfer.boundaryLessonNumber}`
    : viewerTeacherId === transfer.toTeacherId
      ? `Cours 1 à ${transfer.boundaryLessonNumber} assurés par ${transfer.fromTeacherName} — vous reprenez au cours ${resumesAt}`
      : `Changement de professeur le ${date} : ${transfer.fromTeacherName} → ${transfer.toTeacherName} (à partir du cours ${resumesAt})`

  return (
    <div className="flex items-center gap-2 py-1" role="separator">
      <div className="h-0.5 flex-1 rounded bg-purple-300" />
      <span className="flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-700">
        <ArrowRightLeft className="h-3 w-3 shrink-0" />
        {message}
      </span>
      <div className="h-0.5 flex-1 rounded bg-purple-300" />
    </div>
  )
}

/** Bandeau en tête de la copie d'un ancien professeur (lecture seule). */
export function FormerTeacherBanner({
  transfer,
  scope = "student",
}: {
  transfer: SessionTransferView
  /** « class » dans le tableau fusionné d'un binôme/groupe : toute la classe a suivi. */
  scope?: "student" | "class"
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
      transfer.archived ? "border-gray-200 bg-gray-50 text-gray-500" : "border-purple-200 bg-purple-50 text-purple-700"
    }`}>
      {transfer.archived ? <Archive className="h-3.5 w-3.5 shrink-0" /> : <Lock className="h-3.5 w-3.5 shrink-0" />}
      <span>
        {transfer.archived ? "Archivé — " : ""}
        Cours assurés par <span className="font-semibold">{transfer.fromTeacherName}</span> jusqu&apos;au cours{" "}
        {transfer.boundaryLessonNumber}, puis {scope === "class" ? "classe transférée" : "élève transféré"} à{" "}
        <span className="font-semibold">{transfer.toTeacherName}</span> le {formatTransferDate(transfer.transferredAt)}.
        {transfer.archived
          ? " Ces cours ont été payés : le tableau est conservé en lecture seule."
          : " Présences et absences ne sont plus modifiables par l'ancien professeur."}
      </span>
    </div>
  )
}

/**
 * Changement de professeur (directeur / secrétaire). Le transfert emporte TOUTE
 * la classe (individuel, binôme ou groupe). La borne est pré-remplie avec le
 * dernier cours validé : les cours d'avant restent à l'ancien professeur, les
 * suivants passent au nouveau.
 */
export function ChangeTeacherControl({
  sessionId,
  currentTeacherId,
  currentTeacherName,
  teachers,
  lessons,
  classStudentNames = [],
  onTransferred,
}: {
  sessionId: string
  currentTeacherId: string
  currentTeacherName: string
  teachers: { id: string; name: string }[]
  lessons: { number: number; status: string }[]
  /** Élèves emportés par le transfert : toute la classe suit le professeur. */
  classStudentNames?: string[]
  onTransferred?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [toTeacherId, setToTeacherId] = useState("")
  const lastTaught = lessons.reduce((max, lesson) => (lesson.status !== "PENDING" && lesson.number > max ? lesson.number : max), 0)
  const [boundary, setBoundary] = useState(String(lastTaught))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = teachers.filter((teacher) => teacher.id !== currentTeacherId)
  const maxNumber = lessons.reduce((max, lesson) => Math.max(max, lesson.number), 0)
  const boundaryChoices = Array.from({ length: maxNumber + 1 }, (_, index) => index)

  async function submit() {
    if (!toTeacherId) {
      setError("Choisissez le nouveau professeur.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toTeacherId, boundaryLessonNumber: Number(boundary) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Le changement de professeur a échoué.")
      setOpen(false)
      onTransferred?.()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Le changement de professeur a échoué.")
    } finally {
      setSaving(false)
    }
  }

  if (options.length === 0) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800"
        title="Confier cette classe à un autre professeur à partir du prochain cours"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
        Changer de professeur
      </button>
    )
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-purple-200 bg-purple-50 p-3">
      <p className="text-xs font-semibold text-purple-800">Changer de professeur</p>
      <p className="text-[11px] text-purple-700">
        {classStudentNames.length > 1 ? (
          <>Toute la classe suit le nouveau professeur : <span className="font-medium">{classStudentNames.join(", ")}</span>.</>
        ) : classStudentNames.length === 1 ? (
          <>Cours individuel : <span className="font-medium">{classStudentNames[0]}</span> suit le nouveau professeur.</>
        ) : (
          <>Le transfert emporte toute la classe : tous les élèves du même groupe et de la même matière.</>
        )}
      </p>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-purple-700">Nouveau professeur</label>
        <Select value={toTeacherId} onValueChange={setToTeacherId}>
          <SelectTrigger className="h-8 bg-white text-xs"><SelectValue placeholder="Choisir un professeur…" /></SelectTrigger>
          <SelectContent>
            {options.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-purple-700">Dernier cours assuré par {currentTeacherName}</label>
        <Select value={boundary} onValueChange={setBoundary}>
          <SelectTrigger className="h-8 bg-white text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {boundaryChoices.map((number) => (
              <SelectItem key={number} value={String(number)}>
                {number === 0 ? "Aucun cours assuré" : `Cours ${number}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-purple-600">
          Le trait est tiré sous ce cours : le nouveau professeur commence au cours {Number(boundary) + 1}.
        </p>
      </div>
      {error && <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 bg-purple-600 px-3 text-xs hover:bg-purple-700" disabled={saving} onClick={submit}>
          {saving ? "Transfert…" : "Transférer"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-3 text-xs" disabled={saving} onClick={() => { setOpen(false); setError(null) }}>
          Annuler
        </Button>
      </div>
    </div>
  )
}
