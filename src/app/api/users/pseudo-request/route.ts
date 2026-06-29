import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { pseudoRequestBody } from "@/lib/notifications"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "TEACHER") return NextResponse.json({ error: "Réservé aux professeurs." }, { status: 403 })

  const { requestedName } = await req.json()
  const pseudo = String(requestedName || "").trim()
  if (pseudo.length < 2) return NextResponse.json({ error: "Pseudo trop court." }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, tenantId: true },
  })
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })

  const existing = await prisma.notification.findFirst({
    where: {
      tenantId: user.tenantId,
      type: "PSEUDO_CHANGE_REQUEST",
      status: "PENDING",
      body: { contains: `userId=${user.id}` },
    },
    select: { id: true },
  })
  if (existing) return NextResponse.json({ error: "Une demande est déjà en attente." }, { status: 409 })

  await prisma.notification.create({
    data: {
      tenantId: user.tenantId,
      type: "PSEUDO_CHANGE_REQUEST",
      title: "Demande de changement de pseudo",
      body: pseudoRequestBody(user.name, pseudo, user.id),
      recipient: "DIRECTOR",
      channel: "APP",
      status: "PENDING",
    },
  })

  return NextResponse.json({ ok: true })
}
