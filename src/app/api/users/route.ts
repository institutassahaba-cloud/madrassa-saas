import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { generatePassword, sendEmail, welcomeEmailHtml } from "@/lib/mail"
import { wrap } from "@/lib/api"

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()

  if (user.role === "SECRETARY" && body.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const tempPassword = generatePassword()
  const hashed = await bcrypt.hash(tempPassword, 12)

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } })
    const newUser = await prisma.user.create({
      data: {
        tenantId: user.tenantId,
        name: body.name,
        email: body.email,
        password: hashed,
        role: body.role,
        phone: body.phone || null,
        mustChangePassword: true,
      },
    })

    const loginUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3002"}/${tenant?.slug ?? "assahaba"}`
    const html = welcomeEmailHtml(body.name, body.email, tempPassword, loginUrl)
    const emailResult = await sendEmail({ to: body.email, subject: "Bienvenue sur Institut Assahaba — Vos identifiants", html })

    return NextResponse.json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      tempPassword: emailResult.ok ? undefined : tempPassword,
      emailSent: emailResult.ok,
    }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Email déjà utilisé" }, { status: 409 })
  }
})
