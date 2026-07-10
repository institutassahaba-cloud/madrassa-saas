import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendComptaMail } from "@/lib/mail"
import { wrap } from "@/lib/api"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function messageEmailHtml(title: string, body: string) {
  const safeBody = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br />")
  const safeTitle = escapeHtml(title)

  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;color:#1A2440;background:#ffffff;">
      <div style="background:#0C243C;padding:24px;text-align:center;border-radius:16px 16px 0 0;">
        <img src="https://www.institut-assahaba.com/embleme-white.png" alt="Institut As-Sahaba" width="72" style="display:block;margin:0 auto 12px;width:72px;height:auto;border:0;" />
        <div style="font-size:18px;letter-spacing:3px;color:#ffffff;font-weight:700;text-transform:uppercase;">Institut As-Sahaba</div>
      </div>
      <div style="border:1px solid #E9F1F8;border-top:0;border-radius:0 0 16px 16px;padding:28px;background:#ffffff;">
        <p style="margin:0 0 14px;font-size:17px;line-height:28px;color:#235A86;font-weight:600;text-align:center;" dir="rtl">السلام عليكم ورحمة الله وبركاته</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#17456C;">${safeTitle}</h1>
        <p style="margin:0;font-size:15px;line-height:25px;color:#1A2440;">${safeBody}</p>
        <p style="margin:24px 0 0;font-size:15px;line-height:25px;color:#1A2440;">Qu'Allah vous préserve.</p>
      </div>
      <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#5C6577;">Institut As-Sahaba — Sur les traces des compagnons</p>
    </div>
  `
}

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const title = String(body.title || "").trim()
  const message = String(body.message || "").trim()
  const teacherIds = Array.isArray(body.teacherIds) ? body.teacherIds.map(String) : []
  const studentIds = Array.isArray(body.studentIds) ? body.studentIds.map(String) : []

  if (title.length < 2) return NextResponse.json({ error: "Titre trop court." }, { status: 400 })
  if (message.length < 2) return NextResponse.json({ error: "Message trop court." }, { status: 400 })
  if (teacherIds.length === 0 && studentIds.length === 0) {
    return NextResponse.json({ error: "Sélectionnez au moins un destinataire." }, { status: 400 })
  }

  const [teachers, students] = await Promise.all([
    teacherIds.length
      ? prisma.user.findMany({
          where: { tenantId: user.tenantId, id: { in: teacherIds }, role: "TEACHER", isActive: true },
          select: { id: true },
        })
      : Promise.resolve([]),
    studentIds.length
      ? prisma.student.findMany({
          where: { tenantId: user.tenantId, id: { in: studentIds }, status: { not: "ARCHIVED" } },
          select: { id: true, firstName: true, lastName: true, email: true, parentEmail: true },
        })
      : Promise.resolve([]),
  ])

  let appNotifications = 0
  let studentEmailsSent = 0
  let studentEmailsSkipped = 0

  for (const teacher of teachers) {
    await prisma.notification.create({
      data: {
        tenantId: user.tenantId,
        type: "DIRECTOR_MESSAGE",
        title,
        body: message,
        recipient: teacher.id,
        channel: "APP",
        status: "PENDING",
      },
    })
    appNotifications++
  }

  const html = messageEmailHtml(title, message)
  for (const student of students) {
    const to = student.email || student.parentEmail
    const notification = await prisma.notification.create({
      data: {
        tenantId: user.tenantId,
        type: "DIRECTOR_MESSAGE",
        title,
        body: message,
        recipient: `student:${student.id}`,
        channel: "EMAIL",
        status: to ? "PENDING" : "SKIPPED",
      },
    })
    if (!to) {
      studentEmailsSkipped++
      continue
    }
    try {
      await sendComptaMail({
        to,
        subject: `${title} — Institut As-Sahaba`,
        html,
      })
      studentEmailsSent++
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "SENT", sentAt: new Date() },
      })
    } catch (error) {
      console.error("[notifications] Erreur envoi message élève:", error)
      studentEmailsSkipped++
    }
  }

  return NextResponse.json({ ok: true, appNotifications, studentEmailsSent, studentEmailsSkipped })
})
