"use client"

import { useState } from "react"
import { Lock, CheckCircle2 } from "lucide-react"

export function MonCompteClient({ mustChangePassword }: { mustChangePassword: boolean }) {
  const [currentPassword, setCurrent] = useState("")
  const [newPassword, setNew] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (newPassword !== confirm) { setError("Les mots de passe ne correspondent pas."); return }
    if (newPassword.length < 6) { setError("Minimum 6 caractères."); return }

    setLoading(true)
    const res = await fetch("/api/users/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: mustChangePassword ? undefined : currentPassword, newPassword }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || "Erreur")
      setLoading(false)
      return
    }
    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600 mb-3" />
        <p className="font-medium text-emerald-800">Mot de passe modifié avec succès !</p>
      </div>
    )
  }

  return (
    <div>
      {mustChangePassword && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          <Lock className="inline h-4 w-4 mr-1" />
          Vous devez changer votre mot de passe provisoire avant de continuer.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="font-semibold text-gray-900">Changer le mot de passe</h2>

        {!mustChangePassword && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Mot de passe actuel</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Nouveau mot de passe</label>
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Confirmer</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Enregistrement…" : "Changer le mot de passe"}
        </button>
      </form>
    </div>
  )
}
