import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { unlink } from "fs/promises"
import path from "path"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (!["DIRECTOR", "SECRETARY"].includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const exam = await prisma.examFile.findFirst({ where: { id, tenantId: user.tenantId } })
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    await unlink(path.join(process.cwd(), "public", exam.fileUrl))
  } catch {}

  await prisma.examFile.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
