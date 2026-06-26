import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  const salary = await prisma.teacherSalary.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!salary) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.teacherSalary.update({
    where: { id },
    data: {
      status: body.status,
      paidDate: body.paidDate ? new Date(body.paidDate) : null,
    },
  })
  return NextResponse.json(updated)
}
