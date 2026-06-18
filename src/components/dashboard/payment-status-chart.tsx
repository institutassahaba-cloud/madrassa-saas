"use client"
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const STATUS_LABELS: Record<string, string> = {
  PAID: "Payé",
  PENDING: "En attente",
  LATE: "En retard",
  EXEMPTED: "Exonéré",
}

const COLORS: Record<string, string> = {
  PAID: "#059669",
  PENDING: "#f59e0b",
  LATE: "#ef4444",
  EXEMPTED: "#6b7280",
}

interface PaymentStatusChartProps {
  data: { status: string; _count: number }[]
}

export function PaymentStatusChart({ data }: PaymentStatusChartProps) {
  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status] ?? d.status,
    value: d._count,
    color: COLORS[d.status] ?? "#94a3b8",
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Paiements du mois</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">Aucun paiement ce mois</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value">
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
