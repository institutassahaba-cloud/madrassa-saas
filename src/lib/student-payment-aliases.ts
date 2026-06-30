import { prisma } from "@/lib/prisma"
import { ensurePaymentAliasSchema, normalizePaymentAlias } from "@/lib/payment-alias-schema"

type AliasInput = {
  type?: string | null
  alias?: string | null
}

function normalizeType(type: string | null | undefined) {
  if (type === "PAYPAL" || type === "WISE") return type
  return "ANY"
}

export async function replaceStudentPaymentAliases(tenantId: string, studentId: string, aliases: AliasInput[] | undefined) {
  if (!Array.isArray(aliases)) return
  await ensurePaymentAliasSchema()

  const cleanAliases = aliases
    .map((item) => ({
      type: normalizeType(item.type),
      alias: (item.alias || "").trim(),
    }))
    .filter((item) => item.alias.length > 0)

  const unique = new Map<string, { type: string; alias: string; normalized: string }>()
  for (const item of cleanAliases) {
    const normalized = normalizePaymentAlias(item.alias)
    if (!normalized) continue
    unique.set(`${item.type}:${normalized}`, { ...item, normalized })
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentAlias.deleteMany({ where: { tenantId, studentId } })

    for (const item of unique.values()) {
      await tx.paymentAlias.upsert({
        where: {
          tenantId_studentId_type_normalized: {
            tenantId,
            studentId,
            type: item.type,
            normalized: item.normalized,
          },
        },
        create: {
          tenantId,
          studentId,
          type: item.type,
          alias: item.alias,
          normalized: item.normalized,
          source: "MANUAL",
        },
        update: {
          alias: item.alias,
          source: "MANUAL",
        },
      })
    }

    const primary = [...unique.values()][0]
    await tx.student.update({
      where: { id: studentId },
      data: {
        payerName: primary?.alias ?? null,
        paymentType: primary && primary.type !== "ANY" ? primary.type : null,
      },
    })
  })
}
