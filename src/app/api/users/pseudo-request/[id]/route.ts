import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parsePseudoRequest } from "@/lib/notifications"
import { wrap } from "@/lib/api"

export const PATCH = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { action } = await req.json()
  if (!["APPROVE", "REJECT"].includes(action)) {
    return NextResponse.json({ error: "Action invalide" }, { status: 400 })
  }

  const notification = await prisma.notification.findFirst({
    where: {
      id,
      tenantId: session.user.tenantId,
      type: "PSEUDO_CHANGE_REQUEST",
      status: "PENDING",
    },
    select: { id: true, body: true },
  })
  if (!notification) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 })

  const request = parsePseudoRequest(notification.body)
  if (!request) return NextResponse.json({ error: "Demande illisible" }, { status: 400 })

  if (action === "APPROVE") {
    await prisma.user.update({
      where: { id: request.userId },
      data: { name: request.requestedName },
    })
  }

  await prisma.notification.update({
    where: { id },
    data: {
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      sentAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
})
