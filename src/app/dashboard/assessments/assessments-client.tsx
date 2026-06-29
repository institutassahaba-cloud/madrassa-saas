"use client"

import { useState } from "react"
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const RESOURCE_TYPES = [
  { value: "BOOK", label: "PDF de cours / livre" },
  { value: "CONTROL", label: "Contrôle" },
] as const

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
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("LANGUE_ARABE")
  const [level, setLevel] = useState("")
  const [resourceType, setResourceType] = useState<ResourceType>("BOOK")
  const [file, setFile] = useState<File | null>(null)
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({})
  const [uploadError, setUploadError] = useState("")

  const canManage = ["DIRECTOR", "SECRETARY"].includes(role)
  const selectedCategory = CATEGORIES.find((c) => c.value === category) ?? CATEGORIES[0]

  function toggleLevel(key: string) {
    setExpandedLevels((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function resetUploadForm() {
    setTitle("")
    setCategory("LANGUE_ARABE")
    setLevel("")
    setResourceType("BOOK")
    setFile(null)
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !title || !level || !category || !resourceType) return

    setUploadError("")
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", title)
    formData.append("level", encodeLevel(category, level, resourceType))

    const res = await fetch("/api/exams", { method: "POST", body: formData })
    if (res.ok) {
      const newExam = await res.json()
      setExams((prev) => [newExam, ...prev])
      setDialogOpen(false)
      resetUploadForm()
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
        {canManage && (
          <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            Uploader un PDF
          </Button>
        )}
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

                return (
                  <div key={key} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <button
                      onClick={() => toggleLevel(key)}
                      className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-gray-50 sm:items-center"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                        <span className="font-semibold text-gray-900">{lv.label}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          {total} fichier{total !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </button>

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uploader un PDF</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Titre *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Livre débutant ou contrôle niveau 1" required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Catégorie *</Label>
                <Select
                  value={category}
                  onValueChange={(value) => {
                    setCategory(value)
                    const nextCategory = CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[0]
                    setLevel(nextCategory.levels[0]?.value ?? "")
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir la catégorie..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select value={resourceType} onValueChange={(value) => setResourceType(value as ResourceType)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir le type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOURCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Niveau *</Label>
              <Select value={level} onValueChange={setLevel} required>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir le niveau..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedCategory.levels.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fichier PDF *</Label>
              <Input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            {uploadError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {uploadError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={uploading || !file || !title || !level || !category || !resourceType}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Uploader
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
