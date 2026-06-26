"use client"

import { useState } from "react"
import { UserCheck, Clock, UserX, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Member {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  lastLoginAt: string | null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `Il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Hier"
  if (days < 7) return `Il y a ${days} jours`
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`
  return `Il y a ${Math.floor(days / 30)} mois`
}

function statusColor(dateStr: string | null, isActive: boolean) {
  if (!isActive) return { bg: "bg-gray-100", dot: "bg-gray-400", label: "Désactivé" }
  if (!dateStr) return { bg: "bg-gray-100", dot: "bg-gray-400", label: "Jamais connecté(e)" }
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days < 3) return { bg: "bg-emerald-50", dot: "bg-emerald-500", label: "Actif" }
  if (days < 7) return { bg: "bg-amber-50", dot: "bg-amber-500", label: "Inactif récent" }
  return { bg: "bg-red-50", dot: "bg-red-500", label: "Inactif" }
}

export function ConnexionsClient({ members: initial, userRole }: { members: Member[]; userRole: string }) {
  const [members, setMembers] = useState(initial)
  const [loading, setLoading] = useState<string | null>(null)

  async function toggleActive(id: string, isActive: boolean) {
    if (isActive && !confirm("Désactiver ce compte ? Le membre ne pourra plus se connecter.")) return
    if (!isActive && !confirm("Réactiver ce compte ?")) return
    setLoading(id)
    try {
      await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      })
      setMembers((prev) => prev.map((m) => m.id === id ? { ...m, isActive: !isActive } : m))
    } finally {
      setLoading(null)
    }
  }

  const active = members.filter((m) => m.isActive)
  const inactive = members.filter((m) => !m.isActive)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connexions</h1>
        <p className="text-sm text-gray-500 mt-0.5">Dernières connexions de l&apos;équipe</p>
      </div>

      {members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <UserCheck className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-400">Aucun membre</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {active.map((m) => {
              const status = statusColor(m.lastLoginAt, m.isActive)
              return (
                <div key={m.id} className={`flex items-center gap-4 rounded-xl border border-gray-100 ${status.bg} p-4`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-gray-700 shadow-sm">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{m.name}</p>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-500">
                        {m.role === "TEACHER" ? "Professeur" : "Secrétaire"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className={`h-2 w-2 rounded-full ${status.dot}`} />
                        <span className="text-xs font-medium text-gray-600">{status.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        {m.lastLoginAt ? timeAgo(m.lastLoginAt) : "—"}
                      </p>
                    </div>
                    {userRole === "DIRECTOR" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        disabled={loading === m.id}
                        onClick={() => toggleActive(m.id, true)}
                      >
                        <UserX className="h-3 w-3 mr-1" />
                        Désactiver
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {inactive.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-3">Comptes désactivés ({inactive.length})</p>
              <div className="space-y-3">
                {inactive.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 opacity-70">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-600">{m.name}</p>
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
                          {m.role === "TEACHER" ? "Professeur" : "Secrétaire"}
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">Désactivé</span>
                      </div>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </div>
                    {userRole === "DIRECTOR" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        disabled={loading === m.id}
                        onClick={() => toggleActive(m.id, false)}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Réactiver
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
