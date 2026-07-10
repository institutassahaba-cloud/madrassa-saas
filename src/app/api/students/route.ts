import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateForSize } from "@/lib/group-rates"
import { ensureStudentPaymentColumns } from "@/lib/student-payment-schema"
import { ensureStudentContactColumns } from "@/lib/student-contact-schema"
import { replaceStudentPaymentAliases, learnPaymentAliasFromConfirmation } from "@/lib/student-payment-aliases"
import { encodeScheduleLabel } from "@/lib/schedule-meta"
import { wrap } from "@/lib/api"
import { syncStudentGoogleContact } from "@/lib/google-contacts"
import { canonicalSubject, ensureCanonicalSubjects } from "@/lib/subject-canonicalization"
import { z } from "zod"

const DEFAULT_SLOT_COLOR = "#10b981"
// Créneaux « disponibles » du professeur (plages libres) — mêmes constantes que
// /api/schedule/availability. Quand un élève réserve à l'intérieur d'une plage, on la
// découpe (avant / après le cours de l'élève).
const AVAILABILITY_LABEL = "Créneau disponible"
const AVAILABILITY_COLOR = "#7c3aed"
const WEEKLY_AVAILABILITY_START_DATE = "1970-01-05"

// Retranche l'intervalle [bookStart, bookEnd] de chaque plage disponible qui le chevauche
// (même prof, même jour) : la plage se scinde en la partie avant et la partie après.
// Ex. plage 09:00–14:00, cours 11:00–12:00 → 09:00–11:00 + 12:00–14:00.
async function splitAvailabilityForBooking({
  tenantId, teacherId, dayOfWeek, bookStart, bookEnd,
}: {
  tenantId: string
  teacherId: string
  dayOfWeek: number
  bookStart: string
  bookEnd: string
}) {
  if (bookStart >= bookEnd) return
  const availabilities = await prisma.timeSlot.findMany({
    where: {
      tenantId,
      teacherId,
      dayOfWeek,
      groupId: null,
      label: { contains: AVAILABILITY_LABEL },
    },
    select: { id: true, startTime: true, endTime: true },
  })

  for (const av of availabilities) {
    // Pas de chevauchement → on ne touche pas à cette plage.
    if (bookEnd <= av.startTime || bookStart >= av.endTime) continue

    const pieces: { startTime: string; endTime: string }[] = []
    if (av.startTime < bookStart) pieces.push({ startTime: av.startTime, endTime: bookStart })
    if (bookEnd < av.endTime) pieces.push({ startTime: bookEnd, endTime: av.endTime })

    await prisma.timeSlot.delete({ where: { id: av.id } })
    if (pieces.length > 0) {
      await prisma.timeSlot.createMany({
        data: pieces.map((piece) => ({
          tenantId,
          teacherId,
          dayOfWeek,
          startTime: piece.startTime,
          endTime: piece.endTime,
          label: encodeScheduleLabel(AVAILABILITY_LABEL, "WEEKLY", WEEKLY_AVAILABILITY_START_DATE),
          color: AVAILABILITY_COLOR,
          groupId: null,
        })),
      })
    }
  }
}

const scheduleSlotSchema = z.object({
  dayOfWeek: z.string().or(z.number()).transform(Number),
  startTime: z.string().min(1),
})

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
  paymentGraceAllowed: z.boolean().optional(),
  paymentAliases: z.array(z.object({
    type: z.enum(["PAYPAL", "WISE", "ANY"]).optional(),
    alias: z.string().optional(),
  })).optional(),
  scheduleSlots: z.array(scheduleSlotSchema).optional(),
  initialPaymentReceived: z.boolean().optional(),
  initialPaymentMethod: z.enum(["Virement", "PayPal"]).optional(),
  initialPaymentPaidDate: z.string().optional(),
  initialPaymentReference: z.string().optional(),
  // Paiement détecté (scan PayPal/Wise) à utiliser comme 1er paiement : validé,
  // alloué à la 1re session, retiré des « non traités », payeur mémorisé.
  initialPaymentMatchId: z.string().optional(),
  notes: z.string().optional(),
})

