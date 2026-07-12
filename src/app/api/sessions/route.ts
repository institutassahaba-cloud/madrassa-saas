import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"
import { syncStudentGoogleContact } from "@/lib/google-contacts"
import { canonicalSubject, ensureCanonicalSubjects } from "@/lib/subject-canonicalization"

export const GET = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  await ensureCanonicalSubjects(user.tenantId)

  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get("studentId")

  const sessions = await prisma.lessonSession.findMany({
    where: {
      tenantId: user.tenantId,
      ...(studentId ? { studentId } : {}),
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      teacher: { select: { id: true, name: true } },
      lessons: { orderBy: { number: "asc" } },
    },
    orderBy: [{ studentId: "asc" }, { subject: "asc" }, { number: "asc" }],
  })

  return NextResponse.json(sessions)
})

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const body = await req.json()
  const { studentId, teacherId, subject, number, frequency, duration, lessonCount } = body
  const sessionSubject = canonicalSubject(subject)

  if (!studentId || !sessionSubject) {
    return NextResponse.json({ error: "studentId and subject required" }, { status: 400 })
  }

  const hasExplicitLessonCount = !(lessonCount == null || lessonCount === "")
  if (hasExplicitLessonCount) {
    const n = Number(lessonCount)
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return NextResponse.json({ error: "lessonCount must be between 1 and 100" }, { status: 400 })
    }
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: user.tenantId },
    include: { group: { select: { teacherId: true } } },
  })
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 })

  // Nombre de cours d'une nouvelle session = FORFAIT de l'élève (cours par
  // semaine × 4 semaines) quand il n'est pas fourni explicitement. Avant, le
  // défaut était codé en dur à 8 → la validation d'un paiement créait toujours
  // 8 cours quel que soit le forfait (élève à 4 cours/mois → 8 crédités à tort).
  // Repli sur 8 si le forfait n'est pas renseigné.
  const resolvedLessonCount = hasExplicitLessonCount
    ? Number(lessonCount)
    : student.lessonsPerWeek && student.lessonsPerWeek > 0
      ? student.lessonsPerWeek * 4
      : 8
  if (user.role === "TEACHER") {
    const canManageStudent =
      student.group?.teacherId === user.id ||
      await prisma.lessonSession.findFirst({
        where: { tenantId: user.tenantId, studentId, teacherId: user.id },
        select: { id: true },
      })

    if (!canManageStudent) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const resolvedTeacherId = user.role === "TEACHER" ? user.id : (teacherId ?? student.group?.teacherId)
  if (!resolvedTeacherId) {
    return NextResponse.json({ error: "teacherId required" }, { status: 400 })
  }

  const teacher = await prisma.user.findFirst({
    where: {
      id: resolvedTeacherId,
      tenantId: user.tenantId,
      role: "TEACHER",
      isActive: true,
    },
    select: { id: true },
  })
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 })

  // Auto-increment session number if not provided
  let sessionNumber = number
  if (!sessionNumber) {
    const last = await prisma.lessonSession.findFirst({
      where: { tenantId: user.tenantId, studentId, subject: sessionSubject },
      orderBy: { number: "desc" },
    })
    sessionNumber = (last?.number ?? 0) + 1
  }

  const newSession = await prisma.lessonSession.create({
    data: {
      tenantId: user.tenantId,
      studentId,
      teacherId: resolvedTeacherId,
      subject: sessionSubject,
      number: sessionNumber,
      frequency: frequency ? Number(frequency) : null,
      duration: duration || null,
      lessons: {
        create: Array.from({ length: resolvedLessonCount }, (_, i) => ({
          tenantId: user.tenantId,
          number: i + 1,
          status: "PENDING",
        })),
      },
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
      teacher: { select: { id: true, name: true } },
      lessons: { orderBy: { number: "asc" } },
    },
  })

  await syncStudentGoogleContact(studentId).catch((error) => {
    console.error("[contacts] session create sync failed:", error)
  })

  return NextResponse.json(newSession, { status: 201 })
})
