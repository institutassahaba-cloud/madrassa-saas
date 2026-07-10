import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { wrap } from "@/lib/api"
import { syncAllStudentGoogleContacts } from "@/lib/google-contacts"

function friendlyContactsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const projectMatch = message.match(/project\s+(\d+)/i)
  const projectId = projectMatch?.[1]

  if (/people api.*disabled|people\.googleapis\.com|has not been used/i.test(message)) {
    const url = projectId
      ? `https://console.developers.google.com/apis/api/people.googleapis.com/overview?project=${projectId}`
      : "https://console.developers.google.com/apis/api/people.googleapis.com/overview"
    return `Google Contacts n'est pas encore activé sur le projet Google Cloud. Activez l'API People ici : ${url} puis attendez quelques minutes et relancez la synchronisation.`
  }

  return message
}

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const mode = body?.mode === "preview" ? "preview" : "sync"
    const createMissing = body?.createMissing !== false
    const result = await syncAllStudentGoogleContacts(session.user.tenantId, { mode, createMissing })
    return NextResponse.json({ ok: true, ...result })
  } catch (error: unknown) {
    return NextResponse.json({ error: friendlyContactsError(error) }, { status: 400 })
  }
})
