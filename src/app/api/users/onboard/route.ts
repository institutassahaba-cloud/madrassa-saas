import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { contactEmail, newPassword } = await req.json()
  const email = typeof contactEmail === "string" ? contactEmail.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Veuillez entrer une adresse email valide." }, { status: 400 })
  }

  const data: { contactEmail: string; hasOnboarded: boolean; password?: string; mustChangePassword?: boolean } = {
    contactEmail: email,
    hasOnboarded: true,
  }

  if (newPassword) {
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json({ error: "Le mot de passe doit faire au moins 6 caractères." }, { status: 400 })
    }
    data.password = await bcrypt.hash(newPassword, 12)
    data.mustChangePassword = false
  }

  await prisma.user.update({ where: { id: session.user.id }, data })

  return NextResponse.json({ ok: true })
}
