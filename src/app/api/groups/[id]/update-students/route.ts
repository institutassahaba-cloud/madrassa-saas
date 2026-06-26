import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateForSize } from "@/lib/group-rates"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: groupId } = await params
  const { removeStudentIds } = await req.json() as { removeStudentIds: string[] }

  if (!removeStudentIds?.length) {
    return NextResponse.json({ error: "Rien à modifier" }, { status: 400 })
  }

  await prisma.student.updateMany({
    where: { id: { in: removeStudentIds }, groupId, tenantId: user.tenantId },
    data: { groupId: null },
  })

  const remaining = await prisma.student.count({
    where: { groupId, tenantId: user.tenantId, status: "ACTIVE" },
  })

  if (remaining > 0) {
    const newRate = rateForSize(remaining)
    await prisma.student.updateMany({
      where: { groupId, tenantId: user.tenantId, status: "ACTIVE" },
      data: { hourlyRate: newRate },
    })
  }

  const removedRate = rateForSize(1)
  await prisma.student.updateMany({
    where: { id: { in: removeStudentIds }, tenantId: user.tenantId, status: "ACTIVE" },
    data: { hourlyRate: removedRate },
  })

  return NextResponse.json({ remaining, newRate: remaining > 0 ? rateForSize(remaining) : null })
}
