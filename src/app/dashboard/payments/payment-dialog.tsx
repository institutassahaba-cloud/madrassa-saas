"use client"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MONTHS_FR } from "@/lib/utils"

interface PaymentDialogProps {
  open: boolean
  onClose: () => void
  payment: any | null
  students: { id: string; firstName: string; lastName: string; monthlyFee: number }[]
  currentMonth: number
  currentYear: number
}

const EMPTY = {
  studentId: "", amount: "", status: "PAID", method: "CASH",
  month: "", year: "", reference: "", paidDate: "", notes: "",
}

export function PaymentDialog({ open, onClose, payment, students, currentMonth, currentYear }: PaymentDialogProps) {
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (payment) {
      setForm({
        studentId: payment.student?.id ?? "",
        amount: String(payment.amount),
        status: payment.status ?? "PAID",
        method: payment.method ?? "CASH",
        month: String(payment.month),
        year: String(payment.year),
        reference: payment.reference ?? "",
        paidDate: payment.paidDate ? payment.paidDate.toString().slice(0, 10) : "",
        notes: payment.notes ?? "",
      })
    } else {
      setForm({ ...EMPTY, month: String(currentMonth), year: String(currentYear) })
    }
    setError("")
  }, [payment, open])

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onStudentChange(studentId: string) {
    const student = students.find((s) => s.id === studentId)
    setForm((f) => ({ ...f, studentId, amount: student ? String(student.monthlyFee) : f.amount }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const method = payment ? "PUT" : "POST"
      const url = payment ? `/api/payments/${payment.id}` : "/api/payments"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      onClose()
      window.location.reload()
    } catch (e: any) {
      setError(e.message || "Erreur")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{payment ? "Modifier le paiement" : "Enregistrer un paiement"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Élève *</Label>
            <Select value={form.studentId} onValueChange={onStudentChange}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un élève..." /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Mois *</Label>
              <Select value={form.month} onValueChange={(v) => set("month", v)}>
                <SelectTrigger><SelectValue placeholder="Mois" /></SelectTrigger>
                <SelectContent>
                  {MONTHS_FR.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Année *</Label>
              <Input type="number" value={form.year} onChange={(e) => set("year", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Montant (€) *</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Statut *</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAID">Payé</SelectItem>
                  <SelectItem value="PENDING">En attente</SelectItem>
                  <SelectItem value="LATE">En retard</SelectItem>
                  <SelectItem value="EXEMPTED">Exonéré</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Moyen de paiement</Label>
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Espèces</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Virement</SelectItem>
                  <SelectItem value="WISE">Wise</SelectItem>
                  <SelectItem value="PAYPAL">PayPal</SelectItem>
                  <SelectItem value="CHECK">Chèque</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date de paiement</Label>
              <Input type="date" value={form.paidDate} onChange={(e) => set("paidDate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Référence / N° transaction</Label>
            <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="ex: TRF-001234" />
          </div>

          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {payment ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
