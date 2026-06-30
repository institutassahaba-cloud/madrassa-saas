import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { syncPaymentAliasesFromNewTdb } from "@/lib/new-tdb-payment-aliases"

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const result = await syncPaymentAliasesFromNewTdb(session.user.tenantId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[payments] sync tdb aliases failed:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Synchronisation NEW TDB impossible." },
      { status: 500 },
    )
  }
}
