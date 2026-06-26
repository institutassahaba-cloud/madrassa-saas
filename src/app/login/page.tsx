"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { GraduationCap, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ email: "", password: "" })

  const DEMO_ROLES = [
    { label: "Directeur",  email: "directeur@assahaba.com",                icon: "🎓" },
    { label: "Secrétaire", email: "secretaire@assahaba.com",               icon: "📋" },
    { label: "Professeur", email: "samia.umm.abderrahmen@assahaba.com",    icon: "📖" },
  ]

  async function quickDemo(email: string) {
    setLoading(true)
    setError("")
    const result = await signIn("credentials", {
      email,
      password: "admin1234",
      redirect: false,
    })
    if (result?.error) { setError("Erreur de connexion rapide."); setLoading(false) }
    else router.push("/dashboard")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const result = await signIn("credentials", {
      ...form,
      redirect: false,
    })

    if (result?.error) {
      setError("Identifiants incorrects.")
      setLoading(false)
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-gray-100 p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">MadrassaApp</h1>
          <p className="mt-1 text-sm text-gray-500">Gestion d&apos;instituts islamiques</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Connexion</CardTitle>
            <CardDescription>Entrez vos identifiants pour accéder à votre espace</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="directeur@example.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Se connecter
              </Button>

              {process.env.NODE_ENV === "development" && (
                <div className="space-y-2 pt-1">
                  <p className="text-center text-xs text-gray-400">⚡ Accès démo rapide</p>
                  <div className="grid grid-cols-3 gap-2">
                    {DEMO_ROLES.map((r) => (
                      <button
                        key={r.email}
                        type="button"
                        onClick={() => quickDemo(r.email)}
                        disabled={loading}
                        className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 py-3 text-xs font-medium text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 transition-colors disabled:opacity-50"
                      >
                        <span className="text-xl">{r.icon}</span>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400">
          Institut As-Sahaba — Accès interne
        </p>
      </div>
    </div>
  )
}
