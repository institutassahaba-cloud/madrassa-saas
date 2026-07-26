export default function LoadingTeacherPayroll() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-5">
      <div className="h-8 w-72 rounded bg-gray-200" />
      <div className="grid gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 rounded-xl bg-gray-100" />)}
      </div>
      <div className="h-96 rounded-xl bg-gray-100" />
    </div>
  )
}
