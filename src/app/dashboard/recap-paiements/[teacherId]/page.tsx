import { notFound, redirect } from "next/navigation"
import { getEffectiveUser } from "@/lib/view-as"
import { getTeacherPayrollData } from "@/lib/teacher-payroll"
import { TeacherPayrollClient } from "./teacher-payroll-client"

export default async function TeacherPayrollPage({ params }: { params: Promise<{ teacherId: string }> }) {
  const user = await getEffectiveUser()
  if (!user) redirect("/login")
  if (user.role !== "DIRECTOR") redirect("/dashboard/recap-paiements")
  const { teacherId } = await params
  const payroll = await getTeacherPayrollData(user.tenantId, teacherId)
  if (!payroll) notFound()
  return <TeacherPayrollClient initialData={payroll} />
}