function addDurationToTime(time: string, duration: string | null | undefined): string {
  const [h, m] = time.split(":").map(Number)
  const hours = parseFloat((duration || "1").replace(",", "."))
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(hours)) return time
  const total = h * 60 + m + Math.round(hours * 60)
  const normalized = ((total % 1440) + 1440) % 1440
  return `${Math.floor(normalized / 60).toString().padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`
}

function nextDateForDay(dayOfWeek: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  const diff = (dayOfWeek - date.getDay() + 7) % 7
  date.setDate(date.getDate() + diff)
  return date.toISOString().slice(0, 10)
}

async function createStudentScheduleSlots({
  tenantId,
  teacherId,
  groupId,
  className,
  studentName,
  subject,
  duration,
  slots,
}: {
  tenantId: string
  teacherId: string
  groupId: string
  // Nom de la classe (ex. « Binôme de Mohamed et Ilyès ») : sert de titre au créneau
  // dans le tableau du professeur. À défaut, on retombe sur « Créneau matière - élève ».
  className?: string | null
  studentName: string
  subject: string
  duration?: string | null
  slots?: { dayOfWeek: number; startTime: string }[]
}) {
  const validSlots = (slots ?? []).filter((slot) =>
    Number.isInteger(slot.dayOfWeek) &&
    slot.dayOfWeek >= 0 &&
    slot.dayOfWeek <= 6 &&
    /^\d{2}:\d{2}$/.test(slot.startTime)
  )
  if (validSlots.length === 0) return

  const label = (className && className.trim())
    ? className.trim()
    : `Créneau ${subject || "cours"} - ${studentName}`.trim()
  await prisma.timeSlot.createMany({
    data: validSlots.map((slot) => ({
      tenantId,
      teacherId,
      groupId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: addDurationToTime(slot.startTime, duration),
      label: encodeScheduleLabel(label, "WEEKLY", nextDateForDay(slot.dayOfWeek)),
      color: DEFAULT_SLOT_COLOR,
    })),
  })

  // Découpe les plages « disponibles » du prof qui contiennent le cours de l'élève.
  for (const slot of validSlots) {
    await splitAvailabilityForBooking({
      tenantId,
      teacherId,
      dayOfWeek: slot.dayOfWeek,
      bookStart: slot.startTime,
      bookEnd: addDurationToTime(slot.startTime, duration),
    })
  }
}

