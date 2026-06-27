"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Sidebar } from "@/components/layout/sidebar"
import { Topbar } from "@/components/layout/topbar"
import { ImpersonationBanner } from "@/components/layout/impersonation-banner"

interface DashboardShellProps {
  children: React.ReactNode
  role: string
  tenantName: string
  userName: string
  userEmail: string
  impersonating?: boolean
}

export function DashboardShell({
  children,
  role,
  tenantName,
  userName,
  userEmail,
  impersonating = false,
}: DashboardShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50">
      <div className="hidden md:flex">
        <Sidebar role={role} tenantName={tenantName} />
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-gray-900/35"
            aria-label="Fermer le menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(86vw,20rem)] max-w-full flex-col bg-white shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Fermer le menu"
              onClick={() => setMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar role={role} tenantName={tenantName} onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {impersonating && <ImpersonationBanner teacherName={userName} />}
        <Topbar
          userName={userName}
          userEmail={userEmail}
          title="MadrassaApp"
          onMenuClick={() => setMenuOpen(true)}
        />
        <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
