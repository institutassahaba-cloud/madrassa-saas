// ╔══════════════════════════════════════════════════════════════════╗
// ║  TODO AVANT DÉPLOIEMENT :                                      ║
// ║  Configurer un cron quotidien (ex: cron-job.org) qui appelle : ║
// ║  GET https://TON-DOMAINE/api/cron/check-inactivity             ║
// ║  Header: Authorization: Bearer <CRON_SECRET>                   ║
// ║  Planification : tous les jours à 8h00                         ║
// ║  → Alerte directeur + secrétaires si un prof est inactif       ║
// ╚══════════════════════════════════════════════════════════════════╝

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendComptaMail } from "@/lib/mail"
import { wrap } from "@/lib/api"

export const GET = wrap(async (req: Request) => {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const inactivityThresholdDays = 4
  const inactivityThreshold = new Date(Date.now() - inactivityThresholdDays * 24 * 60 * 60 * 1000)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const inactiveTeachers = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      isActive: true,
      OR: [
        { lastLoginAt: { lt: inactivityThreshold } },
        { lastLoginAt: null },
      ],
    },
    include: { tenant: { select: { id: true, name: true } } },
  })

  if (inactiveTeachers.length === 0) {
    return NextResponse.json({ message: "Aucun prof inactif", count: 0 })
  }

  const byTenant = new Map<string, { tenantName: string; teachers: { id: string; name: string; lastLoginAt: Date | null }[] }>()
  for (const t of inactiveTeachers) {
    const entry = byTenant.get(t.tenantId) || { tenantName: t.tenant.name, teachers: [] }
    entry.teachers.push({ id: t.id, name: t.name, lastLoginAt: t.lastLoginAt })
    byTenant.set(t.tenantId, entry)
  }

  let emailsSent = 0
  let appNotifications = 0

  for (const [tenantId, { tenantName, teachers }] of byTenant) {
    const secretaries = await prisma.user.findMany({
      where: { tenantId, role: { in: ["SECRETARY", "DIRECTOR"] }, isActive: true },
      select: { email: true, name: true },
    })

    if (secretaries.length === 0) continue

    const teacherList = teachers.map((teacher) => {
      const days = teacher.lastLoginAt
        ? Math.floor((Date.now() - teacher.lastLoginAt.getTime()) / 86400000)
        : null
      return `• ${teacher.name}${days == null ? " — jamais connecté(e)" : ` — ${days} jour(s) sans connexion`}`
    }).join("<br />")
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#FBF8F1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#FBF8F1"><tbody><tr><td align="center" style="padding:32px 12px;">
<table align="center" width="560" border="0" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E9F1F8;"><tbody>
<tr><td align="center" bgcolor="#0C243C" style="background:#0C243C;padding:24px 20px 20px;">
<div style="font-size:17px;letter-spacing:3px;color:#ffffff;font-weight:700;text-transform:uppercase;">Institut As-Sahaba</div>
</td></tr>
<tr><td align="center" style="padding:30px 32px 8px;font-size:20px;line-height:28px;color:#17456C;font-weight:700;">
⚠️ Alerte d'inactivité
</td></tr>
<tr><td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
Les professeurs suivants ne se sont pas connectés depuis <strong>${inactivityThresholdDays} jours ou plus</strong> :<br /><br />
${teacherList}<br /><br />
Merci de vérifier qu'ils remplissent bien leur cahier de cours et qu'ils ont accès à leur espace.
</td></tr>
<tr><td height="20"></td></tr>
<tr><td align="center" bgcolor="#F4EFE3" style="background:#F4EFE3;padding:16px 32px;font-size:12px;color:#5C6577;">
<strong style="color:#17456C;">${tenantName}</strong> — Institut As-Sahaba — Sur les traces des compagnons
</td></tr>
</tbody></table></td></tr></tbody></table></body></html>`

    for (const sec of secretaries) {
      await sendComptaMail({
        to: sec.email,
        subject: `⚠️ Professeurs inactifs — ${tenantName}`,
        html,
      }).catch((err) => console.error("[cron] Erreur email inactivité:", err))
      emailsSent++
    }

    for (const teacher of teachers) {
      const title = `${teacher.name} ne s'est pas connecté(e)`
      const days = teacher.lastLoginAt
        ? Math.floor((Date.now() - teacher.lastLoginAt.getTime()) / 86400000)
        : null
      const body = days == null
        ? `${teacher.name} ne s'est encore jamais connecté(e).`
        : `${teacher.name} ne s'est pas connecté(e) depuis ${days} jour(s).`

      const existing = await prisma.notification.findFirst({
        where: {
          tenantId,
          type: "TEACHER_INACTIVE",
          title,
          recipient: null,
          createdAt: { gte: todayStart, lt: tomorrowStart },
        },
        select: { id: true },
      })
      if (existing) continue

      await prisma.notification.create({
        data: {
          tenantId,
          type: "TEACHER_INACTIVE",
          title,
          body,
          channel: "APP",
        },
      })
      appNotifications++
    }
  }

  return NextResponse.json({ message: "Vérification terminée", inactiveCount: inactiveTeachers.length, emailsSent, appNotifications })
})
