"use client"

import { useState, useRef } from "react"
import {
  FileText, ScrollText, Plus, Upload, ExternalLink, ChevronDown, ChevronUp,
  Users, Loader2, Trash2, FolderOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const MONTHS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

interface StaffMember { id: string; name: string; role: string }
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

type DocumentKind = "CONTRACT" | "PAYSLIP" | "OTHER"

const PAYSLIP_PREFIX = "[FICHE_PAIE] "
const OTHER_PREFIX = "[AUTRE] "

function formatCurrency(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v)
}

function documentKind(title: string): DocumentKind {
  if (title.startsWith(PAYSLIP_PREFIX)) return "PAYSLIP"
  if (title.startsWith(OTHER_PREFIX)) return "OTHER"
  return "CONTRACT"
}

function cleanDocumentTitle(title: string) {
  return title.replace(PAYSLIP_PREFIX, "").replace(OTHER_PREFIX, "")
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\s.]/gu, "")
    .toLowerCase()
}

function memberColor(member: StaffMember) {
  if (member.role === "SECRETARY") {
    return {
      avatar: "bg-pink-100 text-pink-700",
      badge: "bg-pink-50 text-pink-700",
      border: "border-pink-100",
      icon: "text-pink-600",
    }
  }

  const name = normalizeName(member.name)
  const greenTeachers = ["samia umm haroun", "samia umm abderrahmen", "samia umm abdarrahman", "asma"]
  const isGreen = greenTeachers.some((teacherName) => name.includes(teacherName))

  return isGreen
    ? {
        avatar: "bg-emerald-100 text-emerald-700",
        badge: "bg-emerald-50 text-emerald-700",
        border: "border-emerald-100",
        icon: "text-emerald-600",
      }
    : {
        avatar: "bg-blue-100 text-blue-700",
        badge: "bg-blue-50 text-blue-700",
        border: "border-blue-100",
        icon: "text-blue-600",
      }
}

