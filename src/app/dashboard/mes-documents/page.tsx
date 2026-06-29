import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getEffectiveUser } from "@/lib/view-as"
import { MesDocumentsClient } from "./mes-documents-client"

export default async function MesDocumentsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (!["TEACHER", "SECRETARY"].includes(user.role)) redirect("/dashboard")

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
