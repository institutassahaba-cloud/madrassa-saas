"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, BookOpen, CreditCard,
  Calendar, BarChart3, Settings, GraduationCap, Banknote,
  Bell, ChevronRight, UserCircle, FileText, UserCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
type Role = "DIRECTOR" | "SECRETARY" | "TEACHER"

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles: Role[]
  badge?: number
}

const navItems: NavItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard, roles: ["DIRECTOR", "SECRETARY", "TEACHER"] },
  { label: "Fiches élèves", href: "/dashboard/students", icon: Users, roles: ["DIRECTOR", "SECRETARY"] },
  { label: "Professeurs", href: "/dashboard/teachers", icon: GraduationCap, roles: ["DIRECTOR", "SECRETARY"] },
  { label: "Mes élèves", href: "/dashboard/cahier", icon: BookOpen, roles: ["TEACHER"] },
  { label: "Mes documents", href: "/dashboard/mes-documents", icon: FileText, roles: ["TEACHER"] },
  { label: "Livres et contrôles", href: "/dashboard/assessments", icon: BookOpen, roles: ["DIRECTOR", "SECRETARY", "TEACHER"] },
  { label: "Paiements", href: "/dashboard/payments", icon: CreditCard, roles: ["DIRECTOR", "SECRETARY"] },
  { label: "Récap des paies", href: "/dashboard/recap-paiements", icon: Banknote, roles: ["DIRECTOR", "SECRETARY"] },
  { label: "Planning", href: "/dashboard/schedule", icon: Calendar, roles: ["DIRECTOR", "SECRETARY", "TEACHER"] },
  { label: "Connexions", href: "/dashboard/connexions", icon: UserCheck, roles: ["DIRECTOR", "SECRETARY"] },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell, roles: ["DIRECTOR", "SECRETARY"] },
  { label: "Documents", href: "/dashboard/documents", icon: FileText, roles: ["DIRECTOR", "SECRETARY"] },
  { label: "Paramètres", href: "/dashboard/settings", icon: Settings, roles: ["DIRECTOR"] },
  { label: "Changer mon mot de passe", href: "/dashboard/mon-compte", icon: UserCircle, roles: ["DIRECTOR", "SECRETARY", "TEACHER"] },
]

interface SidebarProps {
  role: string
  tenantName: string
}

export function Sidebar({ role, tenantName }: SidebarProps) {
  const pathname = usePathname()
  const filtered = navItems.filter((item) => item.roles.includes(role as Role))

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-100 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{tenantName}</p>
          <p className="text-xs text-gray-500">MadrassaApp</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {filtered.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-emerald-600" : "text-gray-400")} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="h-3 w-3 text-emerald-500" />}
            </Link>
          )
        })}
      </nav>

      {/* Role badge */}
      <div className="border-t border-gray-100 p-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">Connecté en tant que</p>
          <p className="text-xs font-semibold text-gray-700">
            {role === "DIRECTOR" ? "Directeur" : role === "SECRETARY" ? "Secrétaire" : "Professeur"}
          </p>
        </div>
      </div>
    </aside>
  )
}
