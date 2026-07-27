"use client"
import { useState } from "react"
import { Plus, Loader2, Pencil, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate, getMonthName, MONTHS_FR } from "@/lib/utils"

interface Teacher {
  id: string
  name: string
  email: string
  phone: string | null
}

interface Salary {
  id: string
  month: number
  year: number
  totalAmount: number
  status: string
  hourlyRate: number | null
  hoursWorked: number | null
  fixedSalary: number | null
  paidDate: Date | string | null
  periodStart?: Date | string | null
  periodEnd?: Date | string | null
  teacher: { id: string; name: string }
  revisions: SalaryRevision[]
}

interface SalaryRevision {
  id: string
  revision: number
  totalAmount: number
  status: string
  paidDate: Date | string | null
  hoursWorked: number | null
  lessonsCount: number | null
  periodStart: Date | string | null
  periodEnd: Date | string | null
  createdAt: Date | string
}

const EMPTY = {
  teacherId: "", month: "", year: "", hourlyRate: "",
  hoursWorked: "", fixedSalary: "", notes: "", status: "PENDING",
}

export function SalariesClient({ teachers, salaries, currentMonth, currentYear, canEdit }: {
  teachers: Teacher[]
  salaries: Salary[]
  currentMonth: number
  currentYear: number
  canEdit: boolean
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY, month: String(currentMonth), year: String(currentYear) })
  const [loading, setLoading] = useState(false)
  const [salaryRows, setSalaryRows] = useState(salaries)
  const [editSalary, setEditSalary] = useState<Salary | null>(null)
  const [historySalary, setHistorySalary] = useState<Salary | null>(null)
  const [editAmount, setEditAmount] = useState("")
  const [editStatus, setEditStatus] = useState("PENDING")
  const [error, setError] = useState<string | null>(null)

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function computeTotal() {
    if (form.fixedSalary) return Number(form.fixedSalary)
    if (form.hourlyRate && form.hoursWorked) return Number(form.hourlyRate) * Number(form.hoursWorked)
    return 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, totalAmount: computeTotal() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Impossible de générer la fiche de paie.")
      setSalaryRows((current) => [data, ...current])
      setDialogOpen(false)
      setForm({ ...EMPTY, month: String(currentMonth), year: String(currentYear) })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de générer la fiche de paie.")
    } finally {
      setLoading(false)
    }
  }

  async function markPaid(id: string) {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/salaries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID", paidDate: new Date().toISOString() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Impossible de modifier la fiche.")
      setSalaryRows((current) => current.map((salary) => salary.id === id ? data : salary))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de modifier la fiche.")
    } finally {
      setLoading(false)
    }
  }

  function openEdit(salary: Salary) {
    setEditSalary(salary)
    setEditAmount(String(salary.totalAmount))
    setEditStatus(salary.status)
    setError(null)
  }

  async function saveEdit() {
    if (!editSalary) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/salaries/${editSalary.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount: Number(editAmount),
          status: editStatus,
          paidDate: editStatus === "PAID" ? editSalary.paidDate ?? new Date().toISOString() : null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Impossible de modifier la fiche.")
      setSalaryRows((current) => current.map((salary) => salary.id === data.id ? data : salary))
      setEditSalary(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de modifier la fiche.")
    } finally {
      setLoading(false)
    }
  }

  const totalPending = salaryRows.filter((s) => s.status === "PENDING").reduce((sum, s) => sum + s.totalAmount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Salaires</h2>
          <p className="text-sm text-gray-500">
            Total à payer : <span className="font-semibold text-red-600">{formatCurrency(totalPending)}</span>
          </p>
        </div>
        {canEdit && (
          <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Générer un salaire
          </Button>
        )}
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Professeur</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Heures</TableHead>
                <TableHead>Taux horaire</TableHead>
                <TableHead>Salaire fixe</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Payé le</TableHead>
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salaryRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-gray-400">Aucun salaire généré</TableCell>
                </TableRow>
              ) : (
                salaryRows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.teacher.name}</TableCell>
                    <TableCell>{getMonthName(s.month)} {s.year}</TableCell>
                    <TableCell>{s.hoursWorked ?? "—"}</TableCell>
                    <TableCell>{s.hourlyRate ? formatCurrency(s.hourlyRate) + "/h" : "—"}</TableCell>
                    <TableCell>{s.fixedSalary ? formatCurrency(s.fixedSalary) : "—"}</TableCell>
                    <TableCell><span className="font-bold text-gray-900">{formatCurrency(s.totalAmount)}</span></TableCell>
                    <TableCell>
                      <Badge variant={s.status === "PAID" ? "success" : s.status === "PARTIAL" ? "warning" : "destructive"}>
                        {s.status === "PAID" ? "Payé" : s.status === "PARTIAL" ? "Partiel" : "En attente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{s.paidDate ? formatDate(s.paidDate) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {canEdit && (
                          <Button variant="outline" size="sm" onClick={() => openEdit(s)} aria-label={`Modifier la fiche de ${s.teacher.name}`}>
                            <Pencil className="h-3.5 w-3.5" />
                            Modifier
                          </Button>
                        )}
                        {s.revisions.length > 0 && (
                          <Button variant="ghost" size="sm" onClick={() => setHistorySalary(s)} aria-label={`Voir l'historique de ${s.teacher.name}`}>
                            <History className="h-3.5 w-3.5" />
                            {s.revisions.length}
                          </Button>
                        )}
                        {canEdit && s.status !== "PAID" && (
                          <Button variant="outline" size="sm" onClick={() => markPaid(s.id)} disabled={loading}>
                            Marquer payé
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Générer un salaire</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Professeur *</Label>
              <Select value={form.teacherId} onValueChange={(v) => set("teacherId", v)}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Mois *</Label>
                <Select value={form.month} onValueChange={(v) => set("month", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS_FR.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Année *</Label>
                <Input type="number" value={form.year} onChange={(e) => set("year", e.target.value)} required />
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-600 uppercase">Option 1 : Horaire</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Taux horaire (€/h)</Label>
                  <Input type="number" value={form.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} placeholder="20" />
                </div>
                <div className="space-y-1.5">
                  <Label>Heures effectuées</Label>
                  <Input type="number" value={form.hoursWorked} onChange={(e) => set("hoursWorked", e.target.value)} placeholder="40" />
                </div>
              </div>

              <p className="text-xs font-semibold text-gray-600 uppercase pt-1">Option 2 : Salaire fixe</p>
              <div className="space-y-1.5">
                <Label>Salaire fixe mensuel (€)</Label>
                <Input type="number" value={form.fixedSalary} onChange={(e) => set("fixedSalary", e.target.value)} placeholder="800" />
              </div>
            </div>

            {computeTotal() > 0 && (
              <div className="rounded-lg bg-emerald-50 px-4 py-3">
                <p className="text-sm text-emerald-700">
                  Total calculé : <span className="font-bold text-lg">{formatCurrency(computeTotal())}</span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={loading || computeTotal() === 0}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Générer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editSalary)} onOpenChange={(open) => { if (!open) setEditSalary(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier la fiche de paie</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{editSalary?.teacher.name} · Toute modification est conservée dans l&apos;historique.</p>
            <div className="space-y-1.5">
              <Label htmlFor="salary-edit-amount">Montant (€)</Label>
              <Input id="salary-edit-amount" type="number" min="0" step="0.01" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">En attente</SelectItem>
                  <SelectItem value="PARTIAL">Partiel</SelectItem>
                  <SelectItem value="CONFIRMED">Validé</SelectItem>
                  <SelectItem value="PAID">Payé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditSalary(null)}>Annuler</Button>
              <Button onClick={saveEdit} disabled={loading || !Number.isFinite(Number(editAmount)) || Number(editAmount) < 0}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historySalary)} onOpenChange={(open) => { if (!open) setHistorySalary(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Historique — {historySalary?.teacher.name}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {historySalary?.revisions.map((revision) => (
              <div key={revision.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">Version {revision.revision} · {formatCurrency(revision.totalAmount)}</span>
                  <span className="text-xs text-gray-400">modifiée le {formatDate(revision.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {revision.periodStart && revision.periodEnd
                    ? `Période du ${formatDate(revision.periodStart)} au ${formatDate(revision.periodEnd)}`
                    : `${revision.lessonsCount ?? 0} cours · ${revision.hoursWorked ?? 0} h`}
                  {` · statut ${revision.status}`}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
