import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeFile } from "fs/promises"
import path from "path"

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
  const title = formData.get("title") as string
  const level = formData.get("level") as string

  if (!file || !title || !level) {
    return NextResponse.json({ error: "Fichier, titre et niveau requis" }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const ext = path.extname(file.name) || ".pdf"
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const uploadDir = path.join(process.cwd(), "public", "uploads", "exams")
  const filePath = path.join(uploadDir, safeName)

  await writeFile(filePath, buffer)

  const examFile = await prisma.examFile.create({
    data: {
      tenantId: user.tenantId,
      title,
      level,
      fileName: file.name,
      fileUrl: `/uploads/exams/${safeName}`,
      fileSize: buffer.length,
      uploadedBy: user.name ?? user.email,
    },
  })

  return NextResponse.json(examFile, { status: 201 })
}
