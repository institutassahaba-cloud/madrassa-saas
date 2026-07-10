import { google } from "googleapis"
import { prisma } from "@/lib/prisma"
import { decryptSecret, encryptSecret } from "@/lib/secrets"
import { getGmailRedirectUri } from "@/lib/payment-email-reader"
import { ensureStudentContactColumns } from "@/lib/student-contact-schema"
import { ensureGoogleContactsSettingsColumns } from "@/lib/google-contacts-settings-schema"
import { extractTeacherEmoji } from "@/lib/student-display"
import { ensureCanonicalSubjects } from "@/lib/subject-canonicalization"

const CONTACT_SCOPE_ERROR = "Connexion Google Contacts incomplète. Reconnectez l'adresse contacts."
const GOOGLE_CONTACTS_SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/userinfo.email",
]
const CONTACT_GROUP_NAME = "Institut As-Sahaba - Élèves"
const contactGroupByTenant = new Map<string, string | null>()

type ContactSyncMode = "sync" | "preview"
type ContactSyncOptions = {
  mode?: ContactSyncMode
  createMissing?: boolean
}
type ContactSyncAction = "create" | "update" | "skip_missing"

function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return new google.auth.OAuth2(clientId, clientSecret, getGmailRedirectUri())
}

export function getGoogleContactsAuthUrl() {
  const client = getOAuthClient()
  if (!client) return null
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CONTACTS_SCOPES,
    state: "contacts",
  })
}

export async function saveGoogleContactsRefreshToken(tenantId: string, code: string) {
  await ensureGoogleContactsSettingsColumns()

  const client = getOAuthClient()
  if (!client) throw new Error("Google Contacts OAuth non configuré.")

  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) throw new Error("Google n'a pas renvoyé de refresh token.")

  client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: "v2", auth: client })
  const profile = await oauth2.userinfo.get().catch(() => null)
  const email = profile?.data.email || process.env.GOOGLE_CONTACTS_EMAIL || null
  const encrypted = encryptSecret(tokens.refresh_token) as string

  await prisma.tenantSettings.upsert({
    where: { tenantId },
    create: { tenantId, googleContactsRefreshToken: encrypted, googleContactsEmail: email },
    update: { googleContactsRefreshToken: encrypted, googleContactsEmail: email },
  })
}

async function getPeopleClient(tenantId: string) {
  const client = getOAuthClient()
  if (!client) throw new Error("Google OAuth non configuré.")

  await ensureGoogleContactsSettingsColumns()
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { googleContactsRefreshToken: true },
  })
  const refreshToken = decryptSecret(settings?.googleContactsRefreshToken) || process.env.GOOGLE_CONTACTS_REFRESH_TOKEN
  if (!refreshToken) throw new Error("Adresse Google Contacts non connectée.")

  client.setCredentials({ refresh_token: refreshToken })
  return google.people({ version: "v1", auth: client })
}

function cleanString(value: string | null | undefined) {
  return (value || "").trim()
}

function lower(value: string | null | undefined) {
  return cleanString(value).toLowerCase()
}

function normalizeContactName(value: string | null | undefined) {
  return lower(value)
    .replace(/[\p{Extended_Pictographic}\u2600-\u27BF]/gu, " ")
    .replace(/[⚫🟠]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function digits(value: string | null | undefined) {
  return cleanString(value).replace(/\D/g, "")
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map(cleanString).filter(Boolean))]
}

function contactStatusMarker(statuses: string[]) {
  return statuses.includes("ACTIVE") ? "⚫" : statuses.includes("PAUSED") ? "🟠" : "⚫"
}

