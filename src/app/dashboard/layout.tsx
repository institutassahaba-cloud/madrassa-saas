import { redirect } from "next/navigation"
import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentSession, getEffectiveUser } from "@/lib/view-as"
import { notificationVisibilityWhere } from "@/lib/notifications"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { touchUserActivity } from "@/lib/user-activity"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession()
  if (!session?.user) redirect("/login")

  // La mise à jour d'activité n'est pas nécessaire au rendu : elle s'exécute
  // après l'envoi de la page et ne bloque plus chaque navigation.
  after(() => touchUserActivity(session.user.id).catch(() => null))

  const [dbUser, user] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { hasOnboarded: true },
    }),
    getEffectiveUser(),
  ])

  if (!dbUser?.hasOnboarded) redirect("/bienvenue")

  // Utilisateur effectif : si le directeur a activé "Voir comme", le menu et
  // l'entête reflètent l'espace du professeur consulté.
  const effectiveUser = user!
  const [unreadNotifications, viewAsOptions] = await Promise.all([
    prisma.notification.count({
      where: {
        ...notificationVisibilityWhere(effectiveUser),
        status: { not: "READ" },
      },
    }),
    session.user.role === "DIRECTOR"
      ? prisma.user.findMany({
        where: { tenantId: session.user.tenantId, role: { in: ["SECRETARY", "TEACHER"] }, isActive: true },
        select: { id: true, name: true, role: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      })
      : Promise.resolve([]),
  ])

  return (
    <DashboardShell
      role={effectiveUser.role}
      tenantName={effectiveUser.tenantName}
      userName={effectiveUser.name}
      userEmail={effectiveUser.email}
      unreadNotifications={unreadNotifications}
      impersonating={effectiveUser.impersonating}
      currentViewAsId={effectiveUser.impersonating ? effectiveUser.id : "DIRECTOR"}
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
