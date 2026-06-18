"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { GraduationCap, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { slugify } from "@/lib/utils"

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    instituteName: "", slug: "", directorName: "",
    email: "", password: "", phone: "",
  })

  function set(key: string, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === "instituteName") next.slug = slugify(value)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erreur lors de l'inscription")
      }
      router.push(`/login?slug=${form.slug}&registered=1`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-gray-100 p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Créer votre institut</h1>
          <p className="mt-1 text-sm text-gray-500">Démarrez gratuitement en 2 minutes</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Inscription</CardTitle>
            <CardDescription>Un compte directeur sera créé automatiquement</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nom de l'institut *</Label>
                <Input
                  placeholder="ex: Institut As-Sahaba"
                  value={form.instituteName}
                  onChange={(e) => set("instituteName", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Identifiant unique (slug) *</Label>
                <div className="flex items-center rounded-lg border border-gray-200 bg-white px-3">
                  <span className="text-sm text-gray-400 shrink-0">madrassaapp.fr/</span>
                  <input
                    className="flex-1 py-2 text-sm outline-none"
                    value={form.slug}
                    onChange={(e) => set("slug", slugify(e.target.value))}
                    required
                    placeholder="votre-slug"
                  />
                </div>
                <p className="text-xs text-gray-400">Cet identifiant sera utilisé pour la connexion</p>
              </div>

              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium text-gray-700">Compte directeur</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Nom complet *</Label>
                    <Input value={form.directorName} onChange={(e) => set("directorName", e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Email *</Label>
                      <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Téléphone</Label>
                      <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mot de passe *</Label>
                    <Input type="password" minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} required />
                    <p className="text-xs text-gray-400">Minimum 8 caractères</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Créer mon institut
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400">
          Déjà inscrit ?{" "}
          <a href="/login" className="text-emerald-600 hover:underline">Se connecter</a>
        </p>
      </div>
    </div>
  )
}
