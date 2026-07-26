"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, BookOpenCheck, CheckCircle2, Clock3, Loader2, Save, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { PayrollCourseRow, TeacherPayrollData } from "@/lib/teacher-payroll"

type RowSelection = { first: string; last: string }
type SelectionMap = Record<string, RowSelection>

function currency(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value)
}

function lessonLabel(lesson: PayrollCourseRow["lessons"][number]) {
  const status = lesson.status === "ABSENT" ? "élève absent · compté" : "présent"
  const date = new Date(lesson.date).toLocaleDateString("fr-FR")
  return `Session ${lesson.sessionNumber} · cours ${lesson.lessonNumber} · ${date} · ${status}`
}

function defaultSelections(data: TeacherPayrollData): SelectionMap {
  const selections: SelectionMap = {}
  for (const row of data.rows) {
    if (row.savedFirstKey && row.savedLastKey) {
      selections[row.key] = { first: row.savedFirstKey, last: row.savedLastKey }
      continue
    }
    const lastPaidIndex = row.lessons.reduce((latest, lesson, index) => lesson.alreadyPaid ? index : latest, -1)
    const available = row.lessons.slice(lastPaidIndex + 1).filter((lesson) => !lesson.alreadyPaid)
    if (available.length > 0) selections[row.key] = { first: available[0].key, last: available[available.length - 1].key }
  }
  return selections
}

