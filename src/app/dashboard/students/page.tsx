import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { StudentsClient } from "./students-client"

export default async function StudentsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user as any
  if (user.role === "TEACHER") redirect("/dashboard")

  const [students, groups] = await Promise.all([
    prisma.student.findMany({
      where: { tenantId: user.tenantId },
      include: {
        group: { select: { id: true, name: true } },
      },
      orderBy: { lastName: "asc" },
    }),
    prisma.group.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, name: true, level: true },
      orderBy: { name: "asc" },
    }),
  ])

  return <StudentsClient students={students as any} groups={groups} role={user.role} />
}
