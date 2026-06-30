"use client"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { Bell, Loader2, LogOut, Menu } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getInitials } from "@/lib/utils"

type ViewAsOption = {
  id: string
  label: string
  role: string
}

interface TopbarProps {
  userName: string
  userEmail: string
  title: string
  unreadNotifications?: number
  onMenuClick?: () => void
  viewAsOptions?: ViewAsOption[]
  currentViewAsId?: string
}

function roleLabel(role: string) {
  if (role === "DIRECTOR") return "Directeur"
  if (role === "SECRETARY") return "Secrétaire"
  return "Professeur"
}

export function Topbar({
  userName,
  userEmail,
  title,
  unreadNotifications = 0,
  onMenuClick,
  viewAsOptions = [],
  currentViewAsId = "DIRECTOR",
}: TopbarProps) {
  const [switching, setSwitching] = useState(false)

  async function switchView(value: string) {
    setSwitching(true)
    if (value === "DIRECTOR") {
      await fetch("/api/view-as", { method: "DELETE" })
    } else {
      await fetch("/api/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: value }),
      })
    }
    window.location.href = "/dashboard"
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="truncate text-base font-semibold text-gray-900 sm:text-lg">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {viewAsOptions.length > 0 && (
          <div className="hidden items-center gap-2 lg:flex">
            {switching && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            <Select value={currentViewAsId} onValueChange={switchView} disabled={switching}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Changer de vue" />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                <SelectItem value="DIRECTOR">Directeur</SelectItem>
                {viewAsOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {roleLabel(option.role)} · {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button variant="ghost" size="icon" className="relative" asChild>
          <Link href="/dashboard/notifications" aria-label="Ouvrir les notifications">
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </Link>
        </Button>

        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5 sm:px-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
            {getInitials(userName)}
          </div>
          <div className="hidden max-w-36 sm:block lg:max-w-56">
            <p className="text-xs font-medium text-gray-900">{userName}</p>
            <p className="truncate text-xs text-gray-500">{userEmail}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Déconnexion"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
