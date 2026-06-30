"use client"
import { useState } from "react"
import Image from "next/image"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ email: "", password: "" })

  // Mot de passe oublié
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotId, setForgotId] = useState("")
  const [forgotMsg, setForgotMsg] = useState("")
  const [forgotLoading, setForgotLoading] = useState(false)

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

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)
    setForgotMsg("")
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: forgotId }),
    })
    const data = await res.json().catch(() => ({}))
    setForgotMsg(data.message || "Si un compte correspond, un email a été envoyé.")
    setForgotLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-gray-100 p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <Image
            src="/logo-assahaba.png"
            alt="Institut Assahaba"
            width={80}
            height={80}
            className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain shadow-sm"
          />
          <h1 className="text-2xl font-bold text-gray-900">Institut Assahaba</h1>
          <p className="mt-1 text-sm text-gray-500">Gestion d&apos;instituts islamiques</p>
        </div>

        <Card className="shadow-lg">
          {forgotOpen ? (
            <>
              <CardHeader>
                <CardTitle>Mot de passe oublié</CardTitle>
                <CardDescription>Entrez votre identifiant. Un nouveau mot de passe sera envoyé à votre adresse email.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgotId">Identifiant</Label>
                    <Input
                      id="forgotId"
                      type="text"
                      placeholder="prenom00"
                      value={forgotId}
                      onChange={(e) => setForgotId(e.target.value)}
                      required
                    />
                  </div>

                  {forgotMsg && (
                    <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{forgotMsg}</div>
                  )}

                  <Button type="submit" className="w-full" disabled={forgotLoading}>
                    {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Envoyer un nouveau mot de passe
                  </Button>

                  <button
                    type="button"
                    onClick={() => { setForgotOpen(false); setForgotMsg("") }}
                    className="flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                  >
                    <ArrowLeft className="h-4 w-4" /> Retour à la connexion
                  </button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Connexion</CardTitle>
                <CardDescription>Entrez vos identifiants pour accéder à votre espace</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Identifiant</Label>
                    <Input
                      id="email"
                      type="text"
                      placeholder="prenom00"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">Mot de passe</Label>
                    <PasswordInput
                      id="password"
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

                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="block w-full text-center text-sm text-emerald-600 hover:text-emerald-700"
                  >
                    Mot de passe oublié&nbsp;?
                  </button>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        <p className="text-center text-xs text-gray-400">
          Institut As-Sahaba — Accès interne
        </p>
      </div>
    </div>
  )
}
