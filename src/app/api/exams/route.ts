import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadToDrive } from "@/lib/google-drive"

const MAX_PDF_SIZE = 25 * 1024 * 1024

function isGoogleDriveUrl(value: string) {
  try {
    const url = new URL(value)
    return ["drive.google.com", "docs.google.com"].includes(url.hostname)
  } catch {
    return false
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user

  const exams = await prisma.examFile.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ level: "asc" }, { createdAt: "desc" }],
  })
  return NextResponse.json(exams)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const title = String(formData.get("title") ?? "").trim()
  const level = String(formData.get("level") ?? "").trim()
  const fileUrl = String(formData.get("fileUrl") ?? "").trim()

  if (!title || !level) {
    return NextResponse.json({ error: "Titre et niveau requis" }, { status: 400 })
  }

  if (fileUrl) {
    if (!isGoogleDriveUrl(fileUrl)) {
      return NextResponse.json({ error: "Le lien doit être un lien Google Drive." }, { status: 400 })
    }

    const examFile = await prisma.examFile.create({
      data: {
        tenantId: user.tenantId,
        title,
        level,
        fileName: "Lien Google Drive",
        fileUrl,
        fileSize: null,
        uploadedBy: user.name ?? user.email,
      },
    })

    return NextResponse.json(examFile, { status: 201 })
  }

  if (!file) {
    return NextResponse.json({ error: "Fichier PDF ou lien Google Drive requis" }, { status: 400 })
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés" }, { status: 400 })
  }
  if (file.size > MAX_PDF_SIZE) {
    return NextResponse.json({ error: "Le PDF ne doit pas dépasser 25 Mo." }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  let uploaded: { url: string }
  try {
    uploaded = await uploadToDrive(
      buffer,
      `Livres et contrôles - ${title} - ${file.name}`,
      file.type || "application/pdf"
    )
  } catch (error) {
    console.error("[exams] Upload Google Drive impossible:", error)
    return NextResponse.json(
      { error: "Upload Google Drive impossible. Vérifiez la configuration Drive." },
      { status: 500 }
    )
  }

  const examFile = await prisma.examFile.create({
    data: {
      tenantId: user.tenantId,
      title,
      level,
      fileName: file.name,
      fileUrl: uploaded.url,
      fileSize: buffer.length,
      uploadedBy: user.name ?? user.email,
    },
  })

  return NextResponse.json(examFile, { status: 201 })
}
