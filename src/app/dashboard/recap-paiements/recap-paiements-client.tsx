"use client"

import { useState, useMemo } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Banknote, Calculator, Gift, ChevronDown, ChevronUp, Loader2, CreditCard, Save, Pencil, X } from "lucide-react"

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
}

interface StaffMember {
  id: string
  name: string
  role: string
  paymentInfo: string | null
}

interface CalcDetail {
  type: string
  count: number
  hours: number
  rate: number
  subtotal: number
}

interface CalcResult {
  teacherId: string
  teacherName: string
  lessonsCount: number
  details: CalcDetail[]
  totalHours: number
  totalAmount: number
  bonus: number
  grandTotal: number
  periodStart: string
  periodEnd: string
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
  const [salaries] = useState(initialSalaries)
  const [staff, setStaff] = useState(initialStaff)

  const years = useMemo(() => {
    const set = new Set(salaries.map((s) => s.year))
    if (set.size === 0) set.add(new Date().getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [salaries])

  const [selectedYear, setSelectedYear] = useState(String(years[0] || new Date().getFullYear()))

  // ── Calcul de paie profs ──
  const [showCalc, setShowCalc] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [calcResults, setCalcResults] = useState<CalcResult[] | null>(null)
  const [bonusTeachers, setBonusTeachers] = useState<Record<string, boolean>>({})
  const [bonusAmounts, setBonusAmounts] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)

  const teacherStaff = staff.filter((s) => s.role === "TEACHER")

  async function handleCalculate() {
    setCalculating(true)
    setConfirmed(false)
    const bonuses: Record<string, number> = {}
    for (const t of teacherStaff) {
      if (bonusTeachers[t.id] && bonusAmounts[t.id]) bonuses[t.id] = Number(bonusAmounts[t.id])
    }
    const res = await fetch("/api/salaries/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bonuses }) })
    setCalcResults(await res.json())
    setCalculating(false)
  }

  async function handleConfirm() {
    setCalculating(true)
    const bonuses: Record<string, number> = {}
    for (const t of teacherStaff) {
      if (bonusTeachers[t.id] && bonusAmounts[t.id]) bonuses[t.id] = Number(bonusAmounts[t.id])
    }
    await fetch("/api/salaries/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bonuses, confirm: true }) })
    setConfirmed(true)
    setCalculating(false)
  }

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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Récap des paies</h1>
        <p className="text-sm text-gray-500 mt-0.5">Historique des salaires versés aux professeurs et secrétaires</p>
      </div>

      {/* Bouton Calculer la paie (directeur uniquement) */}
      {isDirector && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-blue-900">Calculer la paie des professeurs</span>
            </div>
            <button onClick={() => setShowCalc(!showCalc)} className="text-blue-600 hover:text-blue-800">
              {showCalc ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {showCalc && (
            <div className="space-y-4">
              {/* Option prime */}
              <div className="rounded-lg border border-blue-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-gray-700">Ajouter une prime (optionnel)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = teacherStaff.every((t) => bonusTeachers[t.id])
                      const next: Record<string, boolean> = {}
                      for (const t of teacherStaff) next[t.id] = !allSelected
                      setBonusTeachers(next)
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {teacherStaff.every((t) => bonusTeachers[t.id]) ? "Tout désélectionner" : "Sélectionner tout"}
                  </button>
                </div>
                <div className="space-y-2">
                  {teacherStaff.map((t) => (
                    <div key={t.id} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 min-w-[180px]">
                        <input type="checkbox" checked={!!bonusTeachers[t.id]} onChange={(e) => setBonusTeachers((prev) => ({ ...prev, [t.id]: e.target.checked }))} className="rounded border-gray-300" />
                        <span className="text-sm text-gray-700">{t.name}</span>
                      </label>
                      {bonusTeachers[t.id] && (
                        <div className="flex items-center gap-1">
                          <input type="number" min="0" step="1" placeholder="Montant" value={bonusAmounts[t.id] || ""} onChange={(e) => setBonusAmounts((prev) => ({ ...prev, [t.id]: e.target.value }))} className="w-24 rounded border border-gray-200 px-2 py-1 text-sm" />
                          <span className="text-xs text-gray-500">€</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={handleCalculate} disabled={calculating} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                Calculer la paie
              </button>

              {calcResults && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">Résultat du calcul</p>
                  {calcResults.map((r) => (
                    <div key={r.teacherId} className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">{r.teacherName}</span>
                        <span className="text-lg font-bold text-gray-900">{formatCurrency(r.grandTotal)}</span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        Période : {new Date(r.periodStart).toLocaleDateString("fr-FR")} → {new Date(r.periodEnd).toLocaleDateString("fr-FR")}
                      </p>
                      {r.details.length > 0 ? (
                        <table className="w-full text-xs mb-2">
                          <thead><tr className="text-gray-500"><th className="text-left py-1">Type</th><th className="text-right py-1">Cours</th><th className="text-right py-1">Heures</th><th className="text-right py-1">Taux</th><th className="text-right py-1">Sous-total</th></tr></thead>
                          <tbody>
                            {r.details.map((d) => (
                              <tr key={d.type} className="text-gray-700"><td className="py-1">{d.type}</td><td className="text-right py-1">{d.count}</td><td className="text-right py-1">{d.hours}h</td><td className="text-right py-1">{formatCurrency(d.rate)}/h</td><td className="text-right py-1 font-medium">{formatCurrency(d.subtotal)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="text-xs text-gray-400 mb-2">Aucun cours donné sur cette période</p>
                      )}
                      {r.bonus > 0 && <p className="text-xs text-amber-600 font-medium">+ Prime : {formatCurrency(r.bonus)}</p>}
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 p-4">
                    <span className="font-semibold text-gray-700">Total général</span>
                    <span className="text-xl font-bold text-gray-900">{formatCurrency(calcResults.reduce((s, r) => s + r.grandTotal, 0))}</span>
                  </div>
                  {!confirmed ? (
                    <button onClick={handleConfirm} disabled={calculating} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Confirmer et enregistrer les fiches de paie
                    </button>
                  ) : (
                    <p className="text-sm text-emerald-600 font-medium">✓ Fiches de paie enregistrées</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filtre année + total */}
      <div className="flex items-center gap-4">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
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
                personId={personId}
                name={name}
                role={role}
                member={member}
                salaries={personSalaries}
                total={personTotal}
                isDirector={isDirector}
                onSavePaymentInfo={handleSavePaymentInfo}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function PersonSalaryCard({ personId, name, role, member, salaries, total, isDirector, onSavePaymentInfo }: {
  personId: string
  name: string
  role: string
  member: StaffMember | undefined
  salaries: Salary[]
  total: number
  isDirector: boolean
  onSavePaymentInfo: (id: string, info: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const roleLabel = role === "SECRETARY" ? "Secrétaire" : "Professeur"
  const roleColor = role === "SECRETARY" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"
  const sorted = [...salaries].sort((a, b) => b.month - a.month)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-4 p-4 text-left hover:bg-gray-50">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleColor}`}>{roleLabel}</span>
          </div>
          {member && (
            <div className="mt-1">
              <PaymentInfoEditor member={member} onSave={onSavePaymentInfo} />
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">{formatCurrency(total)}</p>
          <p className="text-xs text-gray-400">{sorted.length} fiche{sorted.length > 1 ? "s" : ""}</p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="py-2 pl-4 text-left text-xs font-medium">Période</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Heures</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Cours</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Montant</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Notes</th>
                <th className="px-4 py-2 text-right text-xs font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pl-4 text-gray-700">{MONTHS[s.month]} {s.year}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{s.hoursWorked != null ? `${s.hoursWorked}h` : "—"}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{s.lessonsCount ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(s.totalAmount)}</td>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <td className="px-3 py-2 text-right text-xs text-gray-400 max-w-[200px] truncate">{(s as any).notes ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {s.status === "PAID" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Payé{s.paidDate ? ` ${new Date(s.paidDate).toLocaleDateString("fr-FR")}` : ""}
                      </span>
                    ) : s.status === "CONFIRMED" ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Confirmé</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">En attente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
