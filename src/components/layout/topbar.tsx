"use client"
import { signOut } from "next-auth/react"
import { Bell, LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getInitials } from "@/lib/utils"

interface TopbarProps {
  userName: string
  userEmail: string
  title: string
}

export function Topbar({ userName, userEmail, title }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-100 bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </Button>

        <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
            {getInitials(userName)}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-gray-900">{userName}</p>
            <p className="text-xs text-gray-500">{userEmail}</p>
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
