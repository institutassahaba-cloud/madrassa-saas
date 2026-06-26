"use client"
import { useState, useEffect } from "react"
import { Loader2, ChevronUp, ChevronDown } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface StudentDialogProps {
  open: boolean
  onClose: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  student: any | null
  groups: { id: string; name: string; teacherId: string | null }[]
  teachers: { id: string; name: string }[]
}

const EMPTY_IDENTITY = {
  firstName: "", lastName: "", gender: "MALE", phone: "", email: "",
  dateOfBirth: "", level: "", parentName: "", parentPhone: "", parentEmail: "",
}

const EMPTY_SHARED = {
  address: "", city: "", subject: "", monthlyFee: "",
  hourlyRate: "", lessonsPerWeek: "", duration: "", startSession: "",
  groupId: "", notes: "", status: "ACTIVE", recontactDate: "",
}

const EMPTY_EXTRA = {
  subject: "", groupId: "", hourlyRate: "", lessonsPerWeek: "", duration: "", startSession: "",
}

const SUBJECTS = ["Coran", "Nouraniya", "Arabe", "Langue arabe", "Tajwid", "Fiqh", "Autre"]

export function StudentDialog({ open, onClose, student, groups, teachers }: StudentDialogProps) {
  const [studentCount, setStudentCount] = useState(1)
  const [identities, setIdentities] = useState([{ ...EMPTY_IDENTITY }])
  const [shared, setShared] = useState({ ...EMPTY_SHARED })
  const [teacherId, setTeacherId] = useState("")
  const [joinExisting, setJoinExisting] = useState(false)
  const [multiProf, setMultiProf] = useState(false)
  const [extraTeacherId, setExtraTeacherId] = useState("")
  const [extra, setExtra] = useState({ ...EMPTY_EXTRA })
  const [groupInfo, setGroupInfo] = useState<{ count: number; subject?: string; lessonsPerWeek?: number; duration?: string; newRate?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (student) {
      setStudentCount(1)
      setIdentities([{
        firstName: student.firstName ?? "",
        lastName: student.lastName ?? "",
        gender: student.gender ?? "MALE",
        phone: student.phone ?? "",
        email: student.email ?? "",
        dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toString().slice(0, 10) : "",
        level: student.level ?? "",
        parentName: student.parentName ?? "",
        parentPhone: student.parentPhone ?? "",
        parentEmail: student.parentEmail ?? "",
      }])
      setShared({
        address: student.address ?? "",
        city: student.city ?? "",
        subject: student.subject ?? "",
        monthlyFee: String(student.monthlyFee ?? ""),
        hourlyRate: student.hourlyRate != null ? String(student.hourlyRate) : "",
        lessonsPerWeek: student.lessonsPerWeek != null ? String(student.lessonsPerWeek) : "",
        duration: student.duration ?? "",
        startSession: "",
        groupId: student.group?.id ?? "",
        notes: student.notes ?? "",
        status: student.status ?? "ACTIVE",
        recontactDate: student.recontactDate ? student.recontactDate.toString().slice(0, 10) : "",
      })
      const currentGroup = groups.find(g => g.id === student.group?.id)
      setTeacherId(currentGroup?.teacherId ?? "")
    } else {
      setStudentCount(1)
      setIdentities([{ ...EMPTY_IDENTITY }])
      setShared({ ...EMPTY_SHARED })
      setTeacherId("")
    }
    setJoinExisting(false)
    setMultiProf(false)
    setExtra({ ...EMPTY_EXTRA })
    setExtraTeacherId("")
    setError("")
  }, [student, open, groups])
  /* eslint-enable react-hooks/set-state-in-effect */

  function updateCount(newCount: number) {
    if (newCount < 1) return
    setStudentCount(newCount)
    setIdentities((prev) => {
      if (newCount > prev.length) {
        return [...prev, ...Array.from({ length: newCount - prev.length }, () => ({ ...EMPTY_IDENTITY }))]
      }
      return prev.slice(0, newCount)
    })
  }

  function setIdentity(idx: number, key: string, value: string) {
    setIdentities((prev) => prev.map((item, i) => i === idx ? { ...item, [key]: value } : item))
  }

  function setSharedField(key: string, value: string) {
    setShared((f) => ({ ...f, [key]: value }))
  }

  function setEx(key: string, value: string) {
    setExtra((f) => ({ ...f, [key]: value }))
  }

  const filteredGroups = teacherId ? groups.filter(g => g.teacherId === teacherId) : groups
  const lockedByGroup = joinExisting && !!shared.groupId && !!groupInfo && groupInfo.count > 0
  const extraFilteredGroups = extraTeacherId ? groups.filter(g => g.teacherId === extraTeacherId) : groups

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      if (student) {
        // Edit mode: single student
        const form = { ...identities[0], ...shared }
        const res = await fetch(`/api/students/${student.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error(await res.text())
      } else {
        // Create mode: one or multiple students
        for (let i = 0; i < studentCount; i++) {
          const form = { ...identities[i], ...shared, joinExisting }
          if (!joinExisting && !form.startSession) form.startSession = "1"
          const res = await fetch("/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
          if (!res.ok) {
            const data = await res.json()
            throw new Error(`Élève ${i + 1} (${identities[i].firstName || "?"}) : ${data.error || "erreur"}`)
          }

          // Multi-prof for each student
          if (multiProf && extra.groupId) {
            const res2 = await fetch("/api/students", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...form,
                subject: extra.subject,
                groupId: extra.groupId,
                hourlyRate: extra.hourlyRate,
                lessonsPerWeek: extra.lessonsPerWeek,
                duration: extra.duration,
                startSession: extra.startSession,
              }),
            })
            if (!res2.ok) {
              const data = await res2.json()
              setError(`Élève ${i + 1} - 2e inscription : ${data.error || "erreur"}`)
              setLoading(false)
              return
            }
          }
        }
      }
      onClose()
      window.location.reload()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setError(e.message || "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{student ? "Modifier l'élève" : "Ajouter des élèves"}</DialogTitle>
          <DialogDescription>Remplissez les informations {studentCount > 1 ? `des ${studentCount} élèves` : "de l'élève"}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Compteur d'élèves (création uniquement) */}
          {!student && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <Label className="text-sm font-medium text-blue-900">Nombre d&apos;élèves</Label>
              <div className="flex items-center rounded-lg border border-blue-300 bg-white">
                <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[2rem] text-center">{studentCount}</span>
                <div className="flex flex-col border-l border-blue-200">
                  <button type="button" onClick={() => updateCount(studentCount + 1)} className="px-2 py-0.5 hover:bg-blue-100 rounded-tr-lg">
                    <ChevronUp className="h-3 w-3 text-blue-600" />
                  </button>
                  <button type="button" onClick={() => updateCount(studentCount - 1)} disabled={studentCount <= 1} className="px-2 py-0.5 hover:bg-blue-100 rounded-br-lg disabled:opacity-30">
                    <ChevronDown className="h-3 w-3 text-blue-600" />
                  </button>
                </div>
              </div>
              <span className="text-xs text-blue-600">
                {studentCount === 1 ? "Individuel" : studentCount === 2 ? "Binôme" : `Groupe de ${studentCount}`}
              </span>
            </div>
          )}

          {/* Identité de chaque élève */}
          {identities.map((identity, idx) => (
            <div key={idx} className={`space-y-3 ${studentCount > 1 ? "rounded-xl border border-gray-200 p-4" : ""}`}>
              {studentCount > 1 && (
                <p className="text-sm font-semibold text-gray-700">Élève {idx + 1}</p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Prénom *</Label>
                  <Input value={identity.firstName} onChange={(e) => setIdentity(idx, "firstName", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Nom *</Label>
                  <Input value={identity.lastName} onChange={(e) => setIdentity(idx, "lastName", e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Sexe *</Label>
                  <Select value={identity.gender} onValueChange={(v) => setIdentity(idx, "gender", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Garçon</SelectItem>
                      <SelectItem value="FEMALE">Fille</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date de naissance</Label>
                  <Input type="date" value={identity.dateOfBirth} onChange={(e) => setIdentity(idx, "dateOfBirth", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Téléphone</Label>
                  <Input value={identity.phone} onChange={(e) => setIdentity(idx, "phone", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={identity.email} onChange={(e) => setIdentity(idx, "email", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Niveau</Label>
                  <Input value={identity.level} onChange={(e) => setIdentity(idx, "level", e.target.value)} placeholder="ex: Débutant, A1..." />
                </div>
              </div>

              {/* Infos parentales par élève */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Nom du parent/tuteur</Label>
                  <Input value={identity.parentName} onChange={(e) => setIdentity(idx, "parentName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Téléphone parent</Label>
                  <Input value={identity.parentPhone} onChange={(e) => setIdentity(idx, "parentPhone", e.target.value)} />
                </div>
                {studentCount === 1 && (
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs text-gray-500">Email parent</Label>
                    <Input type="email" value={identity.parentEmail} onChange={(e) => setIdentity(idx, "parentEmail", e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Infos communes (adresse, forfait, prof) */}
          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium text-gray-700">{studentCount > 1 ? "Informations communes" : "Informations complémentaires"}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Adresse</Label>
                <Input value={shared.address} onChange={(e) => setSharedField("address", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tarif mensuel (€) *</Label>
                <Input type="number" min="0" step="0.01" value={shared.monthlyFee} onChange={(e) => setSharedField("monthlyFee", e.target.value)} required />
              </div>
            </div>
          </div>

          {/* Professeur & forfait */}
          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Professeur & forfait</p>

            {/* Nouvelle classe vs intégrer classe existante */}
            {!student && (
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => { setJoinExisting(false); setSharedField("groupId", ""); setSharedField("startSession", "1") }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${!joinExisting ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
                >
                  Nouvelle classe
                </button>
                <button
                  type="button"
                  onClick={() => { setJoinExisting(true); setSharedField("startSession", "") }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${joinExisting ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
                >
                  Intégrer à une classe existante
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Professeur</Label>
                <Select value={teacherId} onValueChange={(v) => { setTeacherId(v); setSharedField("groupId", "") }}>
                  <SelectTrigger><SelectValue placeholder="Choisir un prof..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous</SelectItem>
                    {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Classe existante (visible seulement si "intégrer") ou en mode édition */}
              {(joinExisting || student) && (
                <div className="space-y-1.5">
                  <Label>Classe</Label>
                  <Select value={shared.groupId} onValueChange={async (v) => {
                    setSharedField("groupId", v)
                    if (joinExisting && v) {
                      const res = await fetch(`/api/groups/${v}/info`)
                      if (res.ok) {
                        const info = await res.json()
                        setGroupInfo(info)
                        if (info.count > 0) {
                          if (info.subject) setSharedField("subject", info.subject)
                          if (info.lessonsPerWeek) setSharedField("lessonsPerWeek", String(info.lessonsPerWeek))
                          if (info.duration) setSharedField("duration", info.duration)
                          if (info.newRate) setSharedField("hourlyRate", String(info.newRate))
                        }
                      }
                    } else {
                      setGroupInfo(null)
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="">Aucune classe</SelectItem>
                      {filteredGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {joinExisting && shared.groupId && groupInfo && groupInfo.count > 0 && (
                    <p className="text-xs text-blue-600">
                      Classe de {groupInfo.count} élève{groupInfo.count > 1 ? "s" : ""} → tarif adapté à {groupInfo.newRate}€/h
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Matière {lockedByGroup && <span className="text-xs text-blue-500 ml-1">(classe)</span>}</Label>
                <Select value={shared.subject} onValueChange={(v) => setSharedField("subject", v)} disabled={lockedByGroup}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucune</SelectItem>
                    {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cours par semaine {lockedByGroup && <span className="text-xs text-blue-500 ml-1">(classe)</span>}</Label>
                <Input type="number" min="0" step="1" value={shared.lessonsPerWeek} onChange={(e) => setSharedField("lessonsPerWeek", e.target.value)} placeholder="ex: 1, 2..." disabled={lockedByGroup} />
              </div>
              <div className="space-y-1.5">
                <Label>Durée d&apos;un cours {lockedByGroup && <span className="text-xs text-blue-500 ml-1">(classe)</span>}</Label>
                <Select value={shared.duration} onValueChange={(v) => setSharedField("duration", v)} disabled={lockedByGroup}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0,5">30 min</SelectItem>
                    <SelectItem value="1">1h</SelectItem>
                    <SelectItem value="1,5">1h30</SelectItem>
                    <SelectItem value="2">2h</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tarif horaire (€) {lockedByGroup && <span className="text-xs text-blue-500 ml-1">(auto)</span>}</Label>
                <Input type="number" min="0" step="0.01" value={shared.hourlyRate} onChange={(e) => setSharedField("hourlyRate", e.target.value)} disabled={lockedByGroup} />
              </div>
              {!student && (
                <div className="space-y-1.5">
                  <Label>N° de session de départ</Label>
                  {joinExisting && shared.groupId ? (
                    <p className="mt-1 text-sm text-gray-500 italic">Automatique (session de la classe)</p>
                  ) : (
                    <Input type="number" min="1" step="1" value={shared.startSession || "1"} onChange={(e) => setSharedField("startSession", e.target.value)} placeholder="1" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Multi-prof (création uniquement) */}
          {!student && (
            <div className="border-t pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={multiProf} onChange={(e) => setMultiProf(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-medium text-gray-700">Plusieurs professeurs</span>
                <span className="text-xs text-gray-400">(2e matière / créneau / forfait)</span>
              </label>

              {multiProf && (
                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-blue-700">2e inscription</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Professeur</Label>
                      <Select value={extraTeacherId} onValueChange={(v) => { setExtraTeacherId(v); setEx("groupId", "") }}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="Choisir un prof..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Tous</SelectItem>
                          {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Classe</Label>
                      <Select value={extra.groupId} onValueChange={(v) => setEx("groupId", v)}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          <SelectItem value="">Aucune classe</SelectItem>
                          {extraFilteredGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Matière</Label>
                      <Select value={extra.subject} onValueChange={(v) => setEx("subject", v)}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Aucune</SelectItem>
                          {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cours par semaine</Label>
                      <Input type="number" min="0" step="1" value={extra.lessonsPerWeek} onChange={(e) => setEx("lessonsPerWeek", e.target.value)} className="bg-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Durée</Label>
                      <Select value={extra.duration} onValueChange={(v) => setEx("duration", v)}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0,5">30 min</SelectItem>
                          <SelectItem value="1">1h</SelectItem>
                          <SelectItem value="1,5">1h30</SelectItem>
                          <SelectItem value="2">2h</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tarif horaire (€)</Label>
                      <Input type="number" min="0" step="0.01" value={extra.hourlyRate} onChange={(e) => setEx("hourlyRate", e.target.value)} className="bg-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>N° de session de départ</Label>
                      <Input type="number" min="1" step="1" value={extra.startSession} onChange={(e) => setEx("startSession", e.target.value)} className="bg-white" placeholder="ex: 1" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Statut (édition uniquement) */}
          {student && (
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Statut de l&apos;élève</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select value={shared.status} onValueChange={(v) => setSharedField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Actif</SelectItem>
                      <SelectItem value="PAUSED">En pause</SelectItem>
                      <SelectItem value="STOPPED">Arrêt définitif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {shared.status === "PAUSED" && (
                  <div className="space-y-1.5">
                    <Label>Date de recontact</Label>
                    <Input type="date" value={shared.recontactDate} onChange={(e) => setSharedField("recontactDate", e.target.value)} />
                    <p className="text-xs text-gray-400">Une tâche sera créée pour recontacter l&apos;élève à cette date.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {student ? "Enregistrer" : studentCount > 1 ? `Ajouter ${studentCount} élèves` : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
