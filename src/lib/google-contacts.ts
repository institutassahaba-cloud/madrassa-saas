import { google } from "googleapis"
import { prisma } from "@/lib/prisma"
import { decryptSecret, encryptSecret } from "@/lib/secrets"
import { getGmailRedirectUri } from "@/lib/payment-email-reader"
import { ensureStudentContactColumns } from "@/lib/student-contact-schema"
import { ensureGoogleContactsSettingsColumns } from "@/lib/google-contacts-settings-schema"
import { extractTeacherEmoji } from "@/lib/student-display"

const CONTACT_SCOPE_ERROR = "Connexion Google Contacts incomplète. Reconnectez l'adresse contacts."
const GOOGLE_CONTACTS_SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/userinfo.email",
]

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
  const personNames = new Set((person.names ?? []).map((entry) => lower(entry.displayName)).filter(Boolean))

  if (values.emails.some((email) => personEmails.has(lower(email)))) return true
  if (values.phones.some((phone) => personPhones.has(digits(phone)))) return true
  return personNames.has(lower(values.fullName))
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
      return updated.data.resourceName || resourceName
    }

    const created = await people.people.createContact({ requestBody: payload })
    return created.data.resourceName || null
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (/insufficient.*scope|insufficientpermissions|forbidden|permission/i.test(message.toLowerCase())) {
      throw new Error(CONTACT_SCOPE_ERROR)
    }
    if (/not found/i.test(message.toLowerCase()) && resourceName) {
      const created = await people.people.createContact({ requestBody: payload })
      return created.data.resourceName || null
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

  const identifiers = unique([baseStudent.email, baseStudent.phone, baseStudent.parentEmail, baseStudent.parentPhone])
  const where = identifiers.length > 0
    ? {
        tenantId: baseStudent.tenantId,
        firstName: baseStudent.firstName,
        lastName: baseStudent.lastName,
        OR: identifiers.flatMap((value) => [
          { email: value },
          { phone: value },
          { parentEmail: value },
          { parentPhone: value },
        ]),
      }
    : {
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

export async function syncStudentGoogleContact(studentId: string) {
  const siblings = await getSiblingStudents(studentId)
  if (siblings.length === 0) return { ok: false, reason: "student_not_found" as const }

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

  const resourceName = await upsertGoogleContact({
    tenantId: primary.tenantId,
    fullName,
    statuses,
    teacherEmojis,
    teacherNames,
    subjects,
    emails,
    phones,
    resourceName: fallbackResource,
  })

  if (resourceName) {
    await prisma.student.updateMany({
      where: { id: { in: siblings.map((student) => student.id) } },
      data: { googleContactResourceName: resourceName },
    })
  }

  return { ok: true, resourceName }
}

export async function syncAllStudentGoogleContacts(tenantId: string) {
  await ensureStudentContactColumns()
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
  let synced = 0

  for (const student of students) {
    const key = [
      lower(student.firstName),
      lower(student.lastName),
      lower(student.email),
      digits(student.phone),
      lower(student.parentEmail),
      digits(student.parentPhone),
    ].join("|")
    if (processed.has(key)) continue
    processed.add(key)
    await syncStudentGoogleContact(student.id)
    synced += 1
  }

  return { synced }
}
