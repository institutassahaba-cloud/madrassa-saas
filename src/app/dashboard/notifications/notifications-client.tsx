"use client"

import { useMemo, useState } from "react"
import { Bell, Check, Clock, Inbox, Loader2, Mail, Send, ShieldAlert, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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

type TeacherRecipient = {
  id: string
  name: string
}

type StudentRecipient = {
  id: string
  firstName: string
  lastName: string
  displayName: string | null
  email: string | null
  parentEmail: string | null
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
  DIRECTOR_MESSAGE: {
    label: "Message",
    icon: Mail,
    badge: "info",
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

export function NotificationsClient({
  notifications: initialNotifications,
  canSend = false,
  teachers = [],
  students = [],
}: {
  notifications: NotificationItem[]
  canSend?: boolean
  teachers?: TeacherRecipient[]
  students?: StudentRecipient[]
}) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [teacherIds, setTeacherIds] = useState<Set<string>>(new Set())
  const [studentIds, setStudentIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

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

  function toggleSelection(setter: (value: Set<string>) => void, current: Set<string>, id: string, checked: boolean) {
    const next = new Set(current)
    if (checked) next.add(id)
    else next.delete(id)
    setter(next)
  }

  async function sendMessage() {
    setSending(true)
    setSendResult(null)
    setSendError(null)
    try {
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          message,
          teacherIds: Array.from(teacherIds),
          studentIds: Array.from(studentIds),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Envoi impossible.")
      setTitle("")
      setMessage("")
      setTeacherIds(new Set())
      setStudentIds(new Set())
      setSendResult(`${data.appNotifications ?? 0} notification(s) professeur · ${data.studentEmailsSent ?? 0} email(s) élève envoyé(s)${data.studentEmailsSkipped ? ` · ${data.studentEmailsSkipped} sans email` : ""}.`)
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Envoi impossible.")
    } finally {
      setSending(false)
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

      {canSend && (
        <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold text-gray-900">Envoyer un message</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Titre</label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Objet du message" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Message</label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-h-36 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Écrivez le message à envoyer..."
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-gray-100">
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-800">Professeurs</p>
                  <button
                    type="button"
                    className="text-xs font-medium text-emerald-700"
                    onClick={() => setTeacherIds(teacherIds.size === teachers.length ? new Set() : new Set(teachers.map((teacher) => teacher.id)))}
                  >
                    {teacherIds.size === teachers.length ? "Tout retirer" : "Tout sélectionner"}
                  </button>
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto p-2">
                  {teachers.map((teacher) => (
                    <label key={teacher.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={teacherIds.has(teacher.id)}
                        onChange={(event) => toggleSelection(setTeacherIds, teacherIds, teacher.id, event.target.checked)}
                      />
                      {teacher.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100">
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-800">Élèves</p>
                  <button
                    type="button"
                    className="text-xs font-medium text-emerald-700"
                    onClick={() => {
                      const emailableStudents = students.filter((student) => student.email || student.parentEmail)
                      setStudentIds(studentIds.size === emailableStudents.length ? new Set() : new Set(emailableStudents.map((student) => student.id)))
                    }}
                  >
                    {studentIds.size === students.filter((student) => student.email || student.parentEmail).length ? "Tout retirer" : "Tout sélectionner"}
                  </button>
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto p-2">
                  {students.map((student) => {
                    const hasEmail = Boolean(student.email || student.parentEmail)
                    const name = student.displayName || `${student.firstName} ${student.lastName}`
                    return (
                      <label key={student.id} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${hasEmail ? "text-gray-700 hover:bg-gray-50" : "text-gray-300"}`}>
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-gray-300"
                          checked={studentIds.has(student.id)}
                          disabled={!hasEmail}
                          onChange={(event) => toggleSelection(setStudentIds, studentIds, student.id, event.target.checked)}
                        />
                        <span>
                          <span className="block">{name}</span>
                          {!hasEmail && <span className="text-xs">Sans email</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-500">
              <Users className="mr-1 inline h-4 w-4" />
              {teacherIds.size + studentIds.size} destinataire(s) sélectionné(s)
            </div>
            <Button
              type="button"
              onClick={sendMessage}
              disabled={sending || title.trim().length < 2 || message.trim().length < 2 || teacherIds.size + studentIds.size === 0}
              className="w-full sm:w-auto"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </Button>
          </div>
          {sendResult && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{sendResult}</p>}
          {sendError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{sendError}</p>}
        </section>
      )}

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
