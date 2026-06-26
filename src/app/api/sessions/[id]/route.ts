import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendComptaMail, sessionEndEmailHtml } from "@/lib/mail"

const PAYPAL_LINK = process.env.PAYPAL_LINK ?? ""
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL ?? "facturation.institutassahaba@gmail.com"
const WHATSAPP_LINK = process.env.WHATSAPP_LINK ?? ""
const COMPTA_EMAIL = process.env.GMAIL_COMPTA_USER ?? "comptabilite.institutassahaba@gmail.com"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  const { id } = await params

  const body = await req.json()

  const existing = await prisma.lessonSession.findFirst({
    where: { id, tenantId: user.tenantId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isClosing = body.isComplete === true && !existing.isComplete

  const updated = await prisma.lessonSession.update({
    where: { id },
    data: {
      isComplete: body.isComplete ?? existing.isComplete,
      notes: body.notes ?? existing.notes,
      frequency: body.frequency != null ? Number(body.frequency) : existing.frequency,
      duration: body.duration ?? existing.duration,
      ...(isClosing ? { endedAt: new Date() } : {}),
    },
    include: { lessons: { orderBy: { number: "asc" } } },
  })

  if (isClosing) {
    const [student, teacher] = await Promise.all([
      prisma.student.findUnique({ where: { id: existing.studentId } }),
      prisma.user.findUnique({ where: { id: existing.teacherId } }),
    ])
    if (student?.email) {
      const studentName = student.displayName || `${student.firstName} ${student.lastName}`
      const teacherName = teacher?.name || "—"
      const amount = String(student.monthlyFee || 0)
      const html = sessionEndEmailHtml({
        studentName,
        teacherName,
        subject: existing.subject,
        amount,
        paypalLink: PAYPAL_LINK,
        paypalEmail: PAYPAL_EMAIL,
        whatsappLink: WHATSAPP_LINK,
        comptaEmail: COMPTA_EMAIL,
      })
      sendComptaMail({
        to: student.email,
        subject: `Fin de session — ${existing.subject} — Institut As-Sahaba`,
        html,
      }).catch((err) => console.error("[mail] Erreur envoi fin de session:", err))
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params

  await prisma.lessonSession.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
