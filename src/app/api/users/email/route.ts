import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { currentPassword, newEmail } = await req.json()
  const email = typeof newEmail === "string" ? newEmail.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 })
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser?.password) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  if (!currentPassword) return NextResponse.json({ error: "Mot de passe actuel requis" }, { status: 400 })
  const valid = await bcrypt.compare(currentPassword, dbUser.password)
  if (!valid) return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 403 })

  if (email === dbUser.email.toLowerCase()) {
    return NextResponse.json({ error: "C'est déjà votre adresse actuelle." }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: dbUser.tenantId, email } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: "Cette adresse email est déjà utilisée." }, { status: 409 })
  }

  await prisma.user.update({ where: { id: user.id }, data: { email } })

  return NextResponse.json({ ok: true })
}
