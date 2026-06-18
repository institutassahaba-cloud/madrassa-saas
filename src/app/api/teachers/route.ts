import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const teachers = await prisma.user.findMany({
    where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      teacherGroups: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          level: true,
          schedule: true,
          maxStudents: true,
          students: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              status: true,
            },
          },
          attendances: {
            orderBy: { date: "desc" },
            take: 30,
            select: {
              id: true,
              date: true,
              status: true,
              studentId: true,
              student: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(teachers)
}
