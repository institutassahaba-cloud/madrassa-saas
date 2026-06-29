import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getEffectiveUser } from "@/lib/view-as"
import { notificationVisibilityWhere } from "@/lib/notifications"
import { NotificationsClient } from "./notifications-client"

export default async function NotificationsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")

  const notifications = await prisma.notification.findMany({
    where: notificationVisibilityWhere(user),
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      channel: true,
      status: true,
      sentAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <NotificationsClient
      notifications={notifications.map((notification) => ({
        ...notification,
        sentAt: notification.sentAt ? notification.sentAt.toISOString() : null,
        createdAt: notification.createdAt.toISOString(),
      }))}
    />
  )
}
