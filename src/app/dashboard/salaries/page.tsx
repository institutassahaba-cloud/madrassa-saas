import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { SalariesClient } from "./salaries-client"

export default async function SalariesPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user
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
