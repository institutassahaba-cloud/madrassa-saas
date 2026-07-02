"use client"

import { useState } from "react"
import { SessionProvider, useSession } from "next-auth/react"
import { CheckCircle2, ChevronDown, Loader2, Mail, Phone, Plus, ShieldCheck, UserCog } from "lucide-react"
import { PasswordInput } from "@/components/ui/password-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate } from "@/lib/utils"

const ROLE_LABELS: Record<string, string> = {
  DIRECTOR: "Directeur",
  SECRETARY: "Secrétaire",
  TEACHER: "Professeur",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ROLE_VARIANTS: Record<string, any> = {
  DIRECTOR: "default",
  SECRETARY: "info",
  TEACHER: "warning",
}

type User = {
  id: string
  name: string
  email: string
  contactEmail: string | null
  role: string
  isActive: boolean
  phone: string | null
  createdAt: Date
}

type CurrentUser = User & { mustChangePassword: boolean }
type PseudoRequest = { id: string; currentName: string; requestedName: string; createdAt: string }

const USER_EMPTY = { name: "", email: "", role: "TEACHER", phone: "" }

function passwordValid(password: string) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password)
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}

type SettingsClientProps = {
  users: User[]
  currentUser: CurrentUser
  currentUserId: string
  pseudoRequests: PseudoRequest[]
}

// Wrapper : SessionProvider requis pour rafraîchir le jeton de session
// (update()) après un changement de mot de passe forcé — même pattern
// que bienvenue-client.
export function SettingsClient(props: SettingsClientProps) {
  return (
    <SessionProvider>
      <SettingsClientInner {...props} />
    </SessionProvider>
  )
}

