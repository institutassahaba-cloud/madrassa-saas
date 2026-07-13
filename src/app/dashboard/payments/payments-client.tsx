"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, AlertTriangle, CheckCircle2, Clock, Ban, Calculator, Loader2, SplitSquareHorizontal, X, ChevronDown, ChevronUp, Trash2, RotateCcw, ArrowUpDown, UserCog, Check, Mail, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { PaymentDialog } from "./payment-dialog"
import { StudentDialog } from "../students/student-dialog"
import { formatCurrency, formatDate } from "@/lib/utils"
import { PAYMENT_PAID_STATUSES, PAYMENT_AWAITING_STATUSES } from "@/lib/payment-status"
import { studentLabelWithTeacherEmoji } from "@/lib/student-display"

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
  receivedAmount: number | null
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
  frequency: number | null
  duration: string | null
  paymentRequestedAt: Date | string | null
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
  paymentReference: string | null
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
  allocations?: {
    amount: number
    payment?: {
      id: string
      status: string
      sessionNumber: number | null
      student: { firstName: string; lastName: string }
      lessonSession: { number: number; subject: string; teacher: { name: string | null } } | null
    }
  }[]
}

// Total réellement validé (alloué) d'un match ; null si aucune allocation connue.
function allocatedTotal(match: PaymentMatch) {
  if (!match.allocations || match.allocations.length === 0) return null
  return match.allocations.reduce((sum, item) => sum + Number(item.amount), 0)
}

function paymentReceivedAmount(payment: Pick<Payment, "amount" | "receivedAmount">) {
  return Number(payment.receivedAmount ?? payment.amount ?? 0)
}

function paymentValidationDateValue(payment: Pick<Payment, "confirmedAt" | "paidDate">) {
  const date = payment.confirmedAt || payment.paidDate
  return date ? new Date(date).getTime() : null
}

function sourceBadge(match: Pick<PaymentMatch, "source">) {
  if (match.source === "PAYPAL") {
    return <Badge className="bg-blue-100 text-blue-800">PayPal</Badge>
  }
  if (match.source === "WISE") {
    return <Badge className="bg-emerald-100 text-emerald-800">Wise</Badge>
  }
  return <Badge variant="secondary">{match.source}</Badge>
}

function matchStatusConfig(status: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" } {
  if (status === "TO_VERIFY") return { label: "À associer", variant: "warning" }
  if (status === "CONFIRMED") return { label: "Validé", variant: "info" }
  if (status === "AUTO_CONFIRMED") return { label: "Auto-validé", variant: "success" }
  if (status === "DIRECTOR") return { label: "Élève directeur", variant: "secondary" }
  if (status === "TRASHED") return { label: "Ignoré", variant: "secondary" }
  return { label: status, variant: "outline" }
}

function formatScanDiagnostics(data: {
  ignoredReasons?: Record<string, number>
  ignoredSamples?: Array<{ reason: string; from: string; subject: string; date: string | null }>
  skippedMatches?: Array<{ status: string; payerName: string | null; reference: string | null; amount: number }>
}) {
  const sections: string[] = []
  const entries = Object.entries(data.ignoredReasons ?? {}).filter(([, count]) => Number(count) > 0)
  if (entries.length > 0) {
    sections.push(`Détail des emails non exploitables :\n${entries
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([reason, count]) => `- ${count} : ${reason}`)
    .join("\n")}`)
  }
  if ((data.skippedMatches ?? []).length > 0) {
    sections.push(`Déjà connus trouvés :\n${data.skippedMatches!
      .map((item) => `- ${item.status} : ${item.payerName || "payeur inconnu"} · ${formatCurrency(item.amount)} · ${item.reference || "sans référence"}`)
      .join("\n")}`)
  }
  if ((data.ignoredSamples ?? []).length > 0) {
    sections.push(`Exemples rejetés :\n${data.ignoredSamples!
      .map((item) => `- ${item.reason} · ${item.from || "expéditeur inconnu"} · ${item.subject || "sans sujet"}`)
      .join("\n")}`)
  }
  return sections.length ? `\n\n${sections.join("\n\n")}` : ""
}

// Référence lisible à afficher : la vraie référence (n° transfert Wise / transaction
// PayPal) en priorité. Sinon, pour les anciennes lignes, on tolère l'ancienne clé —
// mais on masque l'ID Gmail brut (hex), inutile à l'utilisateur.
function displayReference(match: Pick<PaymentMatch, "paymentReference" | "gmailMessageId">) {
  if (match.paymentReference) return match.paymentReference
  const legacy = match.gmailMessageId || ""
  if (!legacy || /^[0-9a-f]{12,}$/i.test(legacy) || legacy.startsWith("gmail:")) return "—"
  return legacy
}

function paymentMonthKeyFromTime(time: number) {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function formatPaymentMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}

