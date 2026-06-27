import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { formatCurrency, getMonthName } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users, UserCheck, AlertCircle, TrendingUp,
  Banknote, BookOpen, Calendar, BarChart3,
} from "lucide-react"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { PaymentStatusChart } from "@/components/dashboard/payment-status-chart"
import { RecentPayments } from "@/components/dashboard/recent-payments"
import { TeacherHome } from "./teacher-home"

async function getStats(tenantId: string) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  // Cycle de facturation : du 25 du mois précédent au 25 du mois courant
  const startOfBillingMonth = new Date(year, month - 1, 25, 0, 0, 0)
  if (now < startOfBillingMonth) {
    startOfBillingMonth.setMonth(startOfBillingMonth.getMonth() - 1)
  }

  const [
    totalStudents,
    activeStudents,
    latePayments,
    monthRevenue,
    totalTeachers,
    totalAttendances,
    presentAttendances,
    recentPayments,
    paymentsByStatus,
    activeBySubject,
  ] = await Promise.all([
    prisma.student.count({ where: { tenantId } }),
    prisma.student.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.payment.count({ where: { tenantId, status: "LATE" } }),
    prisma.payment.aggregate({
      where: { tenantId, status: "PAID", paidDate: { gte: startOfBillingMonth } },
      _sum: { amount: true },
    }),
    prisma.user.count({ where: { tenantId, role: "TEACHER", isActive: true } }),
    prisma.attendance.count({ where: { tenantId } }),
    prisma.attendance.count({ where: { tenantId, status: "PRESENT" } }),
    prisma.payment.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { student: { select: { firstName: true, lastName: true } } },
    }),
    prisma.payment.groupBy({
      by: ["status"],
      where: { tenantId, month, year },
      _count: true,
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
    monthRevenue: Number(monthRevenue._sum.amount ?? 0),
    totalTeachers,
    attendanceRate: totalAttendances > 0 ? Math.round((presentAttendances / totalAttendances) * 100) : 0,
    recentPayments,
    paymentsByStatus,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeBySubject: (activeBySubject as any[]).map((g: any) => ({ subject: g.subject, count: g._count })),
    billingStart: startOfBillingMonth,
    month,
    year,
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

  // Élèves en pause avec date de recontact passée ou aujourd'hui
  const recontactStudents = await prisma.student.findMany({
    where: {
      tenantId,
      status: "PAUSED",
      recontactDate: { not: null, lte: new Date() },
    },
    select: { id: true, firstName: true, lastName: true, phone: true, parentPhone: true, recontactDate: true },
    orderBy: { recontactDate: "asc" },
  })

  const billingLabel = `Revenus depuis le 25/${String(stats.billingStart.getMonth() + 1).padStart(2, "0")}`

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
      label: billingLabel,
      value: formatCurrency(stats.monthRevenue),
      sub: "paiements reçus",
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

      {/* Élèves par matière */}
      {stats.activeBySubject.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-medium text-gray-500 mb-3">Élèves actifs par matière</p>
            <div className="flex flex-wrap gap-3">
              {stats.activeBySubject.map((s: { subject: string; count: number }) => (
                <div key={s.subject} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-700">{s.subject}</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart tenantId={tenantId} />
        </div>
        <PaymentStatusChart data={stats.paymentsByStatus} />
      </div>

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
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                  <div>
                    <p className="font-medium text-gray-900">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-amber-600">
                      Recontact prévu le {new Date(s.recontactDate!).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex gap-2">
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
