import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

const DEFAULT_PASSWORD = "admin1234"

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

async function resetDirector(req: Request) {
  const recoverySecret = process.env.RECOVERY_SECRET
  if (!recoverySecret) return unauthorized()

  const url = new URL(req.url)
  const querySecret = url.searchParams.get("secret")
  const authHeader = req.headers.get("authorization")
  const headerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null

  if (querySecret !== recoverySecret && headerSecret !== recoverySecret) {
    return unauthorized()
  }

  const password = url.searchParams.get("password") || DEFAULT_PASSWORD
  const contactEmail = url.searchParams.get("contactEmail")?.trim().toLowerCase() || undefined
  if (password.length < 6) {
    return NextResponse.json({ error: "Password too short" }, { status: 400 })
  }

  const director = await prisma.user.findFirst({
    where: { role: "DIRECTOR" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  })

  if (!director) {
    return NextResponse.json({ error: "Director not found" }, { status: 404 })
  }

  const hash = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { id: director.id },
    data: {
      email: "directeur36",
      password: hash,
      mustChangePassword: true,
      hasOnboarded: false,
      isActive: true,
      ...(contactEmail ? { contactEmail } : {}),
    },
  })

  return NextResponse.json({
    ok: true,
    message: "Accès directeur réinitialisé.",
    identifier: "directeur36",
    temporaryPassword: password,
  })
}

export async function GET(req: Request) {
  return resetDirector(req)
}

export async function POST(req: Request) {
  return resetDirector(req)
}