export function PaymentsClient({
  payments,
  students,
  teachers,
  groups,
  lessonSessions,
  paidBySession,
  paymentMatches,
  autoPaymentMatches,
  confirmedPaymentMatches,
  trashedPaymentMatches,
  directorPaymentMatches,
  pendingPayments,
  paymentPeriods,
  currentMonth,
  currentYear,
  isDirector,
  scanControl,
  periodControl,
}: {
  payments: Payment[]
  students: Student[]
  teachers: Teacher[]
  groups: { id: string; name: string; teacherId: string | null }[]
  lessonSessions: LessonSessionOption[]
  paidBySession: Record<string, string>
  paymentMatches: PaymentMatch[]
  autoPaymentMatches: PaymentMatch[]
  confirmedPaymentMatches: PaymentMatch[]
  trashedPaymentMatches: PaymentMatch[]
  directorPaymentMatches: PaymentMatch[]
  pendingPayments: Payment[]
  paymentPeriods: PaymentPeriod[]
  currentMonth: number
  currentYear: number
  isDirector: boolean
  scanControl: { enabled: boolean; startedAt: string | null; lastRunAt?: string | null; lastError?: string | null }
  periodControl: { currentStart: string; isManual: boolean }
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [periodFilter] = useState("CURRENT")
  const [teacherFilter, setTeacherFilter] = useState("ALL")
  const [unprocessedDateFrom, setUnprocessedDateFrom] = useState("")
  const [unprocessedDateTo, setUnprocessedDateTo] = useState("")
  const [matchSearch, setMatchSearch] = useState("")
  const [payerSearchLoading, setPayerSearchLoading] = useState(false)
  const [sortKey, setSortKey] = useState<PaymentSortKey>("paidDate")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPayment, setEditPayment] = useState<Payment | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<PaymentMatch | null>(null)
  const [newStudentOpen, setNewStudentOpen] = useState(false)
  // Paiement d'où l'on a cliqué « nouvel élève » : pré-rempli pour l'élève 1 du formulaire.
  const [newStudentPaymentId, setNewStudentPaymentId] = useState("")
  const [importLoading, setImportLoading] = useState(false)
  const [unprocessedOpen, setUnprocessedOpen] = useState(true)
  const [autoOpen, setAutoOpen] = useState(autoPaymentMatches.length > 0)
  const [confirmedOpen, setConfirmedOpen] = useState(true)
  const [trashOpen, setTrashOpen] = useState(false)
  const [directorOpen, setDirectorOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [historyMonthKey, setHistoryMonthKey] = useState("LATEST")
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [matchActionLoading, setMatchActionLoading] = useState<string | null>(null)
  const [paymentDeleteLoading, setPaymentDeleteLoading] = useState<string | null>(null)
  const [localPaymentMatches, setLocalPaymentMatches] = useState(paymentMatches)
  // Resynchro indispensable : après une association, le dialog appelle
  // router.refresh() qui renvoie des `paymentMatches` frais côté serveur. Sans
  // ce useEffect, la liste restait figée sur le 1er snapshot (le paiement associé
  // ne disparaissait pas de « à associer » et le compteur restait faux).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalPaymentMatches(paymentMatches)
  }, [paymentMatches])
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [selectedConfirmedMatchIds, setSelectedConfirmedMatchIds] = useState<Set<string>>(new Set())
  const [selectedTrashedIds, setSelectedTrashedIds] = useState<Set<string>>(new Set())
  const [selectedDirectorIds, setSelectedDirectorIds] = useState<Set<string>>(new Set())
  const [nowTime] = useState(() => Date.now())

  function paymentTeacherId(payment: Payment) {
    return payment.lessonSession?.teacherId ?? payment.student.group?.teacherId ?? null
  }

  function paymentTeacherName(payment: Payment) {
    const teacherId = paymentTeacherId(payment)
    return teachers.find((teacher) => teacher.id === teacherId)?.name ?? "—"
  }

  function teacherNameById(teacherId: string | null | undefined) {
    return teachers.find((teacher) => teacher.id === teacherId)?.name ?? null
  }

  function paymentStudentLabel(payment: Payment) {
    return studentLabelWithTeacherEmoji(`${payment.student.firstName} ${payment.student.lastName}`, paymentTeacherName(payment))
  }

  function matchStudentLabel(match: PaymentMatch) {
    if (!match.student) return "élève non renseigné"
    const teacherName = teacherNameById(
      lessonSessions.find((session) => session.studentId === match.student?.id)?.teacherId ?? null
    )
    return studentLabelWithTeacherEmoji(`${match.student.firstName} ${match.student.lastName}`, teacherName)
  }

  function paymentDateValue(payment: Payment) {
    return new Date(payment.confirmedAt || payment.paidDate || payment.createdAt).getTime()
  }

  function paymentHasValidatedSession(payment: Payment) {
    return Boolean(payment.lessonSession?.id || payment.sessionNumber != null)
  }

  function matchDateValue(match: PaymentMatch) {
    return new Date(match.paymentDate || match.createdAt).getTime()
  }

  function dayStart(value: string) {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }

  function dayEnd(value: string) {
    const date = new Date(value)
    date.setHours(23, 59, 59, 999)
    return date.getTime()
  }

  const filteredPaymentMatches = localPaymentMatches.filter((match) => {
    const date = matchDateValue(match)
    const afterStart = !unprocessedDateFrom || date >= dayStart(unprocessedDateFrom)
    const beforeEnd = !unprocessedDateTo || date <= dayEnd(unprocessedDateTo)
    const needle = matchSearch.trim().toLowerCase()
    const allocationText = match.allocations?.map((allocation) => {
      const payment = allocation.payment
      if (!payment) return ""
      const student = `${payment.student.firstName} ${payment.student.lastName}`
      const session = payment.lessonSession
        ? `${payment.lessonSession.subject} session ${payment.lessonSession.number} ${payment.lessonSession.teacher.name ?? ""}`
        : payment.sessionNumber ? `session ${payment.sessionNumber}` : ""
      return `${student} ${session} ${payment.status}`
    }).join(" ")
    const matchText = !needle || [
      match.detectedPayerName,
      match.paymentReference,
      match.paymentLabel,
      match.rawSubject,
      match.student ? `${match.student.firstName} ${match.student.lastName}` : "",
      match.status,
      allocationText,
    ].some((field) => (field ?? "").toLowerCase().includes(needle))
    return afterStart && beforeEnd && matchText
  })
  const toVerifyMatches = filteredPaymentMatches.filter((match) => match.status === "TO_VERIFY")

  const selectedPeriod = paymentPeriods.find((item) => item.id === periodFilter)

  function matchesPaymentSearchAndTeacher(p: Payment) {
    const name = paymentStudentLabel(p).toLowerCase()
    const teacherName = paymentTeacherName(p).toLowerCase()
    const matchSearch = name.includes(search.toLowerCase()) || teacherName.includes(search.toLowerCase()) || (p.reference ?? "").includes(search)
    const matchTeacher = teacherFilter === "ALL" || paymentTeacherId(p) === teacherFilter
    return matchSearch && matchTeacher
  }

  const paymentHistoryMonths = useMemo(() => {
    const months = new Map<string, number>()
    for (const payment of payments) {
      const key = paymentMonthKeyFromTime(paymentDateValue(payment))
      months.set(key, (months.get(key) ?? 0) + 1)
    }
    return Array.from(months.entries())
      .map(([key, count]) => ({ key, count, label: formatPaymentMonthLabel(key) }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [payments])
  const activeHistoryMonthKey = historyMonthKey === "LATEST"
    ? paymentHistoryMonths[0]?.key ?? "ALL"
    : historyMonthKey
  const activeHistoryMonthIndex = paymentHistoryMonths.findIndex((month) => month.key === activeHistoryMonthKey)

  function matchesSelectedHistoryMonth(payment: Payment) {
    if (activeHistoryMonthKey === "ALL") return true
    return paymentMonthKeyFromTime(paymentDateValue(payment)) === activeHistoryMonthKey
  }

  const filtered = payments.filter((p) => {
    const matchStatus =
      statusFilter === "ALL" ? true
      : statusFilter === "PAID" ? (PAYMENT_PAID_STATUSES as readonly string[]).includes(p.status)
      : statusFilter === "AWAITING" ? (PAYMENT_AWAITING_STATUSES as readonly string[]).includes(p.status)
      : p.status === statusFilter
    return matchesPaymentSearchAndTeacher(p) && matchStatus && matchesSelectedHistoryMonth(p)
  }).sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1
    if (sortKey === "student") {
      return paymentStudentLabel(a).localeCompare(paymentStudentLabel(b), "fr") * direction
    }
    if (sortKey === "teacher") return paymentTeacherName(a).localeCompare(paymentTeacherName(b), "fr") * direction
    if (sortKey === "amount") return (a.amount - b.amount) * direction
    if (sortKey === "method") return (a.method ?? "").localeCompare(b.method ?? "", "fr") * direction
    return (paymentDateValue(a) - paymentDateValue(b)) * direction
  })

  const selectedPeriodLabel = periodFilter === "CURRENT"
    ? "période en cours"
    : periodFilter === "ALL"
      ? "toutes les périodes"
      : selectedPeriod?.label.toLowerCase() ?? "la période sélectionnée"
  const confirmedPaymentMatchTotal = confirmedPaymentMatches.reduce((sum, match) => {
    const allocated = allocatedTotal(match)
    const partial = allocated != null && match.receivedAmount - allocated > 0.01
    return sum + Number(partial ? allocated : match.receivedAmount)
  }, 0)

  const summary = {
    paid: confirmedPaymentMatchTotal,
    sentRequests: pendingPayments.length,
    toVerify: localPaymentMatches.filter((match) => match.status === "TO_VERIFY").length,
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
    setSelectedMatchIds(checked ? new Set(toVerifyMatches.map((match) => match.id)) : new Set())
  }

  function toggleConfirmedMatchSelection(matchId: string, checked: boolean) {
    setSelectedConfirmedMatchIds((current) => {
      const next = new Set(current)
      if (checked) next.add(matchId)
      else next.delete(matchId)
      return next
    })
  }

  function toggleAllConfirmedMatches(checked: boolean) {
    setSelectedConfirmedMatchIds(checked ? new Set(confirmedPaymentMatches.map((match) => match.id)) : new Set())
  }

  async function importUnprocessedPayments() {
    if (!unprocessedDateFrom) {
      alert("Choisissez une date de début pour importer les paiements Wise/PayPal.")
      return
    }
    setImportLoading(true)
    try {
      const res = await fetch("/api/connexions/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: unprocessedDateFrom,
          dateTo: unprocessedDateTo || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Import des paiements impossible.")
      alert(`${data.created ?? 0} paiement(s) importé(s).\n${data.updated ?? 0} paiement(s) complété(s).\n${data.skipped ?? 0} paiement(s) ignoré(s) car déjà connus ou déjà attribués.\n${data.ignored ?? 0} email(s) scanné(s) mais non exploitables.\n${data.scanned ?? 0} email(s) scanné(s) au total.${formatScanDiagnostics(data)}`)
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Import des paiements impossible.")
    } finally {
      setImportLoading(false)
    }
  }

  async function searchPayerInGmail() {
    const name = matchSearch.trim()
    if (name.length < 3) {
      alert("Entrez au moins 3 lettres du nom du payeur à rechercher.")
      return
    }
    setPayerSearchLoading(true)
    try {
      const res = await fetch("/api/connexions/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payerName: name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Recherche Gmail impossible.")
      alert(`Recherche « ${name} » :\n${data.created ?? 0} nouveau(x) paiement(s) importé(s).\n${data.updated ?? 0} complété(s).\n${data.skipped ?? 0} déjà connu(s).\n${data.ignored ?? 0} non exploitable(s).\n${data.scanned ?? 0} email(s) scanné(s).${formatScanDiagnostics(data)}`)
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Recherche Gmail impossible.")
    } finally {
      setPayerSearchLoading(false)
    }
  }

  async function updatePaymentMatch(matchId: string, action: "trash" | "restore" | "director") {
    const confirmed = action === "trash"
      ? window.confirm("Ignorer ce paiement ? Il quittera les paiements à associer, mais vous pourrez le restaurer ensuite.")
      : action === "director"
        ? window.confirm("Classer ce paiement dans les élèves du directeur ? Il ne sera plus compté ni proposé dans les paiements à associer. Le même payeur sera reconnu automatiquement la prochaine fois.")
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
      const nextStatus = action === "trash" ? "TRASHED" : action === "director" ? "DIRECTOR" : "TO_VERIFY"
      setLocalPaymentMatches((current) => current.map((match) => (
        match.id === matchId
          ? {
              ...match,
              status: nextStatus,
              reason: action === "director"
                ? "Payeur connu : élève du directeur (hors institut)."
                : action === "trash"
                  ? "Paiement ignoré : hors institut."
                  : "Paiement restauré, à associer.",
            }
          : match
      )))
      setSelectedMatchIds((current) => {
        const next = new Set(current)
        next.delete(matchId)
        return next
      })
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setMatchActionLoading(null)
    }
  }

  async function deletePayment(payment: Payment) {
    const label = `${paymentStudentLabel(payment)} · ${formatCurrency(payment.amount)}${payment.sessionNumber ? ` · session ${payment.sessionNumber}` : ""}`
    if (!window.confirm(`Supprimer définitivement ce paiement ?\n${label}\nLa session liée repassera « non payée ». Action irréversible.`)) return
    setPaymentDeleteLoading(payment.id)
    try {
      const res = await fetch(`/api/payments/${payment.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Suppression impossible.")
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Suppression impossible.")
      setPaymentDeleteLoading(null)
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
    const visibleIds = toVerifyMatches.map((match) => match.id).filter((id) => selectedMatchIds.has(id))
    if (visibleIds.length === 0) return
    const confirmed = window.confirm(`Ignorer ${visibleIds.length} paiement(s) ? Ils quitteront les paiements à associer, mais vous pourrez les restaurer ensuite.`)
    if (!confirmed) return
    setMatchActionLoading("bulk-trash")
    try {
      for (const matchId of visibleIds) {
        const res = await fetch(`/api/payment-matches/${matchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trash" }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Action impossible.")
      }
      const ids = new Set(visibleIds)
      setLocalPaymentMatches((current) => current.map((match) => (
        ids.has(match.id)
          ? { ...match, status: "TRASHED", reason: "Paiement ignoré : hors institut." }
          : match
      )))
      setSelectedMatchIds(new Set())
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setMatchActionLoading(null)
    }
  }

  // Boucle une action (trash/director/restore/delete) sur plusieurs paiements.
  async function runBulkMatchAction(ids: string[], action: string) {
    for (const matchId of ids) {
      const res = await fetch(`/api/payment-matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Action impossible.")
    }
  }

  // « à associer » → élèves du directeur, en lot.
  async function directorSelectedMatches() {
    const ids = toVerifyMatches.map((match) => match.id).filter((id) => selectedMatchIds.has(id))
    if (ids.length === 0) return
    if (!window.confirm(`Classer ${ids.length} paiement(s) dans les élèves du directeur ? Ils quitteront la liste « à associer ».`)) return
    setMatchActionLoading("bulk-director")
    try {
      await runBulkMatchAction(ids, "director")
      setSelectedMatchIds(new Set())
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setMatchActionLoading(null)
    }
  }

  // Paiements ignorés : restaurer OU supprimer définitivement, en lot.
  async function bulkTrashedAction(action: "restore" | "delete") {
    const ids = trashedPaymentMatches.map((match) => match.id).filter((id) => selectedTrashedIds.has(id))
    if (ids.length === 0) return
    const message = action === "delete"
      ? `Supprimer DÉFINITIVEMENT ${ids.length} paiement(s) ignoré(s) ? Action irréversible.`
      : `Restaurer ${ids.length} paiement(s) dans « à associer » ?`
    if (!window.confirm(message)) return
    setMatchActionLoading(`bulk-trashed-${action}`)
    try {
      await runBulkMatchAction(ids, action)
      setSelectedTrashedIds(new Set())
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setMatchActionLoading(null)
    }
  }

  // Élèves du directeur → « à associer », en lot.
  async function restoreSelectedDirectorMatches() {
    const ids = directorPaymentMatches.map((match) => match.id).filter((id) => selectedDirectorIds.has(id))
    if (ids.length === 0) return
    if (!window.confirm(`Remettre ${ids.length} paiement(s) dans « à associer » (ce n'est pas un élève du directeur) ?`)) return
    setMatchActionLoading("bulk-director-restore")
    try {
      await runBulkMatchAction(ids, "restore")
      setSelectedDirectorIds(new Set())
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action impossible.")
    } finally {
      setMatchActionLoading(null)
    }
  }

  async function reclassifySelectedConfirmedMatches() {
    if (selectedConfirmedMatchIds.size === 0) return
    const confirmed = window.confirm(
      `Remettre ${selectedConfirmedMatchIds.size} paiement(s) validé(s) dans la période en cours ?\n\nLa date réelle de paiement restera inchangée. Seule la date de classement interne sera mise à jour.`
    )
    if (!confirmed) return
    setMatchActionLoading("bulk-reclassify-confirmed")
    try {
      const res = await fetch("/api/payment-matches/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedConfirmedMatchIds) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Reclassement impossible.")
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Reclassement impossible.")
      setMatchActionLoading(null)
    }
  }

  // Fixe le début de la « période en cours » sur un paiement précis : ce
  // paiement et tous les suivants sont comptés, les précédents sortent du total.
  async function setPeriodStartFromPayment(payment: Payment) {
    const when = paymentValidationDateValue(payment)
    if (when == null) {
      alert("Ce paiement n'a pas de date de validation exploitable.")
      return
    }
    const label = paymentStudentLabel(payment)
    const confirmed = window.confirm(
      `Démarrer la « période en cours » à partir de ce paiement ?\n\n${formatCurrency(paymentReceivedAmount(payment))} · ${label} · ${formatDate(new Date(when).toISOString())}\n\nSeuls ce paiement et les suivants seront comptés dans le total.`
    )
    if (!confirmed) return
    setPeriodLoading(true)
    try {
      const res = await fetch("/api/payments/period", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: new Date(when).toISOString() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Impossible de fixer la période.")
      setPeriodDialogOpen(false)
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de fixer la période.")
      setPeriodLoading(false)
    }
  }

  async function resetPeriodStart() {
    const confirmed = window.confirm("Revenir au calcul automatique de la période (remise à zéro le 25 de chaque mois) ?")
    if (!confirmed) return
    setPeriodLoading(true)
    try {
      const res = await fetch("/api/payments/period", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Réinitialisation impossible.")
      setPeriodDialogOpen(false)
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : "Réinitialisation impossible.")
      setPeriodLoading(false)
    }
  }

  // Paiements validés (payés + session validée), triés du plus récent au plus
  // ancien : c'est la liste dans laquelle le directeur pointe le départ de période.
  const validatedPaymentsForPicker = payments
    .filter((p) => paymentHasValidatedSession(p) && (PAYMENT_PAID_STATUSES as readonly string[]).includes(p.status) && paymentValidationDateValue(p) != null)
    .sort((a, b) => (paymentValidationDateValue(b) ?? 0) - (paymentValidationDateValue(a) ?? 0))

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
            <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-500" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">Paiements validés · {selectedPeriodLabel}</p>
              <p className="text-lg font-bold text-gray-900">{formatCurrency(summary.paid)}</p>
              <p className="text-[11px] text-gray-400">{confirmedPaymentMatches.length} paiement{confirmedPaymentMatches.length > 1 ? "s" : ""} validé{confirmedPaymentMatches.length > 1 ? "s" : ""}</p>
              {isDirector && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[11px] text-gray-400">
                    Période en cours depuis le {formatDate(periodControl.currentStart)}
                    {periodControl.isManual ? " (manuel)" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPeriodDialogOpen(true)}
                    className="text-[11px] font-medium text-emerald-700 hover:underline"
                  >
                    Modifier
                  </button>
                  {periodControl.isManual && (
                    <button
                      type="button"
                      onClick={resetPeriodStart}
                      disabled={periodLoading}
                      className="text-[11px] font-medium text-gray-500 hover:underline disabled:opacity-50"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
              )}
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
              <p className="text-xs text-gray-500">Paiements à associer</p>
              <p className="text-lg font-bold text-gray-900">{summary.toVerify}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingPayments.length > 0 && (
        <Card className="border-amber-200">
          <CardContent className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => setPendingOpen((value) => !value)}
              className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-semibold text-gray-900">Paiements en attente</h3>
                <p className="text-sm text-gray-500">Vert : 1 à 3 jours · Orange : 4 à 5 jours · Rouge : 6 jours et plus.</p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="warning">{pendingPayments.length} en attente</Badge>
                {pendingOpen ? <ChevronUp className="h-4 w-4 text-amber-700" /> : <ChevronDown className="h-4 w-4 text-amber-700" />}
              </span>
            </button>
            {pendingOpen && (
              <div className="grid gap-2 lg:grid-cols-2">
                {pendingPayments.map((payment) => {
                  const days = pendingAgeDays(payment)
                  return (
                    <div key={payment.id} className={`rounded-xl border p-3 ${pendingTone(days)}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{paymentStudentLabel(payment)}</p>
                          {payment.student.paymentGraceAllowed && (
                            <p className="mt-0.5 text-xs font-medium text-amber-700">Cours autorisé par le directeur</p>
                          )}
                          <p className="text-xs opacity-80">
                            {payment.lessonSession?.subject || "Session"} · Session {payment.sessionNumber ?? payment.lessonSession?.number ?? "—"}
                            {` · Professeur : ${paymentTeacherName(payment)}`}
                            {payment.student.group?.name ? ` · ${payment.student.group.name}` : ""}
                          </p>
                        </div>
                        <Badge variant={days >= 6 ? "destructive" : days >= 4 ? "warning" : "success"}>{days} j</Badge>
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold">{formatCurrency(payment.amount)}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full justify-center bg-white/90 text-gray-900 hover:bg-white sm:w-auto"
                          onClick={() => { setEditPayment(payment); setDialogOpen(true) }}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                          Ajouter manuellement le paiement
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calcul paie secrétaire (directeur) */}
      {isDirector && <SecretaryPayBlock />}

      {isDirector && (
        <Card className={scanControl.lastError ? "border-red-300 bg-red-50" : scanControl.enabled ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"}>
          <CardContent className="p-4">
            <div>
              <h3 className="font-semibold text-gray-900">Scan automatique des paiements</h3>
              <p className="text-sm text-gray-600">
                {scanControl.enabled
                  ? `Actif pour les mails reçus depuis ${scanControl.startedAt ? formatDate(scanControl.startedAt) : "l'activation"}.`
                  : "Non activé : utilisez l'import/recherche Gmail ci-dessous pour analyser les paiements."}
              </p>
              {scanControl.lastError && (
                <div className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Le scan tourne mais échoue : aucun paiement n&apos;est lu.
                  </p>
                  <p className="mt-0.5 text-xs text-red-600">
                    {/invalid_grant/i.test(scanControl.lastError)
                      ? <>Connexion Gmail expirée : allez dans <a href="/dashboard/connexions" className="font-semibold underline">Connexions</a> et reconnectez la boîte facturation.</>
                      : <>Erreur : {scanControl.lastError}</>}
                    {scanControl.lastRunAt ? ` (dernier essai : ${formatDate(scanControl.lastRunAt)})` : ""}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => setUnprocessedOpen((value) => !value)}
              className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-semibold text-amber-900">Paiements à associer</h3>
                <p className="text-sm text-amber-700">
                  Payeurs inconnus du système : associez à un élève, classez en élèves du directeur, ou ignorez si le virement est hors institut.
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="warning">{toVerifyMatches.length} à associer</Badge>
                {unprocessedOpen ? <ChevronUp className="h-4 w-4 text-amber-700" /> : <ChevronDown className="h-4 w-4 text-amber-700" />}
              </span>
            </button>

            {unprocessedOpen && <div className="space-y-2">
              <div className="grid gap-3 rounded-lg border border-amber-100 bg-white/70 px-3 py-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label>Reçu du</Label>
                  <Input type="date" value={unprocessedDateFrom} onChange={(event) => setUnprocessedDateFrom(event.target.value)} className="bg-white" />
                </div>
                <div className="space-y-1.5">
                  <Label>au</Label>
                  <Input type="date" value={unprocessedDateTo} onChange={(event) => setUnprocessedDateTo(event.target.value)} className="bg-white" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setUnprocessedDateFrom(""); setUnprocessedDateTo("") }}
                  disabled={!unprocessedDateFrom && !unprocessedDateTo}
                  className="border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  Effacer
                </Button>
                <Button
                  type="button"
                  onClick={importUnprocessedPayments}
                  disabled={!unprocessedDateFrom || importLoading}
                  className="gap-2 whitespace-nowrap"
                >
                  {importLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Importer Wise/PayPal
                </Button>
              </div>
              <div className="grid gap-3 rounded-lg border border-amber-100 bg-white/70 px-3 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label>Rechercher un payeur (nom ou référence)</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={matchSearch}
                      onChange={(event) => setMatchSearch(event.target.value)}
                      placeholder="Ex. Lionel Zilevu ou 2242560083"
                      className="bg-white pl-8"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMatchSearch("")}
                  disabled={!matchSearch}
                  className="border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  Effacer
                </Button>
                <Button
                  type="button"
                  onClick={searchPayerInGmail}
                  disabled={matchSearch.trim().length < 3 || payerSearchLoading}
                  className="gap-2 whitespace-nowrap"
                  title="Chercher dans toute la boîte Gmail les paiements PayPal/Wise de ce payeur"
                >
                  {payerSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Chercher dans Gmail
                </Button>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-amber-100 bg-white/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-amber-300"
                    checked={toVerifyMatches.length > 0 && toVerifyMatches.every((match) => selectedMatchIds.has(match.id))}
                    onChange={(event) => toggleAllMatches(event.target.checked)}
                  />
                  Tout sélectionner
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={directorSelectedMatches}
                    disabled={!toVerifyMatches.some((match) => selectedMatchIds.has(match.id)) || matchActionLoading === "bulk-director"}
                    className="border-violet-300 text-violet-900 hover:bg-violet-100"
                  >
                    {matchActionLoading === "bulk-director" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
                    Élèves du directeur
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={trashSelectedMatches}
                    disabled={!toVerifyMatches.some((match) => selectedMatchIds.has(match.id)) || matchActionLoading === "bulk-trash"}
                    className="border-amber-300 text-amber-900 hover:bg-amber-100"
                  >
                    {matchActionLoading === "bulk-trash" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Ignorer
                  </Button>
                </div>
              </div>
              {toVerifyMatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 p-6 text-center text-sm text-amber-800">
                  Aucun paiement à associer. Les paiements attribués sont dans « Paiements validés ».
                </div>
              ) : (
                <div className="space-y-2">
                  {toVerifyMatches.map((match) => {
                    const status = matchStatusConfig(match.status)
                    const allocations = match.allocations?.filter((allocation) => allocation.payment) ?? []
                    const canAssociate = match.status === "TO_VERIFY" || match.status === "AUTO_CONFIRMED"
                    const canTrash = match.status === "TO_VERIFY"
                    const canDirector = match.status === "TO_VERIFY"
                    const canRestore = match.status === "TRASHED" || match.status === "DIRECTOR"
                    const canCancel = match.status === "CONFIRMED" || match.status === "AUTO_CONFIRMED"

                    return (
                      <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          {canTrash && (
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0 rounded border-amber-300"
                              checked={selectedMatchIds.has(match.id)}
                              onChange={(event) => toggleMatchSelection(match.id, event.target.checked)}
                              aria-label="Sélectionner ce paiement à associer"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {sourceBadge(match)}
                              <p className="font-semibold text-gray-900">{formatCurrency(match.receivedAmount)}</p>
                              <p className="text-sm text-gray-600">{match.detectedPayerName || "Payeur non détecté"}</p>
                              <Badge variant={status.variant}>{status.label}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-gray-400">
                              Reçu le {formatDate(match.paymentDate || match.createdAt)} · Référence : {displayReference(match)}
                            </p>
                            {allocations.length > 0 ? (
                              <div className="mt-2 space-y-1">
                                {allocations.map((allocation, index) => {
                                  const payment = allocation.payment!
                                  const session = payment.lessonSession
                                    ? `${payment.lessonSession.subject} · Session ${payment.lessonSession.number}${payment.lessonSession.teacher.name ? ` · ${payment.lessonSession.teacher.name}` : ""}`
                                    : payment.sessionNumber ? `Session ${payment.sessionNumber}` : "Session non renseignée"
                                  return (
                                    <div key={`${payment.id}-${index}`} className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-900">
                                      <strong>{payment.student.firstName} {payment.student.lastName}</strong>
                                      <span className="block">{session} · {formatCurrency(allocation.amount)}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="mt-1 text-xs text-gray-400">
                                {match.student ? `Élève pressenti : ${matchStudentLabel(match)}` : "Aucun élève pressenti"}
                                {match.reason ? ` · ${match.reason}` : ""}
                              </p>
                            )}
                            {(match.paymentLabel || match.rawSubject) && (
                              <p className="mt-0.5 max-w-3xl truncate text-xs text-gray-500" title={match.paymentLabel || match.rawSubject || undefined}>
                                Libellé : {match.paymentLabel || match.rawSubject}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="grid gap-2 sm:flex sm:items-center sm:justify-end">
                          {canAssociate && (
                            <Button size="sm" onClick={() => setSelectedMatch(match)}>
                              <SplitSquareHorizontal className="h-4 w-4" />
                              {match.status === "AUTO_CONFIRMED" ? "Réassocier" : "Associer élève"}
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cancelMatch(match.id)}
                              disabled={matchActionLoading === match.id}
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                              Réassocier
                            </Button>
                          )}
                          {canDirector && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updatePaymentMatch(match.id, "director")}
                              disabled={matchActionLoading === match.id}
                              className="border-violet-200 text-violet-700 hover:bg-violet-50"
                              title="Ce paiement concerne les élèves du directeur"
                            >
                              {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
                              Élève directeur
                            </Button>
                          )}
                          {canRestore && (
                            <Button size="sm" variant="outline" onClick={() => updatePaymentMatch(match.id, "restore")} disabled={matchActionLoading === match.id}>
                              {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                              Restaurer
                            </Button>
                          )}
                          {canTrash && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => updatePaymentMatch(match.id, "trash")}
                              disabled={matchActionLoading === match.id}
                              title="Ignorer ce paiement hors institut"
                            >
                              {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-500" />}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>}
          </CardContent>
      </Card>

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
                      Validé pour : {matchStudentLabel(match)}
                      {match.reason ? ` · ${match.reason}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">Référence : {displayReference(match)}</p>
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
                  Paiements validés de la période en cours. En cas d&apos;erreur, annulez pour ré-attribuer.
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="info">{confirmedPaymentMatches.length} validé(s)</Badge>
                {confirmedOpen ? <ChevronUp className="h-4 w-4 text-blue-700" /> : <ChevronDown className="h-4 w-4 text-blue-700" />}
              </span>
            </button>
            {confirmedOpen && <div className="space-y-2">
              <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-white/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-blue-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-blue-300"
                    checked={confirmedPaymentMatches.length > 0 && selectedConfirmedMatchIds.size === confirmedPaymentMatches.length}
                    onChange={(event) => toggleAllConfirmedMatches(event.target.checked)}
                  />
                  Tout sélectionner
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reclassifySelectedConfirmedMatches}
                  disabled={selectedConfirmedMatchIds.size === 0 || matchActionLoading === "bulk-reclassify-confirmed"}
                  className="border-blue-300 text-blue-800 hover:bg-blue-100"
                >
                  {matchActionLoading === "bulk-reclassify-confirmed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Remettre dans la période en cours
                </Button>
              </div>
              {confirmedPaymentMatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-blue-200 bg-white/70 p-6 text-center text-sm text-blue-800">
                  Aucun paiement validé dans la période en cours.
                </div>
              ) : confirmedPaymentMatches.map((match) => {
                const allocated = allocatedTotal(match)
                const partial = allocated != null && match.receivedAmount - allocated > 0.01
                return (
                <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 rounded border-blue-300"
                      checked={selectedConfirmedMatchIds.has(match.id)}
                      onChange={(event) => toggleConfirmedMatchSelection(match.id, event.target.checked)}
                      aria-label="Sélectionner ce paiement validé"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={match.source === "PAYPAL" ? "info" : "secondary"}>{match.source === "PAYPAL" ? "PayPal" : "Wise"}</Badge>
                        <p className="font-semibold text-gray-900">{formatCurrency(partial ? allocated : match.receivedAmount)}{partial ? " validés" : ""}</p>
                        {partial && <p className="text-xs text-gray-500">sur {formatCurrency(match.receivedAmount)} reçus</p>}
                        <p className="text-sm text-gray-600">{match.detectedPayerName || "Payeur non détecté"}</p>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Validé pour : {matchStudentLabel(match)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">Référence : {displayReference(match)}</p>
                    </div>
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
                )
              })}
            </div>}
          </CardContent>
        </Card>

      {trashedPaymentMatches.length > 0 && (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => setTrashOpen((value) => !value)}
              className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-semibold text-gray-900">Paiements ignorés</h3>
                <p className="text-sm text-gray-500">Paiements hors institut retirés des paiements à associer, restaurables si besoin.</p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{trashedPaymentMatches.length} ignoré(s)</Badge>
                {trashOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </span>
            </button>
            {trashOpen && <div className="space-y-2">
              <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={trashedPaymentMatches.length > 0 && trashedPaymentMatches.every((match) => selectedTrashedIds.has(match.id))}
                    onChange={(event) => setSelectedTrashedIds(event.target.checked ? new Set(trashedPaymentMatches.map((m) => m.id)) : new Set())}
                  />
                  Tout sélectionner
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkTrashedAction("restore")}
                    disabled={selectedTrashedIds.size === 0 || matchActionLoading === "bulk-trashed-restore"}
                  >
                    {matchActionLoading === "bulk-trashed-restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Restaurer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkTrashedAction("delete")}
                    disabled={selectedTrashedIds.size === 0 || matchActionLoading === "bulk-trashed-delete"}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    {matchActionLoading === "bulk-trashed-delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Supprimer définitivement
                  </Button>
                </div>
              </div>
              {trashedPaymentMatches.map((match) => (
                <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                      checked={selectedTrashedIds.has(match.id)}
                      onChange={(event) => setSelectedTrashedIds((current) => {
                        const next = new Set(current)
                        if (event.target.checked) next.add(match.id)
                        else next.delete(match.id)
                        return next
                      })}
                      aria-label="Sélectionner ce paiement ignoré"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={match.source === "PAYPAL" ? "info" : "secondary"}>{match.source === "PAYPAL" ? "PayPal" : "Wise"}</Badge>
                        <p className="font-semibold text-gray-900">{formatCurrency(match.receivedAmount)}</p>
                        <p className="text-sm text-gray-600">{match.detectedPayerName || "Payeur non détecté"}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">Référence : {displayReference(match)}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => updatePaymentMatch(match.id, "restore")} disabled={matchActionLoading === match.id}>
                    {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Remettre dans « à associer »
                  </Button>
                </div>
              ))}
            </div>}
          </CardContent>
        </Card>
      )}

      {directorPaymentMatches.length > 0 && (
        <Card className="border-violet-200 bg-violet-50">
          <CardContent className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => setDirectorOpen((value) => !value)}
              className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-semibold text-violet-900">Paiements élèves du directeur</h3>
                <p className="text-sm text-violet-700">
                  Virements reçus qui concernent les élèves/familles du directeur. Non comptabilisés, non proposés dans « à associer ».
                </p>
              </div>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{directorPaymentMatches.length}</Badge>
                {directorOpen ? <ChevronUp className="h-4 w-4 text-violet-700" /> : <ChevronDown className="h-4 w-4 text-violet-700" />}
              </span>
            </button>
            {directorOpen && <div className="space-y-2">
              <div className="flex flex-col gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-violet-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-violet-300"
                    checked={directorPaymentMatches.length > 0 && directorPaymentMatches.every((match) => selectedDirectorIds.has(match.id))}
                    onChange={(event) => setSelectedDirectorIds(event.target.checked ? new Set(directorPaymentMatches.map((m) => m.id)) : new Set())}
                  />
                  Tout sélectionner
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={restoreSelectedDirectorMatches}
                  disabled={selectedDirectorIds.size === 0 || matchActionLoading === "bulk-director-restore"}
                  className="border-violet-300 text-violet-900 hover:bg-violet-100"
                >
                  {matchActionLoading === "bulk-director-restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Remettre dans « à associer »
                </Button>
              </div>
              {directorPaymentMatches.map((match) => (
                <div key={match.id} className="flex flex-col gap-3 rounded-xl border border-violet-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-violet-300"
                      checked={selectedDirectorIds.has(match.id)}
                      onChange={(event) => setSelectedDirectorIds((current) => {
                        const next = new Set(current)
                        if (event.target.checked) next.add(match.id)
                        else next.delete(match.id)
                        return next
                      })}
                      aria-label="Sélectionner ce paiement élève du directeur"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={match.source === "PAYPAL" ? "info" : "secondary"}>{match.source === "PAYPAL" ? "PayPal" : "Wise"}</Badge>
                        <p className="font-semibold text-gray-900">{formatCurrency(match.receivedAmount)}</p>
                        <p className="text-sm text-gray-600">{match.detectedPayerName || "Payeur non détecté"}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">Référence : {displayReference(match)}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => updatePaymentMatch(match.id, "restore")} disabled={matchActionLoading === match.id}>
                    {matchActionLoading === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Ce n&apos;est pas un élève du directeur
                  </Button>
                </div>
              ))}
            </div>}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h3 className="font-semibold text-gray-900">Historique des paiements</h3>
              <p className="text-sm text-gray-500">Classé par mois avec recherche, professeur et statut.</p>
            </div>
            <span className="flex items-center gap-2">
              <Badge variant="secondary">{filtered.length} paiement(s)</Badge>
              {historyOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
            </span>
          </button>

          {historyOpen && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_12rem_10rem_minmax(16rem,18rem)]">
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
                <Select value={activeHistoryMonthKey} onValueChange={setHistoryMonthKey}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Mois" /></SelectTrigger>
                  <SelectContent>
                    {paymentHistoryMonths.length === 0 ? (
                      <SelectItem value="ALL">Aucun mois</SelectItem>
                    ) : (
                      paymentHistoryMonths.map((month) => (
                        <SelectItem key={month.key} value={month.key}>{month.label} ({month.count})</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium capitalize text-gray-900">
                    {activeHistoryMonthKey === "ALL" ? "Tous les mois" : formatPaymentMonthLabel(activeHistoryMonthKey)}
                  </p>
                  <p className="text-xs text-gray-500">Une page par mois dans l&apos;historique.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activeHistoryMonthIndex < 0 || activeHistoryMonthIndex >= paymentHistoryMonths.length - 1}
                    onClick={() => setHistoryMonthKey(paymentHistoryMonths[activeHistoryMonthIndex + 1]?.key ?? activeHistoryMonthKey)}
                  >
                    Mois précédent
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activeHistoryMonthIndex <= 0}
                    onClick={() => setHistoryMonthKey(paymentHistoryMonths[activeHistoryMonthIndex - 1]?.key ?? activeHistoryMonthKey)}
                  >
                    Mois suivant
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
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
                        <p className="font-medium text-gray-900">{paymentStudentLabel(p)}</p>
                        {p.student.group && <p className="text-xs text-gray-500">{p.student.group.name}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">{paymentTeacherName(p)}</TableCell>
                      <TableCell><span className="font-semibold">{formatCurrency(paymentReceivedAmount(p))}</span></TableCell>
                      <TableCell className="text-sm text-gray-600">{p.method ?? "—"}</TableCell>
                      <TableCell className="text-sm">{p.paidDate ? formatDate(p.paidDate) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={cfg?.variant ?? "secondary"}>
                          {cfg?.label ?? p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Button variant="ghost" size="sm" onClick={() => { setEditPayment(p); setDialogOpen(true) }}>
                            Modifier
                          </Button>
                          {isDirector && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deletePayment(p)}
                              disabled={paymentDeleteLoading === p.id}
                              title="Supprimer ce paiement (erreur / test)"
                            >
                              {paymentDeleteLoading === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red-500" />}
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
              </div>
            </div>
          )}
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
          paidBySession={paidBySession}
          onNewStudent={(matchId) => { setNewStudentPaymentId(matchId); setNewStudentOpen(true) }}
          onAllocated={() => router.refresh()}
          onClose={() => setSelectedMatch(null)}
        />
      )}
      {/* Création d'un nouvel élève depuis un paiement non traité : même formulaire
          que « Fiches élèves » (classe, planning, alias payeur, 1er paiement...).
          Le paiement cliqué est pré-associé à l'élève 1 ; un binôme peut associer
          un paiement distinct à chaque élève via le menu de sa carte. */}
      <StudentDialog
        open={newStudentOpen}
        onClose={() => { setNewStudentOpen(false); setNewStudentPaymentId("") }}
        student={null}
        groups={groups}
        teachers={teachers}
        paymentMatches={localPaymentMatches}
        preselectedPaymentMatchId={newStudentPaymentId}
      />

      <Dialog open={periodDialogOpen} onOpenChange={(next) => { if (!periodLoading) setPeriodDialogOpen(next) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier la période en cours</DialogTitle>
            <DialogDescription>
              Choisissez le paiement à partir duquel démarre la période. Ce paiement et tous les suivants seront comptés dans le total « Paiements validés ». Les précédents en sortent.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
            {validatedPaymentsForPicker.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Aucun paiement validé à afficher.</p>
            ) : (
              validatedPaymentsForPicker.map((payment) => {
                const when = paymentValidationDateValue(payment)
                const isCurrentStart = when != null && Math.abs(when - 1 - new Date(periodControl.currentStart).getTime()) < 1000
                return (
                  <button
                    key={payment.id}
                    type="button"
                    onClick={() => setPeriodStartFromPayment(payment)}
                    disabled={periodLoading}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-emerald-50 disabled:opacity-50 ${isCurrentStart ? "bg-emerald-50" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900">{paymentStudentLabel(payment)}</span>
                      <span className="block text-xs text-gray-400">{when != null ? formatDate(new Date(when).toISOString()) : "—"}{isCurrentStart ? " · début actuel" : ""}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-gray-900">{formatCurrency(paymentReceivedAmount(payment))}</span>
                  </button>
                )
              })
            )}
          </div>
          {periodControl.isManual && (
            <Button variant="outline" onClick={resetPeriodStart} disabled={periodLoading} className="w-full">
              {periodLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              Réinitialiser (calcul automatique le 25)
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type AllocationRow = {
  id: string
  teacherId: string
  studentId: string
  lessonSessionIds: string[]
  amount: string
}

// Entrée de la recherche globale d'élève : un couple (élève, professeur).
type StudentOption = {
  key: string
  studentId: string
  teacherId: string
  name: string
  subjects: string[]
  teacherName: string
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
    lessonSessionIds: [],
    amount: "",
  }
}

// Sentinel encodant une session pas encore créée : "__new__:{subject}".
const NEW_SESSION_PREFIX = "__new__:"

function isNewSessionSentinel(value: string) {
  return value.startsWith(NEW_SESSION_PREFIX)
}

// Répartit `total` en `count` parts de 2 décimales dont la somme vaut exactement `total`.
function splitAmount(total: number, count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor((total / count) * 100) / 100
  const amounts = Array(count).fill(base)
  const remainder = Math.round((total - base * count) * 100) / 100
  amounts[count - 1] = Math.round((amounts[count - 1] + remainder) * 100) / 100
  return amounts
}

function PaymentMatchDialog({
  match,
  students,
  teachers,
  lessonSessions,
  paidBySession,
  onNewStudent,
  onAllocated,
  onClose,
}: {
  match: PaymentMatch
  students: Student[]
  teachers: Teacher[]
  lessonSessions: LessonSessionOption[]
  paidBySession: Record<string, string>
  onNewStudent: (matchId: string) => void
  onAllocated: () => void
  onClose: () => void
}) {
  const hintedStudent = students.find((student) => student.id === match.student?.id) ?? null
  const [mode, setMode] = useState<"sessions" | "students">("sessions")
  const [rows, setRows] = useState<AllocationRow[]>(() => [newAllocationRow(hintedStudent)])
  const [note, setNote] = useState("")
  const [remainderForDirector, setRemainderForDirector] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const allocated = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const remaining = match.receivedAmount - allocated
  // Encart « reste élèves du directeur » : seulement quand une allocation partielle existe
  // (paiement entièrement élève du directeur = bouton dédié sur la carte, pas ce dialogue).
  const hasRemainder = allocated > 0 && remaining > 0.01

  // "teacherId:studentId" -> matières distinctes, affichées entre parenthèses
  // dans la liste d'élèves (un élève peut avoir plusieurs matières avec le même prof).
  const subjectsByTeacherStudent = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const session of lessonSessions) {
      const key = `${session.teacherId}:${session.studentId}`
      const list = map.get(key) ?? []
      if (!list.includes(session.subject)) list.push(session.subject)
      map.set(key, list)
    }
    return map
  }, [lessonSessions])

  // Recherche globale : une entrée par couple (élève, professeur), pour taper
  // directement un nom d'élève sans passer par le professeur — la sélection
  // pré-remplit le professeur. Un élève sans session connue reste proposé via
  // le professeur de son groupe.
  const studentOptions = useMemo<StudentOption[]>(() => {
    const teacherName = (teacherId: string) => teachers.find((teacher) => teacher.id === teacherId)?.name ?? ""
    const options: StudentOption[] = []
    for (const student of students) {
      const teacherIds = new Set<string>()
      for (const session of lessonSessions) {
        if (session.studentId === student.id) teacherIds.add(session.teacherId)
      }
      if (teacherIds.size === 0 && student.group?.teacherId) teacherIds.add(student.group.teacherId)
      for (const teacherId of teacherIds) {
        const subjects = subjectsByTeacherStudent.get(`${teacherId}:${student.id}`) ?? []
        options.push({
          key: `${student.id}:${teacherId}`,
          studentId: student.id,
          teacherId,
          name: studentLabelWithTeacherEmoji(`${student.firstName} ${student.lastName}`, teacherName(teacherId)),
          subjects,
          teacherName: teacherName(teacherId),
        })
      }
    }
    return options.sort((a, b) => a.name.localeCompare(b.name, "fr"))
  }, [students, teachers, lessonSessions, subjectsByTeacherStudent])

  function updateRow(id: string, patch: Partial<AllocationRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
  }

  function onTeacherChange(row: AllocationRow, teacherId: string) {
    updateRow(row.id, { teacherId, studentId: "", lessonSessionIds: [], amount: "" })
  }

  // La sélection d'un élève depuis la recherche globale pré-remplit aussi son professeur.
  function onStudentChange(row: AllocationRow, studentId: string, teacherId?: string) {
    updateRow(row.id, { studentId, ...(teacherId ? { teacherId } : {}), lessonSessionIds: [], amount: "" })
  }

  function toggleSession(rowId: string, sessionKey: string, isPaid: boolean) {
    if (isPaid) return
    setRows((current) => current.map((item) => {
      if (item.id !== rowId) return item
      const has = item.lessonSessionIds.includes(sessionKey)
      const nextIds = has ? item.lessonSessionIds.filter((id) => id !== sessionKey) : [...item.lessonSessionIds, sessionKey]
      const student = students.find((candidate) => candidate.id === item.studentId)
      const amount = student && nextIds.length > 0 ? String(student.monthlyFee * nextIds.length) : ""
      return { ...item, lessonSessionIds: nextIds, amount }
    }))
  }

  async function submit() {
    setLoading(true)
    setError("")
    try {
      const expandedAllocations: { teacherId: string; studentId: string; lessonSessionId: string; amount: number }[] = []

      for (const row of rows) {
        const count = row.lessonSessionIds.length
        if (count === 0) continue
        const amounts = splitAmount(Number(row.amount || 0), count)
        const resolvedIds: string[] = []
        for (const sessionKey of row.lessonSessionIds) {
          if (isNewSessionSentinel(sessionKey)) {
            const subject = sessionKey.slice(NEW_SESSION_PREFIX.length)
            const template = lessonSessions
              .filter((s) => s.studentId === row.studentId && s.teacherId === row.teacherId && s.subject === subject)
              .sort((a, b) => b.number - a.number)[0]
            const res = await fetch("/api/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                studentId: row.studentId,
                teacherId: row.teacherId,
                subject,
                frequency: template?.frequency ?? undefined,
                duration: template?.duration ?? undefined,
              }),
            })
            const created = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(created.error || "Création de la nouvelle session impossible.")
            resolvedIds.push(created.id)
          } else {
            resolvedIds.push(sessionKey)
          }
        }
        resolvedIds.forEach((sessionId, i) => {
          expandedAllocations.push({ teacherId: row.teacherId, studentId: row.studentId, lessonSessionId: sessionId, amount: amounts[i] })
        })
      }

      if (expandedAllocations.length === 0) throw new Error("Choisissez au moins une session à valider.")

      const payload = { note, mode, allocations: expandedAllocations, remainderForDirector: hasRemainder && remainderForDirector }
      const res = await fetch(`/api/payment-matches/${match.id}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Validation impossible.")
      onClose()
      onAllocated()
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
            <p className="mt-0.5 text-xs text-gray-400">Numéro de transfert / transaction : {displayReference(match)}</p>
            <button
              type="button"
              onClick={() => { onNewStudent(match.id); onClose() }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              <Plus className="h-4 w-4" />
              C&apos;est un nouvel élève — créer sa fiche
            </button>
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
              <div><span className="text-gray-400">Validé pour les sessions</span><p className="font-semibold">{formatCurrency(allocated)}</p></div>
              <div><span className="text-gray-400">Reste</span><p className={`font-semibold ${remaining < -0.01 ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(remaining)}</p></div>
            </div>
            {hasRemainder && (
              <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-2.5">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-violet-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-violet-300"
                    checked={remainderForDirector}
                    onChange={(event) => setRemainderForDirector(event.target.checked)}
                  />
                  <span>
                    Le reste ({formatCurrency(remaining)}) est <strong>pour les élèves du directeur</strong> — il ne sera pas compté
                    dans les paiements de l&apos;institut et restera trouvable dans « Paiements élèves du directeur ».
                  </span>
                </label>
                {!remainderForDirector && (
                  <p className="mt-1.5 pl-6 text-xs text-violet-700">
                    Seul le montant « validé pour les sessions » sera comptabilisé. Ne gonflez pas le montant d&apos;une session pour solder le reste.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const selectableSessions = lessonSessions.filter((session) => (
                session.teacherId === row.teacherId && session.studentId === row.studentId
              ))
              const sessionsBySubject = new Map<string, LessonSessionOption[]>()
              for (const session of selectableSessions) {
                const list = sessionsBySubject.get(session.subject) ?? []
                list.push(session)
                sessionsBySubject.set(session.subject, list)
              }
              for (const list of sessionsBySubject.values()) list.sort((a, b) => a.number - b.number)
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
                  <div className="grid gap-3 lg:grid-cols-[1fr_1fr_8rem]">
                    <Select value={row.teacherId} onValueChange={(value) => onTeacherChange(row, value)}>
                      <SelectTrigger><SelectValue placeholder="Professeur" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <StudentCombobox
                      options={row.teacherId ? studentOptions.filter((option) => option.teacherId === row.teacherId) : studentOptions}
                      showTeacher={!row.teacherId}
                      value={row.studentId ? `${row.studentId}:${row.teacherId}` : ""}
                      onChange={(option) => onStudentChange(row, option.studentId, option.teacherId)}
                      placeholder="Rechercher un élève..."
                    />
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

                  {row.studentId && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-gray-500">
                        Sessions à valider (plusieurs possibles) · <span className="text-emerald-700">vert</span> = déjà payée · <span className="text-red-600">rouge</span> = non payée
                      </p>
                      {sessionsBySubject.size === 0 && <p className="text-xs text-gray-400">Aucune session pour cet élève avec ce professeur.</p>}
                      {Array.from(sessionsBySubject.entries()).map(([subject, sessions]) => {
                        const nextNumber = (sessions[sessions.length - 1]?.number ?? 0) + 1
                        const newSessionKey = `${NEW_SESSION_PREFIX}${subject}`
                        const newSessionSelected = row.lessonSessionIds.includes(newSessionKey)
                        return (
                          <div key={subject} className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-gray-400">{subject} :</span>
                            {sessions.map((session) => {
                              const paidAt = paidBySession[`${row.studentId}:${session.number}`]
                              const isPaid = Boolean(paidAt)
                              const requested = !isPaid && Boolean(session.paymentRequestedAt)
                              const selected = row.lessonSessionIds.includes(session.id)
                              return (
                                <button
                                  key={session.id}
                                  type="button"
                                  disabled={isPaid}
                                  onClick={() => toggleSession(row.id, session.id, isPaid)}
                                  title={isPaid ? `Déjà payée le ${formatDate(paidAt)}` : requested ? "Demande de paiement envoyée" : "Non payée"}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                                    isPaid
                                      ? "cursor-default border-emerald-100 bg-emerald-50 text-emerald-700"
                                      : selected
                                        ? "border-emerald-600 bg-emerald-600 text-white"
                                        : "border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                                  }`}
                                >
                                  Session {session.number}{isPaid ? ` (payée le ${formatDate(paidAt)})` : ""}
                                  {requested && <Mail className="h-3 w-3" />}
                                </button>
                              )
                            })}
                            <button
                              type="button"
                              onClick={() => toggleSession(row.id, newSessionKey, false)}
                              title="Créera une nouvelle session au même modèle que la dernière"
                              className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium ${
                                newSessionSelected ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-300 bg-white text-gray-500 hover:border-gray-400"
                              }`}
                            >
                              <Plus className="h-3 w-3" />
                              Nouvelle session (n°{nextNumber})
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
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
              disabled={
                loading ||
                !rows.some((row) => row.lessonSessionIds.length > 0) ||
                rows.some((row) => row.lessonSessionIds.length > 0 && (!row.teacherId || !row.studentId || !row.amount || Number(row.amount) <= 0)) ||
                remaining < -0.01
              }
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

function StudentCombobox({
  options,
  showTeacher,
  value,
  onChange,
  placeholder,
}: {
  options: StudentOption[]
  showTeacher: boolean
  value: string
  onChange: (option: StudentOption) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selected = options.find((option) => option.key === value)
  const optionLabel = (option: StudentOption) =>
    `${option.name}${option.subjects.length ? ` (${option.subjects.join(", ")})` : ""}${option.teacherName ? ` — ${option.teacherName}` : ""}`
  const filtered = options.filter((option) => optionLabel(option).toLowerCase().includes(query.toLowerCase()))

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); setQuery("") }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={`truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
            {selected
              ? <>{selected.name}<span className="text-gray-400">{selected.subjects.length ? ` (${selected.subjects.join(", ")})` : ""}</span></>
              : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="border-b border-gray-100 p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un élève..."
              className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 && <p className="px-2 py-3 text-center text-sm text-gray-400">Aucun élève trouvé.</p>}
          {filtered.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => { onChange(option); setOpen(false) }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-emerald-50 ${option.key === value ? "bg-emerald-50 text-emerald-900" : "text-gray-700"}`}
            >
              <Check className={`h-3.5 w-3.5 shrink-0 ${option.key === value ? "text-emerald-600" : "opacity-0"}`} />
              <span className="min-w-0 truncate">
                {option.name}
                <span className="text-gray-400">{option.subjects.length ? ` (${option.subjects.join(", ")})` : ""}</span>
                {showTeacher && option.teacherName && <span className="text-gray-400"> — {option.teacherName}</span>}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SecretaryPayBlock() {
  const router = useRouter()
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
    router.refresh()
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
