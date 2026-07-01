import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

export const PATCH = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { timezone } = await req.json()
  if (!timezone) return NextResponse.json({ error: "timezone required" }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { timezone },
    select: { id: true, timezone: true },
  })
  return NextResponse.json(updated)
})
