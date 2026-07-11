import { google } from "googleapis"
import { prisma } from "@/lib/prisma"
import { sendPaymentThanks } from "@/lib/payment-thanks"
import { ensurePaymentScanSettingsColumns } from "@/lib/payment-scan-settings-schema"
import { ensurePaymentAliasSchema, normalizePaymentAlias } from "@/lib/payment-alias-schema"
import { ensureDirectorPayerAliasSchema, isKnownDirectorPayer } from "@/lib/director-payer-alias"
import { PAYMENT_AWAITING_STATUSES } from "@/lib/payment-status"
import { encryptSecret, decryptSecret } from "@/lib/secrets"

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
]
const DEFAULT_FACTURATION_EMAIL = "facturation.institutassahaba@gmail.com"

function getBaseUrl() {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

export function getGmailRedirectUri() {
  return process.env.GMAIL_PAYMENT_REDIRECT_URI || `${getBaseUrl()}/api/connexions/gmail/callback`
}

function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return new google.auth.OAuth2(clientId, clientSecret, getGmailRedirectUri())
}

export function getGmailAuthUrl() {
  const client = getOAuthClient()
  if (!client) return null
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
  })
}

export async function saveGmailRefreshToken(tenantId: string, code: string) {
  const client = getOAuthClient()
  if (!client) throw new Error("Gmail OAuth non configuré.")
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) throw new Error("Google n'a pas renvoyé de refresh token.")
  const encrypted = encryptSecret(tokens.refresh_token) as string
  await prisma.tenantSettings.upsert({
    where: { tenantId },
    create: { tenantId, gmailRefreshToken: encrypted },
    update: { gmailRefreshToken: encrypted },
  })
}

async function getGmailClient(tenantId: string) {
  const client = getOAuthClient()
  if (!client) throw new Error("Gmail OAuth non configuré.")
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { gmailRefreshToken: true },
  })
  const refreshToken = decryptSecret(settings?.gmailRefreshToken) || process.env.GMAIL_PAYMENT_REFRESH_TOKEN
  if (!refreshToken) throw new Error("Boîte paiement non connectée.")
  client.setCredentials({ refresh_token: refreshToken })
  return google.gmail({ version: "v1", auth: client })
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(normalized, "base64").toString("utf8")
}

function readPayloadText(payload: unknown): string {
  const part = payload as {
    mimeType?: string
    body?: { data?: string }
    parts?: unknown[]
  } | null
  if (!part) return ""
  const ownText = part.body?.data && (part.mimeType?.includes("text/plain") || part.mimeType?.includes("text/html"))
    ? decodeBase64Url(part.body.data)
    : ""
  const children = Array.isArray(part.parts) ? part.parts.map(readPayloadText).join("\n") : ""
  return [ownText, children].filter(Boolean).join("\n")
}

