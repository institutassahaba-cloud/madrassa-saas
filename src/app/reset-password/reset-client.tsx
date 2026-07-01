"use client"
import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function ResetClient({ token }: { token: string }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.")
      return
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.")
      return
    }

    setLoading(true)
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(data.error || "Une erreur est survenue.")
      return
    }
    setDone(true)
    setTimeout(() => router.push("/login"), 2500)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-gray-100 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Image
            src="/logo-assahaba.png"
            alt="Institut Assahaba"
            width={80}
            height={80}
            className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain shadow-sm"
          />
          <h1 className="text-2xl font-bold text-gray-900">Institut Assahaba</h1>
          <p className="mt-1 text-sm text-gray-500">Nouveau mot de passe</p>
        </div>

        <Card className="shadow-lg">
          {done ? (
            <CardContent className="space-y-4 py-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <p className="text-sm text-gray-700">
                Votre mot de passe a été mis à jour. Redirection vers la connexion…
              </p>
              <Link href="/login" className="text-sm text-emerald-600 hover:text-emerald-700">
                Se connecter maintenant
              </Link>
            </CardContent>
          ) : !token ? (
            <CardContent className="space-y-4 py-8 text-center">
              <p className="text-sm text-red-700">Lien invalide : aucun jeton fourni.</p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" /> Retour à la connexion
              </Link>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Choisir un nouveau mot de passe</CardTitle>
                <CardDescription>Au moins 8 caractères.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Nouveau mot de passe</Label>
                    <PasswordInput
                      id="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                    <PasswordInput
                      id="confirm"
                      placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Enregistrer le nouveau mot de passe
                  </Button>

                  <Link
                    href="/login"
                    className="flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                  >
                    <ArrowLeft className="h-4 w-4" /> Retour à la connexion
                  </Link>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        <p className="text-center text-xs text-gray-400">Institut As-Sahaba — Accès interne</p>
      </div>
    </div>
  )
}
