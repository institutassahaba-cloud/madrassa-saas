import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { wrap } from "@/lib/api"

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

export const PUT = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { currentPassword, newPassword, confirmPassword } = await req.json()
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "La confirmation du mot de passe ne correspond pas." }, { status: 400 })
  }
  if (!PASSWORD_RE.test(newPassword || "")) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial." }, { status: 400 })
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser?.password) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  if (!dbUser.mustChangePassword) {
    if (!currentPassword) return NextResponse.json({ error: "Mot de passe actuel requis" }, { status: 400 })
    const valid = await bcrypt.compare(currentPassword, dbUser.password)
    if (!valid) return NextResponse.json({ error: "Mot de passe actuel incorrect" }, { status: 403 })
  }

  const hashed = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false },
  })

  return NextResponse.json({ ok: true })
})
