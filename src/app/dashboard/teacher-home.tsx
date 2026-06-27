import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Calendar, Clock, ChevronRight, BookOpen, Users } from "lucide-react"

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]

const SLOT_COLORS = [
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-violet-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
]

export async function TeacherHome({
  tenantId,
  teacherId,
  teacherName,
}: {
  tenantId: string
  teacherId: string
  teacherName: string
}) {
  const today = new Date().getDay()

  const slots = await prisma.timeSlot.findMany({
    where: { tenantId, teacherId, dayOfWeek: today },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      label: true,
      group: {
        select: {
          name: true,
          students: {
            where: { status: "ACTIVE" },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { startTime: "asc" },
  })

  const firstName = teacherName.split(" ")[0]

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Assalâmu ʿalaykum, {firstName}</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {DAYS[today]} · {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Hadith du moment */}
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-4 sm:rounded-2xl sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Hadith du moment</p>
        <p className="mt-2 text-sm text-gray-400 italic">Bientôt — les hadiths ajoutés régulièrement s&apos;afficheront ici.</p>
      </div>

      {/* Cours du jour */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Cours du jour</h2>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{slots.length}</span>
        </div>

        {slots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <Calendar className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">Aucun cours prévu aujourd&apos;hui</p>
            <p className="text-xs text-gray-300 mt-1">Profitez de ce temps pour préparer vos prochaines sessions</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {slots.map((s, i) => {
              const name = s.label || s.group?.name || "Cours"
              const studentCount = s.group?.students.length ?? 0
              const color = SLOT_COLORS[i % SLOT_COLORS.length]
              return (
                <Link
                  key={s.id}
                  href={`/dashboard/cahier?q=${encodeURIComponent(name)}`}
            className="group relative overflow-hidden rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow sm:rounded-2xl"
                >
                  {/* Color accent bar */}
                  <div className={`h-1.5 bg-gradient-to-r ${color}`} />
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">{name}</p>
                        {studentCount > 0 && (
                          <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <Users className="h-3 w-3" />
                            {studentCount} élève{studentCount > 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 transition-colors mt-1" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1.5 rounded-full bg-gradient-to-r ${color} px-3 py-1`}>
                        <Clock className="h-3.5 w-3.5 text-white" />
                        <span className="text-xs font-semibold text-white">{s.startTime} – {s.endTime}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
