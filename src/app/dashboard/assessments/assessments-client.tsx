"use client"
import { useState } from "react"
import { Plus, ChevronDown, ChevronRight, Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate } from "@/lib/utils"

interface Grade {
  id: string
  score: number | null
  observation: string | null
  student: { firstName: string; lastName: string }
}

interface Assessment {
  id: string
  title: string
  subject: string | null
  date: Date
  maxScore: number
  group: { id: string; name: string }
  teacher: { name: string } | null
  grades: Grade[]
}

interface Student {
  id: string
  firstName: string
  lastName: string
}

interface Group {
  id: string
  name: string
  students: Student[]
}

const EMPTY = { title: "", subject: "", groupId: "", date: "", maxScore: "20" }

export function AssessmentsClient({ assessments, groups, role, userId }: {
  assessments: Assessment[]
  groups: Group[]
  role: string
  userId: string
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [gradesOpen, setGradesOpen] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [grades, setGrades] = useState<Record<string, { score: string; obs: string }>>({})
  const [loading, setLoading] = useState(false)
  const [savingGrades, setSavingGrades] = useState(false)

  function openGrades(assessment: Assessment) {
    setGradesOpen(assessment.id)
    const initial: Record<string, { score: string; obs: string }> = {}
    assessment.grades.forEach((g) => {
      initial[`${assessment.id}_student`] = { score: String(g.score ?? ""), obs: g.observation ?? "" }
    })
    const group = groups.find((g) => g.id === assessment.group.id)
    if (group) {
      group.students.forEach((s) => {
        const existing = assessment.grades.find((g: any) => g.student.firstName === s.firstName)
        initial[s.id] = existing
          ? { score: String(existing.score ?? ""), obs: existing.observation ?? "" }
          : { score: "", obs: "" }
      })
    }
    setGrades(initial)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, maxScore: Number(form.maxScore) }),
      })
      setDialogOpen(false)
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveGrades(assessmentId: string) {
    setSavingGrades(true)
    try {
      const records = Object.entries(grades).map(([studentId, v]) => ({
        studentId,
        score: v.score ? Number(v.score) : null,
        observation: v.obs || null,
      }))
      await fetch(`/api/assessments/${assessmentId}/grades`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades: records }),
      })
      window.location.reload()
    } finally {
      setSavingGrades(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Contrôles & Évaluations</h2>
          <p className="text-sm text-gray-500">{assessments.length} contrôle(s)</p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setDialogOpen(true) }}>
          <Plus className="h-4 w-4" />
          Créer un contrôle
        </Button>
      </div>

      <div className="space-y-3">
        {assessments.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-gray-400">Aucun contrôle créé</CardContent>
          </Card>
        )}
        {assessments.map((a) => {
          const group = groups.find((g) => g.id === a.group.id)
          const avg = a.grades.length > 0
            ? (a.grades.reduce((s, g) => s + (g.score ?? 0), 0) / a.grades.filter((g) => g.score !== null).length).toFixed(1)
            : null
          const isOpen = gradesOpen === a.id

          return (
            <Card key={a.id}>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {a.group.name} · {formatDate(a.date)}
                      {a.subject && ` · ${a.subject}`}
                      {a.teacher && ` · Prof. ${a.teacher.name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {avg && (
                      <Badge variant="info">Moy. {avg}/{a.maxScore}</Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={() => isOpen ? setGradesOpen(null) : openGrades(a)}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Notes
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isOpen && group && (
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {group.students.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-2">
                        <p className="flex-1 text-sm font-medium text-gray-900">{s.firstName} {s.lastName}</p>
                        <Input
                          type="number"
                          min="0"
                          max={a.maxScore}
                          step="0.25"
                          className="w-20 text-center"
                          placeholder={`/${a.maxScore}`}
                          value={grades[s.id]?.score ?? ""}
                          onChange={(e) => setGrades((g) => ({ ...g, [s.id]: { ...g[s.id], score: e.target.value, obs: g[s.id]?.obs ?? "" } }))}
                        />
                        <Input
                          className="w-48"
                          placeholder="Observation..."
                          value={grades[s.id]?.obs ?? ""}
                          onChange={(e) => setGrades((g) => ({ ...g, [s.id]: { ...g[s.id], obs: e.target.value, score: g[s.id]?.score ?? "" } }))}
                        />
                      </div>
                    ))}
                    <div className="flex justify-end pt-2">
                      <Button size="sm" onClick={() => handleSaveGrades(a.id)} disabled={savingGrades}>
                        {savingGrades ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Enregistrer les notes
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Créer un contrôle</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Titre *</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Matière</Label>
                <Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="ex: Arabe, Coran..." />
              </div>
              <div className="space-y-1.5">
                <Label>Note max</Label>
                <Input type="number" value={form.maxScore} onChange={(e) => setForm((f) => ({ ...f, maxScore: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Groupe *</Label>
                <Select value={form.groupId} onValueChange={(v) => setForm((f) => ({ ...f, groupId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Créer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