export const GET = wrap(async () => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tenantId = (session.user).tenantId
  await ensureStudentPaymentColumns()
  await ensureStudentContactColumns()
  await ensureCanonicalSubjects(tenantId)

  const students = await prisma.student.findMany({
    where: { tenantId },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { lastName: "asc" },
  })
  return NextResponse.json(students)
})

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role === "TEACHER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  await ensureStudentPaymentColumns()
  await ensureStudentContactColumns()

  const body = await req.json()
  const parsed = studentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const data = parsed.data
  const subject = canonicalSubject(data.subject)
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
      subject,
      monthlyFee: data.monthlyFee,
      paymentGraceAllowed: user.role === "DIRECTOR" ? data.paymentGraceAllowed === true : false,
      hourlyRate: data.hourlyRate ?? null,
      lessonsPerWeek: data.lessonsPerWeek ?? null,
      duration: data.duration || null,
      parentName: data.parentName || null,
      parentPhone: data.parentPhone || null,
      parentEmail: data.parentEmail || null,
      notes: data.notes || null,
    },
  })

  await replaceStudentPaymentAliases(user.tenantId, student.id, data.paymentAliases)

  if (data.groupId) {
    const group = await prisma.group.findFirst({
      where: { id: data.groupId, tenantId: user.tenantId },
      select: { teacherId: true, name: true },
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

      // Nombre de cours de la 1re session = cours/semaine × 4 semaines (1x→4, 2x→8…),
      // pour équilibrer le tableau du professeur avec le rythme réel. Défaut 2x (=8)
      // quand la fréquence n'est pas renseignée ; borné à 24 (6x/sem max).
      const weeklyLessons = data.lessonsPerWeek && data.lessonsPerWeek > 0 ? data.lessonsPerWeek : 2
      const lessonCount = Math.min(Math.max(Math.round(weeklyLessons * 4), 1), 24)

      const lessonSession = await prisma.lessonSession.create({
        data: {
          tenantId: user.tenantId,
          studentId: student.id,
          teacherId: group.teacherId,
          subject: subject || "Coran",
          number: sessionNumber,
          frequency: data.lessonsPerWeek ?? null,
          duration: data.duration || null,
          lessons: {
            create: Array.from({ length: lessonCount }, (_, i) => ({
              tenantId: user.tenantId,
              number: i + 1,
              status: "PENDING",
            })),
          },
        },
      })

      await createStudentScheduleSlots({
        tenantId: user.tenantId,
        teacherId: group.teacherId,
        groupId: data.groupId,
        className: group.name,
        studentName: `${student.firstName} ${student.lastName}`,
        subject: subject || "Coran",
        duration: data.duration,
        slots: data.scheduleSlots,
      })

      if (data.initialPaymentReceived) {
        // Paiement détecté sélectionné : ses données (montant, date, référence) font foi.
        const match = data.initialPaymentMatchId
          ? await prisma.paymentMatch.findFirst({
              where: { id: data.initialPaymentMatchId, tenantId: user.tenantId, status: "TO_VERIFY" },
            })
          : null

        const paidDate = match?.paymentDate ?? (data.initialPaymentPaidDate ? new Date(data.initialPaymentPaidDate) : new Date())
        const paymentMonth = paidDate.getMonth() + 1
        const paymentYear = paidDate.getFullYear()
        const now = new Date()
        const expectedInitialAmount = data.monthlyFee + 10
        const initialAmount = match ? match.receivedAmount : expectedInitialAmount
        const billingStudent = await prisma.student.findUnique({
          where: { id: student.id },
          select: { payerName: true },
        })

        const payment = await prisma.payment.create({
          data: {
            tenantId: user.tenantId,
            studentId: student.id,
            amount: initialAmount,
            status: "CONFIRMED",
            method: match ? (match.source === "PAYPAL" ? "PayPal" : "Virement") : (data.initialPaymentMethod || "Virement"),
            month: paymentMonth,
            year: paymentYear,
            reference: match ? match.gmailMessageId : (data.initialPaymentReference || null),
            paidDate,
            dueDate: new Date(paymentYear, paymentMonth - 1, 5),
            invoiceNumber: `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
            source: match ? match.source : "MANUAL",
            lessonSessionId: lessonSession.id,
            sessionNumber: lessonSession.number,
            expectedAmount: expectedInitialAmount,
            receivedAmount: initialAmount,
            expectedPayerName: billingStudent?.payerName ?? null,
            detectedPayerName: match?.detectedPayerName ?? null,
            confirmedAt: new Date(),
            notes: "Paiement initial incluant 10 € de frais d'inscription.",
          },
        })

        if (match) {
          await prisma.paymentAllocation.create({
            data: { paymentMatchId: match.id, paymentId: payment.id, amount: initialAmount },
          })
          await prisma.paymentMatch.update({
            where: { id: match.id },
            data: { status: "CONFIRMED", studentId: student.id, confirmedAt: new Date() },
          })
          // Le payeur de ce virement devient un alias du nouvel élève : les
          // prochains paiements du même payeur seront suggérés automatiquement.
          await learnPaymentAliasFromConfirmation(user.tenantId, student.id, match.detectedPayerName, match.source)
            .catch((err) => console.error("[alias] apprentissage échoué:", err))
        }
      }
    }
  }

  await syncStudentGoogleContact(student.id).catch((error) => {
    console.error("[contacts] student create sync failed:", error)
  })

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
})
