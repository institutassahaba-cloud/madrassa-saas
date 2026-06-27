import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { SettingsClient } from "./settings-client"

export default async function SettingsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (user.role !== "DIRECTOR") redirect("/dashboard")

  const [users, tenant] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true, email: true, role: true, isActive: true, phone: true, createdAt: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.findUnique({
      where: { id: user.tenantId },
      include: { settings: true },
    }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <SettingsClient users={users} tenant={tenant as any} currentUserId={user.id} />
}
