import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { wrap } from "@/lib/api"
import { syncAllStudentGoogleContacts } from "@/lib/google-contacts"

export const POST = wrap(async () => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  try {
    const result = await syncAllStudentGoogleContacts(session.user.tenantId)
    return NextResponse.json({ ok: true, synced: result.synced })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
