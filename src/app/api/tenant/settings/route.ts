import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  const body = await req.json()
  const allowed = ["wiseMerchantToken", "paypalClientId", "paypalClientSecret", "whatsappApiKey"]
  const data: Record<string, string> = {}
  for (const key of allowed) {
    if (body[key] !== undefined && body[key] !== "") {
      data[key] = body[key]
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucune donnée" }, { status: 400 })
  }

  await prisma.tenantSettings.upsert({
    where: { tenantId: user.tenantId },
    create: { tenantId: user.tenantId, ...data },
    update: data,
  })

  return NextResponse.json({ ok: true })
}
