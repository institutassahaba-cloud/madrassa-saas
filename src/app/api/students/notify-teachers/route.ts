import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"
import { sendEmail, teacherNewStudentEmailHtml, type TeacherNewStudentCourse } from "@/lib/mail"
import { z } from "zod"

const bodySchema = z.object({
  courses: z.array(z.object({
    teacherId: z.string().min(1),
    // Nom de la classe (ex. « Binôme de Mohamed et Ilyès ») et matière du cours.
    className: z.string().trim().max(200).optional(),
    subject: z.string().trim().max(120).optional(),
    // Élèves concernés par ce cours (déjà « Prénom Nom »).
    studentNames: z.array(z.string().trim().min(1)).default([]),
    // Libellé préformaté du prochain cours, ex. « dimanche 12 juillet à 10h00 ».
    nextLesson: z.string().trim().max(120).optional(),
  })).min(1),
})

// Notifie chaque professeur concerné par une nouvelle inscription : une notification
// GROUPÉE par professeur (tous ses cours du binôme réunis), affichée dans son tableau.
// Best-effort côté client : les élèves sont déjà créés, un échec ici ne bloque rien.
export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide" }, { status: 400 })

  const courses = parsed.data.courses.filter((c) => c.studentNames.length > 0)
  if (courses.length === 0) return NextResponse.json({ ok: true, created: 0 })

  // Professeurs valides (du tenant, rôle TEACHER) — jamais un destinataire arbitraire.
  const teacherIds = [...new Set(courses.map((c) => c.teacherId))]
  const teachers = await prisma.user.findMany({
    where: { id: { in: teacherIds }, tenantId: user.tenantId, role: "TEACHER" },
    select: { id: true, name: true, email: true },
  })
  const validTeacherIds = new Set(teachers.map((t) => t.id))
  const teacherById = new Map(teachers.map((t) => [t.id, t]))

  // Regroupe les cours par professeur → une seule notification par prof.
  const byTeacher = new Map<string, typeof courses>()
  for (const course of courses) {
    if (!validTeacherIds.has(course.teacherId)) continue
    const list = byTeacher.get(course.teacherId) || []
    list.push(course)
    byTeacher.set(course.teacherId, list)
  }

  let created = 0
  let emailed = 0
  for (const [teacherId, teacherCourses] of byTeacher) {
    const totalStudents = new Set(teacherCourses.flatMap((c) => c.studentNames)).size
    const lines = teacherCourses.map((course) => {
      const parts: string[] = []
      const heading = [course.className, course.subject].filter(Boolean).join(" — ")
      parts.push(`• ${heading || "Nouveau cours"}`)
      parts.push(`  Élève${course.studentNames.length > 1 ? "s" : ""} : ${course.studentNames.join(", ")}`)
      if (course.nextLesson) parts.push(`  Premier cours : ${course.nextLesson}`)
      return parts.join("\n")
    })

    const title = totalStudents > 1 ? "Nouveaux élèves inscrits" : "Nouvel élève inscrit"
    const body = [
      "Assalâmu ʿalaykum, une nouvelle inscription rejoint votre tableau :",
      "",
      lines.join("\n\n"),
      "",
      "Merci de le/les contacter pour convenir des modalités du cours.",
    ].join("\n")

    await prisma.notification.create({
      data: {
        tenantId: user.tenantId,
        type: "NEW_STUDENT_ENROLLED",
        title,
        body,
        recipient: teacherId,
        channel: "APP",
        status: "PENDING",
      },
    })
    created++

    // E-mail au professeur (en plus de la notification in-app). Best-effort.
    const teacher = teacherById.get(teacherId)
    if (teacher?.email) {
      const emailCourses: TeacherNewStudentCourse[] = teacherCourses.map((c) => ({
        className: c.className ?? null,
        subject: c.subject ?? null,
        studentNames: c.studentNames,
        nextLesson: c.nextLesson ?? null,
      }))
      await sendEmail({
        to: teacher.email,
        subject: title + " — Institut As-Sahaba",
        html: teacherNewStudentEmailHtml({ teacherName: teacher.name || "", courses: emailCourses }),
      }).catch((err) => console.error("[notify-teachers] envoi e-mail prof échoué:", err))
      emailed++
    }
  }

  return NextResponse.json({ ok: true, created, emailed })
})
