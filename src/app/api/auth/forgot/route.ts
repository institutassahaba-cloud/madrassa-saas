import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { sendEmail } from "@/lib/email"

const LET = "abcdefghijkmnpqrstuvwxyz"
const DIG = "23456789"
function genPassword() {
  let s = ""
  for (let i = 0; i < 3; i++) s += LET[Math.floor(Math.random() * LET.length)]
  for (let i = 0; i < 5; i++) s += DIG[Math.floor(Math.random() * DIG.length)]
  return s
}

export async function POST(req: Request) {
  const { identifier } = await req.json().catch(() => ({}))
  const id = typeof identifier === "string" ? identifier.trim().toLowerCase() : ""

  // Réponse générique systématique (ne révèle pas si le compte existe).
  const generic = NextResponse.json({
    ok: true,
    message: "Si un compte correspond, un nouveau mot de passe a été envoyé par email.",
  })

  if (!id) return generic

  const user = await prisma.user.findFirst({
    where: { email: id, isActive: true },
    select: { id: true, name: true, contactEmail: true },
  })
  if (!user?.contactEmail) return generic

  const newPassword = genPassword()
  const hash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash, mustChangePassword: true },
  })

  await sendEmail({
    to: user.contactEmail,
    subject: "Votre nouveau mot de passe — Institut As-Sahaba",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2937;">
        <p style="text-align:center; color:#047857; font-size:18px;">بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيمِ</p>
        <p>As-salâmu ʿalaykum ${user.name},</p>
        <p>Voici votre nouveau mot de passe de connexion à votre espace Institut As-Sahaba&nbsp;:</p>
        <p style="font-size:22px; font-weight:bold; letter-spacing:2px; text-align:center; background:#ecfdf5; color:#065f46; padding:14px; border-radius:8px;">${newPassword}</p>
        <p>Pour votre sécurité, il vous sera demandé de le changer dès votre prochaine connexion.</p>
        <p style="color:#6b7280; font-size:13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email et prévenez la direction.</p>
        <p>Bârak Allâhu fîkum.</p>
      </div>`,
  })

  return generic
}
