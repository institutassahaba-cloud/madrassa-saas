import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
})

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex")
}

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide." }, { status: 400 })
  }

  const { token, password } = parsed.data
  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(token) },
  })

  const invalid = () =>
    NextResponse.json({ error: "Lien invalide ou expiré. Refaites une demande." }, { status: 400 })

  if (!record) return invalid()
  if (record.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } })
    return invalid()
  }

  const user = await prisma.user.findFirst({
    where: { id: record.identifier, isActive: true },
    select: { id: true },
  })
  if (!user) {
    await prisma.verificationToken.deleteMany({ where: { identifier: record.identifier } })
    return invalid()
  }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false },
  })

  // Token à usage unique : on supprime tous les liens de ce compte.
  await prisma.verificationToken.deleteMany({ where: { identifier: user.id } })

  return NextResponse.json({ ok: true })
})
