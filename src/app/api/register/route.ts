import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { slugify } from "@/lib/utils"

export async function POST(req: Request) {
  const body = await req.json()
  const { instituteName, slug, directorName, email, password, phone } = body

  if (!instituteName || !slug || !directorName || !email || !password) {
    return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 })
  }

  const exists = await prisma.tenant.findUnique({ where: { slug } })
  if (exists) {
    return NextResponse.json({ error: "Cet identifiant est déjà utilisé" }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 12)

  const tenant = await prisma.tenant.create({
    data: {
      name: instituteName,
      slug,
      users: {
        create: {
          name: directorName,
          email,
          password: hashed,
          role: "DIRECTOR",
          phone: phone || null,
        },
      },
      settings: { create: {} },
    },
  })

  return NextResponse.json({ tenantId: tenant.id, slug }, { status: 201 })
}
