import { Prisma } from "@prisma/client"

type TransactionClient = Prisma.TransactionClient

export async function snapshotTeacherSalary(
  tx: TransactionClient,
  salaryId: string,
  createdById?: string,
) {
  const salary = await tx.teacherSalary.findUnique({
    where: { id: salaryId },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      salaryLessons: { select: { lineId: true, lessonId: true }, orderBy: { createdAt: "asc" } },
    },
  })
  if (!salary) return null

  const latest = await tx.teacherSalaryRevision.findFirst({
    where: { salaryId },
    select: { revision: true },
    orderBy: { revision: "desc" },
  })

  return tx.teacherSalaryRevision.create({
    data: {
      tenantId: salary.tenantId,
      salaryId,
      revision: (latest?.revision ?? 0) + 1,
      totalAmount: salary.totalAmount,
      status: salary.status,
      paidDate: salary.paidDate,
      hoursWorked: salary.hoursWorked,
      lessonsCount: salary.lessonsCount,
      periodStart: salary.periodStart,
      periodEnd: salary.periodEnd,
      notes: salary.notes,
      createdById,
      snapshotJson: JSON.stringify({
        salary: {
          month: salary.month,
          year: salary.year,
          hourlyRate: salary.hourlyRate,
          fixedSalary: salary.fixedSalary,
          totalAmount: salary.totalAmount,
          status: salary.status,
          paidDate: salary.paidDate,
          hoursWorked: salary.hoursWorked,
          lessonsCount: salary.lessonsCount,
          periodStart: salary.periodStart,
          periodEnd: salary.periodEnd,
          notes: salary.notes,
        },
        lines: salary.lines,
        salaryLessons: salary.salaryLessons,
      }),
    },
  })
}
