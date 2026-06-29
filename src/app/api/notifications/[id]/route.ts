import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notificationVisibilityWhere } from "@/lib/notifications"

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      ...notificationVisibilityWhere(session.user),
    },
    select: { id: true },
  })
  if (!notification) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.notification.update({
    where: { id },
    data: { status: "READ" },
  })

  return NextResponse.json(updated)
}
