// Import de l'emploi du temps (EDT) d'un prof depuis prisma/data/edt-PRxxx.json.
// Idempotent : supprime les TimeSlot existants du prof avant de réimporter.
// Usage : node prisma/migrate-edt.mjs <email_prof> <fichier_json>
//   ex : node prisma/migrate-edt.mjs samia.umm.abderrahmen@assahaba.com prisma/data/edt-PR001.json
import { PrismaClient } from "@prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { readFileSync } from "node:fs"

const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: "file:///Users/idriss/Desktop/madrassa-saas/prisma/dev.db" }),
})

const [, , email, jsonPath] = process.argv
if (!email || !jsonPath) {
  console.error("Usage: node prisma/migrate-edt.mjs <email_prof> <fichier_json>")
  process.exit(1)
}

// titres honorifiques ignorés dans la comparaison de noms
const HONORIFICS = new Set(["umm", "oum", "um", "bint", "ibn", "ben", "el", "al", "de", "la", "et"])

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t))
    .join(" ")
    .trim()
}
function tokens(s) { return new Set(norm(s).split(" ").filter(Boolean)) }

function matchStudent(rawName, students) {
  const target = norm(rawName)
  if (!target) return null
  const tTok = tokens(rawName)
  let best = null, bestScore = 0
  for (const st of students) {
    const cand = [st.displayName, `${st.firstName} ${st.lastName}`, st.firstName, st.lastName]
    for (const c of cand) {
      const cn = norm(c)
      if (!cn) continue
      let score = 0
      if (cn === target) score = 100
      else if (cn.includes(target) || target.includes(cn)) score = 70
      else {
        const cTok = tokens(c)
        const inter = [...tTok].filter((t) => cTok.has(t)).length
        if (inter > 0) score = 40 + inter * 15
      }
      if (score > bestScore) { bestScore = score; best = st }
    }
  }
  // seuil : on relie le groupe seulement si match crédible
  return bestScore >= 70 ? best : null
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "assahaba" } })
  const teacher = await prisma.user.findFirst({ where: { tenantId: tenant.id, email } })
  if (!teacher) throw new Error(`Prof introuvable: ${email}`)

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, status: "ACTIVE", group: { teacherId: teacher.id } },
    select: { id: true, firstName: true, lastName: true, displayName: true, groupId: true },
  })

  const slots = JSON.parse(readFileSync(jsonPath, "utf8"))

  // idempotent
  const del = await prisma.timeSlot.deleteMany({ where: { tenantId: tenant.id, teacherId: teacher.id } })

  let matched = 0, created = 0
  for (const s of slots) {
    const st = matchStudent(s.name, students)
    if (st) matched++
    await prisma.timeSlot.create({
      data: {
        tenantId: tenant.id,
        teacherId: teacher.id,
        groupId: st?.groupId ?? null,
        dayOfWeek: s.day,
        startTime: s.start,
        endTime: s.end,
        label: s.name,
      },
    })
    created++
  }

  console.log(`Prof : ${teacher.name}`)
  console.log(`Anciens créneaux supprimés : ${del.count}`)
  console.log(`Créneaux créés : ${created} | reliés à un élève : ${matched} | label seul : ${created - matched}`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
