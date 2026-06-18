"use client"
import { useState } from "react"
import { Plus, Search, Filter, Download, Edit, Archive, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StudentDialog } from "./student-dialog"
import { formatDate, formatCurrency } from "@/lib/utils"

const STATUS_CONFIG = {
  ACTIVE: { label: "Actif", variant: "success" as const },
  INACTIVE: { label: "Inactif", variant: "warning" as const },
  ARCHIVED: { label: "Archivé", variant: "secondary" as const },
}

interface Student {
  id: string
  firstName: string
  lastName: string
  gender: string
  phone: string | null
  email: string | null
  status: string
  monthlyFee: any
  enrollmentDate: Date
  group: { id: string; name: string } | null
  level: string | null
}

interface Group {
  id: string
  name: string
  level: string | null
}

export function StudentsClient({
  students,
  groups,
  role,
}: {
  students: Student[]
  groups: Group[]
  role: string
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [groupFilter, setGroupFilter] = useState("ALL")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editStudent, setEditStudent] = useState<Student | null>(null)

  const filtered = students.filter((s) => {
    const matchSearch =
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.phone ?? "").includes(search)
    const matchStatus = statusFilter === "ALL" || s.status === statusFilter
    const matchGroup = groupFilter === "ALL" || s.group?.id === groupFilter
    return matchSearch && matchStatus && matchGroup
  })

  function openEdit(student: Student) {
    setEditStudent(student)
    setDialogOpen(true)
  }

  function openCreate() {
    setEditStudent(null)
    setDialogOpen(true)
  }

  async function handleArchive(id: string) {
    await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    })
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Élèves</h2>
          <p className="text-sm text-gray-500">{students.length} élèves au total</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Ajouter un élève
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Rechercher un élève..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                <SelectItem value="ACTIVE">Actif</SelectItem>
                <SelectItem value="INACTIVE">Inactif</SelectItem>
                <SelectItem value="ARCHIVED">Archivé</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Groupe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les groupes</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élève</TableHead>
                <TableHead>Groupe</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Tarif mensuel</TableHead>
                <TableHead>Inscription</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-gray-400">
                    Aucun élève trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((student) => {
                  const cfg = STATUS_CONFIG[student.status as keyof typeof STATUS_CONFIG]
                  return (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {student.gender === "MALE" ? "Garçon" : "Fille"}
                            {student.level && ` · Niveau ${student.level}`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {student.group ? (
                          <span className="text-sm text-gray-700">{student.group.name}</span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {student.phone && <p>{student.phone}</p>}
                          {student.email && <p className="text-gray-500">{student.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-gray-900">
                          {formatCurrency(student.monthlyFee)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatDate(student.enrollmentDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg?.variant ?? "secondary"}>{cfg?.label ?? student.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(student)} title="Modifier">
                            <Edit className="h-4 w-4" />
                          </Button>
                          {student.status !== "ARCHIVED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleArchive(student.id)}
                              title="Archiver"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <StudentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        student={editStudent}
        groups={groups}
      />
    </div>
  )
}
