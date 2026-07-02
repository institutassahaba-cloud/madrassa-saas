"use client"
import Link from "next/link"
import { useState, useRef } from "react"
import { Plus, Search, Upload, Edit, Archive, ArchiveRestore, Trash2, X, MessageCircle, Clock } from "lucide-react"
import { gmailComposeLink } from "@/lib/contact-links"
import { whatsappLink } from "@/lib/phone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StudentDialog } from "./student-dialog"
import { formatCurrency } from "@/lib/utils"

const STATUS_CONFIG = {
  ACTIVE:   { label: "Actif",    variant: "success"   as const },
  PAUSED:   { label: "En pause", variant: "warning"   as const },
  STOPPED:  { label: "Arrêté",   variant: "destructive" as const },
  INACTIVE: { label: "Inactif",  variant: "warning"   as const },
  ARCHIVED: { label: "Ancien",   variant: "secondary" as const },
}

const SUBJECT_COLORS: Record<string, string> = {
  "Coran":        "bg-emerald-100 text-emerald-700",
  "Nouraniya":    "bg-blue-100 text-blue-700",
  "Nouraniyah":   "bg-blue-100 text-blue-700",
  "Arabe":        "bg-amber-100 text-amber-700",
  "Langue arabe": "bg-amber-100 text-amber-700",
  "Tajwid":       "bg-purple-100 text-purple-700",
  "Fiqh":         "bg-rose-100 text-rose-700",
}

interface Student {
  id: string
  firstName: string
  lastName: string
  displayName: string | null
  gender: string
  phone: string | null
  email: string | null
  parentPhone: string | null
  status: string
  subject: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monthlyFee: any
  paymentGraceAllowed: boolean
  hourlyRate: number | null
  lessonsPerWeek: number | null
  duration: string | null
  payerName: string | null
  paymentType: string | null
  paymentAliases: { id: string; type: string; alias: string; source: string }[]
  enrollmentDate: Date
  group: { id: string; name: string } | null
  teacherName: string | null
  groupSize: number
  level: string | null
  schedule: Slot[]
}

interface Slot {
  id: string
  day: number
  start: string
  end: string
  teacherId: string
  teacherTimezone: string
}

// "Individuel" (1 élève) / "Binôme" (2) / "Groupe" (3+) — déduit du nb d'élèves actifs du groupe.
function courseType(size: number): { label: string; cls: string } {
  if (size >= 3) return { label: "Groupe",    cls: "bg-indigo-100 text-indigo-700" }
  if (size === 2) return { label: "Binôme",   cls: "bg-sky-100 text-sky-700" }
  return { label: "Individuel", cls: "bg-gray-100 text-gray-600" }
}

// duration stocké en heures décimales FR ("1", "0,5", "0,75") ou texte ("1h", "30 min")
function formatDuration(d: string | null): string {
  if (!d) return "—"
  if (/h|min/i.test(d)) return d
  const hours = parseFloat(d.replace(",", "."))
  if (!isFinite(hours) || hours <= 0) return "—"
  const mins = Math.round(hours * 60)
  return mins % 60 === 0 ? `${mins / 60}h` : `${mins} min`
}

const DAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":")
  if (!hours || !minutes) return time
  return minutes === "00" ? `${Number(hours)}h` : `${Number(hours)}h${minutes}`
}

function getUTCOffset(tz: string): number {
  try {
    const now = new Date()
    const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" })
    const tzStr = now.toLocaleString("en-US", { timeZone: tz })
    return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000
  } catch { return 0 }
}

function convertTime(time: string, fromTz: string, toTz: string): string {
  const [h, m] = time.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time
  const diff = getUTCOffset(toTz) - getUTCOffset(fromTz || toTz)
  const total = h * 60 + m + diff
  const normalized = ((total % 1440) + 1440) % 1440
  return `${Math.floor(normalized / 60).toString().padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`
}

function scheduleLabel(slot: Slot): string {
  const start = convertTime(slot.start, slot.teacherTimezone, "Europe/Paris")
  const end = convertTime(slot.end, slot.teacherTimezone, "Europe/Paris")
  return `${DAYS_SHORT[slot.day]} ${formatTime(start)}-${formatTime(end)}`
}

