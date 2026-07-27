export default function DashboardLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Chargement du tableau de bord">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-gray-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-gray-100 bg-white" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-gray-100 bg-white" />
      <span className="sr-only">Chargement…</span>
    </div>
  )
}
