import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { MesDocumentsClient } from "./mes-documents-client"

export default async function MesDocumentsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user
  if (user.role !== "TEACHER") redirect("/dashboard")

  const salaries = await prisma.teacherSalary.findMany({
    where: { teacherId: user.id },
    select: {
      id: true,
      month: true,
      year: true,
      totalAmount: true,
      status: true,
      paidDate: true,
      createdAt: true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <MesDocumentsClient salaries={salaries as any} teacherName={user.name ?? ""} />
}
