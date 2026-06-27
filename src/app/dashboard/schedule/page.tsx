import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getEffectiveUser } from "@/lib/view-as"
import { ScheduleClient } from "./schedule-client"

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams
  const user = await getEffectiveUser()
  if (!user) redirect("/login")

  const [slots, groups, teachers, currentUser] = await Promise.all([
    prisma.timeSlot.findMany({
      where: {
        tenantId: user.tenantId,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      include: {
        teacher: { select: { id: true, name: true, timezone: true } },
        group:   { select: { id: true, name: true } },
        exceptions: { select: { id: true, date: true, reason: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    prisma.group.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
      },
      select: { id: true, name: true, teacherId: true },
      orderBy: { name: "asc" },
    }),
    user.role !== "TEACHER"
      ? prisma.user.findMany({
          where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
          select: { id: true, name: true, timezone: true },
          orderBy: { name: "asc" },
        })
      : [],
    prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, timezone: true },
    }),
  ])

  return (
    <ScheduleClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slots={slots as any}
      groups={groups}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      teachers={teachers as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currentUser={currentUser as any}
      role={user.role}
      initialWeek={week ?? ""}
    />
  )
}
