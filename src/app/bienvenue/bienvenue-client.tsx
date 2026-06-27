"use client"

import { useState } from "react"
import { SessionProvider, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Moon, Loader2, Info, Lock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"

function BienvenueForm({ name, currentEmail }: { name: string; currentEmail: string }) {
  const router = useRouter()
  const { update } = useSession()
  const [email, setEmail] = useState(currentEmail)
  const [wantPassword, setWantPassword] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (wantPassword) {
      if (password.length < 6) { setError("Le mot de passe doit faire au moins 6 caractères."); return }
      if (password !== confirm) { setError("Les deux mots de passe ne sont pas identiques."); return }
    }
    setLoading(true)
    const res = await fetch("/api/users/onboard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactEmail: email, newPassword: wantPassword ? password : undefined }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || "Une erreur est survenue.")
      setLoading(false)
      return
    }
    await update()
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-gray-100 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
        {/* En-tête */}
        <div className="bg-emerald-50 px-6 pb-6 pt-7 text-center">
          <p className="mb-3 font-serif text-xl text-emerald-800" dir="rtl">بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيمِ</p>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white">
            <Moon className="h-7 w-7 text-emerald-600" />
          </div>
          <p className="text-sm text-emerald-700">As-salâmu ʿalaykum wa rahmatullâh</p>
          <h1 className="mt-1 text-xl font-bold text-gray-900">Bienvenue, {name}</h1>
          <p className="mt-1 text-sm text-gray-500">Institut As-Sahaba</p>
        </div>

        {/* Hadith */}
        <div className="border-b border-gray-100 px-6 py-4 text-center">
          <p className="mb-1 text-lg text-gray-900" dir="rtl">إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ</p>
          <p className="text-sm italic text-gray-500">« Les actes ne valent que par les intentions. »</p>
          <p className="mt-1 text-xs text-gray-400">al-Bukhârî (n°1) et Muslim (n°1907)</p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Votre adresse email <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              required
              placeholder="prenom@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="flex items-start gap-1 text-xs text-gray-400">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Nécessaire pour récupérer votre mot de passe en cas d&apos;oubli.
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={wantPassword}
                onChange={(e) => setWantPassword(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-600"
              />
              <span className="text-sm text-gray-700">Souhaitez-vous modifier votre mot de passe maintenant&nbsp;?</span>
            </label>
            {wantPassword && (
              <div className="mt-3 space-y-2.5 pl-7">
                <PasswordInput
                  placeholder="Nouveau mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                />
                <PasswordInput
                  placeholder="Confirmer le mot de passe"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <p className="flex items-center gap-1 text-xs text-gray-400">
                  <Lock className="h-3 w-3" />
                  Les deux mots de passe doivent être identiques.
                </p>
              </div>
            )}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Accéder à mon espace
          </button>
        </form>
      </div>
    </div>
  )
}

export function BienvenueClient(props: { name: string; currentEmail: string }) {
  return (
    <SessionProvider>
      <BienvenueForm {...props} />
    </SessionProvider>
  )
}
