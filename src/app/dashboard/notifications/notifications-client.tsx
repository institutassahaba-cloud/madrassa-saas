"use client"

import { useMemo, useState } from "react"
import { Bell, Check, Clock, Inbox, Mail, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const PSEUDO_REQUEST_SEPARATOR = "\n\n---\n"

function visibleNotificationBody(body: string) {
  return body.split(PSEUDO_REQUEST_SEPARATOR)[0]
}

type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  channel: string
  status: string
  sentAt: string | null
  createdAt: string
}

const typeStyles: Record<string, { label: string; icon: typeof Bell; badge: "default" | "warning" | "info" | "secondary" }> = {
  TEACHER_MONTHLY_TIMESHEET_REMINDER: {
    label: "Rappel paie",
    icon: Clock,
    badge: "warning",
  },
  TEACHER_INACTIVE: {
    label: "Activité",
    icon: ShieldAlert,
    badge: "info",
  },
  PSEUDO_CHANGE_REQUEST: {
    label: "Pseudo",
    icon: ShieldAlert,
    badge: "warning",
  },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function NotificationsClient({ notifications: initialNotifications }: { notifications: NotificationItem[] }) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.status !== "READ").length,
    [notifications]
  )

  async function markAsRead(id: string) {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" })
      if (!res.ok) return
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, status: "READ" } : item))
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Notifications</h1>
          <p className="mt-0.5 text-sm text-gray-500">Les messages qui concernent votre compte</p>
        </div>
        <Badge variant={unreadCount > 0 ? "warning" : "secondary"} className="w-fit">
          {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est lu"}
        </Badge>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-700">Aucune notification</p>
          <p className="mt-1 text-sm text-gray-400">Les rappels et alertes apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const style = typeStyles[notification.type] ?? { label: notification.type, icon: Bell, badge: "secondary" as const }
            const Icon = style.icon
            const unread = notification.status !== "READ"

            return (
              <article
                key={notification.id}
                className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${unread ? "border-emerald-200" : "border-gray-100"}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${unread ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-gray-900">{notification.title}</h2>
                        <Badge variant={style.badge}>{style.label}</Badge>
                        {unread && <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="Non lue" />}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-gray-600">{visibleNotificationBody(notification.body)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(notification.createdAt)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {notification.channel === "APP" ? "Application" : notification.channel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {unread && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={loadingId === notification.id}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Marquer comme lu
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
