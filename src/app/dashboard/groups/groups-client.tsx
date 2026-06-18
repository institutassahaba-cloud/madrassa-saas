"use client"
import { useState } from "react"
import { Plus, Users, BookOpen, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

interface Group {
  id: string
  name: string
  level: string | null
  isActive: boolean
  maxStudents: number
  description: string | null
  teacher: { id: string; name: string } | null
  schedule: any
  _count: { students: number }
}

interface Teacher {
  id: string
  name: string
}

const EMPTY = {
  name: "", level: "", teacherId: "", maxStudents: "20",
  description: "", days: [] as string[], startTime: "", endTime: "",
}

export function GroupsClient({ groups, teachers, role }: { groups: Group[]; teachers: Teacher[]; role: string }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<Group | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)

  function openCreate() {
    setEditGroup(null)
    setForm(EMPTY)
    setDialogOpen(true)
  }

  function openEdit(group: Group) {
    setEditGroup(group)
    const schedule = group.schedule as any
    setForm({
      name: group.name,
      level: group.level ?? "",
      teacherId: group.teacher?.id ?? "",
      maxStudents: String(group.maxStudents),
      description: group.description ?? "",
      days: schedule?.days ?? [],
      startTime: schedule?.startTime ?? "",
      endTime: schedule?.endTime ?? "",
    })
    setDialogOpen(true)
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const method = editGroup ? "PUT" : "POST"
      const url = editGroup ? `/api/groups/${editGroup.id}` : "/api/groups"
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          maxStudents: Number(form.maxStudents),
          schedule: { days: form.days, startTime: form.startTime, endTime: form.endTime },
        }),
      })
      setDialogOpen(false)
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Groupes / Classes</h2>
          <p className="text-sm text-gray-500">{groups.length} groupes</p>
        </div>
        {role !== "TEACHER" && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Créer un groupe
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const schedule = group.schedule as any
          return (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{group.name}</CardTitle>
                    {group.level && <p className="text-xs text-gray-500 mt-0.5">Niveau : {group.level}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={group.isActive ? "success" : "secondary"}>
                      {group.isActive ? "Actif" : "Inactif"}
                    </Badge>
                    {role !== "TEACHER" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(group)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="h-4 w-4 text-gray-400" />
                  {group._count.students} / {group.maxStudents} élèves
                </div>
                {group.teacher && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <BookOpen className="h-4 w-4 text-gray-400" />
                    Prof. {group.teacher.name}
                  </div>
                )}
                {schedule?.days?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {schedule.days.map((d: string) => (
                      <span key={d} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{d}</span>
                    ))}
                    {schedule.startTime && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {schedule.startTime} – {schedule.endTime}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editGroup ? "Modifier le groupe" : "Créer un groupe"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Nom du groupe *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Niveau</Label>
                <Input value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} placeholder="Débutant, A1, Coran..." />
              </div>
              <div className="space-y-1.5">
                <Label>Capacité max</Label>
                <Input type="number" min="1" value={form.maxStudents} onChange={(e) => setForm((f) => ({ ...f, maxStudents: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Professeur</Label>
                <Select value={form.teacherId} onValueChange={(v) => setForm((f) => ({ ...f, teacherId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun</SelectItem>
                    {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Jours de cours</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_FR.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      form.days.includes(day)
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Heure de début</Label>
                <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Heure de fin</Label>
                <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={loading}>{editGroup ? "Enregistrer" : "Créer"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
