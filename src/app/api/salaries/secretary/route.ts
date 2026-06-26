import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = session.user
  if (user.role !== "DIRECTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const tenantId = user.tenantId

  const secretaries = await prisma.user.findMany({
    where: { tenantId, role: "SECRETARY", isActive: true },
    select: { id: true, name: true },
  })

  if (secretaries.length === 0) {
    return NextResponse.json({ error: "Aucune secrétaire trouvée" }, { status: 404 })
  }

  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const results = []

  for (const sec of secretaries) {
    const lastCommission = await prisma.secretaryCommission.findFirst({
      where: { tenantId, secretaryId: sec.id },
      orderBy: { createdAt: "desc" },
    })

    const since = lastCommission?.createdAt ?? new Date(2000, 0, 1)

    const collected = await prisma.payment.aggregate({
      where: {
        tenantId,
        status: "PAID",
        paidDate: { gt: since, lte: now },
      },
      _sum: { amount: true },
    })

    const collectedTotal = Number(collected._sum.amount ?? 0)
    const rate = 0.10
    const amount = +(collectedTotal * rate).toFixed(2)

    const result = {
      secretaryId: sec.id,
      secretaryName: sec.name,
      collectedTotal,
      rate,
      amount,
      periodStart: since.toISOString(),
      periodEnd: now.toISOString(),
    }

    if (body.confirm) {
      await prisma.secretaryCommission.create({
        data: {
          tenantId,
          secretaryId: sec.id,
          month,
          year,
          collectedTotal,
          rate,
          amount,
          status: "PENDING",
        },
      })

      const salaryData = {
        tenantId,
        teacherId: sec.id,
        month,
        year,
        hoursWorked: null,
        lessonsCount: null,
        totalAmount: amount,
        periodStart: since,
        periodEnd: now,
        status: "PENDING",
        notes: `Commission 10% sur ${collectedTotal.toFixed(2)} € encaissés`,
      }
      const existing = await prisma.teacherSalary.findUnique({
        where: { teacherId_month_year: { teacherId: sec.id, month, year } },
      })
      if (existing) {
        await prisma.teacherSalary.update({ where: { id: existing.id }, data: salaryData })
      } else {
        await prisma.teacherSalary.create({ data: salaryData })
      }
    }

    results.push(result)
  }

  return NextResponse.json(results)
}
