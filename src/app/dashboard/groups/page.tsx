import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { GroupsClient } from "./groups-client"

export default async function GroupsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user as any

  const [groups, teachers] = await Promise.all([
    prisma.group.findMany({
      where: {
        tenantId: user.tenantId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { students: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  return <GroupsClient groups={groups as any} teachers={teachers} role={user.role} />
}
