"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle2, Clock, CreditCard, MailCheck, Send, Settings, UserCheck, UserPlus, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Member {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  lastLoginAt: string | null
}

interface MailStatus {
  paymentInbox: { email: string; connected: boolean }
  contacts: { email: string; connected: boolean }
  compta: { email: string; connected: boolean }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `Il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Hier"
  if (days < 7) return `Il y a ${days} jours`
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`
  return `Il y a ${Math.floor(days / 30)} mois`
}

function statusColor(dateStr: string | null, isActive: boolean) {
  if (!isActive) return { bg: "bg-gray-100", dot: "bg-gray-400", label: "Désactivé" }
  if (!dateStr) return { bg: "bg-gray-100", dot: "bg-gray-400", label: "Jamais connecté(e)" }
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days < 3) return { bg: "bg-emerald-50", dot: "bg-emerald-500", label: "Actif" }
  if (days < 7) return { bg: "bg-amber-50", dot: "bg-amber-500", label: "Inactif récent" }
  return { bg: "bg-red-50", dot: "bg-red-500", label: "Inactif" }
}

function formatScanDiagnostics(data: {
  ignoredReasons?: Record<string, number>
  ignoredSamples?: Array<{ reason: string; from: string; subject: string; date: string | null }>
  skippedMatches?: Array<{ status: string; payerName: string | null; reference: string | null; amount: number }>
}) {
  const sections: string[] = []
  const entries = Object.entries(data.ignoredReasons ?? {}).filter(([, count]) => Number(count) > 0)
  if (entries.length > 0) {
    sections.push(`Détail des emails non exploitables :\n${entries
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([reason, count]) => `- ${count} : ${reason}`)
    .join("\n")}`)
  }
  if ((data.skippedMatches ?? []).length > 0) {
    sections.push(`Déjà connus trouvés :\n${data.skippedMatches!
      .map((item) => `- ${item.status} : ${item.payerName || "payeur inconnu"} · ${item.amount} € · ${item.reference || "sans référence"}`)
      .join("\n")}`)
  }
  if ((data.ignoredSamples ?? []).length > 0) {
    sections.push(`Exemples rejetés :\n${data.ignoredSamples!
      .map((item) => `- ${item.reason} · ${item.from || "expéditeur inconnu"} · ${item.subject || "sans sujet"}`)
      .join("\n")}`)
  }
  return sections.length ? `\n\n${sections.join("\n\n")}` : ""
}

