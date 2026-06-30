"use client"
import { useMemo, useState } from "react"
import { Plus, Search, AlertTriangle, CheckCircle2, Clock, Ban, Calculator, Loader2, SplitSquareHorizontal, X, PlayCircle, PauseCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PaymentDialog } from "./payment-dialog"
import { formatCurrency, formatDate, getMonthName, MONTHS_FR } from "@/lib/utils"

const STATUS_CONFIG = {
  PAID: { label: "Payé", variant: "success" as const, icon: CheckCircle2, color: "text-emerald-600" },
  CONFIRMED: { label: "Payé OK", variant: "success" as const, icon: CheckCircle2, color: "text-emerald-600" },
  PENDING: { label: "En attente", variant: "warning" as const, icon: Clock, color: "text-amber-600" },
  LATE: { label: "En retard", variant: "destructive" as const, icon: AlertTriangle, color: "text-red-600" },
  EXEMPTED: { label: "Exonéré", variant: "secondary" as const, icon: Ban, color: "text-gray-500" },
}

interface Payment {
  id: string
  amount: number
  status: string
  month: number
  year: number
  paidDate: Date | null
  method: string | null
  reference: string | null
  createdAt: Date | string
  emailSentAt?: Date | string | null
  sessionNumber: number | null
  lessonSession: { id: string; number: number; subject: string; teacherId: string } | null
  student: { id: string; firstName: string; lastName: string; paymentGraceAllowed?: boolean; group: { name: string; teacherId: string | null } | null }
}

interface Student {
  id: string
  firstName: string
  lastName: string
  monthlyFee: number
  payerName: string | null
  paymentType: string | null
  group: { teacherId: string | null; name: string } | null
}

interface Teacher {
  id: string
  name: string
}

interface LessonSessionOption {
  id: string
  studentId: string
  teacherId: string
  subject: string
  number: number
  isComplete: boolean
}

interface PaymentMatch {
  id: string
  source: string
  gmailMessageId: string
  receivedAmount: number
  detectedPayerName: string | null
  paymentLabel: string | null
  paymentDate: Date | string | null
  status: string
  reason: string | null
  rawSubject: string | null
  createdAt: Date | string
  student: {
    id: string
    firstName: string
    lastName: string
    monthlyFee: number
    payerName: string | null
    paymentType: string | null
  } | null
}

