"use client"

import { FileText, Download, ScrollText } from "lucide-react"

const MONTHS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

interface Salary {
  id: string
  month: number
  year: number
  totalAmount: number
  status: string
  paidDate: string | null
  createdAt: string
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v)
}

export function MesDocumentsClient({ salaries, teacherName }: { salaries: Salary[]; teacherName: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Mes documents administratifs</h1>
        <p className="text-sm text-gray-500 mt-0.5">Contrat et fiches de paie</p>
      </div>

      {/* Contrat */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 p-4">
          <ScrollText className="h-4 w-4 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Contrat</h2>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-gray-400 italic">Aucun contrat disponible pour le moment.</p>
        </div>
      </div>

      {/* Fiches de paie */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 p-4">
          <FileText className="h-4 w-4 text-emerald-600" />
          <h2 className="font-semibold text-gray-900">Fiches de paie</h2>
          <span className="text-xs text-gray-400">({salaries.length})</span>
        </div>
        {salaries.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-400 italic">Aucune fiche de paie disponible.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {salaries.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                  <FileText className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{MONTHS[s.month]} {s.year}</p>
                  <p className="text-xs text-gray-400">
                    {s.status === "PAID" ? (
                      <span className="text-emerald-600">Payé{s.paidDate ? ` le ${new Date(s.paidDate).toLocaleDateString("fr-FR")}` : ""}</span>
                    ) : s.status === "CONFIRMED" ? (
                      <span className="text-blue-600">Confirmé</span>
                    ) : (
                      <span className="text-amber-600">En attente</span>
                    )}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900 sm:text-right">{formatCurrency(s.totalAmount)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
