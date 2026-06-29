import { prisma } from "@/lib/prisma"

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
