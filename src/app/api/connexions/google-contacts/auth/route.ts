import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getGoogleContactsAuthUrl } from "@/lib/google-contacts"
import { wrap } from "@/lib/api"

export const GET = wrap(async () => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const url = getGoogleContactsAuthUrl()
  if (!url) return NextResponse.redirect(new URL("/dashboard/connexions?contacts=missing-config", process.env.NEXTAUTH_URL || "http://localhost:3000"))
  return NextResponse.redirect(url)
})