function contactName(fullName: string, statuses: string[], teacherEmojis: string[]) {
  return [contactStatusMarker(statuses), ...teacherEmojis, fullName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

function contactDescription(subjects: string[], teacherNames: string[]) {
  const parts = ["Institut As-Sahaba"]
  if (subjects.length > 0) parts.push(`Matières : ${subjects.join(", ")}`)
  if (teacherNames.length > 0) parts.push(`Professeurs : ${teacherNames.join(", ")}`)
  return parts.join("\n")
}

function sameContactMatch(person: {
  names?: Array<{ displayName?: string | null }>
  emailAddresses?: Array<{ value?: string | null }>
  phoneNumbers?: Array<{ value?: string | null }>
}, values: { fullName: string; emails: string[]; phones: string[] }) {
  const personEmails = new Set((person.emailAddresses ?? []).map((entry) => lower(entry.value)).filter(Boolean))
  const personPhones = new Set((person.phoneNumbers ?? []).map((entry) => digits(entry.value)).filter(Boolean))
  const personNames = new Set((person.names ?? []).map((entry) => normalizeContactName(entry.displayName)).filter(Boolean))

  if (values.emails.some((email) => personEmails.has(lower(email)))) return true
  if (values.phones.some((phone) => personPhones.has(digits(phone)))) return true
  return personNames.has(normalizeContactName(values.fullName))
}

async function findExistingContact(
  tenantId: string,
  values: { fullName: string; emails: string[]; phones: string[] }
) {
  const people = await getPeopleClient(tenantId)
  const queries = unique([values.emails[0], values.phones[0], values.fullName])

  for (const query of queries) {
    try {
      const result = await people.people.searchContacts({
        query,
        readMask: "names,emailAddresses,phoneNumbers",
        pageSize: 10,
      })
      const match = (result.data.results ?? [])
        .map((item) => item.person)
        .find((person) => person && sameContactMatch(person, values))
      if (match?.resourceName) return match.resourceName
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (/insufficient.*scope|insufficientpermissions|forbidden|permission/i.test(message.toLowerCase())) {
        throw new Error(CONTACT_SCOPE_ERROR)
      }
      throw error
    }
  }

  return null
}

async function ensureStudentContactGroup(tenantId: string) {
  if (contactGroupByTenant.has(tenantId)) return contactGroupByTenant.get(tenantId) ?? null

  const people = await getPeopleClient(tenantId)
  const groups = await people.contactGroups.list({
    groupFields: "metadata,name",
    pageSize: 200,
  })
  const existing = (groups.data.contactGroups ?? []).find((group) => group.name === CONTACT_GROUP_NAME)
  if (existing?.resourceName) {
    contactGroupByTenant.set(tenantId, existing.resourceName)
    return existing.resourceName
  }

  const created = await people.contactGroups.create({
    requestBody: {
      contactGroup: { name: CONTACT_GROUP_NAME },
    },
  })
  const resourceName = created.data.resourceName || null
  contactGroupByTenant.set(tenantId, resourceName)
  return resourceName
}

async function addContactToStudentGroup(tenantId: string, resourceName: string) {
  const groupResourceName = await ensureStudentContactGroup(tenantId)
  if (!groupResourceName) return

  const people = await getPeopleClient(tenantId)
  await people.contactGroups.members.modify({
    resourceName: groupResourceName,
    requestBody: {
      resourceNamesToAdd: [resourceName],
    },
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/already|duplicate|member/i.test(message)) return
    throw error
  })
}

async function upsertGoogleContact({
  tenantId,
  fullName,
  statuses,
  teacherEmojis,
  teacherNames,
  subjects,
  emails,
  phones,
  resourceName,
}: {
  tenantId: string
  fullName: string
  statuses: string[]
  teacherEmojis: string[]
  teacherNames: string[]
  subjects: string[]
  emails: string[]
  phones: string[]
  resourceName: string | null
}) {
  const people = await getPeopleClient(tenantId)
  const payload = {
    names: [{
      givenName: fullName.split(" ").slice(0, -1).join(" ") || fullName,
      familyName: fullName.split(" ").slice(-1).join(" ") || "",
      displayName: contactName(fullName, statuses, teacherEmojis),
    }],
    emailAddresses: emails.map((value, index) => ({
      value,
      type: index === 0 ? "home" : "other",
    })),
    phoneNumbers: phones.map((value, index) => ({
      value,
      type: index === 0 ? "mobile" : "other",
    })),
    biographies: [{
      value: contactDescription(subjects, teacherNames),
      contentType: "TEXT_PLAIN",
    }],
  }

  try {
    if (resourceName) {
      const existing = await people.people.get({
        resourceName,
        personFields: "names,emailAddresses,phoneNumbers,biographies,metadata",
      })
      const etag = existing.data.etag || existing.data.metadata?.sources?.[0]?.etag
      const updated = await people.people.updateContact({
        resourceName,
        updatePersonFields: "names,emailAddresses,phoneNumbers,biographies",
        requestBody: {
          ...payload,
          etag: etag || undefined,
        },
      })
      const updatedResourceName = updated.data.resourceName || resourceName
      await addContactToStudentGroup(tenantId, updatedResourceName)
      return updatedResourceName
    }

    const created = await people.people.createContact({ requestBody: payload })
    const createdResourceName = created.data.resourceName || null
    if (createdResourceName) await addContactToStudentGroup(tenantId, createdResourceName)
    return createdResourceName
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (/insufficient.*scope|insufficientpermissions|forbidden|permission/i.test(message.toLowerCase())) {
      throw new Error(CONTACT_SCOPE_ERROR)
    }
    if (/not found/i.test(message.toLowerCase()) && resourceName) {
      const created = await people.people.createContact({ requestBody: payload })
      const createdResourceName = created.data.resourceName || null
      if (createdResourceName) await addContactToStudentGroup(tenantId, createdResourceName)
      return createdResourceName
    }
    throw error
  }
}

async function getSiblingStudents(studentId: string) {
  await ensureStudentContactColumns()

  const baseStudent = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      parentEmail: true,
      parentPhone: true,
    },
  })
  if (!baseStudent) return []

  const where = {
    tenantId: baseStudent.tenantId,
    firstName: baseStudent.firstName,
    lastName: baseStudent.lastName,
  }

  return prisma.student.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      parentEmail: true,
      parentPhone: true,
      subject: true,
      status: true,
      googleContactResourceName: true,
      lessonSessions: {
        select: {
          teacher: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })
}

