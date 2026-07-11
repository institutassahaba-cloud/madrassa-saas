import { google } from "googleapis"
import { prisma } from "@/lib/prisma"
import { sendPaymentThanks } from "@/lib/payment-thanks"
import { ensurePaymentScanSettingsColumns } from "@/lib/payment-scan-settings-schema"
import { ensurePaymentMatchReferenceColumn } from "@/lib/payment-match-schema"
import { ensurePaymentAliasSchema, normalizePaymentAlias } from "@/lib/payment-alias-schema"
import { ensureDirectorPayerAliasSchema, isKnownDirectorPayer } from "@/lib/director-payer-alias"
import { PAYMENT_AWAITING_STATUSES } from "@/lib/payment-status"
import { encryptSecret, decryptSecret } from "@/lib/secrets"

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
]
const DEFAULT_FACTURATION_EMAIL = "facturation.institutassahaba@gmail.com"
const PAYPAL_PAYMENT_SENDERS = ["service@paypal.fr"]
const WISE_PAYMENT_SENDERS = ["noreply@wise.com"]

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

// Lit les parties d'un type MIME donné (text/plain ou text/html), récursivement.
function readBodyByMime(payload: unknown, mime: string): string {
  const part = payload as {
    mimeType?: string
    body?: { data?: string }
    parts?: unknown[]
  } | null
  if (!part) return ""
  const own = part.body?.data && part.mimeType?.includes(mime)
    ? decodeBase64Url(part.body.data)
    : ""
  const children = Array.isArray(part.parts)
    ? part.parts.map((child) => readBodyByMime(child, mime)).filter(Boolean).join("\n")
    : ""
  return [own, children].filter(Boolean).join("\n")
}

function decodeEntities(value: string) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)))
}

