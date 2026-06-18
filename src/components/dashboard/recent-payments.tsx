import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate, getMonthName } from "@/lib/utils"

const STATUS_CONFIG = {
  PAID: { label: "Payé", variant: "success" as const },
  PENDING: { label: "En attente", variant: "warning" as const },
  LATE: { label: "En retard", variant: "destructive" as const },
  EXEMPTED: { label: "Exonéré", variant: "secondary" as const },
}

interface Payment {
  id: string
  amount: number
  status: string
  month: number
  year: number
  paidDate: Date | null
  student: { firstName: string; lastName: string }
}

export function RecentPayments({ payments }: { payments: Payment[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Derniers paiements</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun paiement enregistré</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => {
              const cfg = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] ?? { label: p.status, variant: "secondary" as const }
              return (
                <div key={p.id} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {p.student.firstName} {p.student.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {getMonthName(p.month)} {p.year}
                      {p.paidDate && ` · ${formatDate(p.paidDate)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(p.amount)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
