import { PrismaClient } from "@prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbUrl = `file://${path.resolve(__dirname, "dev.db")}`
const adapter = new PrismaLibSql({ url: dbUrl })
const prisma = new PrismaClient({ adapter })

// bcrypt-like simple hash for demo (use real bcrypt in production)
async function hash(password) {
  const { default: bcrypt } = await import("bcryptjs")
  return bcrypt.hash(password, 10)
}

async function main() {
  console.log("🌱 Création des données de démo...")

  const hashed = await hash("admin1234")

  // Create tenant
  let tenant = await prisma.tenant.findUnique({ where: { slug: "demo-institut" } })
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Institut As-Sahaba (Démo)",
        slug: "demo-institut",
        email: "contact@assahaba.fr",
        phone: "06 12 34 56 78",
        city: "Paris",
        settings: { create: {} },
      },
    })
  }

  // Create users
  const director = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "directeur@assahaba.fr" } },
    update: {},
    create: { tenantId: tenant.id, name: "Ahmad Directeur", email: "directeur@assahaba.fr", password: hashed, role: "DIRECTOR" },
  })

  const teacher1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "prof1@assahaba.fr" } },
    update: {},
    create: { tenantId: tenant.id, name: "Abdallah Martin", email: "prof1@assahaba.fr", password: hashed, role: "TEACHER", phone: "06 11 22 33 44" },
  })

  const teacher2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "prof2@assahaba.fr" } },
    update: {},
    create: { tenantId: tenant.id, name: "Fatima Leclerc", email: "prof2@assahaba.fr", password: hashed, role: "TEACHER" },
  })

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "secretaire@assahaba.fr" } },
    update: {},
    create: { tenantId: tenant.id, name: "Khadija Dupont", email: "secretaire@assahaba.fr", password: hashed, role: "SECRETARY" },
  })

  // Create groups
  const group1 = await prisma.group.upsert({
    where: { id: "grp-debutant-a" },
    update: {},
    create: {
      id: "grp-debutant-a", tenantId: tenant.id, name: "Débutants A", level: "Débutant",
      teacherId: teacher1.id, maxStudents: 12,
      schedule: JSON.stringify({ days: ["Samedi", "Dimanche"], startTime: "10:00", endTime: "12:00" }),
    },
  })

  const group2 = await prisma.group.upsert({
    where: { id: "grp-intermediaire-b" },
    update: {},
    create: {
      id: "grp-intermediaire-b", tenantId: tenant.id, name: "Intermédiaires B", level: "Intermédiaire",
      teacherId: teacher2.id, maxStudents: 10,
      schedule: JSON.stringify({ days: ["Samedi"], startTime: "14:00", endTime: "16:30" }),
    },
  })

  // Create students
  const students = [
    { id: "stu-1", firstName: "Youssef", lastName: "Benali", gender: "MALE", monthlyFee: 50, groupId: group1.id },
    { id: "stu-2", firstName: "Mariam", lastName: "Traoré", gender: "FEMALE", monthlyFee: 50, groupId: group1.id },
    { id: "stu-3", firstName: "Ibrahim", lastName: "Diallo", gender: "MALE", monthlyFee: 50, groupId: group1.id },
    { id: "stu-4", firstName: "Aïcha", lastName: "Konaté", gender: "FEMALE", monthlyFee: 60, groupId: group1.id },
    { id: "stu-5", firstName: "Hassan", lastName: "Lahlou", gender: "MALE", monthlyFee: 50, groupId: group1.id },
    { id: "stu-6", firstName: "Zineb", lastName: "Mansouri", gender: "FEMALE", monthlyFee: 70, groupId: group2.id },
    { id: "stu-7", firstName: "Omar", lastName: "Bouzid", gender: "MALE", monthlyFee: 70, groupId: group2.id },
    { id: "stu-8", firstName: "Nour", lastName: "El Amine", gender: "FEMALE", monthlyFee: 70, groupId: group2.id },
  ]

  for (const s of students) {
    await prisma.student.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, tenantId: tenant.id, status: "ACTIVE", enrollmentDate: new Date("2024-09-01"), phone: "06 00 00 00 00", parentName: "Parent " + s.lastName },
    })
  }

  // Create payments for the last 3 months
  const now = new Date()
  const paymentData = []
  for (let m = 0; m < 3; m++) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - m)
    const month = d.getMonth() + 1
    const year = d.getFullYear()
    for (const s of students) {
      const statuses = m === 0 ? ["PAID", "PAID", "PAID", "LATE", "PENDING", "PAID", "LATE", "PENDING"] : ["PAID", "PAID", "PAID", "PAID", "PAID", "PAID", "PAID", "PAID"]
      const idx = students.indexOf(s)
      paymentData.push({
        id: `pay-${s.id}-${month}-${year}`,
        tenantId: tenant.id, studentId: s.id,
        amount: s.monthlyFee, month, year,
        status: statuses[idx],
        dueDate: new Date(year, month - 1, 5),
        paidDate: statuses[idx] === "PAID" ? new Date(year, month - 1, Math.floor(Math.random() * 15) + 1) : null,
        method: statuses[idx] === "PAID" ? "CASH" : null,
        invoiceNumber: `FAC-${year}${String(month).padStart(2,"0")}-${s.id.slice(-3).toUpperCase()}`,
      })
    }
  }
  for (const p of paymentData) {
    await prisma.payment.upsert({ where: { id: p.id }, update: {}, create: p })
  }

  // Create attendances (last 4 sessions)
  const dates = [
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7),
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14),
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21),
  ]
  const allStatuses = ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT", "LATE", "PRESENT"]
  for (const date of dates) {
    for (const s of students) {
      const idx = students.indexOf(s)
      const groupId = s.groupId
      const teacherId = groupId === group1.id ? teacher1.id : teacher2.id
      await prisma.attendance.upsert({
        where: { studentId_groupId_date: { studentId: s.id, groupId, date } },
        update: {},
        create: { tenantId: tenant.id, studentId: s.id, groupId, teacherId, date, status: allStatuses[idx] },
      })
    }
  }

  // Create an assessment
  const assessment = await prisma.assessment.upsert({
    where: { id: "assess-1" },
    update: {},
    create: {
      id: "assess-1", tenantId: tenant.id, groupId: group1.id, teacherId: teacher1.id,
      title: "Contrôle de lecture — Sourate Al-Fatiha",
      subject: "Coran", date: new Date(now.getFullYear(), now.getMonth(), 10), maxScore: 20,
    },
  })
  const scores = [17, 14, 16, 18, 12]
  for (let i = 0; i < 5; i++) {
    const s = students[i]
    await prisma.grade.upsert({
      where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: s.id } },
      update: {},
      create: { assessmentId: assessment.id, studentId: s.id, score: scores[i], observation: scores[i] >= 16 ? "Excellent" : scores[i] >= 12 ? "Bien" : "À revoir" },
    })
  }

  // Create a salary
  await prisma.teacherSalary.upsert({
    where: { teacherId_month_year: { teacherId: teacher1.id, month: now.getMonth() + 1, year: now.getFullYear() } },
    update: {},
    create: {
      tenantId: tenant.id, teacherId: teacher1.id,
      month: now.getMonth() + 1, year: now.getFullYear(),
      hoursWorked: 16, hourlyRate: 20, totalAmount: 320, status: "PENDING",
    },
  })

  console.log("\n✅ Données de démo créées avec succès !\n")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("🔐  Slug de l'institut : demo-institut")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("👑  Directeur    : directeur@assahaba.fr")
  console.log("📋  Secrétaire   : secretaire@assahaba.fr")
  console.log("📚  Professeur 1 : prof1@assahaba.fr")
  console.log("📚  Professeur 2 : prof2@assahaba.fr")
  console.log("🔑  Mot de passe : admin1234 (pour tous)")
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
}

main().catch(console.error).finally(() => prisma.$disconnect())
