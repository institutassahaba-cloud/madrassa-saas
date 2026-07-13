import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { formatCurrency } from "@/lib/utils"
import { PAYMENT_PAID_STATUSES, PAYMENT_AWAITING_STATUSES } from "@/lib/payment-status"
import { getValidatedPaymentPeriodStart } from "@/lib/payment-period"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCheck, AlertCircle, TrendingUp, BookOpen, UserX } from "lucide-react"
import { RecentPayments } from "@/components/dashboard/recent-payments"
import { SubjectDistributionChart } from "@/components/dashboard/subject-distribution-chart"
import { TeacherHome } from "./teacher-home"
import { studentLabelWithTeacherEmoji } from "@/lib/student-display"

function validatedMatchAmount(match: { receivedAmount: number; allocations: { amount: number }[] }) {
  const allocated = match.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
  return allocated > 0 && match.receivedAmount - allocated > 0.01 ? allocated : Number(match.receivedAmount)
}

async function getStats(tenantId: string) {
  const now = new Date()
  const revenueStart = await getValidatedPaymentPeriodStart(tenantId, now)

  const [
    totalStudents,
    activeStudents,
    latePayments,
    recentValidatedPaymentMatches,
    totalTeachers,
    totalAttendances,
    presentAttendances,
    recentPayments,
    activeBySubject,
  ] = await Promise.all([
    prisma.student.count({ where: { tenantId } }),
    prisma.student.count({ where: { tenantId, status: "ACTIVE" } }),
    // Un retard = paiement encore attendu dont l'échéance est passée
    // (il n'existe pas de statut "LATE" en base).
    prisma.payment.count({
      where: { tenantId, status: { in: [...PAYMENT_AWAITING_STATUSES] }, dueDate: { lt: now } },
    }),
    prisma.paymentMatch.findMany({
      where: {
        tenantId,
        status: "CONFIRMED",
        OR: [
          { confirmedAt: { gt: revenueStart, lte: now } },
          { confirmedAt: null, paymentDate: { gt: revenueStart, lte: now } },
        ],
      },
      select: {
        receivedAmount: true,
        allocations: { select: { amount: true } },
      },
      orderBy: { confirmedAt: "desc" },
      take: 200,
    }),
    prisma.user.count({ where: { tenantId, role: "TEACHER", isActive: true } }),
    prisma.attendance.count({ where: { tenantId } }),
    prisma.attendance.count({ where: { tenantId, status: "PRESENT" } }),
    prisma.payment.findMany({
      where: { tenantId, status: { in: [...PAYMENT_PAID_STATUSES] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { student: { select: { firstName: true, lastName: true, group: { select: { teacher: { select: { name: true } } } } } } },
    }),
    prisma.student.groupBy({
      by: ["subject"],
      where: { tenantId, status: "ACTIVE", subject: { not: null } },
      _count: true,
    }),
  ])

  return {
    totalStudents,
    activeStudents,
    latePayments,
    monthRevenue: recentValidatedPaymentMatches.reduce((sum, match) => sum + validatedMatchAmount(match), 0),
    validatedPaymentCount: recentValidatedPaymentMatches.length,
    totalTeachers,
    attendanceRate: totalAttendances > 0 ? Math.round((presentAttendances / totalAttendances) * 100) : 0,
    recentPayments,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeBySubject: (activeBySubject as any[]).map((g: any) => ({ subject: g.subject, count: g._count })),
  }
}

export default async function DashboardPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  const tenantId = user.tenantId
  const role = user.role

  // Un professeur n'a jamais accès aux chiffres (revenus, paiements…) :
  // il voit son propre accueil (cours du jour, raccourcis).
  if (role === "TEACHER") {
    return (
      <TeacherHome
        tenantId={tenantId}
        teacherId={user.id}
        teacherName={user.name ?? "Professeur"}
      />
    )
  }

  const stats = await getStats(tenantId)
  const dashboardNow = new Date()
  const inactiveThreshold = new Date(dashboardNow.getTime() - 4 * 24 * 60 * 60 * 1000)

  const [recontactStudents, inactiveTeachers] = await Promise.all([
    // Élèves en pause avec date de recontact passée ou aujourd'hui
    prisma.student.findMany({
      where: {
        tenantId,
        status: "PAUSED",
        recontactDate: { not: null, lte: new Date() },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        parentPhone: true,
        recontactDate: true,
        group: { select: { teacher: { select: { name: true } } } },
      },
      orderBy: { recontactDate: "asc" },
    }),
    prisma.user.findMany({
      where: {
        tenantId,
        role: "TEACHER",
        isActive: true,
        OR: [
          { lastLoginAt: null },
          { lastLoginAt: { lt: inactiveThreshold } },
        ],
      },
      select: { id: true, name: true, lastLoginAt: true },
      orderBy: [{ lastLoginAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
      take: 8,
    }),
  ])

  const kpis = [
    {
      label: "Élèves actifs",
      value: stats.activeStudents,
      sub: `${stats.totalStudents} inscrits au total`,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Retards de paiement",
      value: stats.latePayments,
      sub: "à régulariser",
      icon: AlertCircle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Paiements validés",
      value: formatCurrency(stats.monthRevenue),
      sub: `${stats.validatedPaymentCount} validé${stats.validatedPaymentCount > 1 ? "s" : ""} · période en cours`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Taux de présence",
      value: `${stats.attendanceRate}%`,
      sub: "toutes classes",
      icon: UserCheck,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
  ]

  if (role === "DIRECTOR") {
    kpis.push(
      {
        label: "Professeurs actifs",
        value: stats.totalTeachers,
        sub: "dans l'équipe",
        icon: BookOpen,
        color: "text-pink-600",
        bg: "bg-pink-50",
      }
    )
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">{kpi.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{kpi.value}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{kpi.sub}</p>
                </div>
                <div className={`rounded-lg p-2 ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <SubjectDistributionChart data={stats.activeBySubject} />

      {inactiveTeachers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <UserX className="h-5 w-5" />
              Professeurs à relancer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {inactiveTeachers.map((teacher) => {
                const days = teacher.lastLoginAt
                  ? Math.floor((dashboardNow.getTime() - teacher.lastLoginAt.getTime()) / 86400000)
                  : null
                return (
                  <div key={teacher.id} className="rounded-lg border border-amber-100 bg-white px-3 py-2">
                    <p className="font-medium text-gray-900">{teacher.name}</p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      {days == null ? "Jamais connecté(e)" : `Dernière connexion il y a ${days} jour${days > 1 ? "s" : ""}`}
                    </p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Payments */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RecentPayments payments={stats.recentPayments as any} />

      {/* Recontact reminders */}
      {recontactStudents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-5 w-5" />
              Élèves à recontacter ({recontactStudents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recontactStudents.map((s) => (
                <div key={s.id} className="flex flex-col gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {studentLabelWithTeacherEmoji(`${s.firstName} ${s.lastName}`, s.group?.teacher?.name)}
                    </p>
                    <p className="text-xs text-amber-600">
                      Recontact prévu le {new Date(s.recontactDate!).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    {(s.phone || s.parentPhone) && (
                      <a
                        href={`https://wa.me/${(s.phone || s.parentPhone)?.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                      >
                        WhatsApp
                      </a>
                    )}
                    <a
                      href={`/dashboard/students`}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Voir fiche
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
