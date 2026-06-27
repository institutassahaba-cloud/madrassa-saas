import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getEffectiveUser } from "@/lib/view-as"
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

  return (
    <DashboardShell
      role={user.role}
      tenantName={user.tenantName}
      userName={user.name}
      userEmail={user.email}
      impersonating={user.impersonating}
    >
      {children}
    </DashboardShell>
  )
}
