import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user as any
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const hashed = await bcrypt.hash(body.password, 12)

  try {
    const newUser = await prisma.user.create({
      data: {
        tenantId: user.tenantId,
        name: body.name,
        email: body.email,
        password: hashed,
        role: body.role,
        phone: body.phone || null,
      },
    })
    return NextResponse.json({ id: newUser.id, name: newUser.name, email: newUser.email }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Email déjà utilisé" }, { status: 409 })
  }
}
