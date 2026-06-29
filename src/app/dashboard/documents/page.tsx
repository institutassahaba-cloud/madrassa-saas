import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getEffectiveUser } from "@/lib/view-as"
import { DocumentsClient } from "./documents-client"

export default async function DocumentsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) redirect("/dashboard")

  const [staff, contracts, salaries] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: { in: ["TEACHER", "SECRETARY"] }, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.teacherContract.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        teacherId: true,
        title: true,
        driveUrl: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.teacherSalary.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        teacherId: true,
        month: true,
        year: true,
        totalAmount: true,
        hoursWorked: true,
        lessonsCount: true,
        hourlyRate: true,
        fixedSalary: true,
        status: true,
        paidDate: true,
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ])

  return (
    <DocumentsClient
      staff={staff}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contracts={contracts as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      salaries={salaries as any}
      role={user.role}
    />
  )
}
