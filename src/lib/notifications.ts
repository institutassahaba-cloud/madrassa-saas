import { prisma } from "@/lib/prisma"

export const PSEUDO_REQUEST_SEPARATOR = "\n\n---\n"

type NotificationUser = {
  id: string
  role: string
  email?: string | null
  tenantId: string
}

export function notificationVisibilityWhere(user: NotificationUser) {
  const recipients = [user.id, user.role]
  if (user.email) recipients.push(user.email)

  return {
    tenantId: user.tenantId,
    OR: [
      { recipient: { in: recipients } },
      ...(user.role === "DIRECTOR" || user.role === "SECRETARY" ? [{ recipient: null }] : []),
    ],
  }
}

export async function createMonthlyTeacherTableReminder(date = new Date()) {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, timezone: true },
  })

  let created = 0
  let skipped = 0
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const nextMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))

  for (const tenant of tenants) {
    if (dayInTimeZone(date, tenant.timezone || "Europe/Paris") !== 24) {
      skipped++
      continue
    }

    const teachers = await prisma.user.findMany({
      where: { tenantId: tenant.id, role: "TEACHER", isActive: true },
      select: { id: true, name: true },
    })

    for (const teacher of teachers) {
      const existing = await prisma.notification.findFirst({
        where: {
          tenantId: tenant.id,
          type: "TEACHER_MONTHLY_TIMESHEET_REMINDER",
          recipient: teacher.id,
          createdAt: { gte: monthStart, lt: nextMonthStart },
        },
        select: { id: true },
      })
      if (existing) continue

      await prisma.notification.create({
        data: {
          tenantId: tenant.id,
          type: "TEACHER_MONTHLY_TIMESHEET_REMINDER",
          title: "Rappel pour les tableaux",
          body: "Salam alaikoum, pensez à remplir vos tableaux afin qu'on puisse faire les paies demain, inchallah.",
          recipient: teacher.id,
          channel: "APP",
        },
      })
      created++
    }
  }

  return { created, skippedTenants: skipped }
}

export function pseudoRequestBody(currentName: string, requestedName: string, userId: string) {
  return [
    `${currentName} demande à changer de pseudo pour : ${requestedName}.`,
    `${PSEUDO_REQUEST_SEPARATOR}userId=${userId}\nrequestedName=${requestedName}`,
  ].join("")
}

export function visibleNotificationBody(body: string) {
  return body.split(PSEUDO_REQUEST_SEPARATOR)[0]
}

export function parsePseudoRequest(body: string) {
  const [, metadata] = body.split(PSEUDO_REQUEST_SEPARATOR)
  if (!metadata) return null
  const entries = Object.fromEntries(
    metadata.split("\n").map((line) => {
      const [key, ...value] = line.split("=")
      return [key, value.join("=")]
    })
  )
  if (!entries.userId || !entries.requestedName) return null
  return { userId: entries.userId, requestedName: entries.requestedName }
}

function dayInTimeZone(date: Date, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    day: "2-digit",
  }).format(date)
  return Number(day)
}
