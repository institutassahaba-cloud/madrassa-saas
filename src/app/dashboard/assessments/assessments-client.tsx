"use client"
import { useState } from "react"
import { Upload, FileText, Trash2, Loader2, ChevronDown, ChevronUp, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const LEVELS = [
  { value: "DEBUTANT", label: "Niveau débutant" },
  { value: "PREPARATOIRE", label: "Niveau préparatoire" },
  { value: "NIVEAU_01", label: "Niveau 01" },
  { value: "NIVEAU_02", label: "Niveau 02" },
  { value: "NIVEAU_03", label: "Niveau 03" },
  { value: "NIVEAU_04", label: "Niveau 04" },
  { value: "NIVEAU_05", label: "Niveau 05" },
]

const LEVEL_LABELS: Record<string, string> = {}
for (const l of LEVELS) LEVEL_LABELS[l.value] = l.label

const LEVEL_COLORS: Record<string, string> = {
  DEBUTANT: "bg-gray-100 text-gray-700 border-gray-200",
  PREPARATOIRE: "bg-amber-50 text-amber-700 border-amber-200",
  NIVEAU_01: "bg-blue-50 text-blue-700 border-blue-200",
  NIVEAU_02: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NIVEAU_03: "bg-violet-50 text-violet-700 border-violet-200",
  NIVEAU_04: "bg-pink-50 text-pink-700 border-pink-200",
  NIVEAU_05: "bg-red-50 text-red-700 border-red-200",
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
  const [level, setLevel] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const l of LEVELS) init[l.value] = true
    return init
  })

  const canManage = ["DIRECTOR", "SECRETARY"].includes(role)

  const examsByLevel = LEVELS.map((l) => ({
    ...l,
    exams: exams.filter((e) => e.level === l.value),
  })).filter((l) => l.exams.length > 0 || canManage)

  function toggleLevel(lv: string) {
    setExpandedLevels((prev) => ({ ...prev, [lv]: !prev[lv] }))
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !title || !level) return
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", title)
    formData.append("level", level)
    const res = await fetch("/api/exams", { method: "POST", body: formData })
    if (res.ok) {
      const newExam = await res.json()
      setExams((prev) => [newExam, ...prev])
      setDialogOpen(false)
      setTitle("")
      setLevel("")
      setFile(null)
    }
    setUploading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce contrôle ?")) return
    await fetch(`/api/exams/${id}`, { method: "DELETE" })
    setExams((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contrôles</h1>
          <p className="text-sm text-gray-500 mt-0.5">{exams.length} contrôle{exams.length !== 1 ? "s" : ""} classé{exams.length !== 1 ? "s" : ""} par niveau</p>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            Uploader un contrôle
          </Button>
        )}
      </div>

      {/* Liste par niveau */}
      <div className="space-y-3">
        {examsByLevel.map(({ value, label, exams: levelExams }) => {
          const isOpen = expandedLevels[value] ?? true
          const colors = LEVEL_COLORS[value] || "bg-gray-50 text-gray-700 border-gray-200"
          return (
            <div key={value} className={`rounded-xl border ${colors} overflow-hidden`}>
              <button
                onClick={() => toggleLevel(value)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{label}</span>
                  <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium">
                    {levelExams.length} fichier{levelExams.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {isOpen && (
                <div className="border-t border-current/10 bg-white">
                  {levelExams.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">Aucun contrôle pour ce niveau</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {levelExams.map((exam) => (
                        <div key={exam.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                          <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{exam.title}</p>
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
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Dialog upload */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Uploader un contrôle</DialogTitle></DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Titre *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Contrôle de mi-session Coran" required />
            </div>
            <div className="space-y-1.5">
              <Label>Niveau *</Label>
              <Select value={level} onValueChange={setLevel} required>
                <SelectTrigger><SelectValue placeholder="Choisir le niveau..." /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fichier (PDF, image) *</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={uploading || !file || !title || !level}>
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
