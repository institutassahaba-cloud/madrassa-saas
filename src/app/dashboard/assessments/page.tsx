import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { AssessmentsClient } from "./assessments-client"

export default async function AssessmentsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user

  const exams = await prisma.examFile.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ level: "asc" }, { createdAt: "desc" }],
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AssessmentsClient exams={exams as any} role={user.role} />
}