function SettingsClientInner({
  users,
  currentUser,
  currentUserId,
  pseudoRequests,
}: SettingsClientProps) {
  const { update } = useSession()
  const isDirector = currentUser.role === "DIRECTOR"
  const isTeacher = currentUser.role === "TEACHER"
  const [userDialog, setUserDialog] = useState(false)
  const [userForm, setUserForm] = useState(USER_EMPTY)
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [requests, setRequests] = useState(pseudoRequests)
  const [openSection, setOpenSection] = useState<string | null>(currentUser.mustChangePassword ? "password" : null)
  const [accountInfo, setAccountInfo] = useState({
    name: currentUser.name,
    contactEmail: currentUser.contactEmail ?? "",
    phone: currentUser.phone ?? "",
  })

  const [pseudo, setPseudo] = useState(currentUser.name)
  const [requestedPseudo, setRequestedPseudo] = useState("")
  const [emailForm, setEmailForm] = useState({
    currentContactEmail: currentUser.contactEmail ?? "",
    contactEmail: "",
    confirmContactEmail: "",
  })
  const [phoneForm, setPhoneForm] = useState({
    currentPhone: currentUser.phone ?? "",
    phone: "",
    confirmPhone: "",
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  function setUF(key: string, value: string) {
    setUserForm((f) => ({ ...f, [key]: value }))
  }

  async function submitProfile(payload: Record<string, string>, successText: string) {
    setLoading(successText)
    setMessage(null)
    try {
      const res = await fetch("/api/users/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erreur")
      if (typeof data.name === "string") setAccountInfo((info) => ({ ...info, name: data.name }))
      if (typeof data.contactEmail === "string" || data.contactEmail === null) {
        setAccountInfo((info) => ({ ...info, contactEmail: data.contactEmail ?? "" }))
        setEmailForm({ currentContactEmail: data.contactEmail ?? "", contactEmail: "", confirmContactEmail: "" })
        setOpenSection(null)
      }
      if (typeof data.phone === "string" || data.phone === null) {
        setAccountInfo((info) => ({ ...info, phone: data.phone ?? "" }))
        setPhoneForm({ currentPhone: data.phone ?? "", phone: "", confirmPhone: "" })
        setOpenSection(null)
      }
      setMessage({ type: "ok", text: successText })
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Erreur" })
    } finally {
      setLoading(null)
    }
  }

  async function requestPseudo(e: React.FormEvent) {
    e.preventDefault()
    setLoading("pseudo")
    setMessage(null)
    try {
      const res = await fetch("/api/users/pseudo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedName: requestedPseudo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erreur")
      setRequestedPseudo("")
      setMessage({ type: "ok", text: "Demande envoyée au directeur." })
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Erreur" })
    } finally {
      setLoading(null)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!passwordValid(passwordForm.newPassword)) {
      setMessage({ type: "err", text: "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial." })
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: "err", text: "La confirmation du mot de passe ne correspond pas." })
      return
    }
    setLoading("password")
    try {
      const res = await fetch("/api/users/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordForm),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erreur")
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
      setOpenSection(null)
      setMessage({ type: "ok", text: "Mot de passe modifié." })
      if (currentUser.mustChangePassword) {
        // Rafraîchit le jeton (mustChangePassword → false) pour lever la
        // redirection forcée du proxy, puis recharge pour ôter le bandeau.
        await update()
        window.location.reload()
      }
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Erreur" })
    } finally {
      setLoading(null)
    }
  }

  function toggleSection(section: string) {
    setOpenSection((current) => current === section ? null : section)
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setLoading("create-user")
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      })
      if (!res.ok) throw new Error(await res.text())
      setUserDialog(false)
      window.location.reload()
    } finally {
      setLoading(null)
    }
  }

  async function toggleUser(id: string, isActive: boolean) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    })
    window.location.reload()
  }

  async function handlePseudoRequest(id: string, action: "APPROVE" | "REJECT") {
    setLoading(id)
    const res = await fetch(`/api/users/pseudo-request/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    setLoading(null)
    if (res.ok) {
      setRequests((items) => items.filter((item) => item.id !== id))
      if (action === "APPROVE") window.location.reload()
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Paramètres</h1>
        <p className="mt-0.5 text-sm text-gray-500">Pseudo, contact, téléphone et mot de passe</p>
      </div>

      {currentUser.mustChangePassword && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Vous devez changer votre mot de passe provisoire avant de continuer.
        </div>
      )}

      {message && (
        <div className={`rounded-lg px-3 py-2 text-sm ${message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserCog className="h-4 w-4 text-emerald-600" />Pseudo</CardTitle></CardHeader>
          <CardContent>
            {isTeacher ? (
              <form onSubmit={requestPseudo} className="space-y-3">
                <InfoLine label="Pseudo actuel" value={accountInfo.name} />
                <button type="button" onClick={() => toggleSection("pseudo")} className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Demander un changement de pseudo
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "pseudo" ? "rotate-180" : ""}`} />
                </button>
                {openSection === "pseudo" && (
                  <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                    <div className="space-y-1.5"><Label>Nouveau pseudo souhaité</Label><Input value={requestedPseudo} onChange={(e) => setRequestedPseudo(e.target.value)} /></div>
                    <Button type="submit" disabled={loading === "pseudo" || requestedPseudo.trim().length < 2}>{loading === "pseudo" && <Loader2 className="h-4 w-4 animate-spin" />}Envoyer la demande</Button>
                  </div>
                )}
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); submitProfile({ name: pseudo }, "Pseudo modifié.") }} className="space-y-3">
                <InfoLine label="Pseudo actuel" value={accountInfo.name} />
                <button type="button" onClick={() => toggleSection("pseudo")} className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Changer le pseudo
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "pseudo" ? "rotate-180" : ""}`} />
                </button>
                {openSection === "pseudo" && (
                  <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                    <div className="space-y-1.5"><Label>Nouveau pseudo</Label><Input value={pseudo} onChange={(e) => setPseudo(e.target.value)} /></div>
                    <Button type="submit" disabled={loading === "Pseudo modifié." || pseudo.trim().length < 2}>{loading === "Pseudo modifié." && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer</Button>
                  </div>
                )}
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4 text-blue-600" />Email de contact</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); submitProfile(emailForm, "Email de contact modifié.") }} className="space-y-3">
              <InfoLine label="Adresse actuelle" value={accountInfo.contactEmail || "Non renseignée"} />
              <button type="button" onClick={() => toggleSection("email")} className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                Changer l&apos;email de contact
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "email" ? "rotate-180" : ""}`} />
              </button>
              {openSection === "email" && (
                <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                  <div className="space-y-1.5"><Label>Email de contact actuel</Label><Input type="email" value={emailForm.currentContactEmail} onChange={(e) => setEmailForm((f) => ({ ...f, currentContactEmail: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Nouvelle adresse</Label><Input type="email" value={emailForm.contactEmail} onChange={(e) => setEmailForm((f) => ({ ...f, contactEmail: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Vérification de la nouvelle adresse</Label><Input type="email" value={emailForm.confirmContactEmail} onChange={(e) => setEmailForm((f) => ({ ...f, confirmContactEmail: e.target.value }))} /></div>
                  <Button type="submit" disabled={loading === "Email de contact modifié."}>{loading === "Email de contact modifié." && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer</Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Phone className="h-4 w-4 text-pink-600" />Téléphone</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); submitProfile(phoneForm, "Téléphone modifié.") }} className="space-y-3">
              <InfoLine label="Numéro actuel" value={accountInfo.phone || "Non renseigné"} />
              <button type="button" onClick={() => toggleSection("phone")} className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                Changer le numéro de téléphone
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "phone" ? "rotate-180" : ""}`} />
              </button>
              {openSection === "phone" && (
                <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                  <div className="space-y-1.5"><Label>Numéro de téléphone actuel</Label><Input value={phoneForm.currentPhone} onChange={(e) => setPhoneForm((f) => ({ ...f, currentPhone: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Nouveau numéro de téléphone</Label><Input value={phoneForm.phone} onChange={(e) => setPhoneForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Vérification du nouveau téléphone</Label><Input value={phoneForm.confirmPhone} onChange={(e) => setPhoneForm((f) => ({ ...f, confirmPhone: e.target.value }))} /></div>
                  <Button type="submit" disabled={loading === "Téléphone modifié."}>{loading === "Téléphone modifié." && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer</Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-emerald-600" />Mot de passe</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-3">
              <InfoLine label="Mot de passe" value="••••••••" />
              <button type="button" onClick={() => toggleSection("password")} className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                Changer le mot de passe
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openSection === "password" ? "rotate-180" : ""}`} />
              </button>
              {openSection === "password" && (
                <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                  {!currentUser.mustChangePassword && <div className="space-y-1.5"><Label>Mot de passe actuel</Label><PasswordInput value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))} /></div>}
                  <div className="space-y-1.5"><Label>Nouveau mot de passe</Label><PasswordInput value={passwordForm.newPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Confirmation du nouveau mot de passe</Label><PasswordInput value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))} /></div>
                  <p className="text-xs text-gray-400">Minimum 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.</p>
                  <Button type="submit" disabled={loading === "password"}>{loading === "password" && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer</Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      {isDirector && (
        <div className="space-y-4">
          {requests.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Demandes de pseudo à valider</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {requests.map((request) => (
                  <div key={request.id} className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{request.currentName} → {request.requestedName}</p>
                      <p className="text-xs text-gray-500">Demandé le {new Date(request.createdAt).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button size="sm" disabled={loading === request.id} onClick={() => handlePseudoRequest(request.id, "APPROVE")}><CheckCircle2 className="h-3.5 w-3.5" />Valider</Button>
                      <Button size="sm" variant="outline" disabled={loading === request.id} onClick={() => handlePseudoRequest(request.id, "REJECT")}>Refuser</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex sm:justify-end">
            <Button className="w-full sm:w-auto" onClick={() => { setUserForm(USER_EMPTY); setUserDialog(true) }}><Plus className="h-4 w-4" />Ajouter un utilisateur</Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Utilisateurs</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pseudo</TableHead>
                    <TableHead>Identifiant</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-28">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{u.email}</TableCell>
                      <TableCell className="text-sm text-gray-600">{u.contactEmail ?? "—"}</TableCell>
                      <TableCell><Badge variant={ROLE_VARIANTS[u.role]}>{ROLE_LABELS[u.role]}</Badge></TableCell>
                      <TableCell className="text-sm">{u.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm">{formatDate(u.createdAt)}</TableCell>
                      <TableCell><Badge variant={u.isActive ? "success" : "secondary"}>{u.isActive ? "Actif" : "Désactivé"}</Badge></TableCell>
                      <TableCell>{u.id !== currentUserId && <Button variant="ghost" size="sm" onClick={() => toggleUser(u.id, u.isActive)}>{u.isActive ? "Désactiver" : "Activer"}</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={userDialog} onOpenChange={setUserDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un utilisateur</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-1.5"><Label>Nom complet *</Label><Input value={userForm.name} onChange={(e) => setUF("name", e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Identifiant *</Label><Input value={userForm.email} onChange={(e) => setUF("email", e.target.value)} required /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Rôle *</Label>
                <Select value={userForm.role} onValueChange={(v) => setUF("role", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SECRETARY">Secrétaire</SelectItem>
                    <SelectItem value="TEACHER">Professeur</SelectItem>
                    <SelectItem value="DIRECTOR">Directeur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Téléphone</Label><Input value={userForm.phone} onChange={(e) => setUF("phone", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setUserDialog(false)}>Annuler</Button>
              <Button type="submit" disabled={loading === "create-user"}>{loading === "create-user" && <Loader2 className="h-4 w-4 animate-spin" />}Créer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
