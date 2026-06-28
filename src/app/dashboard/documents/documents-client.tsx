"use client"

import { useState, useRef } from "react"
import {
  FileText, ScrollText, Plus, Upload, ExternalLink, ChevronDown, ChevronUp,
  Users, Loader2, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const MONTHS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

interface Teacher { id: string; name: string }
interface Contract {
  id: string
  teacherId: string
  title: string
  driveUrl: string
  uploadedAt: string
}
interface Salary {
  id: string
  teacherId: string
  month: number
  year: number
  totalAmount: number
  hoursWorked: number | null
  lessonsCount: number | null
  hourlyRate: number | null
  fixedSalary: number | null
  status: string
  paidDate: string | null
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v)
}

function TeacherDocSection({
  teacher, contracts, salaries, role, onContractUploaded, onDeleteContract,
}: {
  teacher: Teacher
  contracts: Contract[]
  salaries: Salary[]
  role: string
  onContractUploaded: () => void
  onDeleteContract: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadTitle, setUploadTitle] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !uploadTitle.trim()) return
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", uploadTitle.trim())
    formData.append("teacherId", teacher.id)
    try {
      const res = await fetch("/api/documents/contracts", { method: "POST", body: formData })
      if (!res.ok) throw new Error(await res.text())
      setShowUpload(false)
      setUploadTitle("")
      if (fileRef.current) fileRef.current.value = ""
      onContractUploaded()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left sm:items-center sm:gap-4 sm:p-5"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
          {teacher.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{teacher.name}</p>
          <p className="text-xs text-gray-400">
            {contracts.length} contrat{contracts.length !== 1 ? "s" : ""}
            {" · "}
            {salaries.length} fiche{salaries.length !== 1 ? "s" : ""} de paie
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-gray-100 p-4 sm:p-5">
          {/* Contrats */}
          <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-blue-600" />
                  Contrats
                </p>
                <p className="mt-0.5 text-xs text-gray-400">Ajout manuel des contrats professeurs</p>
              </div>
              {role === "DIRECTOR" && (
                <Button size="sm" variant="outline" className="h-8 w-full text-xs sm:h-7 sm:w-auto" onClick={() => setShowUpload(!showUpload)}>
                  <Plus className="h-3 w-3" /> Ajouter
                </Button>
              )}
            </div>

            {showUpload && (
              <div className="mb-3 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-4 space-y-3">
                <Input
                  placeholder="Titre du contrat (ex: Contrat CDI 2025)"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="bg-white"
                />
                <input ref={fileRef} type="file" accept=".pdf" className="block text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-200" />
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button size="sm" disabled={uploading || !uploadTitle.trim()} onClick={handleUpload}>
                    {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    Envoyer sur Drive
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowUpload(false)}>Annuler</Button>
                </div>
              </div>
            )}

            {contracts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Aucun contrat</p>
            ) : (
              <div className="space-y-2">
                {contracts.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:items-center">
                    <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                      <p className="text-xs text-gray-400">
                        Ajouté le {new Date(c.uploadedAt).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <a href={c.driveUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-blue-50 p-2 text-blue-600 hover:bg-blue-100">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    {role === "DIRECTOR" && (
                      <button onClick={() => { if (confirm("Supprimer ce contrat ?")) onDeleteContract(c.id) }} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 sm:h-auto sm:w-auto">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fiches de paie */}
          <div>
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                Fiches de paie
              </p>
              <p className="mt-0.5 text-xs text-gray-400">Générées automatiquement après confirmation du calcul des paies</p>
            </div>
            {salaries.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Aucune fiche de paie</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-100">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                      <th className="py-2 pl-3 text-left text-xs font-medium">Période</th>
                      <th className="px-2 py-2 text-right text-xs font-medium">Heures</th>
                      <th className="px-2 py-2 text-right text-xs font-medium">Cours</th>
                      <th className="px-2 py-2 text-right text-xs font-medium">Taux</th>
                      <th className="px-2 py-2 text-right text-xs font-medium">Montant</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaries.map((s) => (
                      <tr key={s.id} className="border-b border-gray-50">
                        <td className="py-2 pl-3 font-medium text-gray-900">{MONTHS[s.month]} {s.year}</td>
                        <td className="px-2 py-2 text-right text-gray-600">{s.hoursWorked != null ? `${s.hoursWorked}h` : "—"}</td>
                        <td className="px-2 py-2 text-right text-gray-600">{s.lessonsCount ?? "—"}</td>
                        <td className="px-2 py-2 text-right text-gray-600">{s.hourlyRate ? formatCurrency(s.hourlyRate) + "/h" : s.fixedSalary ? "Fixe" : "—"}</td>
                        <td className="px-2 py-2 text-right font-semibold text-gray-900">{formatCurrency(s.totalAmount)}</td>
                        <td className="px-3 py-2 text-right">
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function DocumentsClient({
  teachers, contracts: initialContracts, salaries, role,
}: {
  teachers: Teacher[]
  contracts: Contract[]
  salaries: Salary[]
  role: string
}) {
  const [contracts, setContracts] = useState(initialContracts)
  const [teacherFilter, setTeacherFilter] = useState("ALL")

  const filteredTeachers = teacherFilter === "ALL" ? teachers : teachers.filter(t => t.id === teacherFilter)

  async function reload() {
    const res = await fetch("/api/documents/contracts")
    if (res.ok) setContracts(await res.json())
  }

  async function handleDelete(id: string) {
    await fetch(`/api/documents/contracts/${id}`, { method: "DELETE" })
    setContracts(c => c.filter(x => x.id !== id))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Documents</h1>
        <p className="text-sm text-gray-500 mt-0.5">Contrats manuels et fiches de paie automatiques des professeurs</p>
      </div>

      {/* Filtre prof */}
      {teachers.length > 1 && (
        <div className="flex gap-3">
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Tous les professeurs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les professeurs</SelectItem>
              {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Par prof */}
      {filteredTeachers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-400">Aucun professeur</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTeachers.map((teacher) => (
            <TeacherDocSection
              key={teacher.id}
              teacher={teacher}
              contracts={contracts.filter(c => c.teacherId === teacher.id)}
              salaries={salaries.filter(s => s.teacherId === teacher.id)}
              role={role}
              onContractUploaded={reload}
              onDeleteContract={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
