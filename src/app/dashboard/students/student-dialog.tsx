"use client"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
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
  student: any | null
  groups: { id: string; name: string }[]
}

const EMPTY = {
  firstName: "", lastName: "", gender: "MALE", phone: "", email: "",
  address: "", city: "", dateOfBirth: "", level: "", monthlyFee: "",
  groupId: "", parentName: "", parentPhone: "", parentEmail: "", notes: "",
}

export function StudentDialog({ open, onClose, student, groups }: StudentDialogProps) {
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (student) {
      setForm({
        firstName: student.firstName ?? "",
        lastName: student.lastName ?? "",
        gender: student.gender ?? "MALE",
        phone: student.phone ?? "",
        email: student.email ?? "",
        address: student.address ?? "",
        city: student.city ?? "",
        dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toString().slice(0, 10) : "",
        level: student.level ?? "",
        monthlyFee: String(student.monthlyFee ?? ""),
        groupId: student.group?.id ?? "",
        parentName: student.parentName ?? "",
        parentPhone: student.parentPhone ?? "",
        parentEmail: student.parentEmail ?? "",
        notes: student.notes ?? "",
      })
    } else {
      setForm(EMPTY)
    }
    setError("")
  }, [student, open])

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const method = student ? "PUT" : "POST"
      const url = student ? `/api/students/${student.id}` : "/api/students"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      onClose()
      window.location.reload()
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
          <DialogTitle>{student ? "Modifier l'élève" : "Ajouter un élève"}</DialogTitle>
          <DialogDescription>Remplissez les informations de l'élève</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Prénom *</Label>
              <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Nom *</Label>
              <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Sexe *</Label>
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Garçon</SelectItem>
                  <SelectItem value="FEMALE">Fille</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date de naissance</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Groupe</Label>
              <Select value={form.groupId} onValueChange={(v) => set("groupId", v)}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun groupe</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Niveau</Label>
              <Input value={form.level} onChange={(e) => set("level", e.target.value)} placeholder="ex: Débutant, A1, Coran..." />
            </div>
            <div className="space-y-1.5">
              <Label>Tarif mensuel (€) *</Label>
              <Input type="number" min="0" step="0.01" value={form.monthlyFee} onChange={(e) => set("monthlyFee", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Informations parentales</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nom du parent/tuteur</Label>
                <Input value={form.parentName} onChange={(e) => set("parentName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Téléphone parent</Label>
                <Input value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Email parent</Label>
                <Input type="email" value={form.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} />
              </div>
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {student ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
