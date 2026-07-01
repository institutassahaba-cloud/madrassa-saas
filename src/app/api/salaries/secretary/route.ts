import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PAYMENT_PAID_STATUSES } from "@/lib/payment-status"
import { wrap } from "@/lib/api"

export const POST = wrap(async (req: Request) => {
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
    const lastClosedSalary = await prisma.teacherSalary.findFirst({
      where: {
        tenantId,
        teacherId: sec.id,
        NOT: { month, year },
      },
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    })

    const since = lastClosedSalary?.periodEnd ?? new Date(2000, 0, 1)

    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        status: { in: [...PAYMENT_PAID_STATUSES] },
        OR: [
          { confirmedAt: { gt: since, lte: now } },
          { confirmedAt: null, createdAt: { gt: since, lte: now } },
        ],
      },
      select: {
        id: true,
        amount: true,
        method: true,
        reference: true,
        paidDate: true,
        confirmedAt: true,
        createdAt: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    const collectedTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
    const rate = 0.10
    const amount = +(collectedTotal * rate).toFixed(2)
    const paymentLines = payments.map((payment) => {
      const date = payment.paidDate ? payment.paidDate.toLocaleDateString("fr-FR") : "date inconnue"
      const closedAt = payment.confirmedAt ?? payment.createdAt
      const student = `${payment.student.firstName} ${payment.student.lastName}`.trim()
      const ref = payment.reference ? ` · réf. ${payment.reference}` : ""
      const method = payment.method ? ` · ${payment.method}` : ""
      return `${date} · ${student} · ${Number(payment.amount).toFixed(2)} €${method}${ref} · enregistré le ${closedAt.toLocaleString("fr-FR")}`
    })
    const notes = [
      `Commission secrétaire 10% sur ${collectedTotal.toFixed(2)} € encaissés.`,
      `Période clôturée du ${since.toLocaleString("fr-FR")} au ${now.toLocaleString("fr-FR")}.`,
      `${payments.length} paiement${payments.length > 1 ? "s" : ""} inclus.`,
      paymentLines.length > 0 ? `Détail :\n${paymentLines.join("\n")}` : "Aucun paiement inclus.",
    ].join("\n")

    const result = {
      secretaryId: sec.id,
      secretaryName: sec.name,
      collectedTotal,
      rate,
      amount,
      paymentCount: payments.length,
      periodStart: since.toISOString(),
      periodEnd: now.toISOString(),
    }

    if (body.confirm) {
      const commissionData = {
        tenantId,
        secretaryId: sec.id,
        month,
        year,
        collectedTotal,
        rate,
        amount,
        status: "PENDING",
        notes,
      }
      const existingCommission = await prisma.secretaryCommission.findUnique({
        where: { secretaryId_month_year: { secretaryId: sec.id, month, year } },
      })
      if (existingCommission) {
        await prisma.secretaryCommission.update({
          where: { id: existingCommission.id },
          data: commissionData,
        })
      } else {
        await prisma.secretaryCommission.create({
          data: commissionData,
        })
      }

      const salaryData = {
        tenantId,
        teacherId: sec.id,
        month,
        year,
        hoursWorked: null,
        lessonsCount: payments.length,
        totalAmount: amount,
        periodStart: since,
        periodEnd: now,
        status: "PENDING",
        notes,
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
})
