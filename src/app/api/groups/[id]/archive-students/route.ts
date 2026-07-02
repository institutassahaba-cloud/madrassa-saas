import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

// Fin de classe : archive d'un coup tous les élèves ACTIFS d'une classe.
// Les élèves passent en ARCHIVED (« Anciens élèves ») sans être supprimés ;
// ils quittent les listes actives du professeur. Directeur + secrétaire.
export const POST = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: groupId } = await params
  const group = await prisma.group.findFirst({ where: { id: groupId, tenantId: user.tenantId } })
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { count } = await prisma.student.updateMany({
    where: { groupId, tenantId: user.tenantId, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  })

  return NextResponse.json({ archived: count })
})
