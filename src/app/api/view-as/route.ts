import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { VIEW_AS_COOKIE } from "@/lib/view-as"
import { wrap } from "@/lib/api"

/** Active "Voir comme <membre>" (directeur uniquement). */
export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (session?.user?.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const targetId = typeof body.userId === "string" ? body.userId : body.teacherId
  if (typeof targetId !== "string" || !targetId) {
    return NextResponse.json({ error: "Membre manquant." }, { status: 400 })
  }

  const target = await prisma.user.findFirst({
    where: { id: targetId, tenantId: session.user.tenantId, role: { in: ["TEACHER", "SECRETARY"] }, isActive: true },
    select: { id: true },
  })
  if (!target) return NextResponse.json({ error: "Membre introuvable." }, { status: 404 })

  const cookieStore = await cookies()
  cookieStore.set(VIEW_AS_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 h
  })

  return NextResponse.json({ ok: true })
})

/** Quitte le mode "Voir comme". */
export const DELETE = wrap(async () => {
  const cookieStore = await cookies()
  cookieStore.delete(VIEW_AS_COOKIE)
  return NextResponse.json({ ok: true })
})