async function buildStudentGoogleContactPlan(studentId: string) {
  const siblings = await getSiblingStudents(studentId)
  if (siblings.length === 0) return null

  const primary = siblings[0]
  const fullName = `${primary.firstName} ${primary.lastName}`.replace(/\s+/g, " ").trim()
  const emails = unique(siblings.flatMap((student) => [student.email, student.parentEmail]))
  const phones = unique(siblings.flatMap((student) => [student.phone, student.parentPhone]))
  const statuses = unique(siblings.map((student) => student.status || "ACTIVE"))
  const teacherNames = unique(
    siblings.flatMap((student) => student.lessonSessions.map((session) => cleanString(session.teacher.name)))
  )
  const teacherEmojis = unique(teacherNames.map(extractTeacherEmoji))
  const subjects = unique(siblings.map((student) => student.subject))
  const existingResource = siblings.find((student) => cleanString(student.googleContactResourceName))?.googleContactResourceName || null
  const fallbackResource = existingResource || await findExistingContact(primary.tenantId, { fullName, emails, phones })
  const expectedName = contactName(fullName, statuses, teacherEmojis)

  return {
    tenantId: primary.tenantId,
    studentIds: siblings.map((student) => student.id),
    fullName,
    expectedName,
    statuses,
    teacherEmojis,
    teacherNames,
    subjects,
    emails,
    phones,
    resourceName: fallbackResource,
    action: fallbackResource ? "update" as const : "create" as const,
  }
}

export async function syncStudentGoogleContact(studentId: string, options: ContactSyncOptions = {}) {
  const plan = await buildStudentGoogleContactPlan(studentId)
  if (!plan) return { ok: false, reason: "student_not_found" as const }

  if (!plan.resourceName && options.createMissing === false) {
    return { ok: true, resourceName: null, action: "skip_missing" as const }
  }

  const resourceName = await upsertGoogleContact({
    tenantId: plan.tenantId,
    fullName: plan.fullName,
    statuses: plan.statuses,
    teacherEmojis: plan.teacherEmojis,
    teacherNames: plan.teacherNames,
    subjects: plan.subjects,
    emails: plan.emails,
    phones: plan.phones,
    resourceName: plan.resourceName,
  })

  if (resourceName) {
    await prisma.student.updateMany({
      where: { id: { in: plan.studentIds } },
      data: { googleContactResourceName: resourceName },
    })
  }

  return { ok: true, resourceName, action: plan.action }
}

export async function syncAllStudentGoogleContacts(tenantId: string, options: ContactSyncOptions = {}) {
  await ensureStudentContactColumns()
  await ensureCanonicalSubjects(tenantId)
  const students = await prisma.student.findMany({
    where: { tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      parentEmail: true,
      parentPhone: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { createdAt: "asc" }],
  })

  const processed = new Set<string>()
  const stats = {
    synced: 0,
    created: 0,
    updated: 0,
    skippedMissing: 0,
    label: CONTACT_GROUP_NAME,
    preview: [] as Array<{
      studentName: string
      expectedName: string
      action: ContactSyncAction
      teacherEmojis: string[]
      subjects: string[]
    }>,
  }

  for (const student of students) {
    const key = [
      lower(student.firstName),
      lower(student.lastName),
    ].join("|")
    if (processed.has(key)) continue
    processed.add(key)

    const plan = await buildStudentGoogleContactPlan(student.id)
    if (!plan) continue
    const action: ContactSyncAction = plan.resourceName ? "update" : options.createMissing === false ? "skip_missing" : "create"
    if (stats.preview.length < 50) {
      stats.preview.push({
        studentName: plan.fullName,
        expectedName: plan.expectedName,
        action,
        teacherEmojis: plan.teacherEmojis,
        subjects: plan.subjects,
      })
    }

    if (options.mode === "preview") {
      if (action === "create") stats.created += 1
      if (action === "update") stats.updated += 1
      if (action === "skip_missing") stats.skippedMissing += 1
      continue
    }

    const result = await syncStudentGoogleContact(student.id, { createMissing: options.createMissing })
    if (result.action === "create") stats.created += 1
    if (result.action === "update") stats.updated += 1
    if (result.action === "skip_missing") stats.skippedMissing += 1
    stats.synced += result.action === "skip_missing" ? 0 : 1
  }

  return stats
}
