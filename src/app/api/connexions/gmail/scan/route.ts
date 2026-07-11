import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { scanPaymentEmails } from "@/lib/payment-email-reader"
import { ensurePaymentMatchLabelColumn } from "@/lib/payment-match-schema"
import { wrap } from "@/lib/api"

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const dateFrom = parseDate(body.dateFrom)
    const dateTo = parseDate(body.dateTo)
    if (dateFrom && dateTo && dateTo < dateFrom) {
      return NextResponse.json({ error: "La date de fin doit être après la date de début." }, { status: 400 })
    }

    await ensurePaymentMatchLabelColumn()
    const result = dateFrom || dateTo
      ? await scanPaymentEmails(session.user.tenantId, {
        requireEnabled: false,
        startedAt: dateFrom,
        endedAt: dateTo,
        manualImport: true,
      })
      : await scanPaymentEmails(session.user.tenantId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[gmail] scan failed:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lecture Gmail impossible." },
      { status: 500 },
    )
  }
})
