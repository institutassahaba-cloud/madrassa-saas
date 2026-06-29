import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { scanPaymentEmails } from "@/lib/payment-email-reader"
import { ensurePaymentMatchLabelColumn } from "@/lib/payment-match-schema"

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  try {
    await ensurePaymentMatchLabelColumn()
    const result = await scanPaymentEmails(session.user.tenantId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[gmail] scan failed:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lecture Gmail impossible." },
      { status: 500 },
    )
  }
}
