import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { SettingsClient } from "./settings-client"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user
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
