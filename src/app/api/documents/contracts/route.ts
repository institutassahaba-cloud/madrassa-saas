import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadToDrive } from "@/lib/google-drive"
import { NextResponse } from "next/server"
import { wrap } from "@/lib/api"

export const GET = wrap(async () => {
  const session = await auth()
  if (!session?.user) return NextResponse.json([], { status: 401 })
  const user = session.user

  const contracts = await prisma.teacherContract.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, teacherId: true, title: true, driveUrl: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" },
  })
  return NextResponse.json(contracts)
})

export const POST = wrap(async (req: Request) => {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const title = formData.get("title") as string
  const teacherId = formData.get("teacherId") as string
  const documentType = String(formData.get("documentType") || "CONTRACT")

  if (!file || !title || !teacherId) {
    return NextResponse.json({ error: "Fichier, titre et membre requis" }, { status: 400 })
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Le document doit être un PDF." }, { status: 400 })
  }

  const teacher = await prisma.user.findFirst({
    where: {
      id: teacherId,
      tenantId: user.tenantId,
      role: { in: ["TEACHER", "SECRETARY"] },
      isActive: true,
    },
    select: { id: true },
  })
  if (!teacher) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 })

  const prefix = documentType === "PAYSLIP" ? "[FICHE_PAIE] " : documentType === "OTHER" ? "[AUTRE] " : ""
  const storedTitle = `${prefix}${title.trim()}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const { fileId, url } = await uploadToDrive(buffer, `${storedTitle} - ${file.name}`, file.type || "application/pdf")

  const contract = await prisma.teacherContract.create({
    data: {
      tenantId: user.tenantId,
      teacherId,
      title: storedTitle,
      driveFileId: fileId,
      driveUrl: url,
    },
  })

  return NextResponse.json(contract)
})
