import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { deleteFromDrive } from "@/lib/google-drive"
import { NextResponse } from "next/server"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  const contract = await prisma.teacherContract.findFirst({
    where: { id, tenantId: user.tenantId },
  })
  if (contract) {
    await deleteFromDrive(contract.driveFileId)
    await prisma.teacherContract.delete({ where: { id } })
  }

  return NextResponse.json({ ok: true })
}
