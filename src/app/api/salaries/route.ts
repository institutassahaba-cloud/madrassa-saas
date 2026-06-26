import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const salary = await prisma.teacherSalary.create({
    data: {
      tenantId: user.tenantId,
      teacherId: body.teacherId,
      month: Number(body.month),
      year: Number(body.year),
      hourlyRate: body.hourlyRate ? Number(body.hourlyRate) : null,
      hoursWorked: body.hoursWorked ? Number(body.hoursWorked) : null,
      fixedSalary: body.fixedSalary ? Number(body.fixedSalary) : null,
      totalAmount: Number(body.totalAmount),
      status: "PENDING",
      notes: body.notes || null,
    },
  })
  return NextResponse.json(salary, { status: 201 })
}
