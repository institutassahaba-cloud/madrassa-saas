import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"
import { sendEmail, studentWelcomeEmailHtml, type WelcomeCourse } from "@/lib/mail"
import { z } from "zod"

const bodySchema = z.object({
  to: z.string().email(),
  studentName: z.string().min(1),
  subject: z.string().trim().min(1).max(200).optional(),
  intro: z.string().trim().max(2000).optional(),
  courses: z.array(z.object({
    subject: z.string().nullable().optional(),
    teacherId: z.string().min(1),
  })).min(1),
})

// Envoie l'e-mail de bienvenue à un nouvel élève : accueil + coordonnées (WhatsApp + Zoom)
// de chaque professeur assigné. Les coordonnées des profs sont relues en base (jamais
// prises du client) et restreintes au tenant courant.
export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide" }, { status: 400 })
  const { to, studentName, subject, intro, courses } = parsed.data

  const teacherIds = [...new Set(courses.map((c) => c.teacherId))]
  const teachers = await prisma.user.findMany({
    where: { id: { in: teacherIds }, tenantId: user.tenantId, role: "TEACHER" },
    select: { id: true, name: true, phone: true, meetingLink: true },
  })
  const teacherById = new Map(teachers.map((t) => [t.id, t]))

  // Un bloc par cours, dans l'ordre saisi ; on ignore un cours dont le prof est introuvable.
  const welcomeCourses: WelcomeCourse[] = courses.flatMap((course) => {
    const teacher = teacherById.get(course.teacherId)
    if (!teacher) return []
    return [{
      subject: course.subject ?? null,
      teacherName: teacher.name,
      teacherPhone: teacher.phone,
      meetingLink: teacher.meetingLink,
    }]
  })

  if (welcomeCourses.length === 0) {
    return NextResponse.json({ error: "Aucun professeur valide pour cet e-mail." }, { status: 400 })
  }

  const result = await sendEmail({
    to,
    subject: subject || "Bienvenue à l'Institut As-Sahaba",
    html: studentWelcomeEmailHtml({ studentName, intro, courses: welcomeCourses }),
  })

  if (!result.ok) {
    return NextResponse.json({ error: "L'envoi de l'e-mail a échoué." }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
})
