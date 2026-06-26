import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { ConnexionsClient } from "./connexions-client"

export default async function ConnexionsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user
  if (user.role === "TEACHER") redirect("/dashboard")

  const members = await prisma.user.findMany({
    where: { tenantId: user.tenantId, role: { in: ["TEACHER", "SECRETARY"] } },
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
    orderBy: { lastLoginAt: { sort: "desc", nulls: "last" } },
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

  return <ConnexionsClient members={data} userRole={user.role} />
}
