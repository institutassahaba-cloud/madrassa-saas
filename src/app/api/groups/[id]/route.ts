import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

export const PUT = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const group = await prisma.group.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.group.update({
    where: { id },
    data: {
      name: body.name,
      level: body.level || null,
      teacherId: body.teacherId || null,
      maxStudents: body.maxStudents,
      description: body.description || null,
      schedule: body.schedule ?? null,
    },
  })
  return NextResponse.json(updated)
})

export const DELETE = wrap(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Suppression d'une classe. Les ÉLÈVES sont préservés (détachés, groupId→null).
  // libSQL n'applique pas les cascades : on efface explicitement les données
  // liées au groupe (notes, contrôles, présences, créneaux) des feuilles vers
  // la racine, puis le groupe.
  await prisma.$transaction([
    prisma.grade.deleteMany({ where: { assessment: { groupId: id } } }),
    prisma.assessment.deleteMany({ where: { groupId: id, tenantId: user.tenantId } }),
    prisma.attendance.deleteMany({ where: { groupId: id, tenantId: user.tenantId } }),
    prisma.slotException.deleteMany({ where: { slot: { groupId: id } } }),
    prisma.timeSlot.deleteMany({ where: { groupId: id, tenantId: user.tenantId } }),
    prisma.student.updateMany({ where: { groupId: id, tenantId: user.tenantId }, data: { groupId: null } }),
    prisma.group.delete({ where: { id } }),
  ])
  return NextResponse.json({ ok: true })
})
