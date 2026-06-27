"use client"
import { useState } from "react"
import { Check, X, Clock, CheckCircle, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { cn, formatDate } from "@/lib/utils"

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"

interface Student {
  id: string
  firstName: string
  lastName: string
  gender: string
}

interface Group {
  id: string
  name: string
  level: string | null
  teacher: { name: string } | null
  students: Student[]
}

const STATUS_CONFIG = {
  PRESENT: { label: "Présent", icon: Check, color: "bg-emerald-500 text-white hover:bg-emerald-600" },
  ABSENT: { label: "Absent", icon: X, color: "bg-red-500 text-white hover:bg-red-600" },
  LATE: { label: "Retard", icon: Clock, color: "bg-amber-500 text-white hover:bg-amber-600" },
  EXCUSED: { label: "Excusé", icon: CheckCircle, color: "bg-gray-400 text-white hover:bg-gray-500" },
}

export function AttendanceClient({ groups, userId }: { groups: Group[]; userId: string }) {
  const [selectedGroup, setSelectedGroup] = useState(groups[0]?.id ?? "")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const group = groups.find((g) => g.id === selectedGroup)

  function setStatus(studentId: string, status: Status) {
    setStatuses((s) => ({ ...s, [studentId]: status }))
    setSaved(false)
  }

  function markAll(status: Status) {
    if (!group) return
    const all: Record<string, Status> = {}
    group.students.forEach((s) => { all[s.id] = status })
    setStatuses(all)
    setSaved(false)
  }

  async function handleSave() {
    if (!group) return
    setSaving(true)
    try {
      const records = group.students.map((s) => ({
        studentId: s.id,
        groupId: group.id,
        date,
        status: statuses[s.id] ?? "ABSENT",
      }))
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const presentCount = group?.students.filter((s) => statuses[s.id] === "PRESENT").length ?? 0
  const absentCount = group?.students.filter((s) => statuses[s.id] === "ABSENT").length ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Présences</h2>
          <p className="text-sm text-gray-500">Faire l&apos;appel et enregistrer les présences</p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-1 lg:min-w-48">
              <p className="text-xs font-medium text-gray-500">Groupe</p>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-full lg:w-48">
                  <SelectValue placeholder="Sélectionner un groupe" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">Date</p>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSaved(false) }} className="w-full lg:w-40" />
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:ml-auto lg:flex">
              <Button variant="outline" size="sm" onClick={() => markAll("PRESENT")}>
                <Check className="h-3.5 w-3.5" />
                Tous présents
              </Button>
              <Button variant="outline" size="sm" onClick={() => markAll("ABSENT")}>
                <X className="h-3.5 w-3.5" />
                Tous absents
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !group}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saved ? "Enregistré ✓" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {group && (
        <div className="flex flex-wrap gap-2 text-sm sm:gap-3">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
            {presentCount} présent(s)
          </span>
          <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
            {absentCount} absent(s)
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">
            {group.students.length - presentCount - absentCount} non renseigné(s)
          </span>
        </div>
      )}

      {/* Student list */}
      {group ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {group.name} — {group.students.length} élèves
              {group.teacher && (
                <span className="ml-2 text-sm font-normal text-gray-500">· Prof. {group.teacher.name}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {group.students.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Aucun élève dans ce groupe</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {group.students.map((student, idx) => {
                  const current = statuses[student.id]
                  return (
                    <div key={student.id} className="flex flex-col gap-3 px-4 py-3 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-400 w-6">{idx + 1}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-xs text-gray-400">
                            {student.gender === "MALE" ? "Garçon" : "Fille"}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:flex">
                        {(Object.keys(STATUS_CONFIG) as Status[]).map((status) => {
                          const cfg = STATUS_CONFIG[status]
                          return (
                            <button
                              key={status}
                              onClick={() => setStatus(student.id, status)}
                              className={cn(
                                "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                                current === status
                                  ? cfg.color
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              )}
                            >
                              <cfg.icon className="h-3 w-3" />
                              {cfg.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            Sélectionnez un groupe pour faire l&apos;appel
          </CardContent>
        </Card>
      )}
    </div>
  )
}
