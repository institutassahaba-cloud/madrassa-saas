import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  const hashed = await bcrypt.hash("admin1234", 12)

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-institut" },
    update: {},
    create: {
      name: "Institut As-Sahaba (Demo)",
      slug: "demo-institut",
      email: "contact@assahaba.fr",
      phone: "06 00 00 00 00",
      city: "Paris",
      settings: { create: {} },
    },
  })

  const director = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "directeur@assahaba.fr" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Directeur Demo",
      email: "directeur@assahaba.fr",
      password: hashed,
      role: "DIRECTOR",
    },
  })

  const teacher = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "prof@assahaba.fr" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Abdallah Martin",
      email: "prof@assahaba.fr",
      password: hashed,
      role: "TEACHER",
    },
  })

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "secretaire@assahaba.fr" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Fatima Dupont",
      email: "secretaire@assahaba.fr",
      password: hashed,
      role: "SECRETARY",
    },
  })

  const group = await prisma.group.upsert({
    where: { id: "group-demo-1" },
    update: {},
    create: {
      id: "group-demo-1",
      tenantId: tenant.id,
      name: "Niveau Débutant A",
      level: "Débutant",
      teacherId: teacher.id,
      maxStudents: 15,
      schedule: "Samedi–Dimanche 10:00–12:00",
    },
  })

  // Create sample students
  const students = [
    { firstName: "Youssef", lastName: "Benali", gender: "MALE", monthlyFee: 50 },
    { firstName: "Mariam", lastName: "Traoré", gender: "FEMALE", monthlyFee: 50 },
    { firstName: "Ibrahim", lastName: "Diallo", gender: "MALE", monthlyFee: 50 },
    { firstName: "Aïcha", lastName: "Konaté", gender: "FEMALE", monthlyFee: 50 },
    { firstName: "Hassan", lastName: "Lahlou", gender: "MALE", monthlyFee: 50 },
  ]

  for (const s of students) {
    await prisma.student.create({
      data: {
        tenantId: tenant.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...s as any,
        groupId: group.id,
        status: "ACTIVE",
        enrollmentDate: new Date("2024-09-01"),
      },
    }).catch(() => {})
  }

  console.log("✅ Seed terminé !")
  console.log("")
  console.log("🔐 Comptes de démo :")
  console.log("   Institut (slug) : demo-institut")
  console.log("   Directeur       : directeur@assahaba.fr / admin1234")
  console.log("   Professeur      : prof@assahaba.fr / admin1234")
  console.log("   Secrétaire      : secretaire@assahaba.fr / admin1234")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
