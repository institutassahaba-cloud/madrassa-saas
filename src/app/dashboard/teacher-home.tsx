import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Calendar, Clock, ChevronDown, ChevronRight, MessageCircle, Users } from "lucide-react"
import { parseScheduleLabel, scheduleSlotOccursOn } from "@/lib/schedule-meta"
import { studentLabelWithTeacherEmoji } from "@/lib/student-display"

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]

const SLOT_COLORS = [
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-violet-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
]

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null
  const trimmed = phone.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/[^\d+]/g, "")
  if (!digits) return null
  if (digits.startsWith("+")) return digits.slice(1)
  if (digits.startsWith("00")) return digits.slice(2)
  if (digits.startsWith("0")) return `33${digits.slice(1)}`
  return digits
}

function whatsappHref(phone: string | null | undefined, studentName: string, courseName: string, startTime: string) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const message = `Assalâmu ʿalaykum, petit rappel pour le cours de ${studentName} (${courseName}) prévu aujourd'hui à ${startTime}.`
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

interface TeacherSlot {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  label: string | null
  group: {
    name: string
    teacher: { name: string } | null
    students: {
      id: string
      firstName: string
      lastName: string
      phone: string | null
      parentPhone: string | null
    }[]
  } | null
  exceptions: { date: Date }[]
}

function CourseCard({ slot, index, compact = false }: { slot: TeacherSlot; index: number; compact?: boolean }) {
  const name = parseScheduleLabel(slot.label).label || slot.group?.name || "Cours"
  const students = slot.group?.students ?? []
  const color = SLOT_COLORS[index % SLOT_COLORS.length]

  return (
    <article className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md sm:rounded-2xl">
      <div className={`h-1.5 bg-gradient-to-r ${color}`} />
      <div className={compact ? "space-y-3 p-3" : "space-y-4 p-4"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/dashboard/cahier?q=${encodeURIComponent(name)}`}
              className="group/link inline-flex max-w-full items-center gap-1"
            >
              <span className="truncate font-semibold text-gray-900 transition-colors group-hover/link:text-emerald-700">{name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover/link:text-emerald-500" />
            </Link>
            {students.length > 0 && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                <Users className="h-3 w-3" />
                {students.length} élève{students.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
          <div className={`flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r ${color} px-3 py-1`}>
            <Clock className="h-3.5 w-3.5 text-white" />
            <span className="text-xs font-semibold text-white">{slot.startTime} – {slot.endTime}</span>
          </div>
        </div>

        {students.length > 0 && (
          <div className="space-y-2">
            {students.map((student) => {
              const studentName = studentLabelWithTeacherEmoji(`${student.firstName} ${student.lastName}`.trim(), slot.group?.teacher?.name)
              const href = whatsappHref(student.parentPhone ?? student.phone, studentName, name, slot.startTime)
              return (
                <div key={student.id} className="flex flex-col gap-2 rounded-lg bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-gray-700">{studentName}</span>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  ) : (
                    <span className="inline-flex h-8 items-center rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-400">
                      Pas de WhatsApp
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}

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
    where: { tenantId, teacherId },
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      label: true,
      group: {
        select: {
          name: true,
          teacher: { select: { name: true } },
          students: {
            where: { status: "ACTIVE" },
            select: { id: true, firstName: true, lastName: true, phone: true, parentPhone: true },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          },
        },
      },
      exceptions: { select: { date: true } },
    },
    orderBy: { startTime: "asc" },
  })
  const todayDate = new Date()
  const todaySlots = slots.filter((slot) => scheduleSlotOccursOn(slot, todayDate)) as TeacherSlot[]
  const nowMinutes = todayDate.getHours() * 60 + todayDate.getMinutes()
  const pastSlots = todaySlots.filter((slot) => timeToMinutes(slot.endTime) <= nowMinutes)
  const upcomingSlots = todaySlots.filter((slot) => timeToMinutes(slot.endTime) > nowMinutes)

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
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{todaySlots.length}</span>
        </div>

        {todaySlots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <Calendar className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">Aucun cours prévu aujourd&apos;hui</p>
            <p className="text-xs text-gray-300 mt-1">Profitez de ce temps pour préparer vos prochaines sessions</p>
          </div>
        ) : (
          <div className="space-y-4">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Cours à venir</h3>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {upcomingSlots.length}
                </span>
              </div>
              {upcomingSlots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
                  Tous les cours prévus aujourd&apos;hui sont déjà passés.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcomingSlots.map((slot, index) => (
                    <CourseCard key={slot.id} slot={slot} index={index} />
                  ))}
                </div>
              )}
            </section>

            {pastSlots.length > 0 && (
              <details className="group rounded-2xl border border-gray-100 bg-gray-50/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm font-semibold text-gray-700">Cours déjà passés</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600">{pastSlots.length}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-gray-100 p-3 sm:grid-cols-2">
                  {pastSlots.map((slot, index) => (
                    <CourseCard key={slot.id} slot={slot} index={index + upcomingSlots.length} compact />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
