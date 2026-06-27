import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { RecapPaiementsClient } from "./recap-paiements-client"

export default async function RecapPaiementsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (user.role === "TEACHER") redirect("/dashboard")

  const [salaries, teachers] = await Promise.all([
    prisma.teacherSalary.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { teacher: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: { in: ["TEACHER", "SECRETARY"] }, isActive: true },
      select: { id: true, name: true, role: true, paymentInfo: true },
      orderBy: { name: "asc" },
    }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = salaries.map((s: any) => ({
    id: s.id,
    teacherId: s.teacherId,
    teacherName: s.teacher.name || "—",
    month: s.month,
    year: s.year,
    hoursWorked: s.hoursWorked,
    lessonsCount: s.lessonsCount,
    hourlyRate: s.hourlyRate,
    fixedSalary: s.fixedSalary,
    totalAmount: Number(s.totalAmount),
    status: s.status,
    paidDate: s.paidDate ? new Date(s.paidDate).toISOString() : null,
    notes: s.notes,
  }))

  return <RecapPaiementsClient salaries={data} teachers={teachers} isDirector={user.role === "DIRECTOR"} />
}
