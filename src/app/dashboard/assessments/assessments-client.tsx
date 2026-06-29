"use client"

import { useState } from "react"
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileText,
  Link as LinkIcon,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const ARABIC_LEVELS = [
  { value: "DEBUTANT", label: "Débutant" },
  { value: "PREPARATOIRE", label: "Préparatoire" },
  ...Array.from({ length: 6 }, (_, index) => ({
    value: `NIVEAU_${index + 1}`,
    label: `Niveau ${index + 1}`,
  })),
]

const CATEGORIES = [
  { value: "LANGUE_ARABE", label: "Langue arabe", levels: ARABIC_LEVELS },
  { value: "CORAN", label: "Coran", levels: [{ value: "GENERAL", label: "Coran" }] },
]

type ResourceType = "BOOK" | "CONTROL"
type AddContext = {
  category: string
  categoryLabel: string
  level: string
  levelLabel: string
}

interface ExamFile {
  id: string
  title: string
  level: string
  fileName: string
  fileUrl: string
  fileSize: number | null
  uploadedBy: string | null
  createdAt: string
}

function encodeLevel(category: string, level: string, type: ResourceType) {
  return `${category}__${level}__${type}`
}

function parseLevel(value: string): { category: string; level: string; type: ResourceType } {
  const [category, level, type] = value.split("__")
  if (category && level && (type === "BOOK" || type === "CONTROL")) {
    return { category, level, type }
  }

  const legacyLevelMap: Record<string, string> = {
    PREPARATOIRE_1: "PREPARATOIRE",
    PREPARATOIRE_2: "NIVEAU_1",
    PREPARATOIRE_3: "NIVEAU_2",
    PREPARATOIRE_4: "NIVEAU_3",
    PREPARATOIRE_5: "NIVEAU_4",
    PREPARATOIRE_6: "NIVEAU_5",
    PREPARATOIRE_7: "NIVEAU_6",
  }
  const legacyLevel = legacyLevelMap[value] ?? value
  return { category: "LANGUE_ARABE", level: legacyLevel, type: "CONTROL" }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function AssessmentsClient({ exams: initialExams, role }: { exams: ExamFile[]; role: string }) {
  const [exams, setExams] = useState(initialExams)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [addContext, setAddContext] = useState<AddContext | null>(null)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState("")
  const [resourceType, setResourceType] = useState<ResourceType>("BOOK")
  const [driveUrl, setDriveUrl] = useState("")
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({})
  const [uploadError, setUploadError] = useState("")
  const [uploadSuccess, setUploadSuccess] = useState("")

  const canManage = ["DIRECTOR", "SECRETARY"].includes(role)

  function toggleLevel(key: string) {
    setExpandedLevels((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function resetUploadForm() {
    setTitle("")
    setResourceType("BOOK")
    setDriveUrl("")
    setUploadError("")
    setUploadSuccess("")
  }

  function openAddDialog(context: AddContext) {
    resetUploadForm()
    setAddContext(context)
    setExpandedLevels((prev) => ({ ...prev, [`${context.category}:${context.level}`]: true }))
    setDialogOpen(true)
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!addContext || !title || !driveUrl || !resourceType) return

    setUploadError("")
    setUploadSuccess("")
    setUploading(true)
    const formData = new FormData()
    formData.append("title", title)
    formData.append("level", encodeLevel(addContext.category, addContext.level, resourceType))
    formData.append("fileUrl", driveUrl)

    const res = await fetch("/api/exams", { method: "POST", body: formData })
    if (res.ok) {
      const newExam = await res.json()
      setExams((prev) => [newExam, ...prev])
      setTitle("")
      setDriveUrl("")
      setUploadSuccess("PDF ajouté. Vous pouvez en ajouter un autre ou fermer la fenêtre.")
    } else {
      const data = await res.json().catch(() => null)
      setUploadError(data?.error || "Upload impossible pour le moment.")
    }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce fichier ?")) return
    const res = await fetch(`/api/exams/${id}`, { method: "DELETE" })
    if (res.ok) {
      setExams((prev) => prev.filter((e) => e.id !== id))
    }
  }

  function filesFor(categoryValue: string, levelValue: string, type: ResourceType) {
    return exams.filter((exam) => {
      const parsed = parseLevel(exam.level)
      return parsed.category === categoryValue && parsed.level === levelValue && parsed.type === type
    })
  }

  function FileList({ files, emptyLabel }: { files: ExamFile[]; emptyLabel: string }) {
    if (files.length === 0) {
      return <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-gray-400">{emptyLabel}</p>
    }

    return (
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
        {files.map((exam) => (
          <div key={exam.id} className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50">
            <FileText className="h-5 w-5 shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{exam.title}</p>
              <p className="text-xs text-gray-400">
                {exam.fileName}
                {exam.fileSize ? ` · ${formatSize(exam.fileSize)}` : ""}
                {exam.uploadedBy ? ` · par ${exam.uploadedBy}` : ""}
                {" · "}
                {new Date(exam.createdAt).toLocaleDateString("fr-FR")}
              </p>
            </div>
            <a
              href={exam.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-blue-600"
              title="Télécharger"
            >
              <Download className="h-4 w-4" />
            </a>
            {canManage && (
              <button
                onClick={() => handleDelete(exam.id)}
                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Livres et contrôles</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {exams.length} fichier{exams.length !== 1 ? "s" : ""} classé{exams.length !== 1 ? "s" : ""} par catégorie et niveau
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => (
          <section key={cat.value} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Catégorie {cat.label}</h2>
              <p className="text-sm text-gray-500">
                {cat.value === "LANGUE_ARABE"
                  ? "PDF de cours et contrôles classés par niveau."
                  : "PDF à télécharger, livres et contrôles liés au Coran."}
              </p>
            </div>

            <div className="space-y-2">
              {cat.levels.map((lv) => {
                const key = `${cat.value}:${lv.value}`
                const isOpen = expandedLevels[key] ?? false
                const books = filesFor(cat.value, lv.value, "BOOK")
                const controls = filesFor(cat.value, lv.value, "CONTROL")
                const total = books.length + controls.length
                const context = {
                  category: cat.value,
                  categoryLabel: cat.label,
                  level: lv.value,
                  levelLabel: lv.label,
                }

                return (
                  <div key={key} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-2 p-4 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        onClick={() => toggleLevel(key)}
                        className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left sm:items-center"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                          <span className="font-semibold text-gray-900">{lv.label}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                            {total} fichier{total !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
                      </button>
                      {canManage && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 w-full shrink-0 sm:w-auto"
                          onClick={() => openAddDialog(context)}
                        >
                          <Plus className="h-4 w-4" />
                          Rajouter un PDF
                        </Button>
                      )}
                    </div>

                    {isOpen && (
                      <div className="grid gap-4 border-t border-gray-100 p-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <BookOpen className="h-4 w-4 text-emerald-600" />
                            PDF de cours / livres
                          </h3>
                          <FileList files={books} emptyLabel="Aucun PDF de cours pour ce niveau" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <ClipboardCheck className="h-4 w-4 text-blue-600" />
                            Contrôles
                          </h3>
                          <FileList files={controls} emptyLabel="Aucun contrôle pour ce niveau" />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Rajouter un PDF</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            {addContext && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {addContext.categoryLabel} · {addContext.levelLabel}
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setResourceType("BOOK")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium ${resourceType === "BOOK" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                <BookOpen className="h-4 w-4" />
                Livre de cours
              </button>
              <button
                type="button"
                onClick={() => setResourceType("CONTROL")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium ${resourceType === "CONTROL" ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                <ClipboardCheck className="h-4 w-4" />
                Contrôle
              </button>
            </div>

            <div className="space-y-1.5">
              <Label>Titre *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Livre débutant ou contrôle niveau 1" required />
            </div>

            <div className="space-y-1.5">
              <Label>Lien Google Drive *</Label>
              <Input
                type="url"
                value={driveUrl}
                onChange={(e) => {
                  setDriveUrl(e.target.value)
                  setUploadSuccess("")
                }}
                placeholder="https://drive.google.com/..."
                required
              />
            </div>

            {uploadSuccess && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {uploadSuccess}
              </p>
            )}
            {uploadError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {uploadError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button
                type="submit"
                disabled={uploading || !addContext || !title || !driveUrl || !resourceType}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                Ajouter le lien
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