function UploadedDocumentList({
  documents, emptyLabel, role, onDeleteContract,
}: {
  documents: Contract[]
  emptyLabel: string
  role: string
  onDeleteContract: (id: string) => void
}) {
  if (documents.length === 0) return <p className="text-sm text-gray-400 italic">{emptyLabel}</p>

  return (
    <div className="space-y-2">
      {documents.map((document) => (
        <div key={document.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:items-center">
          <FileText className="h-5 w-5 text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{cleanDocumentTitle(document.title)}</p>
            <p className="text-xs text-gray-400">
              Ajouté le {new Date(document.uploadedAt).toLocaleDateString("fr-FR")}
            </p>
          </div>
          <a href={document.driveUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-blue-50 p-2 text-blue-600 hover:bg-blue-100">
            <ExternalLink className="h-4 w-4" />
          </a>
          {role === "DIRECTOR" && (
            <button onClick={() => { if (confirm("Supprimer ce document ?")) onDeleteContract(document.id) }} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 sm:h-auto sm:w-auto">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function TeacherDocSection({
  member, contracts, salaries, role, onDeleteContract,
}: {
  member: StaffMember
  contracts: Contract[]
  salaries: Salary[]
  role: string
  onDeleteContract: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const colors = memberColor(member)
  const contractDocs = contracts.filter((document) => documentKind(document.title) === "CONTRACT")
  const payslipDocs = contracts.filter((document) => documentKind(document.title) === "PAYSLIP")
  const otherDocs = contracts.filter((document) => documentKind(document.title) === "OTHER")
  const totalPayslips = salaries.length + payslipDocs.length

  return (
    <div className={`rounded-2xl border bg-white shadow-sm ${colors.border}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left sm:items-center sm:gap-4 sm:p-5"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${colors.avatar}`}>
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">{member.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${colors.badge}`}>
              {member.role === "SECRETARY" ? "Secrétaire" : "Professeur"}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {contractDocs.length} contrat{contractDocs.length !== 1 ? "s" : ""}
            {" · "}
            {totalPayslips} fiche{totalPayslips !== 1 ? "s" : ""} de paie
            {" · "}
            {otherDocs.length} autre{otherDocs.length !== 1 ? "s" : ""}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-gray-100 p-4 sm:p-5">
          {/* Contrats */}
          <div>
            <div className="mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ScrollText className={`h-4 w-4 ${colors.icon}`} />
                  Contrats
                </p>
                <p className="mt-0.5 text-xs text-gray-400">Ajout manuel des contrats de l&apos;équipe</p>
              </div>
            </div>

            <UploadedDocumentList documents={contractDocs} emptyLabel="Aucun contrat" role={role} onDeleteContract={onDeleteContract} />
          </div>

          {/* Fiches de paie */}
          <div>
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText className={`h-4 w-4 ${colors.icon}`} />
                Fiches de paie
              </p>
              <p className="mt-0.5 text-xs text-gray-400">Générées automatiquement ou ajoutées manuellement</p>
            </div>
            {salaries.length === 0 && payslipDocs.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Aucune fiche de paie</p>
            ) : (
              <div className="space-y-3">
                {payslipDocs.length > 0 && (
                  <UploadedDocumentList documents={payslipDocs} emptyLabel="" role={role} onDeleteContract={onDeleteContract} />
                )}
                {salaries.length > 0 && (
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
            )}
          </div>

          {/* Autres */}
          <div>
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FolderOpen className={`h-4 w-4 ${colors.icon}`} />
                Autres
              </p>
              <p className="mt-0.5 text-xs text-gray-400">Documents administratifs divers</p>
            </div>
            <UploadedDocumentList documents={otherDocs} emptyLabel="Aucun autre document" role={role} onDeleteContract={onDeleteContract} />
          </div>
        </div>
      )}
    </div>
  )
}

export function DocumentsClient({
  staff, contracts: initialContracts, salaries, role,
}: {
  staff: StaffMember[]
  contracts: Contract[]
  salaries: Salary[]
  role: string
}) {
  const [contracts, setContracts] = useState(initialContracts)
  const [staffFilter, setStaffFilter] = useState("ALL")
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadTitle, setUploadTitle] = useState("")
  const [uploadMemberId, setUploadMemberId] = useState("")
  const [documentType, setDocumentType] = useState<DocumentKind>("CONTRACT")
  const fileRef = useRef<HTMLInputElement>(null)

  const filteredStaff = staffFilter === "ALL" ? staff : staff.filter(member => member.id === staffFilter)

  async function reload() {
    const res = await fetch("/api/documents/contracts")
    if (res.ok) setContracts(await res.json())
  }

  async function handleDelete(id: string) {
    await fetch(`/api/documents/contracts/${id}`, { method: "DELETE" })
    setContracts(c => c.filter(x => x.id !== id))
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !uploadTitle.trim() || !uploadMemberId) return
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", uploadTitle.trim())
    formData.append("teacherId", uploadMemberId)
    formData.append("documentType", documentType)
    try {
      const res = await fetch("/api/documents/contracts", { method: "POST", body: formData })
      if (!res.ok) throw new Error(await res.text())
      setShowUpload(false)
      setUploadTitle("")
      setUploadMemberId("")
      setDocumentType("CONTRACT")
      if (fileRef.current) fileRef.current.value = ""
      await reload()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contrats, fiches de paie et autres documents de l&apos;équipe</p>
        </div>
        {role === "DIRECTOR" && (
          <Button className="w-full sm:w-auto" onClick={() => setShowUpload(!showUpload)}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        )}
      </div>

      {showUpload && role === "DIRECTOR" && (
        <div className="rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={documentType} onValueChange={(value) => setDocumentType(value as DocumentKind)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Type de document" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONTRACT">Contrat</SelectItem>
                <SelectItem value="PAYSLIP">Fiche de paie</SelectItem>
                <SelectItem value="OTHER">Autre</SelectItem>
              </SelectContent>
            </Select>

            <Select value={uploadMemberId} onValueChange={setUploadMemberId}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Professeur ou secrétaire" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} · {member.role === "SECRETARY" ? "Secrétaire" : "Professeur"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 space-y-3">
            <Input
              placeholder={documentType === "CONTRACT" ? "Titre du contrat" : documentType === "PAYSLIP" ? "Titre de la fiche de paie" : "Titre du document"}
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="bg-white"
            />
            <input ref={fileRef} type="file" accept=".pdf" className="block text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-200" />
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button size="sm" disabled={uploading || !uploadTitle.trim() || !uploadMemberId} onClick={handleUpload}>
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Envoyer sur Drive
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowUpload(false)}>Annuler</Button>
            </div>
          </div>
        </div>
      )}

      {/* Filtre équipe */}
      {staff.length > 1 && (
        <div className="flex gap-3">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Toute l'équipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toute l&apos;équipe</SelectItem>
              {staff.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name} · {member.role === "SECRETARY" ? "Secrétaire" : "Professeur"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Par membre */}
      {filteredStaff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-400">Aucun membre</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStaff.map((member) => (
            <TeacherDocSection
              key={member.id}
              member={member}
              contracts={contracts.filter(c => c.teacherId === member.id)}
              salaries={salaries.filter(s => s.teacherId === member.id)}
              role={role}
              onDeleteContract={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
