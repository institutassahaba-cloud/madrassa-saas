import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getGmailAuthUrl } from "@/lib/payment-email-reader"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const url = getGmailAuthUrl()
  if (!url) return NextResponse.redirect(new URL("/dashboard/connexions?gmail=missing-config", process.env.NEXTAUTH_URL || "http://localhost:3000"))
  return NextResponse.redirect(url)
}
