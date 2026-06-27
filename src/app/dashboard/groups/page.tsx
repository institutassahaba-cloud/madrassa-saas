import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { GroupsClient } from "./groups-client"

export default async function GroupsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <GroupsClient groups={groups as any} teachers={teachers} role={user.role} />
}
