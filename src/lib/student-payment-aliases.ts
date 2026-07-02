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

// Apprentissage : à la confirmation d'un paiement, on mémorise le nom du payeur
// détecté comme alias de l'élève (source CONFIRMED). Ainsi le paiement suivant
// du même payeur est suggéré à 100 %. N'écrase jamais un alias saisi à la main
// ou importé (MANUAL/TDB) : l'upsert ne met à jour `lastSeenAt` que si l'alias
// existant est déjà de source CONFIRMED.
export async function learnPaymentAliasFromConfirmation(
  tenantId: string,
  studentId: string,
  payerName: string | null | undefined,
  source: string,
) {
  const alias = (payerName ?? "").trim()
  const normalized = normalizePaymentAlias(alias)
  if (!alias || !normalized) return
  const type = normalizeType(source)
  await ensurePaymentAliasSchema()

  const existing = await prisma.paymentAlias.findUnique({
    where: { tenantId_studentId_type_normalized: { tenantId, studentId, type, normalized } },
    select: { source: true },
  })
  if (existing && existing.source !== "CONFIRMED") {
    // Alias déjà connu (manuel/TDB) : on ne le dégrade pas, on note juste le passage.
    await prisma.paymentAlias.update({
      where: { tenantId_studentId_type_normalized: { tenantId, studentId, type, normalized } },
      data: { lastSeenAt: new Date() },
    })
    return
  }
  await prisma.paymentAlias.upsert({
    where: { tenantId_studentId_type_normalized: { tenantId, studentId, type, normalized } },
    create: { tenantId, studentId, type, alias, normalized, source: "CONFIRMED", confidence: "EXACT", lastSeenAt: new Date() },
    update: { alias, lastSeenAt: new Date() },
  })
}

// Oubli : à l'annulation d'un paiement, on retire l'alias qu'on avait APPRIS
// de cette attribution (source CONFIRMED uniquement) pour ne pas répéter une
// erreur. Les alias saisis à la main / importés (MANUAL/TDB) sont préservés.
export async function forgetLearnedPaymentAlias(
  tenantId: string,
  studentId: string,
  payerName: string | null | undefined,
) {
  const normalized = normalizePaymentAlias((payerName ?? "").trim())
  if (!normalized) return
  await ensurePaymentAliasSchema()
  await prisma.paymentAlias.deleteMany({
    where: { tenantId, studentId, normalized, source: "CONFIRMED" },
  })
}
