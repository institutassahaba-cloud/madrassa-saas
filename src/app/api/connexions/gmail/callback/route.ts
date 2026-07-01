import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { saveGmailRefreshToken } from "@/lib/payment-email-reader"
import { wrap } from "@/lib/api"

function baseUrl(req: Request) {
  return process.env.NEXTAUTH_URL || new URL(req.url).origin
}

export const GET = wrap(async (req: Request) => {
  const session = await auth()
  const url = new URL(req.url)
  if (!session?.user) return NextResponse.redirect(new URL("/login", baseUrl(req)))
  if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
    return NextResponse.redirect(new URL("/dashboard", baseUrl(req)))
  }

  const code = url.searchParams.get("code")
  if (!code) return NextResponse.redirect(new URL("/dashboard/connexions?gmail=missing-code", baseUrl(req)))

  try {
    await saveGmailRefreshToken(session.user.tenantId, code)
    return NextResponse.redirect(new URL("/dashboard/connexions?gmail=connected", baseUrl(req)))
  } catch (error) {
    console.error("[gmail] callback failed:", error)
    return NextResponse.redirect(new URL("/dashboard/connexions?gmail=error", baseUrl(req)))
  }
})
