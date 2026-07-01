import { NextResponse } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { wrap } from "@/lib/api"
import { isRateLimited, registerAttempt, getClientIp } from "@/lib/rate-limit"

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 h
// Anti-abus : pas de nouveau lien si un lien émis il y a moins de 15 min est encore actif.
// (TTL fixe de 1 h → un token dont l'expiration est > now + 45 min a été créé il y a < 15 min.)
const THROTTLE_MS = 15 * 60 * 1000

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex")
}

export const POST = wrap(async (req: Request) => {
  // Limitation par IP : au plus 5 demandes toutes les 15 min.
  const ip = getClientIp(req)
  if (ip) {
    const key = `forgot:${ip}`
    if (isRateLimited(key, 5, 15 * 60 * 1000).limited) {
      return NextResponse.json(
        { message: "Trop de demandes de réinitialisation. Réessayez dans quelques minutes." },
        { status: 429 },
      )
    }
    registerAttempt(key, 15 * 60 * 1000)
  }

  const { identifier } = await req.json().catch(() => ({}))
  const id = typeof identifier === "string" ? identifier.trim().toLowerCase() : ""

  // Réponse générique systématique (ne révèle pas si le compte existe).
  const generic = NextResponse.json({
    ok: true,
    message: "Si un compte correspond, un lien de réinitialisation a été envoyé par email.",
  })

  if (!id) return generic

  const user = await prisma.user.findFirst({
    where: { email: id, isActive: true },
    select: { id: true, name: true, contactEmail: true },
  })
  if (!user?.contactEmail) return generic

  const now = new Date()

  // Throttle : un lien récent est-il déjà actif ?
  const recent = await prisma.verificationToken.findFirst({
    where: {
      identifier: user.id,
      expires: { gt: new Date(now.getTime() + (TOKEN_TTL_MS - THROTTLE_MS)) },
    },
    select: { token: true },
  })
  if (recent) return generic

  // On invalide les éventuels anciens liens de ce compte, puis on en crée un neuf.
  await prisma.verificationToken.deleteMany({ where: { identifier: user.id } })

  const rawToken = randomBytes(32).toString("hex")
  await prisma.verificationToken.create({
    data: {
      identifier: user.id,
      token: hashToken(rawToken),
      expires: new Date(now.getTime() + TOKEN_TTL_MS),
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3002"
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`

  const sent = await sendEmail({
    to: user.contactEmail,
    subject: "Réinitialisation de votre mot de passe — Institut As-Sahaba",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
        <p style="text-align:center; color:#047857; font-size:18px;">بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيمِ</p>
        <p>As-salâmu ʿalaykum ${user.name},</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau&nbsp;:</p>
        <p style="text-align:center; margin:24px 0;">
          <a href="${resetUrl}" style="display:inline-block; background:#047857; color:#ffffff; text-decoration:none; font-weight:bold; padding:14px 24px; border-radius:8px;">Réinitialiser mon mot de passe</a>
        </p>
        <p style="color:#6b7280; font-size:13px;">Ce lien est valable <strong>1 heure</strong>. Tant que vous ne l'utilisez pas, votre mot de passe actuel reste inchangé.</p>
        <p style="color:#6b7280; font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email et prévenez la direction.</p>
        <p>Bârak Allâhu fîkum.</p>
      </div>`,
  })

  // Si l'email n'est pas parti, on retire le token pour ne pas laisser un lien orphelin.
  if (!sent.ok) {
    console.error("[forgot] Email non envoyé:", sent.error)
    await prisma.verificationToken.deleteMany({ where: { identifier: user.id } })
  }

  return generic
})
