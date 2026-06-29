import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { parsePseudoRequest } from "@/lib/notifications"
import { SettingsClient } from "./settings-client"

export default async function SettingsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")

  const [users, currentUser, pseudoNotifications] = await Promise.all([
    user.role === "DIRECTOR" ? prisma.user.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true, email: true, contactEmail: true, role: true, isActive: true, phone: true, createdAt: true },
      orderBy: { name: "asc" },
    }) : Promise.resolve([]),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, contactEmail: true, role: true, isActive: true, phone: true, createdAt: true, mustChangePassword: true },
    }),
    user.role === "DIRECTOR" ? prisma.notification.findMany({
      where: { tenantId: user.tenantId, type: "PSEUDO_CHANGE_REQUEST", status: "PENDING" },
      select: { id: true, body: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve([]),
  ])

  if (!currentUser) redirect("/login")

  const pseudoRequests = pseudoNotifications.flatMap((notification) => {
    const request = parsePseudoRequest(notification.body)
    if (!request) return []
    const target = users.find((u) => u.id === request.userId)
    return [{
      id: notification.id,
      currentName: target?.name ?? "Professeur",
      requestedName: request.requestedName,
      createdAt: notification.createdAt.toISOString(),
    }]
  })

  return (
    <SettingsClient
      users={users}
      currentUser={currentUser}
      currentUserId={user.id}
      pseudoRequests={pseudoRequests}
    />
  )
}