export function PaymentsClient({
  payments,
  students,
  teachers,
  lessonSessions,
  paymentMatches,
  autoPaymentMatches,
  pendingPayments,
  currentMonth,
  currentYear,
  isDirector,
  scanControl,
}: {
  payments: Payment[]
  students: Student[]
  teachers: Teacher[]
  lessonSessions: LessonSessionOption[]
  paymentMatches: PaymentMatch[]
  autoPaymentMatches: PaymentMatch[]
  pendingPayments: Payment[]
  currentMonth: number
  currentYear: number
  isDirector: boolean
  scanControl: { enabled: boolean; startedAt: string | null }
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [monthFilter, setMonthFilter] = useState(String(currentMonth))
  const [yearFilter, setYearFilter] = useState(String(currentYear))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPayment, setEditPayment] = useState<Payment | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<PaymentMatch | null>(null)
  const [scanState, setScanState] = useState(scanControl)
  const [scanLoading, setScanLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [nowTime] = useState(() => Date.now())

  const filtered = payments.filter((p) => {
    const name = `${p.student.firstName} ${p.student.lastName}`.toLowerCase()
    const matchSearch = name.includes(search.toLowerCase()) || (p.reference ?? "").includes(search)
    const matchStatus = statusFilter === "ALL" || p.status === statusFilter
    const matchMonth = monthFilter === "ALL" || p.month === Number(monthFilter)
    const matchYear = yearFilter === "ALL" || p.year === Number(yearFilter)
    return matchSearch && matchStatus && matchMonth && matchYear
  })

  const summary = {
    paid: filtered.filter((p) => ["PAID", "CONFIRMED"].includes(p.status)).reduce((sum, p) => sum + p.amount, 0),
    late: filtered.filter((p) => p.status === "LATE").length,
    pending: filtered.filter((p) => p.status === "PENDING").length,
  }

  function pendingAgeDays(payment: Payment) {
    const start = new Date(payment.emailSentAt || payment.createdAt).getTime()
    return Math.max(1, Math.floor((nowTime - start) / 86400000) + 1)
  }

  function pendingTone(days: number) {
    if (days >= 6) return "border-red-200 bg-red-50 text-red-900"
    if (days >= 4) return "border-orange-200 bg-orange-50 text-orange-900"
    return "border-emerald-200 bg-emerald-50 text-emerald-900"
  }

  async function updateScanControl(action: "activate" | "pause") {
    const confirmed = action === "activate"
      ? window.confirm("Activer le scan automatique à partir de maintenant ? Les anciens mails seront ignorés.")
      : window.confirm("Mettre le scan automatique en pause ? Apps Script continuera d'appeler le site, mais aucun mail ne sera lu.")
    if (!confirmed) return
    setScanLoading(true)
    try {
      const res = await fetch("/api/payments/scan-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Impossible de modifier le scan.")
      setScanState({ enabled: data.enabled, startedAt: data.startedAt })
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de modifier le scan.")
    } finally {
      setScanLoading(false)
    }
  }

  async function syncTdbAliases() {
    setSyncLoading(true)
    try {
      const res = await fetch("/api/payments/sync-tdb-aliases", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Synchronisation impossible.")
      alert(`Synchronisation terminée : ${data.upsertedAliases} nom(s) associé(s), ${data.updatedStudents} fiche(s) élève mise(s) à jour.`)
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Synchronisation impossible.")
    } finally {
      setSyncLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Paiements</h2>
          <p className="text-sm text-gray-500">{payments.length} paiements enregistrés</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => { setEditPayment(null); setDialogOpen(true) }}>
          <Plus className="h-4 w-4" />
          Enregistrer un paiement manuel
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-xs text-gray-500">Payés (filtrés)</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(summary.paid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-xs text-gray-500">En retard</p>
              <p className="text-lg font-bold text-gray-900">{summary.late} élève(s)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-xs text-gray-500">En attente</p>
              <p className="text-lg font-bold text-gray-900">{summary.pending} élève(s)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calcul paie secrétaire (directeur) */}
      {isDirector && <SecretaryPayBlock />}

      {isDirector && (
        <Card className={scanState.enabled ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"}>
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Scan automatique des paiements</h3>
              <p className="text-sm text-gray-600">
                {scanState.enabled
                  ? `Actif uniquement pour les mails reçus depuis ${scanState.startedAt ? formatDate(scanState.startedAt) : "l'activation"}.`
                  : "En pause : les mails reçus ne sont pas consommés automatiquement."}
              </p>
            </div>
            <div className="grid gap-2 sm:flex">
              <Button variant="outline" onClick={syncTdbAliases} disabled={syncLoading} className="w-full sm:w-auto">
                {syncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Synchroniser NEW TDB
              </Button>
              <Button
                variant={scanState.enabled ? "outline" : "default"}
                onClick={() => updateScanControl(scanState.enabled ? "pause" : "activate")}
                disabled={scanLoading}
                className="w-full sm:w-auto"
              >
                {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : scanState.enabled ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                {scanState.enabled ? "Mettre en pause" : "Activer à partir de maintenant"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {paymentMatches.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-amber-900">Paiements non traités</h3>
                <p className="text-sm text-amber-700">
                  Paiements reçus sans concordance automatique, à associer à un ou plusieurs élèves, professeurs ou sessions.
                </p>
              </div>
              <Badge variant="warning">{paymentMatches.length} à traiter</Badge>
            </div>

            <div className="space-y-2">
              {paymentMatches.map((match) => (
                <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={match.source === "PAYPAL" ? "info" : "secondary"}>{match.source === "PAYPAL" ? "PayPal" : "Wise"}</Badge>
                      <p className="font-semibold text-gray-900">{formatCurrency(match.receivedAmount)}</p>
                      <p className="text-sm text-gray-600">{match.detectedPayerName || "Payeur non détecté"}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {match.student
                        ? `Élève pressenti : ${match.student.firstName} ${match.student.lastName}`
                        : "Aucun élève pressenti"}
                      {match.reason ? ` · ${match.reason}` : ""}
                    </p>
                    {(match.paymentLabel || match.rawSubject) && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        Libellé : {match.paymentLabel || match.rawSubject}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400">Numéro de transfert / transaction : {match.gmailMessageId}</p>
                  </div>
                  <Button size="sm" onClick={() => setSelectedMatch(match)}>
                    <SplitSquareHorizontal className="h-4 w-4" />
                    Associer un élève
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {autoPaymentMatches.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-emerald-900">Paiements auto-validés</h3>
                <p className="text-sm text-emerald-700">
                  Validés automatiquement. En cas d&apos;erreur, vous pouvez corriger l&apos;association.
                </p>
              </div>
              <Badge variant="success">{autoPaymentMatches.length} validé(s)</Badge>
            </div>
            <div className="space-y-2">
              {autoPaymentMatches.map((match) => (
                <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={match.source === "PAYPAL" ? "info" : "secondary"}>{match.source === "PAYPAL" ? "PayPal" : "Wise"}</Badge>
                      <p className="font-semibold text-gray-900">{formatCurrency(match.receivedAmount)}</p>
                      <p className="text-sm text-gray-600">{match.detectedPayerName || "Payeur non détecté"}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Validé pour : {match.student ? `${match.student.firstName} ${match.student.lastName}` : "élève non renseigné"}
                      {match.reason ? ` · ${match.reason}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">Référence : {match.gmailMessageId}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelectedMatch(match)}>
                    Corriger
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingPayments.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <h3 className="font-semibold text-gray-900">Paiements en attente</h3>
              <p className="text-sm text-gray-500">Vert : 1 à 3 jours · Orange : 4 à 5 jours · Rouge : 6 jours et plus.</p>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {pendingPayments.map((payment) => {
                const days = pendingAgeDays(payment)
                return (
                  <div key={payment.id} className={`rounded-xl border p-3 ${pendingTone(days)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{payment.student.firstName} {payment.student.lastName}</p>
                        {payment.student.paymentGraceAllowed && (
                          <p className="mt-0.5 text-xs font-medium text-amber-700">Cours autorisé par le directeur</p>
                        )}
                        <p className="text-xs opacity-80">
                          {payment.lessonSession?.subject || "Session"} · Session {payment.sessionNumber ?? payment.lessonSession?.number ?? "—"}
                          {payment.student.group?.name ? ` · ${payment.student.group.name}` : ""}
                        </p>
                      </div>
                      <Badge variant={days >= 6 ? "destructive" : days >= 4 ? "warning" : "success"}>{days} j</Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold">{formatCurrency(payment.amount)}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_9rem_7rem]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Rechercher..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous statuts</SelectItem>
                <SelectItem value="CONFIRMED">Payé OK</SelectItem>
                <SelectItem value="PAID">Payé</SelectItem>
                <SelectItem value="PENDING">En attente</SelectItem>
                <SelectItem value="LATE">En retard</SelectItem>
                <SelectItem value="EXEMPTED">Exonéré</SelectItem>
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Mois" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous mois</SelectItem>
                {MONTHS_FR.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Année" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes</SelectItem>
                <SelectItem value={String(currentYear)}>{currentYear}</SelectItem>
                <SelectItem value={String(currentYear - 1)}>{currentYear - 1}</SelectItem>
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
                <TableHead>Session</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Moyen</TableHead>
                <TableHead>Date paiement</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-gray-400">Aucun paiement trouvé</TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const cfg = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG]
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium text-gray-900">{p.student.firstName} {p.student.lastName}</p>
                        {p.student.group && <p className="text-xs text-gray-500">{p.student.group.name}</p>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.sessionNumber ?? p.lessonSession?.number
                          ? `Session ${p.sessionNumber ?? p.lessonSession?.number}`
                          : `${getMonthName(p.month)} ${p.year}`}
                        {p.lessonSession?.subject && <p className="text-xs text-gray-400">{p.lessonSession.subject}</p>}
                      </TableCell>
                      <TableCell><span className="font-semibold">{formatCurrency(p.amount)}</span></TableCell>
                      <TableCell className="text-sm text-gray-600">{p.method ?? "—"}</TableCell>
                      <TableCell className="text-sm">{p.paidDate ? formatDate(p.paidDate) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={cfg?.variant ?? "secondary"}>
                          {cfg?.label ?? p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => { setEditPayment(p); setDialogOpen(true) }}>
                          Modifier
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PaymentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        payment={editPayment}
        students={students}
        teachers={teachers}
        lessonSessions={lessonSessions}
        currentMonth={currentMonth}
        currentYear={currentYear}
      />
      {selectedMatch && (
        <PaymentMatchDialog
          match={selectedMatch}
          students={students}
          teachers={teachers}
          lessonSessions={lessonSessions}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </div>
  )
}

type AllocationRow = {
  id: string
  teacherId: string
  studentId: string
  lessonSessionId: string
  amount: string
}

function newAllocationRow(student?: Student | null): AllocationRow {
  return {
    id: Math.random().toString(36).slice(2),
    teacherId: student?.group?.teacherId ?? "",
    studentId: student?.id ?? "",
    lessonSessionId: "",
    amount: student?.monthlyFee ? String(student.monthlyFee) : "",
  }
}

function PaymentMatchDialog({
  match,
  students,
  teachers,
  lessonSessions,
  onClose,
}: {
  match: PaymentMatch
  students: Student[]
  teachers: Teacher[]
  lessonSessions: LessonSessionOption[]
  onClose: () => void
}) {
  const hintedStudent = students.find((student) => student.id === match.student?.id) ?? null
  const [mode, setMode] = useState<"sessions" | "students">("sessions")
  const [rows, setRows] = useState<AllocationRow[]>(() => [newAllocationRow(hintedStudent)])
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const allocated = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const remaining = match.receivedAmount - allocated

  const studentsByTeacher = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const session of lessonSessions) {
      const set = map.get(session.teacherId) ?? new Set<string>()
      set.add(session.studentId)
      map.set(session.teacherId, set)
    }
    return map
  }, [lessonSessions])

  function updateRow(id: string, patch: Partial<AllocationRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
  }

  function onTeacherChange(row: AllocationRow, teacherId: string) {
    updateRow(row.id, { teacherId, studentId: "", lessonSessionId: "", amount: "" })
  }

  function onStudentChange(row: AllocationRow, studentId: string) {
    const student = students.find((item) => item.id === studentId)
    updateRow(row.id, { studentId, lessonSessionId: "", amount: student ? String(student.monthlyFee) : "" })
  }

  async function submit() {
    setLoading(true)
    setError("")
    try {
      const payload = {
        note,
        mode,
        allocations: rows.map((row) => ({
          teacherId: row.teacherId,
          studentId: row.studentId,
          lessonSessionId: row.lessonSessionId,
          amount: Number(row.amount),
        })),
      }
      const res = await fetch(`/api/payment-matches/${match.id}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Validation impossible.")
      onClose()
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation impossible.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-3">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4 sm:p-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Associer un paiement non traité</h3>
            <p className="mt-1 text-sm text-gray-500">
              {match.source === "PAYPAL" ? "PayPal" : "Wise"} · {formatCurrency(match.receivedAmount)} · {match.detectedPayerName || "Payeur non détecté"}
            </p>
            {(match.paymentLabel || match.rawSubject) && (
              <p className="mt-0.5 text-xs text-gray-500">Libellé : {match.paymentLabel || match.rawSubject}</p>
            )}
            <p className="mt-0.5 text-xs text-gray-400">Numéro de transfert / transaction : {match.gmailMessageId}</p>
          </div>
          <button className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("sessions")}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${mode === "sessions" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600"}`}
            >
              Ce paiement est pour plusieurs sessions
            </button>
            <button
              type="button"
              onClick={() => setMode("students")}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${mode === "students" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600"}`}
            >
              Ce paiement est pour plusieurs élèves
            </button>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div><span className="text-gray-400">Reçu</span><p className="font-semibold">{formatCurrency(match.receivedAmount)}</p></div>
              <div><span className="text-gray-400">Validé</span><p className="font-semibold">{formatCurrency(allocated)}</p></div>
              <div><span className="text-gray-400">Reste</span><p className={`font-semibold ${remaining < -0.01 ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(remaining)}</p></div>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const teacherStudentIds = row.teacherId ? studentsByTeacher.get(row.teacherId) : null
              const selectableStudents = row.teacherId
                ? students.filter((student) => student.group?.teacherId === row.teacherId || teacherStudentIds?.has(student.id))
                : []
              const selectableSessions = lessonSessions.filter((session) => (
                session.teacherId === row.teacherId && session.studentId === row.studentId
              ))
              const selectedStudent = students.find((student) => student.id === row.studentId)

              return (
                <div key={row.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">Association {index + 1}</p>
                    {rows.length > 1 && (
                      <button type="button" className="text-xs font-medium text-red-600" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>
                        Retirer
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_8rem]">
                    <Select value={row.teacherId} onValueChange={(value) => onTeacherChange(row, value)}>
                      <SelectTrigger><SelectValue placeholder="Professeur" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={row.studentId} onValueChange={(value) => onStudentChange(row, value)} disabled={!row.teacherId}>
                      <SelectTrigger><SelectValue placeholder={row.teacherId ? "Élève" : "Choisir professeur"} /></SelectTrigger>
                      <SelectContent>
                        {selectableStudents.map((student) => (
                          <SelectItem key={student.id} value={student.id}>
                            {student.firstName} {student.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={row.lessonSessionId} onValueChange={(value) => updateRow(row.id, { lessonSessionId: value })} disabled={!row.studentId}>
                      <SelectTrigger><SelectValue placeholder={row.studentId ? "Session" : "Choisir élève"} /></SelectTrigger>
                      <SelectContent>
                        {selectableSessions.map((session) => (
                          <SelectItem key={session.id} value={session.id}>
                            Session {session.number} · {session.subject}{session.isComplete ? " · terminée" : " · à venir"}
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
                    {selectedStudent
                      ? `Forfait élève : ${formatCurrency(selectedStudent.monthlyFee)} · Payeur attendu : ${selectedStudent.payerName || "non renseigné"}`
                      : "Choisissez un élève pour afficher son forfait."}
                  </p>
                </div>
              )
            })}
          </div>

          <Button type="button" variant="outline" onClick={() => setRows((current) => [...current, newAllocationRow(null)])}>
            <Plus className="h-4 w-4" />
            Ajouter une validation
          </Button>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Note interne</label>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ex: 2 sessions payées, frère et sœur, avance..." />
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button
              onClick={submit}
              disabled={loading || rows.some((row) => !row.teacherId || !row.studentId || !row.lessonSessionId || !row.amount) || remaining < -0.01}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Valider le paiement
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SecretaryPayBlock() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ secretaryName: string; collectedTotal: number; amount: number; paymentCount: number; periodStart: string; periodEnd: string } | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  async function calculate() {
    setLoading(true)
    setConfirmed(false)
    const res = await fetch("/api/salaries/secretary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) setResult(data[0])
    setLoading(false)
  }

  async function confirm() {
    setLoading(true)
    await fetch("/api/salaries/secretary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) })
    setConfirmed(true)
    setLoading(false)
  }

  return (
    <Card className="border-violet-200 bg-violet-50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-violet-600" />
            <span className="font-semibold text-violet-900">Clôturer la paie de la secrétaire</span>
          </div>
          <Button variant="outline" size="sm" onClick={calculate} disabled={loading} className="border-violet-300 text-violet-700 hover:bg-violet-100">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Calculator className="h-4 w-4 mr-1" />}
            Prévisualiser (10%)
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-violet-200 bg-white p-4 space-y-2">
            <p className="font-medium text-gray-900">{result.secretaryName}</p>
            <p className="text-xs text-gray-400">
              Période : {new Date(result.periodStart).toLocaleDateString("fr-FR")} → {new Date(result.periodEnd).toLocaleDateString("fr-FR")}
            </p>
            <p className="text-xs text-gray-400">
              {result.paymentCount} paiement{result.paymentCount > 1 ? "s" : ""} inclus dans cette clôture.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total encaissé</span>
              <span className="font-medium">{formatCurrency(result.collectedTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Commission 10%</span>
              <span className="text-lg font-bold text-violet-700">{formatCurrency(result.amount)}</span>
            </div>
            {!confirmed ? (
              <Button size="sm" onClick={confirm} disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white mt-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Confirmer et clôturer cette période
              </Button>
            ) : (
              <p className="text-sm text-emerald-600 font-medium mt-2">✓ Période clôturée et fiche de paie enregistrée</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
