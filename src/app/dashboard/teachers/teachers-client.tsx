"use client"

import { useState } from "react"
import { Users, BookOpen, UserCheck, ChevronDown, ChevronUp, Mail, Phone, Calendar } from "lucide-react"

interface AttendanceRecord {
  id: string
  date: string
  status: string
  studentId: string
  student: { firstName: string; lastName: string }
}

interface Student {
  id: string
  firstName: string
  lastName: string
  status: string
}

interface Group {
  id: string
  name: string
  level: string | null
  schedule: string | null
  maxStudents: number
  students: Student[]
  attendances: AttendanceRecord[]
}

interface Teacher {
  id: string
  name: string
  email: string
  phone: string | null
  createdAt: string
  teacherGroups: Group[]
}

function AttendanceTable({ attendances, students }: { attendances: AttendanceRecord[]; students: Student[] }) {
  // Group by date
  const byDate = attendances.reduce((acc, a) => {
    const d = a.date.slice(0, 10)
    if (!acc[d]) acc[d] = {}
    acc[d][a.studentId] = a.status
    return acc
  }, {} as Record<string, Record<string, string>>)

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a)).slice(0, 10)

  if (dates.length === 0) return <p className="text-sm text-gray-400 italic">Aucune présence enregistrée</p>

  const statusColor = (s: string) => {
    if (s === "PRESENT") return "bg-emerald-100 text-emerald-700"
    if (s === "ABSENT") return "bg-red-100 text-red-600"
    if (s === "LATE") return "bg-amber-100 text-amber-700"
    return "bg-gray-100 text-gray-500"
  }

  const statusLabel = (s: string) => {
    if (s === "PRESENT") return "P"
    if (s === "ABSENT") return "A"
    if (s === "LATE") return "R"
    return "-"
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="py-2 pr-3 text-left font-medium text-gray-500 whitespace-nowrap">Élève</th>
            {dates.map((d) => (
              <th key={d} className="px-1 py-2 text-center font-medium text-gray-500 whitespace-nowrap">
                {new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.filter(s => s.status === "ACTIVE").map((student) => (
            <tr key={student.id} className="border-b border-gray-50">
              <td className="py-1.5 pr-3 font-medium text-gray-700 whitespace-nowrap">
                {student.firstName} {student.lastName}
              </td>
              {dates.map((d) => {
                const status = byDate[d]?.[student.id]
                return (
                  <td key={d} className="px-1 py-1.5 text-center">
                    {status ? (
                      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${statusColor(status)}`}>
                        {statusLabel(status)}
                      </span>
                    ) : (
                      <span className="text-gray-200">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-gray-400">P = Présent · A = Absent · R = Retard</p>
    </div>
  )
}

function GroupCard({ group }: { group: Group }) {
  const [showAttendance, setShowAttendance] = useState(false)
  const activeStudents = group.students.filter((s) => s.status === "ACTIVE")

  const presentCount = group.attendances.filter((a) => a.status === "PRESENT").length
  const totalCount = group.attendances.length
  const rate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : null

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-gray-900">{group.name}</h4>
          {group.level && <p className="text-xs text-gray-500">{group.level}</p>}
        </div>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {activeStudents.length} / {group.maxStudents}
          </span>
          {rate !== null && (
            <span className={`flex items-center gap-1 font-medium ${rate >= 75 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-600"}`}>
              <UserCheck className="h-3.5 w-3.5" />
              {rate}% présence
            </span>
          )}
        </div>
      </div>

      {group.schedule && (
        <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <Calendar className="h-3 w-3" />
          {group.schedule}
        </p>
      )}

      {/* Students list */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-gray-500">Élèves inscrits</p>
        <div className="flex flex-wrap gap-1">
          {activeStudents.length === 0 ? (
            <span className="text-xs text-gray-400 italic">Aucun élève</span>
          ) : (
            activeStudents.map((s) => (
              <span key={s.id} className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
                {s.firstName} {s.lastName}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Attendance toggle */}
      {group.attendances.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowAttendance(!showAttendance)}
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Tableau de présence
            {showAttendance ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showAttendance && (
            <div className="mt-3">
              <AttendanceTable attendances={group.attendances} students={group.students} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TeacherCard({ teacher }: { teacher: Teacher }) {
  const [expanded, setExpanded] = useState(false)
  const totalStudents = teacher.teacherGroups.reduce((sum, g) => sum + g.students.filter(s => s.status === "ACTIVE").length, 0)
  const totalGroups = teacher.teacherGroups.length

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-4 p-5 text-left"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700">
          {teacher.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">{teacher.name}</p>
          <div className="flex flex-wrap gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Mail className="h-3 w-3" /> {teacher.email}
            </span>
            {teacher.phone && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Phone className="h-3 w-3" /> {teacher.phone}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-emerald-600">{totalGroups}</p>
            <p className="text-xs text-gray-400">{totalGroups > 1 ? "groupes" : "groupe"}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-blue-600">{totalStudents}</p>
            <p className="text-xs text-gray-400">élèves</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5">
          {teacher.teacherGroups.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Aucun groupe assigné</p>
          ) : (
            <div className="space-y-3">
              {teacher.teacherGroups.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TeachersClient({ teachers }: { teachers: Teacher[] }) {
  const totalStudents = teachers.reduce(
    (sum, t) => sum + t.teacherGroups.reduce((s, g) => s + g.students.filter(st => st.isActive).length, 0),
    0
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Professeurs</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {teachers.length} professeur{teachers.length > 1 ? "s" : ""} · {totalStudents} élèves au total
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-gray-500">Professeurs</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{teachers.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-500">Groupes actifs</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {teachers.reduce((sum, t) => sum + t.teacherGroups.length, 0)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-medium text-gray-500">Élèves encadrés</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
        </div>
      </div>

      {/* Teacher list */}
      {teachers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-500">Aucun professeur enregistré</p>
        </div>
      ) : (
        <div className="space-y-3">
          {teachers.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} />
          ))}
        </div>
      )}
    </div>
  )
}
