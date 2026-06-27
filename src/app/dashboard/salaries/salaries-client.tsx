"use client"
import { useState } from "react"
import { Plus, Loader2 } from "lucide-react"
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
  paidDate: Date | null
  teacher: { id: string; name: string }
}

const EMPTY = {
  teacherId: "", month: "", year: "", hourlyRate: "",
  hoursWorked: "", fixedSalary: "", notes: "", status: "PENDING",
}

export function SalariesClient({ teachers, salaries, currentMonth, currentYear }: {
  teachers: Teacher[]
  salaries: Salary[]
  currentMonth: number
  currentYear: number
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY, month: String(currentMonth), year: String(currentYear) })
  const [loading, setLoading] = useState(false)

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
    try {
      await fetch("/api/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, totalAmount: computeTotal() }),
      })
      setDialogOpen(false)
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  async function markPaid(id: string) {
    await fetch(`/api/salaries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAID", paidDate: new Date().toISOString() }),
    })
    window.location.reload()
  }

  const totalPending = salaries.filter((s) => s.status === "PENDING").reduce((sum, s) => sum + s.totalAmount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Salaires</h2>
          <p className="text-sm text-gray-500">
            Total à payer : <span className="font-semibold text-red-600">{formatCurrency(totalPending)}</span>
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Générer un salaire
        </Button>
      </div>

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
              {salaries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-gray-400">Aucun salaire généré</TableCell>
                </TableRow>
              ) : (
                salaries.map((s) => (
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
                      {s.status !== "PAID" && (
                        <Button variant="outline" size="sm" onClick={() => markPaid(s.id)}>
                          Marquer payé
                        </Button>
                      )}
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
    </div>
  )
}
