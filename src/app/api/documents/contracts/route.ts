import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadToDrive } from "@/lib/google-drive"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json([], { status: 401 })
  const user = session.user

  const contracts = await prisma.teacherContract.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, teacherId: true, title: true, driveUrl: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" },
  })
  return NextResponse.json(contracts)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Accès refusé" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const title = formData.get("title") as string
  const teacherId = formData.get("teacherId") as string

  if (!file || !title || !teacherId) {
    return NextResponse.json({ error: "Fichier, titre et professeur requis" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { fileId, url } = await uploadToDrive(buffer, `${title} - ${file.name}`, file.type || "application/pdf")

  const contract = await prisma.teacherContract.create({
    data: {
      tenantId: user.tenantId,
      teacherId,
      title,
      driveFileId: fileId,
      driveUrl: url,
    },
  })

  return NextResponse.json(contract)
}
