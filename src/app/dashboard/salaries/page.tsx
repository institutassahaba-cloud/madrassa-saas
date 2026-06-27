import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { SalariesClient } from "./salaries-client"

export default async function SalariesPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) redirect("/dashboard")

  const now = new Date()
  const [teachers, salaries] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.teacherSalary.findMany({
      where: { tenantId: user.tenantId },
      include: { teacher: { select: { id: true, name: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 100,
    }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <SalariesClient teachers={teachers} salaries={salaries as any} currentMonth={now.getMonth() + 1} currentYear={now.getFullYear()} />
}
