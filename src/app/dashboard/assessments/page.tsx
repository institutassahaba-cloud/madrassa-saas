import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { AssessmentsClient } from "./assessments-client"

export default async function AssessmentsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user as any

  const [assessments, groups] = await Promise.all([
    prisma.assessment.findMany({
      where: {
        tenantId: user.tenantId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: {
        group: { select: { id: true, name: true } },
        teacher: { select: { name: true } },
        grades: { include: { student: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.group.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: {
        students: { where: { status: "ACTIVE" }, orderBy: { lastName: "asc" } },
      },
    }),
  ])

  return <AssessmentsClient assessments={assessments as any} groups={groups as any} role={user.role} userId={user.id} />
}