function ConnectionState({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
      {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
      {connected ? "Connecté" : "À configurer"}
    </span>
  )
}

export function ConnexionsClient({ members: initial, userRole, mailStatus }: { members: Member[]; userRole: string; mailStatus: MailStatus }) {
  const [members, setMembers] = useState(initial)
  const [loading, setLoading] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)

  async function toggleActive(id: string, isActive: boolean) {
    if (isActive && !confirm("Désactiver ce compte ? Le membre ne pourra plus se connecter.")) return
    if (!isActive && !confirm("Réactiver ce compte ?")) return
    setLoading(id)
    try {
      await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      })
      setMembers((prev) => prev.map((m) => m.id === id ? { ...m, isActive: !isActive } : m))
    } finally {
      setLoading(null)
    }
  }

  async function sendComptaTest() {
    const to = prompt("Adresse email où envoyer le test compta :")
    if (to === null) return
    setTestLoading(true)
    try {
      const res = await fetch("/api/connexions/test-compta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || "L'envoi du test a échoué.")
        return
      }
      alert(`Mail de test compta envoyé à ${data.to}.`)
    } finally {
      setTestLoading(false)
    }
  }

  async function scanFacturationInbox() {
    setScanLoading(true)
    try {
      const res = await fetch("/api/connexions/gmail/scan", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || "Lecture de la boîte facturation impossible.")
        return
      }
      alert(`${data.created ?? 0} nouveau(x) paiement(s) détecté(s). ${data.updated ?? 0} complété(s) (nom rattrapé). ${data.skipped ?? 0} email(s) déjà connu(s). ${data.ignored ?? 0} email(s) non exploitable(s).${formatScanDiagnostics(data)}`)
      window.location.href = "/dashboard/payments"
    } finally {
      setScanLoading(false)
    }
  }

  async function syncStudentContacts(mode: "preview" | "update-only" | "sync") {
    setContactsLoading(true)
    try {
      const res = await fetch("/api/connexions/gmail/sync-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: mode === "preview" ? "preview" : "sync",
          createMissing: mode !== "update-only",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || "Synchronisation des contacts impossible.")
        return
      }
      const lines = [
        mode === "preview" ? "Aperçu de synchronisation :" : "Synchronisation terminée :",
        `${data.updated ?? 0} contact(s) à mettre à jour`,
        `${data.created ?? 0} contact(s) à créer`,
        `${data.skippedMissing ?? 0} contact(s) ignoré(s) car introuvables`,
        data.label ? `Libellé Google : ${data.label}` : "",
      ].filter(Boolean)
      if (mode === "preview" && Array.isArray(data.preview) && data.preview.length > 0) {
        lines.push("")
        lines.push("Exemples :")
        for (const item of data.preview.slice(0, 8)) {
          lines.push(`- ${item.expectedName}`)
        }
      }
      alert(lines.join("\n"))
    } finally {
      setContactsLoading(false)
    }
  }

  const active = members.filter((m) => m.isActive)
  const inactive = members.filter((m) => !m.isActive)

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Connexions</h1>
        <p className="text-sm text-gray-500 mt-0.5">Dernières connexions de l&apos;équipe</p>
      </div>

      {!mailStatus.contacts.connected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Pour créer et mettre à jour les contacts élèves dans Google Contacts, connectez d&apos;abord l&apos;adresse Google utilisée pour les contacts.
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Adresse facturation</h2>
                <p className="mt-0.5 text-xs text-gray-500">{mailStatus.paymentInbox.email || "Adresse non renseignée"}</p>
              </div>
            </div>
            <ConnectionState connected={mailStatus.paymentInbox.connected} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase text-gray-400">Boîte mail</p>
              <p className={`mt-1 text-xs font-semibold ${mailStatus.paymentInbox.connected ? "text-emerald-700" : "text-amber-700"}`}>
                {mailStatus.paymentInbox.connected ? "Lecture active" : "Non reliée"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase text-gray-400">Détection</p>
              <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${mailStatus.paymentInbox.connected ? "text-emerald-700" : "text-amber-700"}`}>
                <MailCheck className="h-3.5 w-3.5" />
                {mailStatus.paymentInbox.connected ? "Emails PayPal/Wise lisibles" : "En attente de connexion"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { window.location.href = "/api/connexions/gmail/auth" }}>
              <MailCheck className="h-3.5 w-3.5" />
              Connecter Gmail
            </Button>
            <Button size="sm" onClick={scanFacturationInbox} disabled={!mailStatus.paymentInbox.connected || scanLoading}>
              <CreditCard className="h-3.5 w-3.5" />
              {scanLoading ? "Scan..." : "Scanner les paiements"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Contacts Google</h2>
                <p className="mt-0.5 text-xs text-gray-500">{mailStatus.contacts.email || "Adresse Google non renseignée"}</p>
              </div>
            </div>
            <ConnectionState connected={mailStatus.contacts.connected} />
          </div>
          <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-medium uppercase text-gray-400">Contacts élèves</p>
            <p className={`mt-1 text-xs font-semibold ${mailStatus.contacts.connected ? "text-emerald-700" : "text-amber-700"}`}>
              {mailStatus.contacts.connected ? "Adresse connectée" : "Adresse à connecter"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Cette connexion permet de créer ou mettre à jour les fiches élèves dans Google Contacts.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { window.location.href = "/api/connexions/google-contacts/auth" }}>
              <MailCheck className="h-3.5 w-3.5" />
              Connecter l&apos;adresse contacts
            </Button>
            <Button size="sm" variant="outline" onClick={() => syncStudentContacts("preview")} disabled={!mailStatus.contacts.connected || contactsLoading}>
              <UserCheck className="h-3.5 w-3.5" />
              Aperçu
            </Button>
            <Button size="sm" variant="outline" onClick={() => syncStudentContacts("update-only")} disabled={!mailStatus.contacts.connected || contactsLoading}>
              <UserCheck className="h-3.5 w-3.5" />
              Mettre à jour seulement
            </Button>
            <Button size="sm" onClick={() => syncStudentContacts("sync")} disabled={!mailStatus.contacts.connected || contactsLoading}>
              <UserCheck className="h-3.5 w-3.5" />
              {contactsLoading ? "Synchronisation..." : "Synchroniser les contacts"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Adresse compta</h2>
                <p className="mt-0.5 text-xs text-gray-500">{mailStatus.compta.email || "Adresse non renseignée"}</p>
              </div>
            </div>
            <ConnectionState connected={mailStatus.compta.connected} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase text-gray-400">Renouvellements</p>
              <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${mailStatus.compta.connected ? "text-emerald-700" : "text-amber-700"}`}>
                <MailCheck className="h-3.5 w-3.5" />
                {mailStatus.compta.connected ? "Envoi possible" : "Envoi bloqué"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase text-gray-400">Test</p>
              <button
                type="button"
                onClick={sendComptaTest}
                disabled={testLoading}
                className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" />
                {testLoading ? "Envoi..." : "Envoyer un test"}
              </button>
            </div>
          </div>
          {userRole === "DIRECTOR" && (
            <button
              type="button"
              onClick={() => { window.location.href = "/dashboard/settings" }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-emerald-700"
            >
              <Settings className="h-3.5 w-3.5" />
              Paramètres
            </button>
          )}
        </div>
      </section>

      {members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <UserCheck className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-gray-400">Aucun membre</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {active.map((m) => {
              const status = statusColor(m.lastLoginAt, m.isActive)
              return (
                <div key={m.id} className={`flex flex-col gap-3 rounded-xl border border-gray-100 ${status.bg} p-4 sm:flex-row sm:items-center sm:gap-4`}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-gray-700 shadow-sm">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{m.name}</p>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-500">
                        {m.role === "TEACHER" ? "Professeur" : "Secrétaire"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="shrink-0 text-left sm:text-right">
                      <div className="flex items-center gap-1.5 sm:justify-end">
                        <div className={`h-2 w-2 rounded-full ${status.dot}`} />
                        <span className="text-xs font-medium text-gray-600">{status.label}</span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 sm:justify-end">
                        <Clock className="h-3 w-3" />
                        {m.lastLoginAt ? timeAgo(m.lastLoginAt) : "—"}
                      </p>
                    </div>
                    {userRole === "DIRECTOR" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        disabled={loading === m.id}
                        onClick={() => toggleActive(m.id, true)}
                      >
                        <UserX className="h-3 w-3 mr-1" />
                        Désactiver
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {inactive.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-3">Comptes désactivés ({inactive.length})</p>
              <div className="space-y-3">
                {inactive.map((m) => (
                  <div key={m.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 opacity-70 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-600">{m.name}</p>
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
                          {m.role === "TEACHER" ? "Professeur" : "Secrétaire"}
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">Désactivé</span>
                      </div>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </div>
                    {userRole === "DIRECTOR" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        disabled={loading === m.id}
                        onClick={() => toggleActive(m.id, false)}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Réactiver
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
