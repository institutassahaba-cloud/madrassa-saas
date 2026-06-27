import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { ConnexionsClient } from "./connexions-client"

const DEFAULT_PAYMENT_EMAIL = "facturation.institutassahaba@gmail.com"
const DEFAULT_COMPTA_EMAIL = "comptabilite.institutassahaba@gmail.com"

export default async function ConnexionsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (user.role === "TEACHER") redirect("/dashboard")

  const members = await prisma.user.findMany({
    where: { tenantId: user.tenantId, role: { in: ["TEACHER", "SECRETARY"] } },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
    orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
  })
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: user.tenantId },
    select: {
      gmailRefreshToken: true,
      smtpUser: true,
      smtpPassword: true,
      smtpFrom: true,
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = members.map((m: any) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    isActive: m.isActive,
    lastLoginAt: m.lastLoginAt ? new Date(m.lastLoginAt).toISOString() : null,
  }))

  const paymentEmail = process.env.PAYMENT_EMAIL ?? process.env.GMAIL_PAYMENT_USER ?? process.env.PAYPAL_EMAIL ?? DEFAULT_PAYMENT_EMAIL
  const comptaEmail = process.env.COMPTA_EMAIL ?? process.env.GMAIL_COMPTA_USER ?? settings?.smtpUser ?? settings?.smtpFrom ?? DEFAULT_COMPTA_EMAIL
  const mailStatus = {
    paymentInbox: {
      email: paymentEmail,
      connected: Boolean((process.env.PAYMENT_EMAIL_PASSWORD || process.env.GMAIL_PAYMENT_REFRESH_TOKEN || settings?.gmailRefreshToken) && paymentEmail),
    },
    compta: {
      email: comptaEmail,
      connected: Boolean(comptaEmail && (process.env.COMPTA_EMAIL_PASSWORD || settings?.smtpPassword)),
    },
  }

  return <ConnexionsClient members={data} userRole={user.role} mailStatus={mailStatus} />
}
