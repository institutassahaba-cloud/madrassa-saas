import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { StudentsClient } from "./students-client"

export default async function StudentsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user
  if (user.role === "TEACHER") redirect("/dashboard")

  const [students, groups, teachers] = await Promise.all([
    prisma.student.findMany({
      where: { tenantId: user.tenantId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            teacher: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { lastName: "asc" },
    }),
    prisma.group.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      select: { id: true, name: true, level: true, teacherId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  // Type de cours (Individuel/Binôme/Groupe) = nombre d'élèves ACTIFS partageant le groupe.
  const activePerGroup: Record<string, number> = {}
  for (const s of students) {
    if (s.status === "ACTIVE" && s.groupId) {
      activePerGroup[s.groupId] = (activePerGroup[s.groupId] ?? 0) + 1
    }
  }
  const enriched = students.map((s) => ({
    ...s,
    teacherName: s.group?.teacher?.name ?? null,
    groupSize: s.groupId ? (activePerGroup[s.groupId] ?? 0) : 0,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <StudentsClient students={enriched as any} groups={groups as any} teachers={teachers} role={user.role} />
}
