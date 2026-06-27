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
  /** true quand le directeur consulte l'espace d'un professeur. */
  impersonating: boolean
  realRole: string
  realName: string
}

/**
 * Renvoie l'utilisateur "effectif" pour le filtrage des pages.
 * Si le directeur a activé "Voir comme <prof>", renvoie le prof (rôle TEACHER)
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

  // Seul le directeur peut consulter l'espace d'un professeur.
  if (u.role !== "DIRECTOR") return base

  const cookieStore = await cookies()
  const teacherId = cookieStore.get(VIEW_AS_COOKIE)?.value
  if (!teacherId) return base

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, tenantId: u.tenantId, role: "TEACHER", isActive: true },
    select: { id: true, name: true, email: true },
  })
  if (!teacher) return base

  return {
    ...base,
    id: teacher.id,
    role: "TEACHER",
    name: teacher.name,
    email: teacher.email,
    impersonating: true,
  }
}
