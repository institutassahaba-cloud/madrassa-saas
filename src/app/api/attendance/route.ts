import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { records } = await req.json()

  await prisma.$transaction(
    (records as { studentId: string; groupId: string; date: string; status: string; note?: string }[]).map((r) =>
      prisma.attendance.upsert({
        where: {
          studentId_groupId_date: {
            studentId: r.studentId,
            groupId: r.groupId,
            date: new Date(r.date),
          },
        },
        create: {
          tenantId: user.tenantId,
          studentId: r.studentId,
          groupId: r.groupId,
          teacherId: user.id,
          date: new Date(r.date),
          status: r.status,
          note: r.note || null,
        },
        update: {
          status: r.status,
          teacherId: user.id,
          note: r.note || null,
        },
      })
    )
  )

  return NextResponse.json({ ok: true })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get("groupId")
  const date = searchParams.get("date")

  const records = await prisma.attendance.findMany({
    where: {
      tenantId: user.tenantId,
      ...(groupId ? { groupId } : {}),
      ...(date ? { date: new Date(date) } : {}),
    },
    include: {
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { date: "desc" },
  })
  return NextResponse.json(records)
}
