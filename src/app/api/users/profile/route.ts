import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { wrap } from "@/lib/api"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const PUT = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const data: { contactEmail?: string | null; phone?: string | null; name?: string } = {}

  if (body.contactEmail !== undefined) {
    const currentEmail = String(body.currentContactEmail || "").trim().toLowerCase()
    const newEmail = String(body.contactEmail || "").trim().toLowerCase()
    const confirmEmail = String(body.confirmContactEmail || "").trim().toLowerCase()
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { contactEmail: true, tenantId: true },
    })
    if (!dbUser) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
    if ((dbUser.contactEmail || "").toLowerCase() !== currentEmail) {
      return NextResponse.json({ error: "L'email actuel ne correspond pas." }, { status: 400 })
    }
    if (!EMAIL_RE.test(newEmail)) return NextResponse.json({ error: "Nouvelle adresse email invalide." }, { status: 400 })
    if (newEmail !== confirmEmail) return NextResponse.json({ error: "La vérification de l'email ne correspond pas." }, { status: 400 })

    const existing = await prisma.user.findFirst({
      where: { tenantId: dbUser.tenantId, contactEmail: newEmail, NOT: { id: session.user.id } },
      select: { id: true },
    })
    if (existing) return NextResponse.json({ error: "Cette adresse email est déjà utilisée." }, { status: 409 })
    data.contactEmail = newEmail
  }

  if (body.phone !== undefined) {
    const currentPhone = String(body.currentPhone || "").trim()
    const newPhone = String(body.phone || "").trim()
    const confirmPhone = String(body.confirmPhone || "").trim()
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true },
    })
    if (!dbUser) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 })
    if ((dbUser.phone || "").trim() !== currentPhone) {
      return NextResponse.json({ error: "Le téléphone actuel ne correspond pas." }, { status: 400 })
    }
    if (newPhone !== confirmPhone) return NextResponse.json({ error: "La vérification du téléphone ne correspond pas." }, { status: 400 })
    data.phone = newPhone || null
  }

  if (body.name !== undefined) {
    if (!["DIRECTOR", "SECRETARY"].includes(session.user.role)) {
      return NextResponse.json({ error: "Demande de validation requise." }, { status: 403 })
    }
    const name = String(body.name || "").trim()
    if (name.length < 2) return NextResponse.json({ error: "Pseudo trop court." }, { status: 400 })
    data.name = name
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Aucune donnée" }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, name: true, contactEmail: true, phone: true },
  })

  return NextResponse.json(updated)
})
