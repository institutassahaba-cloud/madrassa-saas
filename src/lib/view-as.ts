import { cookies } from "next/headers"
import { auth } from "./auth"
import { prisma } from "./prisma"

export const VIEW_AS_COOKIE = "viewAsTeacher"

export type EffectiveUser = {
  id: string
  role: string
  name: string
  email: string
  tenantId: string
  tenantName: string
  /** true quand le directeur consulte l'espace d'un autre rôle. */
  impersonating: boolean
  realRole: string
  realName: string
}

/**
 * Renvoie l'utilisateur "effectif" pour le filtrage des pages.
 * Si le directeur a activé "Voir comme", renvoie l'utilisateur choisi
 * tout en conservant le rôle réel (realRole) pour l'affichage du bandeau.
 * Renvoie null si non connecté.
 */
export async function getEffectiveUser(): Promise<EffectiveUser | null> {
  const session = await auth()
  if (!session?.user) return null
  const u = session.user

  const base: EffectiveUser = {
    id: u.id,
    role: u.role,
    name: u.name ?? "",
    email: u.email ?? "",
    tenantId: u.tenantId,
    tenantName: u.tenantName,
    impersonating: false,
    realRole: u.role,
    realName: u.name ?? "",
  }

  // Seul le directeur peut consulter l'espace d'un autre rôle.
  if (u.role !== "DIRECTOR") return base

  const cookieStore = await cookies()
  const targetId = cookieStore.get(VIEW_AS_COOKIE)?.value
  if (!targetId) return base

  const target = await prisma.user.findFirst({
    where: { id: targetId, tenantId: u.tenantId, role: { in: ["TEACHER", "SECRETARY"] }, isActive: true },
    select: { id: true, name: true, email: true, role: true },
  })
  if (!target) return base

  return {
    ...base,
    id: target.id,
    role: target.role,
    name: target.name,
    email: target.email,
    impersonating: true,
  }
}
