import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { ensureTeacherPayrollSchema } from "@/lib/teacher-payroll-schema"
import { RecapPaiementsClient } from "./recap-paiements-client"
import { readSecretaryPaymentDetails } from "@/lib/secretary-salary-details"

export default async function RecapPaiementsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (user.role === "TEACHER") redirect("/dashboard")
  await ensureTeacherPayrollSchema()

  const [salaries, teachers] = await Promise.all([
    prisma.teacherSalary.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: {
        teacher: { select: { name: true } },
        lines: { orderBy: { label: "asc" } },
      },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: { in: ["TEACHER", "SECRETARY"] }, isActive: true },
      select: { id: true, name: true, role: true, paymentInfo: true },
      orderBy: { name: "asc" },
    }),
  ])

  const data = salaries.map((s) => {
    const secretaryDetails = readSecretaryPaymentDetails(s.notes)
    return ({
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
    periodStart: s.periodStart ? new Date(s.periodStart).toISOString() : null,
    periodEnd: s.periodEnd ? new Date(s.periodEnd).toISOString() : null,
    notes: secretaryDetails.displayNotes,
    secretaryPayments: secretaryDetails.payments,
    lines: s.lines.map((line) => ({
      id: line.id,
      label: line.label,
      lessonsCount: line.lessonsCount,
      hoursWorked: Number(line.hoursWorked),
      hourlyRate: Number(line.hourlyRate),
      totalAmount: Number(line.totalAmount),
    })),
    })
  })

  return <RecapPaiementsClient salaries={data} teachers={teachers} isDirector={user.role === "DIRECTOR"} />
}
