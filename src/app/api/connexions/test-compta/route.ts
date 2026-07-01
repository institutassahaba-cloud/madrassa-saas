import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendComptaMail } from "@/lib/mail"
import { wrap } from "@/lib/api"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const requestedEmail = typeof body.to === "string" ? body.to.trim().toLowerCase() : ""

  const dbUser = await prisma.user.findFirst({
    where: { id: user.id, tenantId: user.tenantId },
    select: { name: true, email: true, contactEmail: true },
  })
  if (!dbUser) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  const recipient = requestedEmail || dbUser.contactEmail || dbUser.email
  if (!EMAIL_RE.test(recipient)) {
    return NextResponse.json({ error: "Aucune adresse personnelle valide sur votre compte." }, { status: 400 })
  }

  try {
    const result = await sendComptaMail({
      to: recipient,
      subject: "Test compta - Institut As-Sahaba",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937;">
          <h2 style="margin:0 0 12px;color:#0f766e;">Test email compta</h2>
          <p>Assalâmu ʿalaykum ${dbUser.name},</p>
          <p>Ce message confirme que l'adresse compta du SaaS peut envoyer des emails.</p>
          <p style="margin-top:24px;font-size:12px;color:#6b7280;">Institut Assahaba</p>
        </div>
      `,
    })

    if (!result.ok) {
      return NextResponse.json({ error: "Adresse compta non configurée." }, { status: 400 })
    }

    return NextResponse.json({ ok: true, to: recipient })
  } catch (error) {
    console.error("[connexions] Test email compta failed:", error)
    return NextResponse.json({ error: "L'envoi du test a échoué." }, { status: 500 })
  }
})
