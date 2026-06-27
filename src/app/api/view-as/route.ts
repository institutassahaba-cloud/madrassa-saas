import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { VIEW_AS_COOKIE } from "@/lib/view-as"

/** Active "Voir comme <prof>" (directeur uniquement). */
export async function POST(req: Request) {
  const session = await auth()
  if (session?.user?.role !== "DIRECTOR") {
    return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 })
  }

  const { teacherId } = await req.json().catch(() => ({}))
  if (typeof teacherId !== "string" || !teacherId) {
    return NextResponse.json({ error: "Professeur manquant." }, { status: 400 })
  }

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, tenantId: session.user.tenantId, role: "TEACHER", isActive: true },
    select: { id: true },
  })
  if (!teacher) return NextResponse.json({ error: "Professeur introuvable." }, { status: 404 })

  const cookieStore = await cookies()
  cookieStore.set(VIEW_AS_COOKIE, teacher.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 h
  })

  return NextResponse.json({ ok: true })
}

/** Quitte le mode "Voir comme". */
export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(VIEW_AS_COOKIE)
  return NextResponse.json({ ok: true })
}
