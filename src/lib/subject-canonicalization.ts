import { prisma } from "@/lib/prisma"

let canonicalSubjectsReady: Promise<void> | null = null

export function canonicalSubject(value: string | null | undefined) {
  const subject = (value || "").trim()
  if (!subject) return null
  return subject.toLowerCase() === "arabe" ? "Langue arabe" : subject
}

export function ensureCanonicalSubjects(tenantId?: string) {
  canonicalSubjectsReady ??= canonicalizeSubjects(tenantId).then(() => undefined)
  return canonicalSubjectsReady
}

async function canonicalizeSubjects(tenantId?: string) {
  const whereTenant = tenantId ? { tenantId } : {}

  await prisma.student.updateMany({
    where: { ...whereTenant, subject: "Arabe" },
    data: { subject: "Langue arabe" },
  })

  const oldSessions = await prisma.lessonSession.findMany({
    where: { ...whereTenant, subject: "Arabe" },
    select: { id: true, tenantId: true, studentId: true, number: true },
  })

  for (const oldSession of oldSessions) {
    const target = await prisma.lessonSession.findFirst({
      where: {
        tenantId: oldSession.tenantId,
        studentId: oldSession.studentId,
        subject: "Langue arabe",
        number: oldSession.number,
      },
      select: { id: true },
    })

    if (target && target.id !== oldSession.id) {
      await prisma.$transaction([
        prisma.lesson.updateMany({
          where: { sessionId: oldSession.id },
          data: { sessionId: target.id },
        }),
        prisma.payment.updateMany({
          where: { lessonSessionId: oldSession.id },
          data: { lessonSessionId: target.id },
        }),
        prisma.lessonSession.delete({ where: { id: oldSession.id } }),
      ])
      continue
    }

    await prisma.lessonSession.update({
      where: { id: oldSession.id },
      data: { subject: "Langue arabe" },
    })
  }
}
