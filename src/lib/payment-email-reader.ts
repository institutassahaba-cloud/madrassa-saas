import { google } from "googleapis"
import { prisma } from "@/lib/prisma"

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
const DEFAULT_PAYMENT_EMAIL = "facturation.institutassahaba@gmail.com"

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
  await prisma.tenantSettings.upsert({
    where: { tenantId },
    create: { tenantId, gmailRefreshToken: tokens.refresh_token },
    update: { gmailRefreshToken: tokens.refresh_token },
  })
}

async function getGmailClient(tenantId: string) {
  const client = getOAuthClient()
  if (!client) throw new Error("Gmail OAuth non configuré.")
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { gmailRefreshToken: true },
  })
  const refreshToken = settings?.gmailRefreshToken || process.env.GMAIL_PAYMENT_REFRESH_TOKEN
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

function extractPayerName(text: string) {
  const patterns = [
    /(?:de|from|payeur|payer)\s*:\s*([A-Za-zÀ-ÿ' -]{3,80})/i,
    /([A-Za-zÀ-ÿ' -]{3,80})\s+(?:vous a envoyé|sent you|paid you)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function extractLabel(subject: string, text: string) {
  const labelMatch = text.match(/(?:libellé|note|message|motif|description|reference|référence)\s*:\s*([^.\n\r]{3,160})/i)
  return cleanText(labelMatch?.[1] || subject).slice(0, 180) || null
}

export async function scanPaymentEmails(tenantId: string) {
  const gmail = await getGmailClient(tenantId)
  const paymentEmail = process.env.PAYMENT_EMAIL ?? process.env.GMAIL_PAYMENT_USER ?? process.env.PAYPAL_EMAIL ?? DEFAULT_PAYMENT_EMAIL
  const query = [
    "newer_than:45d",
    "(paypal OR wise OR transferwise OR virement OR paiement OR payment)",
    paymentEmail ? `to:${paymentEmail}` : "",
  ].filter(Boolean).join(" ")

  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: 25,
    q: query,
  })
  const messages = list.data.messages ?? []
  let created = 0
  let skipped = 0

  for (const message of messages) {
    if (!message.id) continue
    const full = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    })
    const headers = full.data.payload?.headers ?? []
    const subject = headers.find((header) => header.name?.toLowerCase() === "subject")?.value ?? ""
    const dateHeader = headers.find((header) => header.name?.toLowerCase() === "date")?.value ?? ""
    const bodyText = cleanText(readPayloadText(full.data.payload))
    const combined = `${subject}\n${full.data.snippet ?? ""}\n${bodyText}`
    const source = detectSource(combined)
    const amount = extractAmount(combined)
    if (!amount) {
      skipped += 1
      continue
    }
    const reference = extractReference(source, combined, `gmail:${message.id}`)
    const existing = await prisma.paymentMatch.findUnique({
      where: { tenantId_gmailMessageId: { tenantId, gmailMessageId: reference } },
      select: { id: true },
    })
    if (existing) {
      skipped += 1
      continue
    }
    await prisma.paymentMatch.create({
      data: {
        tenantId,
        source,
        gmailMessageId: reference,
        receivedAmount: amount,
        detectedPayerName: extractPayerName(combined),
        paymentLabel: extractLabel(subject, combined),
        paymentDate: dateHeader ? new Date(dateHeader) : null,
        status: "TO_VERIFY",
        reason: "Paiement détecté par email, à associer.",
        rawSubject: subject || null,
      },
    })
    created += 1
  }

  return { ok: true, created, skipped, scanned: messages.length }
}
