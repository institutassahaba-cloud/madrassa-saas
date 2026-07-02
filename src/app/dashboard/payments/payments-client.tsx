"use client"
import { useMemo, useState } from "react"
import { Plus, Search, AlertTriangle, CheckCircle2, Clock, Ban, Calculator, Loader2, SplitSquareHorizontal, X, PlayCircle, PauseCircle, ChevronDown, ChevronUp, Trash2, RotateCcw, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PaymentDialog } from "./payment-dialog"
import { formatCurrency, formatDate } from "@/lib/utils"
import { PAYMENT_PAID_STATUSES, PAYMENT_AWAITING_STATUSES } from "@/lib/payment-status"

const STATUS_CONFIG = {
  // Statuts canoniques
  EXPECTED: { label: "Attendu", variant: "warning" as const, icon: Clock, color: "text-amber-600" },
  EMAIL_SENT: { label: "Demande envoyée", variant: "warning" as const, icon: Clock, color: "text-amber-600" },
  REMINDED: { label: "Relancé", variant: "warning" as const, icon: AlertTriangle, color: "text-orange-600" },
  CONFIRMED: { label: "Payé", variant: "success" as const, icon: CheckCircle2, color: "text-emerald-600" },
  REJECTED: { label: "Rejeté", variant: "destructive" as const, icon: Ban, color: "text-red-600" },
  // Statuts hérités (affichage rétrocompatible)
  PAID: { label: "Payé", variant: "success" as const, icon: CheckCircle2, color: "text-emerald-600" },
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
  confirmedAt?: Date | string | null
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

interface PaymentPeriod {
  id: string
  label: string
  start: string | null
  end: string | null
  isCurrent?: boolean
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
  confirmedPaymentMatches,
  trashedPaymentMatches,
  pendingPayments,
  paymentPeriods,
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
  confirmedPaymentMatches: PaymentMatch[]
  trashedPaymentMatches: PaymentMatch[]
  pendingPayments: Payment[]
  paymentPeriods: PaymentPeriod[]
  currentMonth: number
  currentYear: number
  isDirector: boolean
  scanControl: { enabled: boolean; startedAt: string | null }
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [periodFilter, setPeriodFilter] = useState("CURRENT")
  const [teacherFilter, setTeacherFilter] = useState("ALL")
  const [sortKey, setSortKey] = useState<PaymentSortKey>("paidDate")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPayment, setEditPayment] = useState<Payment | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<PaymentMatch | null>(null)
  const [scanState, setScanState] = useState(scanControl)
  const [scanLoading, setScanLoading] = useState(false)
  const [unprocessedOpen, setUnprocessedOpen] = useState(paymentMatches.length > 0)
  const [autoOpen, setAutoOpen] = useState(autoPaymentMatches.length > 0)
  const [confirmedOpen, setConfirmedOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [matchActionLoading, setMatchActionLoading] = useState<string | null>(null)
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [nowTime] = useState(() => Date.now())

  function paymentTeacherId(payment: Payment) {
    return payment.lessonSession?.teacherId ?? payment.student.group?.teacherId ?? null
  }

  function paymentTeacherName(payment: Payment) {
    const teacherId = paymentTeacherId(payment)
    return teachers.find((teacher) => teacher.id === teacherId)?.name ?? "—"
  }

  function paymentDateValue(payment: Payment) {
    return new Date(payment.confirmedAt || payment.paidDate || payment.createdAt).getTime()
  }

  const filtered = payments.filter((p) => {
    const name = `${p.student.firstName} ${p.student.lastName}`.toLowerCase()
    const teacherName = paymentTeacherName(p).toLowerCase()
    const matchSearch = name.includes(search.toLowerCase()) || teacherName.includes(search.toLowerCase()) || (p.reference ?? "").includes(search)
    const matchStatus =
      statusFilter === "ALL" ? true
      : statusFilter === "PAID" ? (PAYMENT_PAID_STATUSES as readonly string[]).includes(p.status)
      : statusFilter === "AWAITING" ? (PAYMENT_AWAITING_STATUSES as readonly string[]).includes(p.status)
      : p.status === statusFilter
    const matchTeacher = teacherFilter === "ALL" || paymentTeacherId(p) === teacherFilter
    const period = paymentPeriods.find((item) => item.id === periodFilter)
    const paymentDate = paymentDateValue(p)
    const matchPeriod = !period || periodFilter === "ALL"
      ? true
      : period.isCurrent && !period.start
        ? false
      : (!period.start || paymentDate > new Date(period.start).getTime()) && (!period.end || paymentDate <= new Date(period.end).getTime())
    return matchSearch && matchStatus && matchTeacher && matchPeriod
  }).sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1
    if (sortKey === "student") {
      return `${a.student.lastName} ${a.student.firstName}`.localeCompare(`${b.student.lastName} ${b.student.firstName}`, "fr") * direction
    }
    if (sortKey === "teacher") return paymentTeacherName(a).localeCompare(paymentTeacherName(b), "fr") * direction
    if (sortKey === "amount") return (a.amount - b.amount) * direction
    if (sortKey === "method") return (a.method ?? "").localeCompare(b.method ?? "", "fr") * direction
    return (paymentDateValue(a) - paymentDateValue(b)) * direction
  })

  const summary = {
    paid: filtered.filter((p) => (PAYMENT_PAID_STATUSES as readonly string[]).includes(p.status)).reduce((sum, p) => sum + p.amount, 0),
    sentRequests: pendingPayments.length,
    toVerify: paymentMatches.length,
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

  function updateSort(nextKey: PaymentSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc")
    } else {
      setSortKey(nextKey)
      setSortDirection(nextKey === "paidDate" ? "desc" : "asc")
    }
  }

  function toggleMatchSelection(matchId: string, checked: boolean) {
    setSelectedMatchIds((current) => {
      const next = new Set(current)
      if (checked) next.add(matchId)
      else next.delete(matchId)
      return next
    })
  }

  function toggleAllMatches(checked: boolean) {
    setSelectedMatchIds(checked ? new Set(paymentMatches.map((match) => match.id)) : new Set())
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

  async function updatePaymentMatch(matchId: string, action: "trash" | "restore") {
    const confirmed = action === "trash"
      ? window.confirm("Mettre ce paiement non traité dans la corbeille ? Vous pourrez le restaurer ensuite.")
      : true
    if (!confirmed) return
    setMatchActionLoading(matchId)
    try {
      const res = await fetch(`/api/payment-matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Action impossible.")
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setMatchActionLoading(null)
    }
  }

  async function cancelMatch(matchId: string) {
    if (!window.confirm(
      "Annuler ce paiement validé ? Le(s) paiement(s) créé(s) seront retirés (les sessions concernées repasseront en « non payé ») et le paiement reviendra dans « à valider » pour être ré-attribué."
    )) return
    setMatchActionLoading(matchId)
    try {
      const res = await fetch(`/api/payment-matches/${matchId}/cancel`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Annulation impossible.")
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Annulation impossible.")
    } finally {
      setMatchActionLoading(null)
    }
  }

  async function trashSelectedMatches() {
    if (selectedMatchIds.size === 0) return
    const confirmed = window.confirm(`Mettre ${selectedMatchIds.size} paiement(s) non traité(s) dans la corbeille ? Vous pourrez les restaurer ensuite.`)
    if (!confirmed) return
    setMatchActionLoading("bulk-trash")
    try {
      for (const matchId of selectedMatchIds) {
        const res = await fetch(`/api/payment-matches/${matchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trash" }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Action impossible.")
      }
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action impossible.")
      setMatchActionLoading(null)
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
              <p className="text-xs text-gray-500">Paiements validés</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(summary.paid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-xs text-gray-500">Demandes envoyées</p>
              <p className="text-lg font-bold text-gray-900">{summary.sentRequests}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-xs text-gray-500">À vérifier / non traités</p>
              <p className="text-lg font-bold text-gray-900">{summary.toVerify}</p>
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
            <button
              type="button"
              onClick={() => setUnprocessedOpen((value) => !value)}
              className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-semibold text-amber-900">Paiements non traités</h3>
                <p className="text-sm text-amber-700">
                  Paiements reçus sans concordance automatique, à associer à un ou plusieurs élèves, professeurs ou sessions.
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="warning">{paymentMatches.length} à traiter</Badge>
                {unprocessedOpen ? <ChevronUp className="h-4 w-4 text-amber-700" /> : <ChevronDown className="h-4 w-4 text-amber-700" />}
              </span>
            </button>

            {unprocessedOpen && <div className="space-y-2">
              <div className="flex flex-col gap-2 rounded-lg border border-amber-100 bg-white/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-amber-300"
                    checked={paymentMatches.length > 0 && selectedMatchIds.size === paymentMatches.length}
                    onChange={(event) => toggleAllMatches(event.target.checked)}
                  />
                  Tout sélectionner
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={trashSelectedMatches}
                  disabled={selectedMatchIds.size === 0 || matchActionLoading === "bulk-trash"}
                  className="border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  {matchActionLoading === "bulk-trash" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Mettre la sélection à la corbeille
                </Button>
              </div>
              {paymentMatches.map((match) => (
                <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 rounded border-amber-300"
                      checked={selectedMatchIds.has(match.id)}
                      onChange={(event) => toggleMatchSelection(match.id, event.target.checked)}
                      aria-label="Sélectionner ce paiement non traité"
                    />
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
                  </div>
                  <div className="grid gap-2 sm:flex sm:items-center">
                    <Button size="sm" onClick={() => setSelectedMatch(match)}>
                      <SplitSquareHorizontal className="h-4 w-4" />
                      Associer un élève
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => updatePaymentMatch(match.id, "trash")}
                      disabled={matchActionLoading === match.id}
                      title="Mettre à la corbeille"
                    >
                      {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-500" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>}
          </CardContent>
        </Card>
      )}

      {autoPaymentMatches.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => setAutoOpen((value) => !value)}
              className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-semibold text-emerald-900">Paiements auto-validés</h3>
                <p className="text-sm text-emerald-700">
                  Validés automatiquement. En cas d&apos;erreur, vous pouvez corriger l&apos;association.
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="success">{autoPaymentMatches.length} validé(s)</Badge>
                {autoOpen ? <ChevronUp className="h-4 w-4 text-emerald-700" /> : <ChevronDown className="h-4 w-4 text-emerald-700" />}
              </span>
            </button>
            {autoOpen && <div className="space-y-2">
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
            </div>}
          </CardContent>
        </Card>
      )}

      {confirmedPaymentMatches.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => setConfirmedOpen((value) => !value)}
              className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-semibold text-blue-900">Paiements validés (récents)</h3>
                <p className="text-sm text-blue-700">
                  En cas d&apos;erreur, annulez pour ré-attribuer : les sessions concernées repasseront en « non payé ».
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="info">{confirmedPaymentMatches.length} validé(s)</Badge>
                {confirmedOpen ? <ChevronUp className="h-4 w-4 text-blue-700" /> : <ChevronDown className="h-4 w-4 text-blue-700" />}
              </span>
            </button>
            {confirmedOpen && <div className="space-y-2">
              {confirmedPaymentMatches.map((match) => (
                <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={match.source === "PAYPAL" ? "info" : "secondary"}>{match.source === "PAYPAL" ? "PayPal" : "Wise"}</Badge>
                      <p className="font-semibold text-gray-900">{formatCurrency(match.receivedAmount)}</p>
                      <p className="text-sm text-gray-600">{match.detectedPayerName || "Payeur non détecté"}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Validé pour : {match.student ? `${match.student.firstName} ${match.student.lastName}` : "élève non renseigné"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">Référence : {match.gmailMessageId}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelMatch(match.id)}
                    disabled={matchActionLoading === match.id}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Annuler / Ré-attribuer"}
                  </Button>
                </div>
              ))}
            </div>}
          </CardContent>
        </Card>
      )}

      {trashedPaymentMatches.length > 0 && (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => setTrashOpen((value) => !value)}
              className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-semibold text-gray-900">Corbeille des paiements détectés</h3>
                <p className="text-sm text-gray-500">Paiements retirés des non traités, restaurables si besoin.</p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{trashedPaymentMatches.length} dans la corbeille</Badge>
                {trashOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </span>
            </button>
            {trashOpen && <div className="space-y-2">
              {trashedPaymentMatches.map((match) => (
                <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={match.source === "PAYPAL" ? "info" : "secondary"}>{match.source === "PAYPAL" ? "PayPal" : "Wise"}</Badge>
                      <p className="font-semibold text-gray-900">{formatCurrency(match.receivedAmount)}</p>
                      <p className="text-sm text-gray-600">{match.detectedPayerName || "Payeur non détecté"}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">Référence : {match.gmailMessageId}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => updatePaymentMatch(match.id, "restore")} disabled={matchActionLoading === match.id}>
                    {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Remettre dans non traités
                  </Button>
                </div>
              ))}
            </div>}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_12rem_10rem_minmax(16rem,18rem)]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Rechercher..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Professeur" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous professeurs</SelectItem>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous statuts</SelectItem>
                <SelectItem value="PAID">Payé</SelectItem>
                <SelectItem value="AWAITING">En attente</SelectItem>
                <SelectItem value="REJECTED">Rejeté</SelectItem>
              </SelectContent>
            </Select>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Période" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les périodes</SelectItem>
                {paymentPeriods.map((period) => (
                  <SelectItem key={period.id} value={period.id}>{period.label}</SelectItem>
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
                <TableHead>
                  <SortButton label="Élève" active={sortKey === "student"} direction={sortDirection} onClick={() => updateSort("student")} />
                </TableHead>
                <TableHead>
                  <SortButton label="Professeur" active={sortKey === "teacher"} direction={sortDirection} onClick={() => updateSort("teacher")} />
                </TableHead>
                <TableHead>
                  <SortButton label="Montant" active={sortKey === "amount"} direction={sortDirection} onClick={() => updateSort("amount")} />
                </TableHead>
                <TableHead>
                  <SortButton label="Moyen" active={sortKey === "method"} direction={sortDirection} onClick={() => updateSort("method")} />
                </TableHead>
                <TableHead>
                  <SortButton label="Date paiement" active={sortKey === "paidDate"} direction={sortDirection} onClick={() => updateSort("paidDate")} />
                </TableHead>
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
                      <TableCell className="text-sm text-gray-700">{paymentTeacherName(p)}</TableCell>
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

type PaymentSortKey = "student" | "teacher" | "amount" | "method" | "paidDate"
type SortDirection = "asc" | "desc"

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: SortDirection
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900">
      {label}
      <ArrowUpDown className={`h-3.5 w-3.5 ${active ? "text-emerald-600" : "text-gray-300"}`} />
      {active && <span className="sr-only">{direction === "asc" ? "tri croissant" : "tri décroissant"}</span>}
    </button>
  )
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
