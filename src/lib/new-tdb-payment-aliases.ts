import path from "path"
import { google } from "googleapis"
import { prisma } from "@/lib/prisma"
import { ensurePaymentAliasSchema, normalizePaymentAlias } from "@/lib/payment-alias-schema"

const DEFAULT_NEW_TDB_ID = "1lgGhXaDxhRdtaZy21-MqTTbihapcv_ypPsl0UA4mZQM"
const DEFAULT_NEW_TDB_RANGE = "Tableau De Bord!A1:T900"

function getSheetsAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const credentialsJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

  if (credentialsJson || credentialsJsonBase64) {
    const raw = credentialsJsonBase64
      ? Buffer.from(credentialsJsonBase64, "base64").toString("utf8")
      : credentialsJson
    return new google.auth.GoogleAuth({ credentials: JSON.parse(raw!), scopes })
  }

  return new google.auth.GoogleAuth({
    keyFile: path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "./google-drive-credentials.json"),
    scopes,
  })
}

function parsePaymentAlias(rawValue: string | undefined) {
  const raw = (rawValue || "").trim()
  if (!raw) return null
  if (/^P\s*[:.]?\s*/i.test(raw)) {
    return { type: "PAYPAL", alias: raw.replace(/^P\s*[:.]?\s*/i, "").trim() }
  }
  if (/^V\s*[:.]?\s*/i.test(raw)) {
    return { type: "WISE", alias: raw.replace(/^V\s*[:.]?\s*/i, "").trim() }
  }
  return { type: "ANY", alias: raw }
}

function parseNumber(value: string | undefined) {
  const normalized = (value || "").replace(",", ".").replace(/[^\d.]/g, "")
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

export async function syncPaymentAliasesFromNewTdb(tenantId: string) {
  await ensurePaymentAliasSchema()
  const sheets = google.sheets({ version: "v4", auth: getSheetsAuth() })
  const spreadsheetId = process.env.NEW_TDB_SPREADSHEET_ID || DEFAULT_NEW_TDB_ID
  const range = process.env.NEW_TDB_RANGE || DEFAULT_NEW_TDB_RANGE
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  })

  const rows = res.data.values || []
  let seen = 0
  let updatedStudents = 0
  let upsertedAliases = 0
  let skipped = 0

  for (const row of rows) {
    const profCode = row[0] || ""
    const legacyId = row[3] || ""
    if (!/^PR\d{3}$/.test(profCode) || !/^EL\d+$/i.test(legacyId)) continue
    seen += 1

    const parsedAlias = parsePaymentAlias(row[12])
    if (!parsedAlias?.alias) {
      skipped += 1
      continue
    }

    const student = await prisma.student.findFirst({
      where: {
        tenantId,
        legacyId,
        group: { description: { contains: row[1] || "" } },
      },
      select: { id: true },
    }) || await prisma.student.findFirst({
      where: { tenantId, legacyId },
      select: { id: true },
    })

    if (!student) {
      skipped += 1
      continue
    }

    const normalized = normalizePaymentAlias(parsedAlias.alias)
    if (!normalized) {
      skipped += 1
      continue
    }

    await prisma.student.update({
      where: { id: student.id },
      data: {
        payerName: parsedAlias.alias,
        paymentType: parsedAlias.type === "ANY" ? null : parsedAlias.type,
        monthlyFee: parseNumber(row[9]) ?? undefined,
      },
    })
    updatedStudents += 1

    await prisma.paymentAlias.upsert({
      where: {
        tenantId_studentId_type_normalized: {
          tenantId,
          studentId: student.id,
          type: parsedAlias.type,
          normalized,
        },
      },
      create: {
        tenantId,
        studentId: student.id,
        type: parsedAlias.type,
        alias: parsedAlias.alias,
        normalized,
        source: "TDB",
      },
      update: {
        alias: parsedAlias.alias,
        source: "TDB",
      },
    })
    upsertedAliases += 1
  }

  return { ok: true, seen, updatedStudents, upsertedAliases, skipped }
}
