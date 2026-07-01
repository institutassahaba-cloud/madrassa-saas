import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { slotId, date, reason } = await req.json()

  const slot = await prisma.timeSlot.findFirst({ where: { id: slotId, tenantId: user.tenantId } })
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (user.role === "TEACHER" && slot.teacherId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const exception = await prisma.slotException.create({
    data: { slotId, date: new Date(date), reason: reason || null },
  })

  return NextResponse.json(exception, { status: 201 })
})