function subjectLabel(subject: string): string {
  if (subject === "Nouraniyah") return "Nouraniya"
  if (subject === "Langue arabe") return "Arabe"
  return subject
}

function paymentAliasLabel(type: string | null) {
  if (type === "PAYPAL") return "PayPal"
  if (type === "WISE") return "Virement"
  return "Associé"
}

interface Group {
  id: string
  name: string
  level: string | null
  teacherId: string | null
}

interface Teacher {
  id: string
  name: string
}

interface ImportRow {
  firstName: string
  lastName: string
  subject: string
  groupName: string
  monthlyFee: string
  parentPhone: string
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split("\n").filter(Boolean)
  // Skip header if present
  const start = lines[0].toLowerCase().includes("prénom") || lines[0].toLowerCase().includes("prenom") ? 1 : 0
  return lines.slice(start).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
    return {
      firstName:   cols[0] ?? "",
      lastName:    cols[1] ?? "",
      subject:     cols[2] ?? "",
      groupName:   cols[3] ?? "",
      monthlyFee:  cols[4] ?? "0",
      parentPhone: cols[5] ?? "",
    }
  }).filter((r) => r.firstName)
}

export function StudentsClient({ students, groups, teachers, role }: { students: Student[]; groups: Group[]; teachers: Teacher[]; role: string }) {
  const [search, setSearch]         = useState("")
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(["ACTIVE"]))
  const [teacherFilter, setTeacherFilter] = useState("ALL")
  const [subjectFilters, setSubjectFilters] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editStudent, setEdit]      = useState<Student | null>(null)
  const [importing, setImporting]   = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Collect unique subjects from existing students
  const subjects = Array.from(new Set(students.map((s) => s.subject).filter(Boolean))) as string[]

  function toggleFilter(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  const filtered = students.filter((s) => {
    const matchSearch  = `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
                         (s.phone ?? "").includes(search)
    const matchStatus  = statusFilters.size === 0 || statusFilters.has(s.status)
    const matchTeacher = teacherFilter === "ALL" || groups.some((g) => g.id === s.group?.id && g.teacherId === teacherFilter)
    const matchSubject = subjectFilters.size === 0 || (s.subject != null && subjectFilters.has(s.subject))
    return matchSearch && matchStatus && matchTeacher && matchSubject
  })

  const activeCount   = students.filter((s) => s.status === "ACTIVE").length
  const archivedCount = students.filter((s) => s.status === "ARCHIVED").length
  const subjectCounts = Array.from(
    students
      .filter((s) => s.status === "ACTIVE")
      .reduce((map, student) => {
        const label = subjectLabel(student.subject?.trim() || "Sans matière")
        map.set(label, (map.get(label) ?? 0) + 1)
        return map
      }, new Map<string, number>())
  ).sort(([a], [b]) => {
    const order = ["Arabe", "Coran", "Nouraniya", "Tajwid"]
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    return a.localeCompare(b, "fr")
  })

  async function handleArchive(id: string, name: string) {
    if (!confirm(`Archiver ${name} ? L'élève sortira des listes actives mais son dossier sera conservé (consultable dans « Anciens »).`)) return
    await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    })
    window.location.reload()
  }

  async function handleUnarchive(id: string) {
    await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    })
    window.location.reload()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(
      `⚠️ EFFACER définitivement ${name} ?\n\n` +
      `Cette action supprime l'élève ET toutes ses données liées : historique de paiements, présences et notes. Elle est IRRÉVERSIBLE.\n\n` +
      `Rappel : la comptabilité doit légalement être conservée 10 ans. Pour un simple départ, préférez « Archiver ». N'effacez que sur demande d'oubli (RGPD).`
    )) return
    if (!confirm(`Confirmez une dernière fois l'effacement définitif de ${name}.`)) return
    const res = await fetch(`/api/students/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      alert(`Échec de l'effacement : ${err?.error ?? res.status}`)
      return
    }
    window.location.reload()
  }

  async function togglePaymentGrace(student: Student, checked: boolean) {
    await fetch(`/api/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentGraceAllowed: checked }),
    })
    window.location.reload()
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      let ok = 0, fail = 0
      for (const row of rows) {
        const group = groups.find((g) => g.name.toLowerCase() === row.groupName.toLowerCase())
        const res = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName:   row.firstName,
            lastName:    row.lastName,
            gender:      "FEMALE",
            subject:     row.subject || null,
            groupId:     group?.id ?? "",
            monthlyFee:  row.monthlyFee || "0",
            parentPhone: row.parentPhone || "",
          }),
        })
        if (res.ok) ok++
        else fail++
      }
      setImportResult(`${ok} élève(s) importé(s)${fail ? `, ${fail} erreur(s)` : ""}.`)
      if (ok > 0) setTimeout(() => window.location.reload(), 1500)
    } catch {
      setImportResult("Erreur lors de la lecture du fichier.")
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Élèves</h2>
          <p className="text-sm text-gray-500">
            {filtered.length !== students.length
              ? <><span className="font-medium text-emerald-600">{filtered.length}</span>/{students.length} élèves</>
              : <>{students.length} élève{students.length > 1 ? "s" : ""}</>
            }
            {` · ${activeCount} actif${activeCount > 1 ? "s" : ""}`}
            {archivedCount > 0 && ` · ${archivedCount} ancien${archivedCount > 1 ? "s" : ""}`}
          </p>
          {subjectCounts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {subjectCounts.map(([subject, count]) => (
                <span
                  key={subject}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${SUBJECT_COLORS[subject] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {subject} : {count}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4" />
            {importing ? "Import…" : "Importer CSV"}
          </Button>
          <Button onClick={() => { setEdit(null); setDialogOpen(true) }}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </div>

      {importResult && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">
          {importResult}
          <button onClick={() => setImportResult(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Format CSV info */}
      <p className="text-xs text-gray-400">
        Format CSV attendu : <code className="bg-gray-100 px-1 rounded">prénom, nom, matière, groupe, tarif, téléphone parent</code>
      </p>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 flex-1 sm:min-w-48">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input placeholder="Rechercher…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Professeur" />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="ALL">Tous les professeurs</SelectItem>
                  {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-400 self-center mr-1">Statut :</span>
              {(["ACTIVE", "PAUSED", "STOPPED", "ARCHIVED"] as const).map((key) => {
                const labels: Record<string, string> = { ACTIVE: "Actifs", PAUSED: "En pause", STOPPED: "Arrêtés", ARCHIVED: "Anciens" }
                const active = statusFilters.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleFilter(statusFilters, key, setStatusFilters)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {labels[key]}
                  </button>
                )
              })}
              <span className="text-xs text-gray-400 self-center ml-3 mr-1">Matière :</span>
              {subjects.map((s) => {
                const active = subjectFilters.has(s)
                const color = SUBJECT_COLORS[s] ?? "bg-gray-100 text-gray-600"
                return (
                  <button
                    key={s}
                    onClick={() => toggleFilter(subjectFilters, s, setSubjectFilters)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? `${color} border-current`
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Élève</TableHead>
                <TableHead>Professeur</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Forfait</TableHead>
                <TableHead>Nom paiement</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-gray-400">
                    Aucun élève trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((student) => {
                  const cfg = STATUS_CONFIG[student.status as keyof typeof STATUS_CONFIG]
                  const subjectColor = student.subject ? (SUBJECT_COLORS[student.subject] ?? "bg-gray-100 text-gray-600") : ""
                  const type = courseType(student.groupSize)
                  const hasSchedule = student.schedule.length > 0
                  return (
                    <TableRow key={student.id} className={student.status === "ARCHIVED" ? "opacity-60" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{student.displayName || `${student.firstName} ${student.lastName}`}</p>
                          <p className="text-xs text-gray-400">
                            {student.gender === "MALE" ? "Garçon" : student.gender === "FEMALE" ? "Fille" : ""}
                            {student.level && ` · ${student.level}`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-gray-700">{student.teacherName ?? <span className="text-gray-300">—</span>}</p>
                        {student.subject && (
                          <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${subjectColor}`}>
                            {student.subject}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${type.cls}`}>{type.label}</span>
                        {student.groupSize >= 2 && student.group && (
                          <p className="mt-0.5 text-xs text-gray-400">{student.group.name}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 space-y-1">
                        {student.phone && (() => {
                          const wa = whatsappLink(student.phone)
                          return wa ? (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-700 hover:underline">
                              <MessageCircle className="h-3.5 w-3.5" />{student.phone}
                            </a>
                          ) : <p>{student.phone}</p>
                        })()}
                        {student.parentPhone && student.parentPhone !== student.phone && (() => {
                          const wa = whatsappLink(student.parentPhone)
                          return wa ? (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-600 hover:underline">
                              <MessageCircle className="h-3.5 w-3.5" />Parent : {student.parentPhone}
                            </a>
                          ) : <p className="text-gray-400">Parent : {student.parentPhone}</p>
                        })()}
                        {student.email && (() => {
                          const mail = gmailComposeLink(student.email)
                          return mail ? (
                            <a href={mail} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:underline">{student.email}</a>
                          ) : null
                        })()}
                        {!student.phone && !student.parentPhone && !student.email && <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <p className="font-medium text-gray-900">{formatCurrency(student.monthlyFee)}<span className="font-normal text-gray-400"> / 4 sem.</span></p>
                        <label className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300"
                            checked={student.paymentGraceAllowed}
                            disabled={role !== "DIRECTOR"}
                            onChange={(event) => togglePaymentGrace(student, event.target.checked)}
                          />
                          <span>Cours autorisé sans paiement</span>
                        </label>
                        <p className="text-xs text-gray-500">
                          {student.lessonsPerWeek ? `${student.lessonsPerWeek}×/sem` : "—"}
                          {` · ${formatDuration(student.duration)}`}
                          {student.hourlyRate ? ` · ${formatCurrency(student.hourlyRate)}/h` : ""}
                        </p>
                        {hasSchedule && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {student.schedule.map((slot) => (
                              <a
                                key={slot.id}
                                href={`/dashboard/schedule?teacherId=${slot.teacherId}`}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-emerald-100"
                                title="Modifier ce créneau dans le planning"
                              >
                                <Clock className="h-3 w-3 text-emerald-600" />
                                🇫🇷 {scheduleLabel(slot)}
                              </a>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-56 text-xs text-gray-600">
                        {student.paymentAliases?.length ? (
                          <div className="space-y-1">
                            {student.paymentAliases.slice(0, 3).map((alias) => (
                              <p key={alias.id} className="truncate">
                                <span className="font-medium text-gray-800">{paymentAliasLabel(alias.type)} :</span> {alias.alias}
                              </p>
                            ))}
                            {student.paymentAliases.length > 3 && (
                              <p className="text-gray-400">+ {student.paymentAliases.length - 3} autre(s)</p>
                            )}
                          </div>
                        ) : student.payerName ? (
                          <p className="truncate">
                            <span className="font-medium text-gray-800">{paymentAliasLabel(student.paymentType)} :</span> {student.payerName}
                          </p>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg?.variant ?? "secondary"}>{cfg?.label ?? student.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button asChild variant="ghost" size="icon" title="Voir les sessions et demandes de paiement">
                            <Link href={`/dashboard/cahier?q=${encodeURIComponent(student.displayName || `${student.firstName} ${student.lastName}`)}`}>
                              <Clock className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setEdit(student); setDialogOpen(true) }} title="Modifier">
                            <Edit className="h-4 w-4" />
                          </Button>
                          {student.status !== "ARCHIVED" ? (
                            <Button variant="ghost" size="icon" onClick={() => handleArchive(student.id, `${student.firstName} ${student.lastName}`)} title="Archiver">
                              <Archive className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => handleUnarchive(student.id)} title="Désarchiver (remettre en actif)">
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                          )}
                          {role === "DIRECTOR" && (
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(student.id, `${student.firstName} ${student.lastName}`)} title="Effacer définitivement (RGPD)" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
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
        </CardContent>
      </Card>

      <StudentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} student={editStudent} groups={groups} teachers={teachers} />
    </div>
  )
}
