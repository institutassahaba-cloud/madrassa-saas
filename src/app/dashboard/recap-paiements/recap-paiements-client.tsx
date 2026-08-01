"use client"

import Link from "next/link"
import { useState, useMemo } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowRight, Banknote, ChevronDown, ChevronUp, CreditCard, Save, Pencil, X, Trash2, Loader2 } from "lucide-react"

const MONTHS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

interface Salary {
  id: string
  teacherId: string
  teacherName: string
  month: number
  year: number
  hoursWorked: number | null
  lessonsCount: number | null
  hourlyRate: number | null
  fixedSalary: number | null
  totalAmount: number
  status: string
  paidDate: string | null
  periodStart: string | null
  periodEnd: string | null
  notes: string | null
  secretaryPayments: Array<{ id?: string; paymentDate: string | null; student: string; session: string | null; amount: number; method: string | null; validated: boolean; validationDate: string | null; reference?: string | null }>
  lines: Array<{ id: string; label: string; lessonsCount: number; hoursWorked: number; hourlyRate: number; totalAmount: number }>
}

interface StaffMember {
  id: string
  name: string
  role: string
  paymentInfo: string | null
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v)
}

function PaymentInfoEditor({ member, onSave }: { member: StaffMember; onSave: (id: string, info: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(member.paymentInfo ?? "")

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        {member.paymentInfo ? (
          <span className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 border border-gray-100 flex items-center gap-1">
            <CreditCard className="h-3 w-3" />
            {member.paymentInfo}
          </span>
        ) : (
          <span className="text-xs text-gray-300 italic">Aucune info de paiement</span>
        )}
        <button onClick={() => { setValue(member.paymentInfo ?? ""); setEditing(true) }} className="text-gray-400 hover:text-blue-600">
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="PayPal, RIB, Western Union..."
        className="text-xs rounded border border-gray-200 px-2 py-1 w-64"
        autoFocus
      />
      <button onClick={() => { onSave(member.id, value); setEditing(false) }} className="text-emerald-600 hover:text-emerald-700">
        <Save className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function RecapPaiementsClient({ salaries: initialSalaries, teachers: initialStaff, isDirector }: { salaries: Salary[]; teachers: StaffMember[]; isDirector: boolean }) {
  const [salaries, setSalaries] = useState(initialSalaries)
  const [staff, setStaff] = useState(initialStaff)

  const years = useMemo(() => {
    const set = new Set(salaries.map((s) => s.year))
    if (set.size === 0) set.add(new Date().getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [salaries])

  const [selectedYear, setSelectedYear] = useState(String(years[0] || new Date().getFullYear()))

  const teacherStaff = staff.filter((s) => s.role === "TEACHER")

  async function handleSavePaymentInfo(userId: string, info: string) {
    await fetch("/api/teachers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherId: userId, paymentInfo: info }) })
    setStaff((prev) => prev.map((s) => s.id === userId ? { ...s, paymentInfo: info || null } : s))
  }

  // Group salaries by person
  const salariesByPerson = useMemo(() => {
    const map = new Map<string, { name: string; role: string; salaries: Salary[] }>()
    const yearSalaries = salaries.filter((s) => s.year === Number(selectedYear))
    for (const s of yearSalaries) {
      if (!map.has(s.teacherId)) map.set(s.teacherId, { name: s.teacherName, role: "TEACHER", salaries: [] })
      map.get(s.teacherId)!.salaries.push(s)
    }
    // Attach role from staff list
    for (const m of staff) {
      if (map.has(m.id)) map.get(m.id)!.role = m.role
    }
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [salaries, staff, selectedYear])

  const totalYear = salaries.filter((s) => s.year === Number(selectedYear)).reduce((sum, s) => sum + s.totalAmount, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Récap des paies</h1>
        <p className="text-sm text-gray-500 mt-0.5">Historique des salaires versés aux professeurs et secrétaires</p>
      </div>

      {/* Un calcul séparé par professeur évite les validations globales opaques. */}
      {isDirector && (
        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-blue-950">Calculer les paies</h2>
            <p className="mt-1 text-sm text-blue-700">Ouvre la fiche d’un professeur pour choisir précisément les cours à payer.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teacherStaff.map((teacher) => {
              const latest = salaries
                .filter((salary) => salary.teacherId === teacher.id)
                .sort((a, b) => (b.periodEnd ? new Date(b.periodEnd).getTime() : 0) - (a.periodEnd ? new Date(a.periodEnd).getTime() : 0))[0]
              return (
                <Link key={teacher.id} href={`/dashboard/recap-paiements/${teacher.id}`} className="group rounded-lg border border-blue-100 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{teacher.name}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {latest ? `Dernière fiche : ${formatCurrency(latest.totalAmount)}` : "Aucune fiche enregistrée"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-blue-400 transition group-hover:translate-x-1" />
                  </div>
                  <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${latest?.status === "CONFIRMED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {latest?.status === "CONFIRMED" ? "Fiche validée · modifiable" : "À calculer"}
                  </span>
                </Link>
              )
            })}
            {teacherStaff.length === 0 && <p className="text-sm text-blue-700">Aucun professeur actif.</p>}
          </div>
        </section>
      )}

      {/* Filtre année + total */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-2">
          <Banknote className="h-4 w-4 text-amber-500" />
          <span className="text-sm text-gray-500">Total {selectedYear} :</span>
          <span className="font-bold text-gray-900">{formatCurrency(totalYear)}</span>
        </div>
      </div>

      {/* Historique par personne */}
      {salariesByPerson.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <Banknote className="mx-auto h-8 w-8 text-gray-300 mb-2" />
          <p className="text-gray-400">Aucune fiche de paie pour {selectedYear}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {salariesByPerson.map(([personId, { name, role, salaries: personSalaries }]) => {
            const member = staff.find((s) => s.id === personId)
            const personTotal = personSalaries.reduce((s, p) => s + p.totalAmount, 0)
            return (
              <PersonSalaryCard
                key={personId}
                name={name}
                role={role}
                member={member}
                salaries={personSalaries}
                total={personTotal}
                onSavePaymentInfo={handleSavePaymentInfo}
                isDirector={isDirector}
                onSalaryUpdated={(updated) => setSalaries((current) => current.map((salary) => salary.id === updated.id ? { ...salary, ...updated } : salary))}
                onSalaryDeleted={(salaryId) => setSalaries((current) => current.filter((salary) => salary.id !== salaryId))}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function PersonSalaryCard({ name, role, member, salaries, total, onSavePaymentInfo, isDirector, onSalaryUpdated, onSalaryDeleted }: {
  name: string
  role: string
  member: StaffMember | undefined
  salaries: Salary[]
  total: number
  onSavePaymentInfo: (id: string, info: string) => void
  isDirector: boolean
  onSalaryUpdated: (salary: Salary) => void
  onSalaryDeleted: (salaryId: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const roleLabel = role === "SECRETARY" ? "Secrétaire" : "Professeur"
  const roleColor = role === "SECRETARY" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"
  const sorted = [...salaries].sort((a, b) => {
    const aDate = a.periodEnd ? new Date(a.periodEnd).getTime() : new Date(a.year, a.month - 1).getTime()
    const bDate = b.periodEnd ? new Date(b.periodEnd).getTime() : new Date(b.year, b.month - 1).getTime()
    return bDate - aDate
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-gray-50 sm:items-center sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleColor}`}>{roleLabel}</span>
          </div>
          {member && (
            <div className="mt-1">
              <PaymentInfoEditor member={member} onSave={onSavePaymentInfo} />
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-gray-900">{formatCurrency(total)}</p>
          <p className="text-xs text-gray-400">{sorted.length} fiche{sorted.length > 1 ? "s" : ""}</p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="py-2 pl-4 text-left text-xs font-medium">Période</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Heures</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Cours</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Montant</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Détail</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Statut</th>
                {isDirector && <th className="px-4 py-2 text-right text-xs font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pl-4 text-gray-700">
                    {s.periodStart && s.periodEnd
                      ? `${new Date(s.periodStart).toLocaleDateString("fr-FR")} → ${new Date(s.periodEnd).toLocaleDateString("fr-FR")}`
                      : `${MONTHS[s.month]} ${s.year}`}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{s.hoursWorked != null ? `${s.hoursWorked}h` : "—"}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{s.lessonsCount ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">
                    {formatCurrency(s.totalAmount)}
                  </td>
                  <td className="max-w-[280px] px-3 py-2 text-left text-xs text-gray-500">
                    {s.lines.length > 0 || s.notes || s.secretaryPayments.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-blue-600">Voir le détail</summary>
                        <div className="mt-2 space-y-2">
                          {s.secretaryPayments.length > 0 && (
                            <div className="max-h-[32rem] overflow-auto rounded-lg border border-gray-200 bg-white">
                              <table className="w-full min-w-[880px] text-xs">
                                <thead className="sticky top-0 bg-violet-50 text-violet-900">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Date du paiement</th>
                                    <th className="px-3 py-2 text-left font-semibold">Élève</th>
                                    <th className="px-3 py-2 text-left font-semibold">Session</th>
                                    <th className="px-3 py-2 text-right font-semibold">Montant</th>
                                    <th className="px-3 py-2 text-left font-semibold">Moyen</th>
                                    <th className="px-3 py-2 text-left font-semibold">Validation</th>
                                    <th className="px-3 py-2 text-left font-semibold">Date de validation</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.secretaryPayments.map((payment, index) => (
                                    <tr key={payment.id ?? `${payment.student}-${index}`} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/70">
                                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDetailDate(payment.paymentDate)}</td>
                                      <td className="px-3 py-2 font-medium text-gray-900">{payment.student}</td>
                                      <td className="px-3 py-2 text-gray-600">{payment.session ?? "Non renseignée"}</td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(payment.amount)}</td>
                                      <td className="px-3 py-2 text-gray-600">{payment.method ?? "Non renseigné"}</td>
                                      <td className="px-3 py-2"><span className={payment.validated ? "rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700" : "rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700"}>{payment.validated ? "Validé" : "Non validé"}</span></td>
                                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDetailDate(payment.validationDate, true)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {s.lines.map((line) => (
                            <div key={line.id} className="rounded border border-gray-100 bg-gray-50 p-2">
                              <p className="font-medium text-gray-700">{line.label}</p>
                              <p>{line.lessonsCount} cours · {line.hoursWorked} h · {formatCurrency(line.hourlyRate)}/h · <strong>{formatCurrency(line.totalAmount)}</strong></p>
                            </div>
                          ))}
                          {s.notes && <pre className="whitespace-pre-wrap font-sans text-gray-400">{s.notes}</pre>}
                        </div>
                      </details>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.status === "PAID" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Payé{s.paidDate ? ` le ${new Date(s.paidDate).toLocaleDateString("fr-FR")}` : ""}
                      </span>
                    ) : s.status === "CONFIRMED" ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Confirmé</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">En attente</span>
                    )}
                  </td>
                  {isDirector && (
                    <td className="px-4 py-2 text-right">
                      <SalaryActions salary={s} onUpdated={onSalaryUpdated} onDeleted={onSalaryDeleted} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

function formatDetailDate(value: string | null, withTime = false) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("fr-FR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" })
}

function SalaryActions({ salary, onUpdated, onDeleted }: { salary: Salary; onUpdated: (salary: Salary) => void; onDeleted: (salaryId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(salary.totalAmount))
  const [status, setStatus] = useState(salary.status)
  const [paidDate, setPaidDate] = useState(salary.paidDate ? salary.paidDate.slice(0, 10) : "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function beginEdit() {
    setAmount(String(salary.totalAmount))
    setStatus(salary.status)
    setPaidDate(salary.paidDate ? salary.paidDate.slice(0, 10) : "")
    setError(null)
    setOpen(true)
  }

  async function save() {
    const totalAmount = Number(amount.replace(",", "."))
    if (!Number.isFinite(totalAmount) || totalAmount < 0) return setError("Montant invalide.")
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/salaries/${salary.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount,
          status,
          paidDate: status === "PAID" ? (paidDate ? new Date(`${paidDate}T12:00:00`).toISOString() : new Date().toISOString()) : null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Modification impossible.")
      onUpdated({ ...salary, totalAmount: Number(data.totalAmount), status: data.status, paidDate: data.paidDate, notes: data.notes ?? salary.notes })
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Modification impossible.")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer définitivement la paie de ${salary.teacherName} pour ${MONTHS[salary.month]} ${salary.year} ?`)) return
    setSaving(true)
    try {
      const response = await fetch(`/api/salaries/${salary.id}`, { method: "DELETE" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Suppression impossible.")
      onDeleted(salary.id)
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Suppression impossible.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <button type="button" onClick={beginEdit} disabled={saving} className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-blue-200 hover:text-blue-600 disabled:opacity-50">
        <Pencil className="h-3 w-3" /> Modifier
      </button>
      <button type="button" onClick={remove} disabled={saving} className="inline-flex items-center gap-1 rounded border border-red-100 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Supprimer
      </button>

      <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next) }}>
        <DialogContent className="max-w-md text-left">
          <DialogHeader><DialogTitle>Modifier la paie de {salary.teacherName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={`salary-amount-${salary.id}`} className="text-sm font-medium text-gray-700">Montant</label>
              <input id={`salary-amount-${salary.id}`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Statut</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">En attente</SelectItem>
                  <SelectItem value="PARTIAL">Partiel</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmé</SelectItem>
                  <SelectItem value="PAID">Payé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === "PAID" && (
              <div className="space-y-1.5">
                <label htmlFor={`salary-date-${salary.id}`} className="text-sm font-medium text-gray-700">Date de paiement</label>
                <input id={`salary-date-${salary.id}`} type="date" value={paidDate} onChange={(event) => setPaidDate(event.target.value)} className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm" />
              </div>
            )}
            {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className="rounded-md border border-gray-200 px-3 py-2 text-sm">Annuler</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
