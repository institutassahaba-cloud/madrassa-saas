import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { AttendanceClient } from "./attendance-client"

export default async function AttendancePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user as any

  const groups = await prisma.group.findMany({
    where: {
      tenantId: user.tenantId,
      isActive: true,
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    include: {
      students: {
        where: { status: "ACTIVE" },
        orderBy: { lastName: "asc" },
      },
      teacher: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  })

  return <AttendanceClient groups={groups as any} userId={user.id} />
}
