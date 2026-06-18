"use client"
import { useState } from "react"
import { Plus, Loader2, UserPlus, Settings2, Key } from "lucide-react"
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

const ROLE_VARIANTS: Record<string, any> = {
  DIRECTOR: "default",
  SECRETARY: "info",
  TEACHER: "warning",
}

interface User {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  phone: string | null
  createdAt: Date
}

const USER_EMPTY = { name: "", email: "", password: "", role: "TEACHER", phone: "" }

export function SettingsClient({ users, tenant, currentUserId }: {
  users: User[]
  tenant: any
  currentUserId: string
}) {
  const [tab, setTab] = useState<"users" | "institute" | "integrations">("users")
  const [userDialog, setUserDialog] = useState(false)
  const [userForm, setUserForm] = useState(USER_EMPTY)
  const [loading, setLoading] = useState(false)
  const [tenantForm, setTenantForm] = useState({
    name: tenant?.name ?? "",
    email: tenant?.email ?? "",
    phone: tenant?.phone ?? "",
    address: tenant?.address ?? "",
    city: tenant?.city ?? "",
  })

  function setUF(key: string, value: string) {
    setUserForm((f) => ({ ...f, [key]: value }))
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
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
      setLoading(false)
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

  async function saveTenant(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch("/api/tenant", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tenantForm),
      })
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Paramètres</h2>
        <p className="text-sm text-gray-500">Gestion de l'institut et des utilisateurs</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {[
          { key: "users", label: "Utilisateurs", icon: UserPlus },
          { key: "institute", label: "Institut", icon: Settings2 },
          { key: "integrations", label: "Intégrations", icon: Key },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setUserForm(USER_EMPTY); setUserDialog(true) }}>
              <Plus className="h-4 w-4" />
              Ajouter un utilisateur
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
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
                      <TableCell>
                        <Badge variant={ROLE_VARIANTS[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{u.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm">{formatDate(u.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? "success" : "secondary"}>
                          {u.isActive ? "Actif" : "Désactivé"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.id !== currentUserId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleUser(u.id, u.isActive)}
                          >
                            {u.isActive ? "Désactiver" : "Activer"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Institute tab */}
      {tab === "institute" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Informations de l'institut</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveTenant} className="space-y-4 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <Label>Nom de l'institut</Label>
                  <Input value={tenantForm.name} onChange={(e) => setTenantForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email contact</Label>
                  <Input type="email" value={tenantForm.email} onChange={(e) => setTenantForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Téléphone</Label>
                  <Input value={tenantForm.phone} onChange={(e) => setTenantForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Adresse</Label>
                  <Input value={tenantForm.address} onChange={(e) => setTenantForm((f) => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Ville</Label>
                  <Input value={tenantForm.city} onChange={(e) => setTenantForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
              </div>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Integrations tab */}
      {tab === "integrations" && (
        <div className="space-y-4 max-w-lg">
          {[
            { title: "Wise", desc: "Détection automatique des virements", field: "wiseMerchantToken", placeholder: "Token API Wise" },
            { title: "PayPal", desc: "Synchronisation des paiements PayPal", field: "paypalClientId", placeholder: "Client ID PayPal" },
            { title: "WhatsApp", desc: "Envoi de rappels WhatsApp", field: "whatsappApiKey", placeholder: "Clé API WhatsApp" },
          ].map(({ title, desc, field, placeholder }) => (
            <Card key={field}>
              <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <p className="text-xs text-gray-500">{desc}</p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input type="password" placeholder={placeholder} />
                  <Button variant="outline">Connecter</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add user dialog */}
      <Dialog open={userDialog} onOpenChange={setUserDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un utilisateur</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nom complet *</Label>
              <Input value={userForm.name} onChange={(e) => setUF("name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={userForm.email} onChange={(e) => setUF("email", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Mot de passe *</Label>
              <Input type="password" value={userForm.password} onChange={(e) => setUF("password", e.target.value)} required minLength={6} />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-1.5">
                <Label>Téléphone</Label>
                <Input value={userForm.phone} onChange={(e) => setUF("phone", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setUserDialog(false)}>Annuler</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Créer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