export function TeacherPayrollClient({ initialData }: { initialData: TeacherPayrollData }) {
  const storageKey = `teacher-payroll-draft:${initialData.teacher.id}`
  const [selections, setSelections] = useState<SelectionMap>(() => defaultSelections(initialData))
  const [bonus, setBonus] = useState(String(initialData.currentSalary?.bonus ?? ""))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [validated, setValidated] = useState(initialData.currentSalary?.status === "CONFIRMED")

  useEffect(() => {
    const draft = window.localStorage.getItem(storageKey)
    if (!draft) return
    try {
      const parsed = JSON.parse(draft) as { selections?: SelectionMap; bonus?: string }
      const timeout = window.setTimeout(() => {
        if (parsed.selections) setSelections(parsed.selections)
        if (parsed.bonus !== undefined) setBonus(parsed.bonus)
        setMessage("Brouillon restauré.")
      }, 0)
      return () => window.clearTimeout(timeout)
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }, [storageKey])

  const calculatedRows = useMemo(() => initialData.rows.map((row) => {
    const selection = selections[row.key]
    const firstIndex = selection ? row.lessons.findIndex((lesson) => lesson.key === selection.first) : -1
    const lastIndex = selection ? row.lessons.findIndex((lesson) => lesson.key === selection.last) : -1
    const lessons = firstIndex >= 0 && lastIndex >= firstIndex ? row.lessons.slice(firstIndex, lastIndex + 1) : []
    const hasPaidLesson = lessons.some((lesson) => lesson.alreadyPaid)
    const validLessons = hasPaidLesson ? [] : lessons
    const minutes = validLessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0)
    const durations = Array.from(new Set(validLessons.map((lesson) => lesson.durationMinutes))).sort((a, b) => a - b)
    const durationLabel = durations.length === 0 ? "—" : durations.length === 1 ? `${durations[0]} min` : `${durations[0]}–${durations[durations.length - 1]} min`
    const hours = +(minutes / 60).toFixed(2)
    const total = +(minutes / 60 * row.hourlyRate).toFixed(2)
    return { row, lessons: validLessons, durationLabel, hours, total, hasPaidLesson }
  }), [initialData.rows, selections])

  const totals = useMemo(() => {
    const lessonCount = calculatedRows.reduce((sum, item) => sum + item.lessons.length, 0)
    const hours = +calculatedRows.reduce((sum, item) => sum + item.hours, 0).toFixed(2)
    const courseTotal = +calculatedRows.reduce((sum, item) => sum + item.total, 0).toFixed(2)
    const parsedBonus = Number(bonus.replace(",", ".")) || 0
    return { lessonCount, hours, courseTotal, bonus: parsedBonus, grandTotal: +(courseTotal + parsedBonus).toFixed(2) }
  }, [bonus, calculatedRows])

  function changeBoundary(row: PayrollCourseRow, boundary: "first" | "last", value: string) {
    const current = selections[row.key] ?? { first: value, last: value }
    const next = { ...current, [boundary]: value }
    const firstIndex = row.lessons.findIndex((lesson) => lesson.key === next.first)
    const lastIndex = row.lessons.findIndex((lesson) => lesson.key === next.last)
    if (boundary === "first" && firstIndex > lastIndex) next.last = value
    if (boundary === "last" && lastIndex < firstIndex) next.first = value
    setSelections((previous) => ({ ...previous, [row.key]: next }))
    setValidated(false)
    setMessage(null)
  }

  function saveDraft() {
    window.localStorage.setItem(storageKey, JSON.stringify({ selections, bonus }))
    setMessage("Brouillon enregistré sur cet appareil.")
  }

  async function validatePayroll() {
    if (totals.lessonCount === 0 && totals.bonus === 0) return setMessage("Sélectionne au moins un cours à payer.")
    if (!window.confirm(`Valider la fiche de paie de ${initialData.teacher.name} pour ${currency(totals.grandTotal)} ?`)) return
    setSaving(true)
    setMessage(null)
    try {
      const selectedRows = calculatedRows
        .filter((item) => item.lessons.length > 0)
        .map((item) => ({
          courseKey: item.row.key,
          firstLessonKey: item.lessons[0].key,
          lastLessonKey: item.lessons[item.lessons.length - 1].key,
        }))
      const response = await fetch(`/api/salaries/teacher/${initialData.teacher.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections: selectedRows, bonus: totals.bonus }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Validation impossible.")
      window.localStorage.removeItem(storageKey)
      setValidated(true)
      setMessage(`Fiche validée : ${currency(data.totalAmount)}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validation impossible.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/dashboard/recap-paiements" className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Retour au récapitulatif
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Paie de {initialData.teacher.name}</h1>
          <p className="mt-1 text-sm text-gray-500">Choisis le premier et le dernier cours à payer pour chaque élève ou classe.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={saveDraft}><Save className="h-4 w-4" /> Enregistrer le brouillon</Button>
          <Button onClick={validatePayroll} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {validated ? "Mettre à jour la fiche" : "Valider la fiche de paie"}
          </Button>
        </div>
      </div>

      {message && <div className={`rounded-lg border px-4 py-3 text-sm ${validated ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{message}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><Users className="h-8 w-8 text-blue-500" /><div><p className="text-xs text-gray-500">Élèves actifs</p><p className="text-xl font-bold">{initialData.activeStudentCount}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><BookOpenCheck className="h-8 w-8 text-violet-500" /><div><p className="text-xs text-gray-500">Cours comptés</p><p className="text-xl font-bold">{totals.lessonCount}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-8 w-8 text-amber-500" /><div><p className="text-xs text-gray-500">Heures enseignées</p><p className="text-xl font-bold">{totals.hours} h</p></div></CardContent></Card>
        <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-4"><p className="text-xs text-emerald-700">Total de la paie</p><p className="text-2xl font-bold text-emerald-800">{currency(totals.grandTotal)}</p></CardContent></Card>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Élève / classe</th>
                <th className="px-3 py-3 text-left font-medium">Forfait</th>
                <th className="px-3 py-3 text-left font-medium">Premier cours compté</th>
                <th className="px-3 py-3 text-left font-medium">Dernier cours compté</th>
                <th className="px-3 py-3 text-right font-medium">Cours</th>
                <th className="px-3 py-3 text-right font-medium">Durée / cours</th>
                <th className="px-3 py-3 text-left font-medium">Type</th>
                <th className="px-3 py-3 text-right font-medium">Part prof.</th>
                <th className="px-3 py-3 text-right font-medium">Heures</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {calculatedRows.map(({ row, lessons, durationLabel, hours, total, hasPaidLesson }) => {
                const selection = selections[row.key]
                const typeLabel = row.courseType === "INDIVIDUAL" ? "Individuel" : row.courseType === "BINOME" ? "Binôme" : "Classe"
                return (
                  <tr key={row.key} className="border-t border-gray-100 align-top hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.label}</p>
                      <p className="mt-1 text-xs text-gray-400">{row.studentNames.join(" · ")}</p>
                      <p className="mt-1 text-xs text-gray-400">{row.studentCount} élève{row.studentCount > 1 ? "s" : ""}</p>
                      {row.activeStudentCount < row.studentCount && <p className="mt-1 text-xs text-amber-600">{row.activeStudentCount}/{row.studentCount} élève(s) actif(s)</p>}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{row.forfait ?? "Non renseigné"}</td>
                    <td className="px-3 py-3">
                      <select aria-label={`Premier cours pour ${row.label}`} value={selection?.first ?? ""} onChange={(event) => changeBoundary(row, "first", event.target.value)} className="w-64 rounded-md border border-gray-200 bg-white px-2 py-2 text-xs">
                        <option value="">Aucun cours</option>
                        {row.lessons.map((lesson) => <option key={lesson.key} value={lesson.key} disabled={lesson.alreadyPaid} className={lesson.alreadyPaid ? "text-gray-400" : "text-gray-900"}>{lesson.alreadyPaid ? `Déjà payé (${lesson.paidLabel}) · ` : ""}{lessonLabel(lesson)}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select aria-label={`Dernier cours pour ${row.label}`} value={selection?.last ?? ""} onChange={(event) => changeBoundary(row, "last", event.target.value)} className="w-64 rounded-md border border-gray-200 bg-white px-2 py-2 text-xs">
                        <option value="">Aucun cours</option>
                        {row.lessons.map((lesson) => <option key={lesson.key} value={lesson.key} disabled={lesson.alreadyPaid} className={lesson.alreadyPaid ? "text-gray-400" : "text-gray-900"}>{lesson.alreadyPaid ? `Déjà payé (${lesson.paidLabel}) · ` : ""}{lessonLabel(lesson)}</option>)}
                      </select>
                      {hasPaidLesson && <p className="mt-1 text-xs text-red-600">Cette plage contient un cours déjà payé.</p>}
                    </td>
                    <td className="px-3 py-3 text-right font-medium">{lessons.length}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{durationLabel}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{typeLabel}</span></td>
                    <td className="px-3 py-3 text-right text-gray-600">{currency(row.hourlyRate)}/h</td>
                    <td className="px-3 py-3 text-right font-medium">{hours} h</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{currency(total)}</td>
                  </tr>
                )
              })}
              {calculatedRows.length === 0 && <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">Aucun élève ou cours disponible pour ce professeur.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-end">
        <label className="text-sm text-gray-600">Prime éventuelle
          <span className="mt-1 flex items-center gap-2"><input type="number" min="0" step="0.5" value={bonus} onChange={(event) => { setBonus(event.target.value); setValidated(false) }} className="w-28 rounded-md border border-gray-200 px-3 py-2 text-right" /><span>€</span></span>
        </label>
        <div className="min-w-52 text-right"><p className="text-xs text-gray-500">Cours : {currency(totals.courseTotal)} · Prime : {currency(totals.bonus)}</p><p className="text-2xl font-bold text-gray-900">Total : {currency(totals.grandTotal)}</p></div>
      </div>
    </div>
  )
}
