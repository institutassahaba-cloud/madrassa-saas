import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureUserMeetingLinkColumn } from "@/lib/user-schema"
import { wrap } from "@/lib/api"

export const GET = wrap(async () => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureUserMeetingLinkColumn()

  const teachers = await prisma.user.findMany({
    where: { tenantId: user.tenantId, role: "TEACHER", isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      meetingLink: true,
      individualRate: true,
      binomeRate: true,
      groupRate: true,
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
})

export const PATCH = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureUserMeetingLinkColumn()

  const body = await req.json()
  const { teacherId, individualRate, binomeRate, groupRate, paymentInfo, meetingLink } = body
  if (!teacherId) return NextResponse.json({ error: "teacherId required" }, { status: 400 })
  if (user.role !== "DIRECTOR" && (individualRate !== undefined || binomeRate !== undefined || groupRate !== undefined || paymentInfo !== undefined)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, tenantId: user.tenantId },
  })
  if (!teacher) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.user.update({
    where: { id: teacherId },
    data: {
      individualRate: individualRate !== undefined ? (individualRate != null ? Number(individualRate) : null) : undefined,
      binomeRate: binomeRate !== undefined ? (binomeRate != null ? Number(binomeRate) : null) : undefined,
      groupRate: groupRate !== undefined ? (groupRate != null ? Number(groupRate) : null) : undefined,
      paymentInfo: paymentInfo !== undefined ? (paymentInfo || null) : undefined,
      meetingLink: meetingLink !== undefined ? (meetingLink || null) : undefined,
    },
  })

  return NextResponse.json({
    id: updated.id,
    individualRate: updated.individualRate,
    binomeRate: updated.binomeRate,
    groupRate: updated.groupRate,
    paymentInfo: updated.paymentInfo,
    meetingLink: updated.meetingLink,
  })
})
