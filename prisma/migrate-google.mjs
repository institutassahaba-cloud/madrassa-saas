/**
 * Migration des données historiques Google Sheets → SaaS.
 * Lot B : tenant réel + 10 profs + groupes + élèves (inscriptions).
 *
 * Données sources : prisma/data/teachers.json + prisma/data/tdb-students.json
 * (extraites du NEW TDB via prisma/data/_extract.py).
 *
 * Idempotent : réinitialise les élèves/groupes/sessions/paiements du tenant
 * cible avant de réimporter. Le tenant démo n'est pas touché.
 *
 * Usage : node prisma/migrate-google.mjs
 */
import { PrismaClient } from "@prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import path from "path"
import { fileURLToPath } from "url"
import { readFileSync } from "fs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const adapter = new PrismaLibSql({ url: `file://${path.resolve(__dirname, "dev.db")}` })
const prisma = new PrismaClient({ adapter })

const TENANT_SLUG = "assahaba"

const teachers = JSON.parse(readFileSync(path.join(__dirname, "data/teachers.json"), "utf8"))
const students = JSON.parse(readFileSync(path.join(__dirname, "data/tdb-students.json"), "utf8"))

async function hash(pwd) {
  const { default: bcrypt } = await import("bcryptjs")
  return bcrypt.hash(pwd, 10)
}

function slug(name) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")
}

async function main() {
  console.log("🚚 Migration Google → SaaS")
  const hashed = await hash("admin1234")

  // ── 1. Tenant réel ───────────────────────────────────────────────
  let tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } })
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Institut As-Sahaba",
        slug: TENANT_SLUG,
        email: "institut.assahaba@gmail.com",
        city: "En ligne",
        country: "FR",
        timezone: "Europe/Paris",
        settings: { create: {} },
      },
    })
    console.log("✅ Tenant créé :", tenant.slug)
  } else {
    console.log("ℹ️  Tenant existant :", tenant.slug)
  }
  const tenantId = tenant.id

  // ── 2. Direction + secrétariat ───────────────────────────────────
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: "directeur@assahaba.com" } },
    update: {},
    create: { tenantId, name: "Idriss (Directeur)", email: "directeur@assahaba.com", password: hashed, role: "DIRECTOR", timezone: "Europe/Paris" },
  })
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: "secretaire@assahaba.com" } },
    update: {},
    create: { tenantId, name: "Secrétaire", email: "secretaire@assahaba.com", password: hashed, role: "SECRETARY", timezone: "Europe/Paris" },
  })

  // ── 3. Reset des données importées (tenant cible uniquement) ──────
  await prisma.payment.deleteMany({ where: { tenantId } })
  await prisma.lessonSession.deleteMany({ where: { tenantId } })
  await prisma.attendance.deleteMany({ where: { tenantId } })
  await prisma.student.deleteMany({ where: { tenantId } })
  await prisma.timeSlot.deleteMany({ where: { tenantId } })
  await prisma.group.deleteMany({ where: { tenantId } })

  // ── 4. Professeurs (role TEACHER) ────────────────────────────────
  const profByCode = {}
  for (const t of teachers) {
    const email = `${slug(t.name)}@assahaba.com`
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: { name: `${t.emoji} ${t.name}`, phone: "+" + t.whatsapp, timezone: t.tz, role: "TEACHER", password: hashed },
      create: { tenantId, name: `${t.emoji} ${t.name}`, email, password: hashed, role: "TEACHER", phone: "+" + t.whatsapp, timezone: t.tz },
    })
    profByCode[t.code] = user.id
  }
  console.log(`✅ ${teachers.length} professeurs`)

  // ── 5. Groupes (1 par groupCode) ─────────────────────────────────
  const groupByCode = {}
  for (const s of students) {
    if (groupByCode[s.groupCode]) continue
    const teacherId = profByCode[s.profCode] || null
    const g = await prisma.group.create({
      data: {
        tenantId,
        name: s.groupName || s.groupCode,
        teacherId,
        description: `legacy:${s.groupCode}`,
      },
    })
    groupByCode[s.groupCode] = g.id
  }
  console.log(`✅ ${Object.keys(groupByCode).length} groupes`)

  // ── 6. Élèves (1 par inscription) ────────────────────────────────
  let count = 0
  for (const s of students) {
    await prisma.student.create({
      data: {
        tenantId,
        firstName: s.firstName || s.displayName || "—",
        lastName: s.lastName || "",
        displayName: s.displayName,
        legacyId: s.legacyId,
        groupId: groupByCode[s.groupCode] || null,
        subject: s.subject,
        monthlyFee: s.monthlyFee || 0,
        payerName: s.payerName,
        paymentType: s.paymentType,
        hourlyRate: s.hourlyRate,
        lessonsPerWeek: s.lessonsPerWeek,
        duration: s.duration,
        phone: s.phone || null,
        email: s.email || null,
        status: "ACTIVE",
      },
    })
    count++
  }
  console.log(`✅ ${count} élèves (inscriptions)`)

  console.log("\n🎉 Migration terminée.")
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
