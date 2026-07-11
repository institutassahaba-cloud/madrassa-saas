import { prisma } from "@/lib/prisma"

let paymentReferenceColumnReady: Promise<void> | null = null

export function ensurePaymentMatchReferenceColumn() {
  paymentReferenceColumnReady ??= prisma
    .$executeRawUnsafe('ALTER TABLE "PaymentMatch" ADD COLUMN "paymentReference" TEXT')
    .then(() => undefined)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/duplicate column|already exists/i.test(message)) return
      throw error
    })

  return paymentReferenceColumnReady
}

let paymentLabelColumnReady: Promise<void> | null = null

export function ensurePaymentMatchLabelColumn() {
  paymentLabelColumnReady ??= prisma
    .$executeRawUnsafe('ALTER TABLE "PaymentMatch" ADD COLUMN "paymentLabel" TEXT')
    .then(() => undefined)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/duplicate column|already exists/i.test(message)) return
      throw error
    })

  return paymentLabelColumnReady
}