// Convertit le HTML en texte propre en IMITANT le getPlainBody() de Gmail :
// on supprime <head>/<style>/<script> (sinon le CSS polluait l'extraction, ex.
// « interpolation-mode:bicubic » → payeur "bicubic"), on transforme les images
// en « [image: <alt>] » (le corps PayPal donne « [image: PayPal] <payeur> vous
// a envoyé »), puis on retire les balises et on décode les entités.
function htmlToText(html: string) {
  return decodeEntities(
    String(html || "")
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<img[^>]*\balt\s*=\s*"([^"]*)"[^>]*>/gi, (_m, alt) => (alt ? ` [image: ${alt}] ` : " "))
      .replace(/<img[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

// Corps de mail exploitable : on privilégie la partie texte/plain quand elle
// existe, sinon on convertit le HTML (les mails PayPal n'ont QUE du HTML).
function readEmailBody(payload: unknown): string {
  const plain = readBodyByMime(payload, "text/plain").trim()
  if (plain) return decodeEntities(plain).replace(/ /g, " ").replace(/[ \t]+/g, " ").trim()
  return htmlToText(readBodyByMime(payload, "text/html"))
}

function normalizeSpaces(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function cleanText(value: string | null | undefined) {
  return (value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Paiement PayPal SORTANT (« Vous avez envoyé un paiement », « voici votre
// reçu ») : à ne jamais compter comme un encaissement.
function isOutgoingPaypal(subject: string, text: string) {
  return /vous\s+avez\s+envoy[ée]|voici\s+votre\s+re[çc]u/i.test(`${subject}\n${text}`)
    && !/vous\s+a\s+envoy[ée]/i.test(text)
}

function detectSource(text: string, fromHeader = "") {
  // On inclut l'en-tête « From » : certains mails Wise ne contiennent le mot
  // « Wise » que dans l'adresse expéditrice (noreply@wise.com), jamais dans le
  // corps visible. Sans ça ils étaient classés BANK puis IGNORÉS à l'import
  // manuel → paiements manquants.
  const haystack = `${text}\n${fromHeader}`
  const from = normalizeEmail(fromHeader)
  if (WISE_PAYMENT_SENDERS.some((sender) => from.includes(sender))) return "WISE"
  if (PAYPAL_PAYMENT_SENDERS.some((sender) => from.includes(sender))) return "PAYPAL"

  const hasPaypalTemplate = /(?:vous\s+a\s+envoy[ée]|num[ée]ro\s+de\s+transaction|montant\s+re[çc]u)/i.test(haystack)
    && /paypal/i.test(haystack)
  const hasWiseTemplate = /(?:num[ée]ro\s+de\s+transfert|montant\s+re[çc]u|vous\s+avez\s+re[çc]u\s+[0-9]+(?:[,.][0-9]{1,2})?\s*(?:€|eur)\s+de)/i.test(haystack)
    && /(?:wise|transferwise|noreply@wise\.com)/i.test(haystack)

  if (hasPaypalTemplate && !hasWiseTemplate) return "PAYPAL"
  if (hasWiseTemplate && !hasPaypalTemplate) return "WISE"
  if (/paypal/i.test(from)) return "PAYPAL"
  if (/wise|transferwise/i.test(from)) return "WISE"
  return "BANK"
}

function toAmount(raw: string | null | undefined) {
  if (raw == null) return null
  const amount = parseFloat(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

// Montant : logique portée du script Apps Script éprouvé. On lit le corps
// nettoyé (imité de getPlainBody) et on prend le 1er montant en euros, en
// privilégiant les formats à 2 décimales (« 28,00 € ») puis « 56 EUR ».
function extractAmount(text: string) {
  const t = normalizeSpaces(text)
  const patterns = [
    /(\d+[.,]\d{2})\s?(?:€|EUR)\b/i,
    /(?:€|EUR)\s?(\d+[.,]\d{2})/i,
    /(\d+)\s?(?:€|EUR)\b/i,
    /montant\s+re[çc]u[^0-9]{0,30}(\d+[.,]?\d*)/i,
    /montant[^0-9]{0,30}(\d+[.,]?\d*)/i,
  ]
  for (const pattern of patterns) {
    const match = t.match(pattern)
    const amount = toAmount(match?.[1])
    if (amount != null) return amount
  }
  return null
}

function extractReference(source: string, text: string, fallback: string) {
  // PayPal : « Numéro de transaction 2MC04570LK807561J » ou « la transaction 2MC0… ».
  const paypal = text.match(/(?:num[ée]ro\s+de\s+transaction|transaction\s*id|transaction|référence|reference)[^A-Z0-9]{0,80}([A-Z0-9]{10,24})/i)
    || text.match(/activities\/details\/([A-Z0-9]{10,24})/i)
    || text.match(/details_([A-Z0-9]{10,24})/i)
  // Wise : « Numéro de transfert : #2242560083 ». Le numéro est toujours préfixé « # ».
  const wise = text.match(/#\s*([0-9]{6,20})/)
    || text.match(/(?:num[ée]ro\s+de\s+transfert|transfert|transfer|virement|référence|reference)\s*[:#]?\s*#?\s*([A-Z0-9-]{6,36})/i)
  const match = source === "PAYPAL" ? paypal : wise
  return match?.[1] || fallback
}

function cleanPayerName(raw: string) {
  // Aligné sur cleanPersonName_ du script Apps Script + garde-fous SaaS.
  return normalizeSpaces(
    String(raw || "")
      .replace(/\[image:[^\]]*\]/gi, " ")
      .replace(/["'«»]/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ")
      .replace(/\b(?:EUR|USD)\b/gi, " ")
      .replace(/€/g, " ")
      .replace(/\bvous\s+a\s+envoy[ée]\b.*$/i, " ")
      .replace(/\bvous\s+a\s+pay[ée]\b.*$/i, " ")
      .replace(/\b(?:sent|paid|has sent)\b.*$/i, " "),
  )
    // Préfixes marque/salutation, ex. « PayPal drame khadi », « Bonjour Lionel ».
    .replace(/^(?:paypal|wise|transferwise|bonjour|bonsoir|hello|hi|hey|de|from)[\s,:]+/i, "")
    .replace(/^(?:paypal|wise|transferwise|bonjour|bonsoir|hello|hi|hey|de|from)[\s,:]+/i, "")
    // Comptes joints Wise : « MR OU MME KHADIJA DRAME » → « KHADIJA DRAME ».
    .replace(/^(?:m|mr|mme|mlle|mle|monsieur|madame|mademoiselle)\b(?:\s+ou\s+(?:m|mr|mme|mlle|mle|monsieur|madame|mademoiselle)\b)?[\s.,:]*/i, "")
    .replace(/[.,;:!?-]+$/g, "")
    .trim()
}

function isUsablePayerName(value: string | null | undefined) {
  const normalized = cleanPayerName(value || "")
  if (normalized.length < 3 || normalized.length > 80) return false
  if (/@/.test(normalized)) return false
  if (/(?:€|eur|\d+[,.]\d{1,2})/i.test(normalized)) return false
  if (/^(paypal|wise|transferwise|service|notification|recu|reçu|argent|paiement|payment)$/i.test(normalized)) return false
  // « Vous avez reçu de l'argent » (sujet PayPal générique) donnait le faux nom
  // « l argent ». On rejette tout ce qui n'est composé que de mots vides / « argent ».
  if (normalized.split(" ").every((word) => /^(l|d|de|du|la|le|les|argent|money|somme|paiement|payment)$/i.test(word))) return false
  return /[A-Za-zÀ-ÿ]{2,}/.test(normalized)
}

// Nom du payeur : logique portée du script Apps Script éprouvé.
// PayPal : « [image: PayPal] <Nom> vous a envoyé » (ancre du logo dans le corps).
// Wise : le nom vient du sujet « Argent reçu de <Nom> » (borné en fin de ligne).
function extractPayerName(source: string, text: string, fromHeader = "") {
  const flat = normalizeSpaces(text)
  if (source === "PAYPAL") {
    // 1) Ancre exacte : le logo PayPal précède immédiatement le payeur.
    let match = flat.match(/\[image:\s*PayPal\]\s*(.+?)\s+vous\s+a\s+envoy[ée]/i)
    if (match?.[1]) { const name = cleanPayerName(match[1]); if (isUsablePayerName(name)) return name }
    // 2) Repli : « <Nom> vous a envoyé », borné à gauche par début / virgule de
    //    salutation (« Bonjour Michael Silva, ») / deux-points.
    match = flat.match(/(?:^|[,:]\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.\- ]{1,60}?)\s+vous\s+a\s+envoy[ée]/i)
    if (match?.[1]) { const name = cleanPayerName(match[1]); if (isUsablePayerName(name)) return name }
    // 3) Repli : nom dans l'en-tête From « "Nom" <...> ».
    const fromName = fromHeader.match(/^"?([^"<@]{3,80})"?\s*</)?.[1]
    if (fromName) { const name = cleanPayerName(fromName); if (isUsablePayerName(name) && !/paypal/i.test(name)) return name }
    return null
  }

  if (source === "WISE") {
    // Le nom Wise vient d'abord du sujet (borné par fin de ligne), sinon du corps.
    const patterns = [
      /argent\s+re[çc]u\s+de\s+(.+?)(?:\s*\n|$)/i,
      /re[çc]u\s+de\s+l['’]argent\s+de\s+(.+?)(?:\s*\n|$)/i,
      /\bde\s+la\s+part\s+de\s+(.+?)(?:\s*\n|$)/i,
      /(.+?)\s+vous\s+a\s+envoy[ée]\s+de\s+l['’]argent/i,
      /vous\s+avez\s+re[çc]u\s+[0-9]+(?:[,.][0-9]{1,2})?\s*(?:€|eur)\s+de\s+(.+?)(?:\s*\n|$|\.)/i,
      /\bde\s*:\s*(.+?)(?:\s*\n|$)/i,
    ]
    for (const pattern of patterns) {
      const match = text.match(pattern)
      const name = match?.[1] ? cleanPayerName(match[1]) : ""
      if (isUsablePayerName(name)) return name
    }
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

function normalizeMatchName(value: string | null | undefined) {
  return normalizePaymentAlias(value)
    .replace(/\b(m|mr|mme|mlle|mle|monsieur|madame|mademoiselle)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function similarity(left: string, right: string) {
  const a = normalizeMatchName(left)
  const b = normalizeMatchName(right)
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
  let ambiguous = false
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
      ambiguous = false
    } else if (best && score >= 0.45 && Math.abs(score - best.score) < 0.001 && candidate.studentId !== best.studentId) {
      ambiguous = true
    }
  }
  return best && best.score >= 0.45 && !ambiguous ? best : null
}

type CertainPendingPayment = {
  id: string
  amount: number
  dueDate: Date | null
  emailSentAt: Date | null
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
    paymentRequestedAt: Date | null
  } | null
}

async function findCertainPendingPayment({
  tenantId,
  amount,
  paymentDate,
  studentId,
  score,
}: {
  tenantId: string
  amount: number
  paymentDate?: Date | null
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
      lessonSession: { select: { id: true, number: true, subject: true, paymentRequestedAt: true, teacher: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  })

  const matchingAmount = pendingPayments.filter((payment) => {
    const expected = payment.expectedAmount ?? payment.student.monthlyFee
    const amountOk = Math.abs(expected - amount) <= 0.5
    const requestDate = payment.emailSentAt ?? payment.lessonSession?.paymentRequestedAt ?? null
    const dateOk = !paymentDate || !requestDate || paymentDate >= requestDate
    return amountOk && dateOk
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
  // Recherche ciblée : nom du payeur cherché dans Gmail, sans borne de date,
  // pour retrouver les paiements PayPal/Wise d'une personne précise.
  payerQuery?: string | null
}

function sanitizeGmailPhrase(value: string) {
  // On garde lettres/chiffres/espaces/apostrophes/tirets, on retire les
  // caractères d'opérateur Gmail (:, (), «, », ", -) qui casseraient la requête.
  return value.replace(/["():<>{}]/g, " ").replace(/\s+/g, " ").trim()
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

function paymentProviderQuery(manualImport: boolean, payerQuery: string) {
  if (payerQuery) return "(paypal OR wise OR transferwise)"
  if (manualImport) return ""
  return `(${[
    ...PAYPAL_PAYMENT_SENDERS.map((sender) => `from:${sender}`),
    ...WISE_PAYMENT_SENDERS.map((sender) => `from:${sender}`),
    "paypal",
    "wise",
    "transferwise",
  ].join(" OR ")})`
}

export async function scanPaymentEmails(tenantId: string, options: ScanPaymentEmailsOptions = {}) {
  await ensurePaymentScanSettingsColumns()
  await ensurePaymentAliasSchema()
  await ensureDirectorPayerAliasSchema()
  await ensurePaymentMatchReferenceColumn()
  const requireEnabled = options.requireEnabled ?? true
  const autoConfirmEnabled = process.env.PAYMENT_SCAN_AUTO_CONFIRM === "true"
  const scanSettings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { paymentScanEnabled: true, paymentScanStartedAt: true },
  })
  const payerQuery = sanitizeGmailPhrase(options.payerQuery ?? "")
  // Une recherche par nom balaie toute la boîte (pas de borne de date) et ne
  // garde que PayPal/Wise, comme l'import manuel.
  const broadImport = (options.manualImport ?? false) || Boolean(payerQuery)
  const startedAt = payerQuery ? null : (options.startedAt ?? scanSettings?.paymentScanStartedAt ?? null)
  const endedAt = payerQuery ? null : (options.endedAt ?? null)
  const manualImport = broadImport
  if (requireEnabled && !scanSettings?.paymentScanEnabled) {
    return { ok: true, disabled: true, created: 0, updated: 0, skipped: 0, scanned: 0 }
  }
  if (requireEnabled && !startedAt) {
    return { ok: true, disabled: true, created: 0, updated: 0, skipped: 0, scanned: 0 }
  }

  const gmail = await getGmailClient(tenantId)
  const paymentEmail = process.env.PAYMENT_EMAIL ?? process.env.GMAIL_PAYMENT_USER ?? process.env.FACTURATION_EMAIL ?? DEFAULT_FACTURATION_EMAIL
  const query = [
    payerQuery ? `"${payerQuery}"` : "",
    startedAt ? afterDateQuery(startedAt) : (payerQuery ? "" : "newer_than:45d"),
    endedAt ? beforeDateQuery(endedAt) : "",
    paymentProviderQuery(manualImport, payerQuery),
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
    // Mails internes de l'institut (récap quotidien, notifications maison…) : un
    // vrai paiement vient TOUJOURS de paypal.fr / wise.com, jamais d'une adresse
    // « institutassahaba ». Leur tableau récap contient « Montant reçu » + « PayPal »
    // et piégeait detectSource → faux paiements « Payeur non détecté » 28 €.
    if (/institut\.?assahaba/i.test(fromHeader) || /r[ée]capitulatif\s+paiements/i.test(subject)) {
      ignored += 1
      continue
    }
    // Corps nettoyé « à la Gmail » (getPlainBody) : le sujet reste sur sa
    // propre ligne (le nom Wise vient du sujet, borné par le saut de ligne).
    const bodyText = readEmailBody(full.data.payload)
    const combined = `${subject}\n${full.data.snippet ?? ""}\n${bodyText}`
    const source = detectSource(combined, fromHeader)
    // On ne garde QUE les vrais encaissements PayPal/Wise : ni virement bancaire,
    // ni mail de récap interne (« Récapitulatif paiements »), ni PayPal SORTANT
    // (« Vous avez envoyé »). Ce filtre s'applique à TOUS les scans (avant, il ne
    // valait qu'en import manuel → d'où les lignes « Payeur non détecté » 28 €).
    if (!["PAYPAL", "WISE"].includes(source)) {
      ignored += 1
      continue
    }
    if (source === "PAYPAL" && isOutgoingPaypal(subject, combined)) {
      ignored += 1
      continue
    }
    const amount = extractAmount(combined)
    if (!amount) {
      ignored += 1
      continue
    }
    // Verrou anti-doublon = l'ID Gmail RÉEL du message (unique par nature).
    // La « référence » lisible (n° de transfert Wise / transaction PayPal) devient
    // un simple champ affiché/cherchable, plus jamais la clé — fini les paiements
    // avalés à cause de deux mails partageant la même référence extraite.
    const gmailId = message.id
    const extractedReference = extractReference(source, combined, "")
    const paymentReference = extractedReference || null
    const reference = extractedReference || `gmail:${gmailId}` // conservé pour lier le Payment
    const detectedPayerName = extractPayerName(source, combined, fromHeader)
    const paymentLabel = extractLabel(subject, combined)
    // On retrouve la ligne existante par le nouvel ID Gmail, mais aussi par les
    // anciennes clés (référence extraite, ou repli « gmail:<id> ») pour migrer les
    // lignes déjà en base sans jamais créer de doublon.
    const legacyKeys = [gmailId, `gmail:${gmailId}`, extractedReference].filter(Boolean) as string[]
    const existing = await prisma.paymentMatch.findFirst({
      where: { tenantId, gmailMessageId: { in: legacyKeys } },
      select: {
        id: true,
        status: true,
        source: true,
        gmailMessageId: true,
        receivedAmount: true,
        detectedPayerName: true,
        paymentReference: true,
        paymentLabel: true,
        studentId: true,
      },
    })
    if (existing) {
      // La migration de clé (ancienne réf → ID Gmail réel) s'applique à tous les
      // statuts sans jamais toucher aux autres champs.
      const needsKeyMigration = existing.gmailMessageId !== gmailId

      const isOpenMatch = existing.status === "TO_VERIFY"
      const isTrashed = existing.status === "TRASHED"
      if (isOpenMatch || isTrashed) {
        // Paiement NON validé (« à associer ») OU en corbeille : le rescan le
        // RÉ-EXTRAIT entièrement avec le parser courant et ÉCRASE les anciennes
        // valeurs (nom, montant, source, libellé). C'est ce qui permet aux
        // corrections de parsing de rattraper les vieilles lignes (« bicubic »,
        // montant du sujet au lieu du corps, « MR OU MME » collé au nom…).
        // Une ligne en corbeille RESTE en corbeille : on ne re-suggère pas
        // d'élève et on ne touche pas à son motif « supprimé ». Les paiements
        // validés / auto-validés / directeur ne passent JAMAIS ici.
        const nameChanged = (existing.detectedPayerName ?? null) !== (detectedPayerName ?? null)
        const labelChanged = (existing.paymentLabel ?? null) !== (paymentLabel ?? null)
        const sourceChanged = existing.source !== source
        const amountChanged = Math.abs(Number(existing.receivedAmount) - amount) > 0.01
        const referenceChanged = Boolean(paymentReference) && existing.paymentReference !== paymentReference

        if (needsKeyMigration || nameChanged || labelChanged || sourceChanged || amountChanged || referenceChanged) {
          // La suggestion d'élève n'est recalculée que pour un « à associer »
          // (jamais pour la corbeille) quand le nom / libellé change — et remise
          // à zéro si plus aucune correspondance, pour ne pas garder une
          // association fantôme issue de l'ancien nom erroné.
          const suggestion = isOpenMatch && (nameChanged || labelChanged)
            ? await suggestStudentForPayment(tenantId, source, detectedPayerName, paymentLabel)
            : null
          await prisma.paymentMatch.update({
            where: { id: existing.id },
            data: {
              ...(needsKeyMigration ? { gmailMessageId: gmailId } : {}),
              source,
              receivedAmount: amount,
              detectedPayerName,
              paymentLabel,
              ...(referenceChanged ? { paymentReference } : {}),
              ...(isOpenMatch && (nameChanged || labelChanged)
                ? {
                    studentId: suggestion?.studentId ?? null,
                    score: suggestion?.score ?? null,
                    reason: suggestion?.reason ?? "Paiement détecté par email, à associer.",
                  }
                : {}),
            },
          })
          if (nameChanged || labelChanged || sourceChanged || amountChanged || referenceChanged) updated += 1
          else skipped += 1
          continue
        }
        skipped += 1
        continue
      }

      // Statuts protégés (validé / auto-validé / directeur) : on
      // COMPLÈTE uniquement les champs vides, jamais d'écrasement.
      const needsReference = !existing.paymentReference && Boolean(paymentReference)
      const canBackfillName = !existing.detectedPayerName && Boolean(detectedPayerName)
      const needsLabel = !existing.paymentLabel && Boolean(paymentLabel)
      if (needsKeyMigration || needsReference || canBackfillName || needsLabel) {
        await prisma.paymentMatch.update({
          where: { id: existing.id },
          data: {
            ...(needsKeyMigration ? { gmailMessageId: gmailId } : {}),
            ...(needsReference ? { paymentReference } : {}),
            ...(canBackfillName ? { detectedPayerName } : {}),
            ...(needsLabel ? { paymentLabel } : {}),
          },
        })
        if (canBackfillName || needsReference || needsLabel) updated += 1
        else skipped += 1
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
          gmailMessageId: gmailId,
          paymentReference,
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
    const paymentDate = dateHeader ? new Date(dateHeader) : null
    const certainPendingPayment = await findCertainPendingPayment({
      tenantId,
      amount,
      paymentDate,
      studentId: suggestion?.studentId,
      score: suggestion?.score,
    })
    const autoConfirmedPayment = autoConfirmEnabled ? await autoConfirmIfCertain({
      tenantId,
      source,
      reference,
      amount,
      paymentDate,
      detectedPayerName,
      studentId: suggestion?.studentId,
      score: suggestion?.score,
    }) : null
    await prisma.paymentMatch.create({
      data: {
        tenantId,
        source,
        gmailMessageId: gmailId,
        paymentReference,
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
