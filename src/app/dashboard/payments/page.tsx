import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { PaymentsClient } from "./payments-client"

export default async function PaymentsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (user.role === "TEACHER") redirect("/dashboard")

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [payments, students] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId: user.tenantId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, group: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.student.findMany({
      where: { tenantId: user.tenantId, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, monthlyFee: true },
      orderBy: { lastName: "asc" },
    }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <PaymentsClient payments={payments as any} students={students as any} currentMonth={month} currentYear={year} isDirector={user.role === "DIRECTOR"} />
}
