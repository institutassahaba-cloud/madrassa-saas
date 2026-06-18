import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { TeachersClient } from "./teachers-client"

export default async function TeachersPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = session.user as any
  if (user.role !== "DIRECTOR") redirect("/dashboard")

  const teachers = await prisma.user.findMany({
    where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      teacherGroups: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          level: true,
          schedule: true,
          maxStudents: true,
          students: {
            select: { id: true, firstName: true, lastName: true, status: true },
          },
          attendances: {
            orderBy: { date: "desc" },
            take: 60,
            select: {
              id: true,
              date: true,
              status: true,
              studentId: true,
              student: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  return <TeachersClient teachers={teachers as any} />
}
