import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getEffectiveUser } from "@/lib/view-as"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { ImpersonationBanner } from "@/components/layout/impersonation-banner"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.hasOnboarded) redirect("/bienvenue")

  // Utilisateur effectif : si le directeur a activé "Voir comme", le menu et
  // l'entête reflètent l'espace du professeur consulté.
  const user = (await getEffectiveUser())!

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar role={user.role} tenantName={user.tenantName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {user.impersonating && <ImpersonationBanner teacherName={user.name} />}
        <Topbar
          userName={user.name}
          userEmail={user.email}
          title="MadrassaApp"
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
