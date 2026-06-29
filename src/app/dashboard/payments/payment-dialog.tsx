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

type ManualPaymentRow = {
  id: string
  teacherId: string
  studentId: string
  lessonSessionId: string
  amount: string
  amountOverrideReason: string
}

function newManualPaymentRow(): ManualPaymentRow {
  return {
    id: Math.random().toString(36).slice(2),
    teacherId: "",
    studentId: "",
    lessonSessionId: "",
    amount: "",
    amountOverrideReason: "",
  }
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
  const [rows, setRows] = useState<ManualPaymentRow[]>(() => [newManualPaymentRow()])
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

  const studentsByTeacher = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const session of lessonSessions) {
      const set = map.get(session.teacherId) ?? new Set<string>()
      set.add(session.studentId)
      map.set(session.teacherId, set)
    }
    return map
  }, [lessonSessions])

  const manualTotal = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)

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
      setRows([newManualPaymentRow()])
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

  function updateRow(id: string, patch: Partial<ManualPaymentRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
  }

  function onRowTeacherChange(row: ManualPaymentRow, teacherId: string) {
    updateRow(row.id, { teacherId, studentId: "", lessonSessionId: "", amount: "", amountOverrideReason: "" })
  }

  function onRowStudentChange(row: ManualPaymentRow, studentId: string) {
    const student = students.find((item) => item.id === studentId)
    updateRow(row.id, {
      studentId,
      lessonSessionId: "",
      amount: student ? String(student.monthlyFee) : "",
      amountOverrideReason: "",
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const method = payment ? "PUT" : "POST"
      const url = payment ? `/api/payments/${payment.id}` : "/api/payments"
      const payload = payment
        ? { ...form, status: "CONFIRMED", month: currentMonth, year: currentYear }
        : {
            paidDate: form.paidDate,
            method: form.method,
            reference: form.reference,
            allocations: rows.map((row) => ({
              teacherId: row.teacherId,
              studentId: row.studentId,
              lessonSessionId: row.lessonSessionId,
              amount: Number(row.amount),
              amountOverrideReason: row.amountOverrideReason,
            })),
          }
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
      <DialogContent className={payment ? "max-w-lg" : "max-w-4xl"} onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{payment ? "Modifier le paiement manuel" : "Enregistrer un paiement manuel"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {payment ? (
            <>
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
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-sm font-medium text-emerald-900">Répartition du paiement reçu</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Ajoutez une ligne par session concernée si le même paiement couvre plusieurs élèves, professeurs ou sessions.
                </p>
                <p className="mt-2 text-sm font-semibold text-emerald-900">Total saisi : {formatCurrency(manualTotal)}</p>
              </div>

              {rows.map((row, index) => {
                const teacherStudentIds = row.teacherId ? studentsByTeacher.get(row.teacherId) : null
                const selectableStudents = row.teacherId
                  ? students.filter((student) => student.group?.teacherId === row.teacherId || teacherStudentIds?.has(student.id))
                  : []
                const selectableSessions = lessonSessions.filter((session) => (
                  session.teacherId === row.teacherId && session.studentId === row.studentId
                ))
                const rowStudent = students.find((student) => student.id === row.studentId)
                const amountChanged = rowStudent && row.amount !== "" && Number(row.amount) !== rowStudent.monthlyFee

                return (
                  <div key={row.id} className="rounded-xl border border-gray-200 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-700">Paiement concerné {index + 1}</p>
                      {rows.length > 1 && (
                        <button type="button" className="text-xs font-medium text-red-600" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>
                          Retirer
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_8rem]">
                      <Select value={row.teacherId} onValueChange={(value) => onRowTeacherChange(row, value)}>
                        <SelectTrigger><SelectValue placeholder="Professeur" /></SelectTrigger>
                        <SelectContent>
                          {teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={row.studentId} onValueChange={(value) => onRowStudentChange(row, value)} disabled={!row.teacherId}>
                        <SelectTrigger><SelectValue placeholder={row.teacherId ? "Élève" : "Choisir professeur"} /></SelectTrigger>
                        <SelectContent>
                          {selectableStudents.map((student) => (
                            <SelectItem key={student.id} value={student.id}>{student.firstName} {student.lastName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={row.lessonSessionId} onValueChange={(value) => updateRow(row.id, { lessonSessionId: value })} disabled={!row.studentId}>
                        <SelectTrigger><SelectValue placeholder={row.studentId ? "Session" : "Choisir élève"} /></SelectTrigger>
                        <SelectContent>
                          {selectableSessions.map((session) => (
                            <SelectItem key={session.id} value={session.id}>
                              Session {session.number} · {session.subject}{session.isComplete ? " · terminée" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.amount}
                        onChange={(event) => updateRow(row.id, { amount: event.target.value })}
                        placeholder="Montant"
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-400">
                      {rowStudent
                        ? `Forfait élève : ${formatCurrency(rowStudent.monthlyFee)}`
                        : "Choisissez un élève pour afficher son forfait."}
                    </p>
                    {amountChanged && (
                      <div className="mt-2 space-y-1.5">
                        <Label>Raison de modification *</Label>
                        <Input
                          value={row.amountOverrideReason}
                          onChange={(event) => updateRow(row.id, { amountOverrideReason: event.target.value })}
                          placeholder="ex: 2 sessions, paiement groupé, avance..."
                          required
                        />
                      </div>
                    )}
                  </div>
                )
              })}

              <Button type="button" variant="outline" onClick={() => setRows((current) => [...current, newManualPaymentRow()])}>
                Ajouter une session / un élève
              </Button>
            </div>
          )}

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
            <Button
              type="submit"
              disabled={loading || !form.paidDate || !form.method || (payment
                ? (!form.teacherId || !form.studentId || !form.lessonSessionId || !form.amount)
                : rows.some((row) => !row.teacherId || !row.studentId || !row.lessonSessionId || !row.amount || (students.find((student) => student.id === row.studentId) && Number(row.amount) !== students.find((student) => student.id === row.studentId)!.monthlyFee && !row.amountOverrideReason)))}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {payment ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
