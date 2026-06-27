import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { AssessmentsClient } from "./assessments-client"

export default async function AssessmentsPage() {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")

  const exams = await prisma.examFile.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ level: "asc" }, { createdAt: "desc" }],
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AssessmentsClient exams={exams as any} role={user.role} />
}
