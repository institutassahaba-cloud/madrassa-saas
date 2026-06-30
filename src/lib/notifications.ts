import { prisma } from "@/lib/prisma"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"

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

export async function createDailyPendingPaymentReminders(date = new Date()) {
  await ensureStudentPaymentColumns()
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  let created = 0
  let skipped = 0
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const nextDayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1))

  for (const tenant of tenants) {
    const pending = await prisma.payment.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["EXPECTED", "EMAIL_SENT", "REMINDED", "PENDING"] },
      },
      include: {
        student: { select: { firstName: true, lastName: true, paymentGraceAllowed: true, group: { select: { teacherId: true } } } },
        lessonSession: { select: { teacherId: true, number: true, subject: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    const byTeacher = new Map<string, typeof pending>()
    for (const payment of pending) {
      const teacherId = payment.lessonSession?.teacherId || payment.student.group?.teacherId
      if (!teacherId) continue
      const list = byTeacher.get(teacherId) || []
      list.push(payment)
      byTeacher.set(teacherId, list)
    }

    for (const [teacherId, payments] of byTeacher) {
      const existing = await prisma.notification.findFirst({
        where: {
          tenantId: tenant.id,
          type: "DAILY_PENDING_PAYMENT_REMINDER",
          recipient: teacherId,
          createdAt: { gte: dayStart, lt: nextDayStart },
        },
        select: { id: true },
      })
      if (existing) {
        skipped++
        continue
      }

      const lines = payments.slice(0, 12).map((payment) => {
        const days = Math.max(1, Math.floor((date.getTime() - payment.createdAt.getTime()) / 86400000) + 1)
        const grace = payment.student.paymentGraceAllowed ? " (cours autorisé par le directeur)" : ""
        return `- ${payment.student.firstName} ${payment.student.lastName} : session ${payment.sessionNumber ?? payment.lessonSession?.number ?? "?"}, ${payment.amount} €, en attente depuis ${days} jour(s)${grace}.`
      })
      const more = payments.length > 12 ? `\n+ ${payments.length - 12} autre(s) paiement(s) en attente.` : ""

      await prisma.notification.create({
        data: {
          tenantId: tenant.id,
          type: "DAILY_PENDING_PAYMENT_REMINDER",
          title: "Paiements en attente",
          body: `Salam alaikoum, voici les paiements encore en attente :\n${lines.join("\n")}${more}`,
          recipient: teacherId,
          channel: "APP",
        },
      })
      created++
    }
  }

  return { created, skipped }
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
