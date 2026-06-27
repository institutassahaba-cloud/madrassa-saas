"use client"

import { useState } from "react"
import { Eye, Loader2 } from "lucide-react"

export function ImpersonationBanner({ teacherName }: { teacherName: string }) {
  const [loading, setLoading] = useState(false)

  async function exit() {
    setLoading(true)
    await fetch("/api/view-as", { method: "DELETE" })
    window.location.href = "/dashboard/teachers"
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <Eye className="h-4 w-4" />
      <span>Vous consultez l&apos;espace de <strong>{teacherName}</strong> (lecture seule)</span>
      <button
        onClick={exit}
        disabled={loading}
        className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-0.5 text-xs hover:bg-white/30 disabled:opacity-50"
      >
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        Quitter la vue
      </button>
    </div>
  )
}
