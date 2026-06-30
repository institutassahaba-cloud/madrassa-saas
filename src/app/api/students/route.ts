import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateForSize } from "@/lib/group-rates"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"
import { z } from "zod"

const studentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(["MALE", "FEMALE"]),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  groupId: z.string().optional(),
  level: z.string().optional(),
  subject: z.string().optional(),
  monthlyFee: z.string().or(z.number()).transform(Number),
  hourlyRate: z.string().or(z.number()).optional().transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
  lessonsPerWeek: z.string().or(z.number()).optional().transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
  duration: z.string().optional(),
  startSession: z.string().or(z.number()).optional().transform((v) => (v === undefined || v === "" ? undefined : Number(v))),
  joinExisting: z.boolean().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tenantId = (session.user).tenantId
  await ensureStudentPaymentColumns()

  const students = await prisma.student.findMany({
    where: { tenantId },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { lastName: "asc" },
  })
  return NextResponse.json(students)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureStudentPaymentColumns()

  const body = await req.json()
  const parsed = studentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const data = parsed.data
  const student = await prisma.student.create({
    data: {
      tenantId: user.tenantId,
      firstName: data.firstName,
      lastName: data.lastName,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      city: data.city || null,
      groupId: data.groupId || null,
      level: data.level || null,
      subject: data.subject || null,
      monthlyFee: data.monthlyFee,
      hourlyRate: data.hourlyRate ?? null,
      lessonsPerWeek: data.lessonsPerWeek ?? null,
      duration: data.duration || null,
      parentName: data.parentName || null,
      parentPhone: data.parentPhone || null,
      parentEmail: data.parentEmail || null,
      notes: data.notes || null,
    },
  })

  if (data.groupId) {
    const group = await prisma.group.findFirst({
      where: { id: data.groupId, tenantId: user.tenantId },
      select: { teacherId: true },
    })
    if (group?.teacherId) {
      let sessionNumber = data.startSession && data.startSession > 0 ? data.startSession : 1

      if (data.joinExisting) {
        const maxSession = await prisma.lessonSession.findFirst({
          where: {
            tenantId: user.tenantId,
            student: { groupId: data.groupId },
          },
          orderBy: { number: "desc" },
          select: { number: true },
        })
        if (maxSession) sessionNumber = maxSession.number
      }

      await prisma.lessonSession.create({
        data: {
          tenantId: user.tenantId,
          studentId: student.id,
          teacherId: group.teacherId,
          subject: data.subject || "Coran",
          number: sessionNumber,
          lessons: {
            create: Array.from({ length: 8 }, (_, i) => ({
              tenantId: user.tenantId,
              number: i + 1,
              status: "PENDING",
            })),
          },
        },
      })
    }
  }

  if (data.groupId) {
    const activeCount = await prisma.student.count({
      where: { groupId: data.groupId, tenantId: user.tenantId, status: "ACTIVE" },
    })
    const newRate = rateForSize(activeCount)
    await prisma.student.updateMany({
      where: { groupId: data.groupId, tenantId: user.tenantId, status: "ACTIVE" },
      data: { hourlyRate: newRate },
    })
  }

  return NextResponse.json(student, { status: 201 })
}
