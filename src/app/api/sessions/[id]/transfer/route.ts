import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"
import { ensureTeacherPayrollSchema } from "@/lib/teacher-payroll-schema"
import { ensureTeacherTransferSchema, getSessionTransfers } from "@/lib/teacher-transfer"

const TAUGHT = ["PRESENT", "ABSENT"]

/**
 * Changement de professeur (directeur / secrétaire).
 *
 * Un cours appartient à une CLASSE, pas à un élève : le transfert emporte donc
 * tous les élèves du même groupe et de la même matière (individuel, binôme ou
 * groupe), avec la même borne pour tout le monde.
 *
 * Les sessions ne sont jamais dupliquées : les cours déjà assurés sont épinglés
 * à l'ancien professeur (`Lesson.teacherId`), la session passe au nouveau. Chaque
 * cours n'a donc qu'un seul professeur créditeur → aucun doublon en paie.
 */
export const POST = wrap(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) {
    return NextResponse.json({ error: "Réservé au directeur ou à la secrétaire." }, { status: 403 })
  }
  await ensureTeacherTransferSchema()
  await ensureTeacherPayrollSchema()

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const toTeacherId = typeof body.toTeacherId === "string" ? body.toTeacherId : null
  if (!toTeacherId) return NextResponse.json({ error: "Nouveau professeur manquant." }, { status: 400 })

  const origin = await prisma.lessonSession.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { student: { select: { id: true, groupId: true } } },
  })
  if (!origin) return NextResponse.json({ error: "Session introuvable." }, { status: 404 })
  if (origin.teacherId === toTeacherId) {
    return NextResponse.json({ error: "La classe est déjà suivie par ce professeur." }, { status: 400 })
  }

  const [fromTeacher, toTeacher] = await Promise.all([
    prisma.user.findFirst({ where: { id: origin.teacherId, tenantId: user.tenantId }, select: { id: true, name: true } }),
    prisma.user.findFirst({
      where: { id: toTeacherId, tenantId: user.tenantId, role: "TEACHER", isActive: true },
      select: { id: true, name: true },
    }),
  ])
  if (!fromTeacher) return NextResponse.json({ error: "Professeur actuel introuvable." }, { status: 404 })
  if (!toTeacher) return NextResponse.json({ error: "Professeur introuvable ou inactif." }, { status: 404 })

  // ── La classe : tous les élèves du groupe, ou l'élève seul s'il n'en a pas ──
  const classStudentIds = origin.student.groupId
    ? (await prisma.student.findMany({
        where: { tenantId: user.tenantId, groupId: origin.student.groupId },
        select: { id: true },
      })).map((student) => student.id)
    : [origin.student.id]

  // Session en cours de la classe + sessions suivantes déjà ouvertes (demandes de
  // paiement envoyées d'avance) : elles suivent la classe chez le nouveau professeur.
  const classSessions = await prisma.lessonSession.findMany({
    where: {
      tenantId: user.tenantId,
      studentId: { in: classStudentIds },
      subject: origin.subject,
      number: { gte: origin.number },
      teacherId: fromTeacher.id,
    },
    include: {
      lessons: { orderBy: { number: "asc" }, select: { id: true, number: true, status: true, teacherId: true } },
      student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
    },
  })
  if (classSessions.length === 0) {
    return NextResponse.json({ error: "Aucune session à transférer pour cette classe." }, { status: 404 })
  }
  const currentSessions = classSessions.filter((item) => item.number === origin.number)
  const nextSessions = classSessions.filter((item) => item.number > origin.number)

  // ── Borne commune à la classe ──
  // Par défaut le dernier cours validé (présent/absent) de la classe : c'est là
  // que le trait est tiré dans tous les cahiers.
  const lastTaught = currentSessions.reduce((max, item) => item.lessons.reduce(
    (inner, lesson) => (TAUGHT.includes(lesson.status) && lesson.number > inner ? lesson.number : inner), max,
  ), 0)
  const maxLessonNumber = currentSessions.reduce((max, item) => item.lessons.reduce(
    (inner, lesson) => Math.max(inner, lesson.number), max,
  ), 0)
  const requested = body.boundaryLessonNumber
  const boundary = requested === undefined || requested === null || requested === "" ? lastTaught : Number(requested)
  if (!Number.isInteger(boundary) || boundary < 0 || boundary > maxLessonNumber) {
    return NextResponse.json({ error: `La borne doit être comprise entre 0 et ${maxLessonNumber}.` }, { status: 400 })
  }

  // Les cours déjà épinglés à un professeur antérieur ne peuvent pas être repris.
  const pinnedMax = currentSessions.reduce((max, item) => item.lessons.reduce(
    (inner, lesson) => (lesson.teacherId && lesson.teacherId !== fromTeacher.id ? Math.max(inner, lesson.number) : inner), max,
  ), 0)
  if (boundary < pinnedMax) {
    return NextResponse.json(
      { error: `Les cours jusqu'au n°${pinnedMax} appartiennent déjà à un professeur précédent : la borne doit être au moins ${pinnedMax}.` },
      { status: 409 },
    )
  }

  // Un cours déjà comptabilisé dans une fiche de paie ne peut pas changer de
  // professeur : il serait payé une seconde fois au nouveau. Seuls les cours
  // assurés APRÈS la borne basculeraient — ce sont eux qu'on vérifie.
  const movedTaughtLessonIds = currentSessions.flatMap((item) => item.lessons
    .filter((lesson) => lesson.number > boundary && TAUGHT.includes(lesson.status))
    .map((lesson) => lesson.id))
  if (movedTaughtLessonIds.length > 0) {
    const alreadyPaid = await prisma.teacherSalaryLesson.findFirst({
      where: { tenantId: user.tenantId, lessonId: { in: movedTaughtLessonIds } },
      select: { lesson: { select: { number: true } } },
    })
    if (alreadyPaid) {
      return NextResponse.json(
        { error: `Le cours n°${alreadyPaid.lesson.number} est déjà payé à ${fromTeacher.name} : placez la borne après ce cours.` },
        { status: 409 },
      )
    }
  }

  const transferredAt = new Date()
  const currentIds = currentSessions.map((item) => item.id)
  const nextIds = nextSessions.map((item) => item.id)

  await prisma.$transaction(async (tx) => {
    // Session en cours : l'ancien professeur garde les cours qu'il a réellement
    // assurés jusqu'à la borne. Les cours non faits restent à la session et
    // reviennent donc au nouveau professeur, qui les assurera.
    await tx.lesson.updateMany({
      where: {
        tenantId: user.tenantId,
        sessionId: { in: currentIds },
        number: { lte: boundary },
        status: { in: TAUGHT },
        teacherId: null,
      },
      data: { teacherId: fromTeacher.id },
    })
    // Sessions suivantes : tout cours déjà assuré y appartient forcément à
    // l'ancien professeur.
    if (nextIds.length > 0) {
      await tx.lesson.updateMany({
        where: { tenantId: user.tenantId, sessionId: { in: nextIds }, status: { in: TAUGHT }, teacherId: null },
        data: { teacherId: fromTeacher.id },
      })
    }

    await tx.lessonSession.updateMany({
      where: { tenantId: user.tenantId, id: { in: [...currentIds, ...nextIds] } },
      data: { teacherId: toTeacherId },
    })

    // Un historique par session : chaque cahier d'élève porte son propre trait.
    await tx.sessionTeacherTransfer.createMany({
      data: classSessions.map((item) => ({
        tenantId: user.tenantId,
        sessionId: item.id,
        fromTeacherId: fromTeacher.id,
        fromTeacherName: fromTeacher.name,
        toTeacherId: toTeacher.id,
        toTeacherName: toTeacher.name,
        boundaryLessonNumber: item.number === origin.number ? boundary : 0,
        reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null,
        transferredAt,
        createdById: user.id,
      })),
    })

    // La classe change de professeur : le groupe et ses créneaux suivent, sinon
    // les élèves resteraient listés et planifiés chez l'ancien professeur.
    if (origin.student.groupId) {
      await tx.group.updateMany({
        where: { id: origin.student.groupId, tenantId: user.tenantId, teacherId: fromTeacher.id },
        data: { teacherId: toTeacherId },
      })
      await tx.timeSlot.updateMany({
        where: { tenantId: user.tenantId, groupId: origin.student.groupId, teacherId: fromTeacher.id },
        data: { teacherId: toTeacherId },
      })
    }
  })

  const transfers = await getSessionTransfers(user.tenantId, currentIds)
  return NextResponse.json({
    ok: true,
    boundaryLessonNumber: boundary,
    fromTeacherName: fromTeacher.name,
    toTeacherName: toTeacher.name,
    students: classSessions
      .filter((item) => item.number === origin.number)
      .map((item) => item.student.displayName || `${item.student.firstName} ${item.student.lastName}`.trim()),
    sessionsMoved: classSessions.length,
    transfers: currentIds.flatMap((sessionId) => transfers.get(sessionId) ?? []),
  })
})
