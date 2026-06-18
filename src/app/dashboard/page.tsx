import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { formatCurrency, getMonthName } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users, UserCheck, AlertCircle, TrendingUp,
  Banknote, BookOpen, Calendar, BarChart3,
} from "lucide-react"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { PaymentStatusChart } from "@/components/dashboard/payment-status-chart"
import { RecentPayments } from "@/components/dashboard/recent-payments"

async function getStats(tenantId: string) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [
    totalStudents,
    activeStudents,
    latePayments,
    monthRevenue,
    pendingSalaries,
    totalTeachers,
    totalAttendances,
    presentAttendances,
    recentPayments,
    paymentsByStatus,
  ] = await Promise.all([
    prisma.student.count({ where: { tenantId } }),
    prisma.student.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.payment.count({ where: { tenantId, status: "LATE" } }),
    prisma.payment.aggregate({
      where: { tenantId, status: "PAID", month, year },
      _sum: { amount: true },
    }),
    prisma.teacherSalary.aggregate({
      where: { tenantId, status: "PENDING", month, year },
      _sum: { totalAmount: true },
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
  ])

  return {
    totalStudents,
    activeStudents,
    latePayments,
    monthRevenue: Number(monthRevenue._sum.amount ?? 0),
    pendingSalaries: Number(pendingSalaries._sum.totalAmount ?? 0),
    totalTeachers,
    attendanceRate: totalAttendances > 0 ? Math.round((presentAttendances / totalAttendances) * 100) : 0,
    recentPayments,
    paymentsByStatus,
    month,
    year,
  }
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const tenantId = (session.user as any).tenantId
  const role = (session.user as any).role

  const stats = await getStats(tenantId)

  const kpis = [
    {
      label: "Total élèves",
      value: stats.totalStudents,
      sub: `${stats.activeStudents} actifs`,
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
      label: `Revenus ${getMonthName(stats.month)}`,
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
        label: "Salaires à payer",
        value: formatCurrency(stats.pendingSalaries),
        sub: `${getMonthName(stats.month)} ${stats.year}`,
        icon: Banknote,
        color: "text-amber-600",
        bg: "bg-amber-50",
      },
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

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart tenantId={tenantId} />
        </div>
        <PaymentStatusChart data={stats.paymentsByStatus} />
      </div>

      {/* Recent Payments */}
      <RecentPayments payments={stats.recentPayments as any} />
    </div>
  )
}