function cleanText(value: string | null | undefined) {
  return (value || "")
    // Blocs <style>/<script> : leur CONTENU (CSS/JS) survivrait au retrait des balises
    // et polluerait l'extraction du nom (ex: « interpolation-mode:bicubic » → payeur "bicubic").
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function detectSource(text: string) {
  if (/paypal/i.test(text)) return "PAYPAL"
  if (/wise|transferwise/i.test(text)) return "WISE"
  return "BANK"
}

function extractAmount(text: string) {
  const match = text.match(/(?:€|EUR)\s*([0-9]+(?:[,.][0-9]{1,2})?)|([0-9]+(?:[,.][0-9]{1,2})?)\s*(?:€|EUR)/i)
  const raw = match?.[1] || match?.[2]
  return raw ? Number(raw.replace(",", ".")) : null
}

function extractReference(source: string, text: string, fallback: string) {
  const paypal = text.match(/(?:transaction|transaction id|n[°o]\s*de transaction|référence)[^\w]{0,12}([A-Z0-9]{10,24})/i)
  const wise = text.match(/(?:transfer|virement|référence|reference|membership)[^\w]{0,12}([A-Z0-9-]{8,36})/i)
  const match = source === "PAYPAL" ? paypal : wise
  return match?.[1] || fallback
}

function cleanPayerName(raw: string) {
  return raw
    .replace(/["'«»]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ")
    .replace(/\b(?:a|à)\s+envoy[ée]\b.*$/i, " ")
    .replace(/\b(?:sent|paid|has sent)\b.*$/i, " ")
    .replace(/\b(?:vous|you)\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?-]+$/g, "")
    .trim()
}

function isUsablePayerName(value: string | null | undefined) {
  const normalized = cleanPayerName(value || "")
  if (normalized.length < 3 || normalized.length > 80) return false
  if (/@/.test(normalized)) return false
  if (/(?:€|eur|\d+[,.]\d{1,2})/i.test(normalized)) return false
  if (/^(paypal|wise|transferwise|service|notification|recu|reçu|argent|paiement|payment)$/i.test(normalized)) return false
  return /[A-Za-zÀ-ÿ]{2,}/.test(normalized)
}

function firstPayerNameMatch(values: string[], patterns: RegExp[]) {
  for (const value of values) {
    for (const pattern of patterns) {
      const match = value.match(pattern)
      const name = match?.[1] ? cleanPayerName(match[1]) : ""
      if (isUsablePayerName(name)) return name
    }
  }
  return null
}

function extractPayerName(source: string, text: string, subject = "", fromHeader = "") {
  const values = [subject, text]
  if (source === "PAYPAL") {
    const paypalPatterns = [
      /(.{3,80}?)\s+(?:vous\s+a\s+envoy[ée]|vous\s+a\s+pay[ée]|sent\s+you|paid\s+you)\b/i,
      /(?:vous\s+avez\s+re[çc]u|you\s+received)(?:[^.\n\r]{0,120}?)(?:\s+de|\s+from)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,80})/i,
      /(?:exp[ée]diteur|sender|client|customer|payeur|payer)\s*:\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,80})/i,
      /(?:nom|name)\s*:\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{2,80})/i,
    ]
    const name = firstPayerNameMatch(values, paypalPatterns)
    if (name) return name

    const fromName = fromHeader.match(/^"?([^"<@]{3,80})"?\s*</)?.[1]
    const cleanedFromName = fromName ? cleanPayerName(fromName) : ""
    if (isUsablePayerName(cleanedFromName) && !/paypal/i.test(cleanedFromName)) return cleanedFromName
  }

  if (source === "WISE") {
    // Sujet Wise (sans guillemets), ex. « Argent reçu de Nom Prénom ».
    // Le sujet est sur une seule ligne : on capture jusqu'à la fin de ligne.
    const subjectPatterns = [
      /re[çc]u\s+de\s+l['’]argent\s+de\s+(.+)$/i,
      /\bde\s+la\s+part\s+de\s+(.+)$/i,
      /argent\s+re[çc]u\s+de\s+(.+)$/i,
      /re[çc]u\s+de\s+(.+)$/i,
    ]
    for (const pattern of subjectPatterns) {
      const match = subject.match(pattern)
      const name = match?.[1] ? cleanPayerName(match[1]) : ""
      if (isUsablePayerName(name)) return name
    }
  }
  // Wise ancien format : "Vous avez reçu .. EUR de "Nom Prénom"" — le nom est entre guillemets.
  const wisePatterns = [
    /(?:reçu|recu|received)[^"]*?\b(?:de|from)\s+"([^"]{2,80})"/i,
    /\b(?:de|from)\s+"([^"]{2,80})"/i,
  ]
  const commonPatterns = [
    // \b obligatoire : sans lui, « mode:bicubic » (CSS) matche via la fin de « moDE : »
    /\b(?:de|from|payeur|payer)\s*:\s*([A-Za-zÀ-ÿ' -]{3,80})/i,
    /([A-Za-zÀ-ÿ' -]{3,80})\s+(?:vous a envoyé|sent you|paid you)/i,
  ]
  const patterns = source === "WISE" ? [...wisePatterns, ...commonPatterns] : commonPatterns
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const name = match?.[1] ? cleanPayerName(match[1]) : ""
    if (isUsablePayerName(name)) return name
  }
  return null
}

function extractLabel(subject: string, text: string) {
  const labelMatch = text.match(/(?:libellé|note|message|motif|description|reference|référence)\s*:\s*([^.\n\r]{3,160})/i)
  return cleanText(labelMatch?.[1] || subject).slice(0, 180) || null
}

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase()
}

function headerValue(headers: Array<{ name?: string | null; value?: string | null }>, name: string) {
  return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
}

function similarity(left: string, right: string) {
  const a = normalizePaymentAlias(left)
  const b = normalizePaymentAlias(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const aWords = new Set(a.split(" ").filter(Boolean))
  const bWords = new Set(b.split(" ").filter(Boolean))
  const common = [...aWords].filter((word) => bWords.has(word)).length
  const total = new Set([...aWords, ...bWords]).size
  return total ? common / total : 0
}

async function suggestStudentForPayment(tenantId: string, source: string, payerName: string | null, label: string | null) {
  await ensurePaymentAliasSchema()
  const candidates = await prisma.paymentAlias.findMany({
    where: {
      tenantId,
      OR: [{ type: source }, { type: "ANY" }],
    },
    include: { student: { select: { id: true, firstName: true, lastName: true, monthlyFee: true } } },
  })

  let best: { studentId: string; score: number; reason: string } | null = null
  for (const candidate of candidates) {
    const payerScore = payerName ? similarity(payerName, candidate.alias) : 0
    const labelScore = label ? similarity(label, candidate.alias) * 0.7 : 0
    const score = Math.max(payerScore, labelScore)
    if (!best || score > best.score) {
      best = {
        studentId: candidate.studentId,
        score,
        reason: payerScore >= labelScore
          ? `Nom proche : ${candidate.alias}`
          : `Libellé proche : ${candidate.alias}`,
      }
    }
  }
  return best && best.score >= 0.45 ? best : null
}

type CertainPendingPayment = {
  id: string
  amount: number
  dueDate: Date | null
  invoiceNumber: string | null
  sessionNumber: number | null
  student: {
    firstName: string
    lastName: string
    email: string | null
    payerName: string | null
    monthlyFee: number
  }
  lessonSession: {
    id: string
    number: number
    subject: string
    teacher: { name: string | null }
  } | null
}

async function findCertainPendingPayment({
  tenantId,
  amount,
  studentId,
  score,
}: {
  tenantId: string
  amount: number
  studentId: string | undefined
  score: number | undefined
}): Promise<CertainPendingPayment | null> {
  if (!studentId || score !== 1) return null

  const pendingPayments = await prisma.payment.findMany({
    where: {
      tenantId,
      studentId,
      status: { in: [...PAYMENT_AWAITING_STATUSES] },
      expectedAmount: { not: null },
    },
    include: {
      student: { select: { firstName: true, lastName: true, email: true, payerName: true, monthlyFee: true } },
      lessonSession: { select: { id: true, number: true, subject: true, teacher: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  })

  const matchingAmount = pendingPayments.filter((payment) => {
    const expected = payment.expectedAmount ?? payment.student.monthlyFee
    return Math.abs(expected - amount) < 0.01
  })

  if (matchingAmount.length !== 1) return null

  return matchingAmount[0]
}

async function autoConfirmIfCertain({
  tenantId,
  source,
  reference,
  amount,
  paymentDate,
  detectedPayerName,
  studentId,
  score,
}: {
  tenantId: string
  source: string
  reference: string
  amount: number
  paymentDate: Date | null
  detectedPayerName: string | null
  studentId: string | undefined
  score: number | undefined
}) {
  const payment = await findCertainPendingPayment({ tenantId, amount, studentId, score })
  if (!payment) return null

  const paidAt = paymentDate ?? new Date()
  const invoiceNumber = payment.invoiceNumber || `FAC-${paidAt.getFullYear()}${String(paidAt.getMonth() + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  const confirmed = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      amount,
      status: "CONFIRMED",
      method: source === "PAYPAL" ? "PayPal" : "Virement",
      source,
      reference,
      paidDate: paidAt,
      month: paidAt.getMonth() + 1,
      year: paidAt.getFullYear(),
      dueDate: payment.dueDate ?? new Date(paidAt.getFullYear(), paidAt.getMonth(), 5),
      invoiceNumber,
      sessionNumber: payment.lessonSession?.number ?? payment.sessionNumber,
      receivedAmount: amount,
      detectedPayerName,
      confirmedAt: new Date(),
      notes: "Validation automatique : payeur, montant et paiement attendu concordants.",
    },
  })

  sendPaymentThanks({
    studentEmail: payment.student.email,
    studentName: `${payment.student.firstName} ${payment.student.lastName}`,
    teacherName: payment.lessonSession?.teacher.name,
    subject: payment.lessonSession?.subject,
    amount: confirmed.amount,
    paidDate: confirmed.paidDate,
    method: confirmed.method,
  }).catch((err) => console.error("[mail] Erreur envoi remerciement paiement:", err))

  return confirmed
}

type ScanPaymentEmailsOptions = {
  requireEnabled?: boolean
  startedAt?: Date | null
  endedAt?: Date | null
  manualImport?: boolean
}

function afterDateQuery(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `after:${year}/${month}/${day}`
}

function beforeDateQuery(date: Date) {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  const year = next.getFullYear()
  const month = String(next.getMonth() + 1).padStart(2, "0")
  const day = String(next.getDate()).padStart(2, "0")
  return `before:${year}/${month}/${day}`
}

export async function scanPaymentEmails(tenantId: string, options: ScanPaymentEmailsOptions = {}) {
  await ensurePaymentScanSettingsColumns()
  await ensurePaymentAliasSchema()
  await ensureDirectorPayerAliasSchema()
  const requireEnabled = options.requireEnabled ?? true
  const autoConfirmEnabled = process.env.PAYMENT_SCAN_AUTO_CONFIRM === "true"
  const scanSettings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { paymentScanEnabled: true, paymentScanStartedAt: true },
  })
  const startedAt = options.startedAt ?? scanSettings?.paymentScanStartedAt ?? null
  const endedAt = options.endedAt ?? null
  const manualImport = options.manualImport ?? false
  if (requireEnabled && !scanSettings?.paymentScanEnabled) {
    return { ok: true, disabled: true, created: 0, updated: 0, skipped: 0, scanned: 0 }
  }
  if (requireEnabled && !startedAt) {
    return { ok: true, disabled: true, created: 0, updated: 0, skipped: 0, scanned: 0 }
  }

  const gmail = await getGmailClient(tenantId)
  const paymentEmail = process.env.PAYMENT_EMAIL ?? process.env.GMAIL_PAYMENT_USER ?? process.env.FACTURATION_EMAIL ?? DEFAULT_FACTURATION_EMAIL
  const query = [
    startedAt ? afterDateQuery(startedAt) : "newer_than:45d",
    endedAt ? beforeDateQuery(endedAt) : "",
    manualImport ? "" : "(paypal OR wise OR transferwise OR virement OR paiement OR payment)",
    !manualImport && paymentEmail ? `to:${paymentEmail}` : "",
    paymentEmail ? `-from:${paymentEmail}` : "",
    "-in:sent",
  ].filter(Boolean).join(" ")

  // Après une panne de plusieurs jours (jeton Gmail expiré, déclencheur arrêté...),
  // ou un import manuel daté, un passage doit pouvoir rattraper tout le retard.
  // La dé-duplication par référence garantit qu'aucun paiement déjà classé ne revient.
  const messages: Array<{ id?: string | null }> = []
  let pageToken: string | undefined
  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      pageToken,
      q: query,
    })
    messages.push(...(list.data.messages ?? []))
    pageToken = list.data.nextPageToken || undefined
  } while (pageToken && messages.length < 2000)

  let created = 0
  let updated = 0
  let skipped = 0
  let ignored = 0

  for (const message of messages) {
    if (!message.id) continue
    const full = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    })
    const internalDate = full.data.internalDate ? new Date(Number(full.data.internalDate)) : null
    if (startedAt && internalDate && internalDate < startedAt) {
      skipped += 1
      continue
    }
    if (endedAt && internalDate) {
      const endOfDay = new Date(endedAt)
      endOfDay.setHours(23, 59, 59, 999)
      if (internalDate > endOfDay) {
        skipped += 1
        continue
      }
    }
    const headers = full.data.payload?.headers ?? []
    const subject = headerValue(headers, "subject")
    const dateHeader = headerValue(headers, "date")
    const fromHeader = headerValue(headers, "from")
    if (paymentEmail && normalizeEmail(fromHeader).includes(normalizeEmail(paymentEmail))) {
      skipped += 1
      continue
    }
    const bodyText = cleanText(readPayloadText(full.data.payload))
    const combined = `${subject}\n${full.data.snippet ?? ""}\n${bodyText}`
    const source = detectSource(combined)
    if (manualImport && !["PAYPAL", "WISE"].includes(source)) {
      ignored += 1
      continue
    }
    const amount = extractAmount(combined)
    if (!amount) {
      ignored += 1
      continue
    }
    const reference = extractReference(source, combined, `gmail:${message.id}`)
    const detectedPayerName = extractPayerName(source, combined, subject, fromHeader)
    const paymentLabel = extractLabel(subject, combined)
    const existing = await prisma.paymentMatch.findUnique({
      where: { tenantId_gmailMessageId: { tenantId, gmailMessageId: reference } },
      select: { id: true, status: true, detectedPayerName: true, paymentLabel: true, studentId: true },
    })
    if (existing) {
      // Rattrapage : un paiement encore « à vérifier » mais sans nom détecté
      // (créé pendant une coupure du scan ou par l'ancien bug d'extraction Wise)
      // est complété a posteriori. On ne touche JAMAIS aux paiements déjà validés,
      // classés directeur ou supprimés — et on ne recrée jamais de doublon.
      if (existing.status === "TO_VERIFY" && !existing.detectedPayerName && detectedPayerName) {
        const backfillLabel = existing.paymentLabel ?? paymentLabel
        const suggestion = existing.studentId
          ? null
          : await suggestStudentForPayment(tenantId, source, detectedPayerName, backfillLabel)
        await prisma.paymentMatch.update({
          where: { id: existing.id },
          data: {
            detectedPayerName,
            paymentLabel: backfillLabel,
            ...(suggestion
              ? { studentId: suggestion.studentId, score: suggestion.score, reason: suggestion.reason }
              : {}),
          },
        })
        updated += 1
        continue
      }
      skipped += 1
      continue
    }

    const alreadyAttributed = await prisma.payment.findFirst({
      where: {
        tenantId,
        reference,
        status: { in: ["CONFIRMED", "PAID"] },
      },
      select: { id: true },
    })
    if (alreadyAttributed) {
      skipped += 1
      continue
    }

    if (await isKnownDirectorPayer(tenantId, source, detectedPayerName)) {
      await prisma.paymentMatch.create({
        data: {
          tenantId,
          source,
          gmailMessageId: reference,
          receivedAmount: amount,
          detectedPayerName,
          paymentLabel,
          paymentDate: dateHeader ? new Date(dateHeader) : null,
          status: "DIRECTOR",
          reason: "Payeur connu : paiement pour le directeur (non comptabilisé).",
          rawSubject: subject || null,
        },
      })
      created += 1
      continue
    }

    const suggestion = await suggestStudentForPayment(tenantId, source, detectedPayerName, paymentLabel)
    const certainPendingPayment = await findCertainPendingPayment({
      tenantId,
      amount,
      studentId: suggestion?.studentId,
      score: suggestion?.score,
    })
    const autoConfirmedPayment = autoConfirmEnabled ? await autoConfirmIfCertain({
      tenantId,
      source,
      reference,
      amount,
      paymentDate: dateHeader ? new Date(dateHeader) : null,
      detectedPayerName,
      studentId: suggestion?.studentId,
      score: suggestion?.score,
    }) : null
    await prisma.paymentMatch.create({
      data: {
        tenantId,
        source,
        gmailMessageId: reference,
        receivedAmount: amount,
        detectedPayerName,
        paymentLabel,
        paymentDate: dateHeader ? new Date(dateHeader) : null,
        studentId: suggestion?.studentId,
        status: autoConfirmedPayment ? "AUTO_CONFIRMED" : "TO_VERIFY",
        score: suggestion?.score,
        reason: autoConfirmedPayment
          ? "Validé automatiquement : concordance exacte nom + montant + une seule demande en attente."
          : certainPendingPayment
            ? "Concordance exacte détectée : validation manuelle demandée avant confirmation."
          : suggestion?.reason || "Paiement détecté par email, à associer.",
        rawSubject: subject || null,
        confirmedAt: autoConfirmedPayment ? new Date() : null,
        allocations: autoConfirmedPayment
          ? { create: { paymentId: autoConfirmedPayment.id, amount } }
          : undefined,
      },
    })
    created += 1
  }

  return { ok: true, created, updated, skipped, ignored, scanned: messages.length, query }
}
