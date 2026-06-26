import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Détail de présence d'un élève : toutes ses sessions, chaque cours daté + statut,
// et la date de paiement par session (jamais le montant). Depuis le début.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params

  const student = await prisma.student.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, firstName: true, lastName: true, displayName: true },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const sessions = await prisma.lessonSession.findMany({
    where: {
      studentId: id,
      tenantId: user.tenantId,
      // un prof ne voit que ses propres sessions
      ...(user.role === "TEACHER" ? { teacherId: user.id } : {}),
    },
    select: {
      id: true,
      number: true,
      subject: true,
      lessons: {
        orderBy: { number: "asc" },
        select: { number: true, date: true, status: true },
      },
    },
    orderBy: [{ subject: "asc" }, { number: "asc" }],
  })

  // dates de paiement par n° de session (date seule, pas de montant)
  const payments = await prisma.payment.findMany({
    where: {
      studentId: id,
      tenantId: user.tenantId,
      status: "CONFIRMED",
      sessionNumber: { not: null },
      paidDate: { not: null },
    },
    select: { sessionNumber: true, paidDate: true },
  })
  const paidByNumber: Record<number, string> = {}
  for (const p of payments) {
    const n = p.sessionNumber as number
    const iso = p.paidDate!.toISOString()
    if (!paidByNumber[n] || iso > paidByNumber[n]) paidByNumber[n] = iso
  }

  return NextResponse.json({
    student: { id: student.id, name: student.displayName || `${student.firstName} ${student.lastName}`.trim() },
    sessions: sessions.map((s) => ({
      id: s.id,
      number: s.number,
      subject: s.subject,
      paidAt: paidByNumber[s.number] ?? null,
      lessons: s.lessons.map((l) => ({
        number: l.number,
        date: l.date ? l.date.toISOString() : null,
        status: l.status,
      })),
    })),
  })
}
