import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getEffectiveUser } from "@/lib/view-as"
import { notificationVisibilityWhere } from "@/lib/notifications"
import { DashboardShell } from "@/components/layout/dashboard-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { hasOnboarded: true },
  })

  if (!dbUser?.hasOnboarded) redirect("/bienvenue")

  // Utilisateur effectif : si le directeur a activé "Voir comme", le menu et
  // l'entête reflètent l'espace du professeur consulté.
  const user = (await getEffectiveUser())!
  const unreadNotifications = await prisma.notification.count({
    where: {
      ...notificationVisibilityWhere(user),
      status: { not: "READ" },
    },
  })
  const viewAsOptions = session.user.role === "DIRECTOR"
    ? await prisma.user.findMany({
        where: { tenantId: session.user.tenantId, role: { in: ["SECRETARY", "TEACHER"] }, isActive: true },
        select: { id: true, name: true, role: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      })
    : []

  return (
    <DashboardShell
      role={user.role}
      tenantName={user.tenantName}
      userName={user.name}
      userEmail={user.email}
      unreadNotifications={unreadNotifications}
      impersonating={user.impersonating}
      currentViewAsId={user.impersonating ? user.id : "DIRECTOR"}
      viewAsOptions={viewAsOptions.map((option) => ({
        id: option.id,
        label: option.name,
        role: option.role,
      }))}
    >
      {children}
    </DashboardShell>
  )
}
