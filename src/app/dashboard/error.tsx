"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[dashboard] erreur de rendu", error)
  }, [error])

  return (
    <div role="alert" className="mx-auto mt-12 max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
      <AlertTriangle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold text-gray-900">Cette page n&apos;a pas pu être chargée</h2>
      <p className="mt-1 text-sm text-gray-500">Tes données ne sont pas perdues. Tu peux relancer uniquement cette partie de l&apos;application.</p>
      <Button className="mt-4" onClick={unstable_retry}>Réessayer</Button>
    </div>
  )
}
