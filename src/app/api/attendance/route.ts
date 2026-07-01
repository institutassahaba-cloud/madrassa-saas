import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap, ApiError } from "@/lib/api"

const ALLOWED_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"]

type AttendanceRecord = { studentId: string; groupId: string; date: string; status: string; note?: string }

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const { records } = await req.json()
  if (!Array.isArray(records) || records.length === 0) {
    throw new ApiError(400, "Aucune présence à enregistrer.")
  }

  const rows = records as AttendanceRecord[]
  for (const r of rows) {
    if (!r.studentId || !r.groupId || !r.date || !ALLOWED_STATUSES.includes(r.status)) {
      throw new ApiError(400, "Chaque ligne doit contenir élève, groupe, date et statut valides.")
    }
    if (Number.isNaN(new Date(r.date).getTime())) {
      throw new ApiError(400, "Date de présence invalide.")
    }
  }

  const studentIds = [...new Set(rows.map((r) => r.studentId))]
  const groupIds = [...new Set(rows.map((r) => r.groupId))]

  // Les élèves et groupes référencés doivent appartenir à l'institut.
  const [validStudents, validGroups] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds }, tenantId: user.tenantId },
      select: { id: true },
    }),
    prisma.group.findMany({
      where: { id: { in: groupIds }, tenantId: user.tenantId },
      select: { id: true, teacherId: true },
    }),
  ])

  if (validStudents.length !== studentIds.length || validGroups.length !== groupIds.length) {
    throw new ApiError(404, "Élève ou groupe introuvable dans cet institut.")
  }

  // Un professeur ne peut saisir des présences que pour ses propres groupes.
  if (user.role === "TEACHER" && validGroups.some((g) => g.teacherId !== user.id)) {
    throw new ApiError(403, "Vous ne pouvez saisir des présences que pour vos groupes.")
  }

  await prisma.$transaction(
    rows.map((r) =>
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
})

export const GET = wrap(async (req: Request) => {
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
})
