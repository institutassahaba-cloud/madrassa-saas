import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"
import { ensureTeacherPayrollSchema } from "@/lib/teacher-payroll-schema"

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  await ensureTeacherPayrollSchema()
  const teacher = await prisma.user.findFirst({
    where: { id: body.teacherId, tenantId: user.tenantId, role: { in: ["TEACHER", "SECRETARY"] }, isActive: true },
    select: { id: true, name: true },
  })
  if (!teacher) return NextResponse.json({ error: "Professeur introuvable." }, { status: 404 })

  const month = Number(body.month)
  const year = Number(body.year)
  const totalAmount = Number(body.totalAmount)
  const hourlyRate = body.hourlyRate ? Number(body.hourlyRate) : null
  const hoursWorked = body.hoursWorked ? Number(body.hoursWorked) : null
  const fixedSalary = body.fixedSalary ? Number(body.fixedSalary) : null
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2200) {
    return NextResponse.json({ error: "Période invalide." }, { status: 400 })
  }
  if (![totalAmount, hourlyRate, hoursWorked, fixedSalary].filter((value) => value !== null).every((value) => Number.isFinite(value) && Number(value) >= 0)) {
    return NextResponse.json({ error: "Montants invalides." }, { status: 400 })
  }

  const existing = await prisma.teacherSalary.findUnique({
    where: { teacherId_month_year: { teacherId: teacher.id, month, year } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: "Une fiche existe déjà pour cette personne et ce mois. Modifiez la fiche existante." }, { status: 409 })
  }
  const salary = await prisma.teacherSalary.create({
    data: {
      tenantId: user.tenantId,
      teacherId: teacher.id,
      month,
      year,
      hourlyRate,
      hoursWorked,
      fixedSalary,
      totalAmount,
      status: "PENDING",
      notes: body.notes || null,
    },
  })
  return NextResponse.json({ ...salary, teacher, revisions: [] }, { status: 201 })
})
