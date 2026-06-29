"use client"
import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, Pencil } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

interface Teacher {
  id: string
  name: string
}

interface Student {
  id: string
  firstName: string
  lastName: string
  monthlyFee: number
  group: { teacherId: string | null; name: string } | null
}

interface LessonSessionOption {
  id: string
  studentId: string
  teacherId: string
  subject: string
  number: number
  isComplete: boolean
}

interface PaymentDialogProps {
  open: boolean
  onClose: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payment: any | null
  students: Student[]
  teachers: Teacher[]
  lessonSessions: LessonSessionOption[]
  currentMonth: number
  currentYear: number
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  teacherId: "",
  studentId: "",
  lessonSessionId: "",
  amount: "",
  amountOverrideReason: "",
  method: "Virement",
  paidDate: todayIso(),
  reference: "",
}

export function PaymentDialog({
  open,
  onClose,
  payment,
  students,
  teachers,
  lessonSessions,
  currentMonth,
  currentYear,
}: PaymentDialogProps) {
  const [form, setForm] = useState(EMPTY)
  const [amountEditable, setAmountEditable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const selectedStudent = students.find((s) => s.id === form.studentId)
  const filteredStudents = useMemo(() => {
    if (!form.teacherId) return []
    const sessionStudentIds = new Set(
      lessonSessions.filter((s) => s.teacherId === form.teacherId).map((s) => s.studentId)
    )
    return students.filter((s) => s.group?.teacherId === form.teacherId || sessionStudentIds.has(s.id))
  }, [form.teacherId, lessonSessions, students])

  const filteredSessions = useMemo(() => {
    if (!form.teacherId || !form.studentId) return []
    return lessonSessions.filter((s) => s.teacherId === form.teacherId && s.studentId === form.studentId)
  }, [form.teacherId, form.studentId, lessonSessions])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (payment) {
      const teacherId = payment.lessonSession?.teacherId ?? payment.student?.group?.teacherId ?? ""
      setForm({
        teacherId,
        studentId: payment.student?.id ?? "",
        lessonSessionId: payment.lessonSession?.id ?? "",
        amount: String(payment.amount ?? ""),
        amountOverrideReason: payment.notes ?? "",
        method: payment.method === "PayPal" ? "PayPal" : "Virement",
        paidDate: payment.paidDate ? payment.paidDate.toString().slice(0, 10) : todayIso(),
        reference: payment.reference ?? "",
      })
      setAmountEditable(true)
    } else {
      setForm({ ...EMPTY, paidDate: todayIso() })
      setAmountEditable(false)
    }
    setError("")
  }, [payment, open])
  /* eslint-enable react-hooks/set-state-in-effect */

  function set(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onTeacherChange(teacherId: string) {
    setForm((f) => ({
      ...f,
      teacherId,
      studentId: "",
      lessonSessionId: "",
      amount: "",
      amountOverrideReason: "",
    }))
    setAmountEditable(false)
  }

  function onStudentChange(studentId: string) {
    const student = students.find((s) => s.id === studentId)
    setForm((f) => ({
      ...f,
      studentId,
      lessonSessionId: "",
      amount: student ? String(student.monthlyFee) : "",
      amountOverrideReason: "",
    }))
    setAmountEditable(false)
  }

  function onSessionChange(lessonSessionId: string) {
    set("lessonSessionId", lessonSessionId)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const method = payment ? "PUT" : "POST"
      const url = payment ? `/api/payments/${payment.id}` : "/api/payments"
      const payload = { ...form, status: "CONFIRMED", month: currentMonth, year: currentYear }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "Erreur lors de l'enregistrement.")
      }
      onClose()
      window.location.reload()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setError(e.message || "Erreur")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-lg" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{payment ? "Modifier le paiement manuel" : "Enregistrer un paiement manuel"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Professeur *</Label>
            <Select value={form.teacherId} onValueChange={onTeacherChange}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un professeur..." /></SelectTrigger>
              <SelectContent>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Élève du professeur *</Label>
            <Select value={form.studentId} onValueChange={onStudentChange} disabled={!form.teacherId}>
              <SelectTrigger><SelectValue placeholder={form.teacherId ? "Sélectionner un élève..." : "Choisir d'abord un professeur"} /></SelectTrigger>
              <SelectContent>
                {filteredStudents.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.firstName} {student.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Numéro de session *</Label>
            <Select value={form.lessonSessionId} onValueChange={onSessionChange} disabled={!form.studentId}>
              <SelectTrigger><SelectValue placeholder={form.studentId ? "Sélectionner une session..." : "Choisir d'abord un élève"} /></SelectTrigger>
              <SelectContent>
                {filteredSessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    Session {session.number} · {session.subject}{session.isComplete ? " · terminée" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-900">Montant prévu</p>
                <p className="text-xs text-emerald-700">
                  {selectedStudent ? `Forfait élève: ${formatCurrency(selectedStudent.monthlyFee)}` : "Sélectionnez un élève pour préremplir le montant."}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setAmountEditable(true)}>
                <Pencil className="h-4 w-4" />
                Modifier le montant
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Montant (€) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  disabled={!amountEditable}
                  required
                />
              </div>
              {amountEditable && selectedStudent && Number(form.amount) !== selectedStudent.monthlyFee && (
                <div className="space-y-1.5">
                  <Label>Raison de modification *</Label>
                  <Input
                    value={form.amountOverrideReason}
                    onChange={(e) => set("amountOverrideReason", e.target.value)}
                    placeholder="ex: paiement partiel, autre payeur..."
                    required
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Payé le *</Label>
              <Input type="date" value={form.paidDate} onChange={(e) => set("paidDate", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Moyen *</Label>
              <Select value={form.method} onValueChange={(value) => set("method", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Virement">Virement</SelectItem>
                  <SelectItem value="PayPal">PayPal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Référence</Label>
            <Input value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="ex: TRF-001234 ou ID PayPal" />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Payé OK
          </div>

          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-3 pt-2 sm:flex sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading || !form.teacherId || !form.studentId || !form.lessonSessionId || !form.amount || !form.paidDate || !form.method}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {payment ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
