"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type SubjectStat = {
  subject: string
  count: number
}

const SUBJECT_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#4b5563",
]

export function SubjectDistributionChart({ data }: { data: SubjectStat[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const chartData = data
    .filter((item) => item.count > 0)
    .map((item, index) => ({
      ...item,
      name: item.subject,
      value: item.count,
      percent: total > 0 ? Math.round((item.count / total) * 100) : 0,
      color: SUBJECT_COLORS[index % SUBJECT_COLORS.length],
    }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Élèves actifs par matière</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">Aucune matière renseignée</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(14rem,18rem)_1fr] lg:items-center">
            <div className="relative h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={96}
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={3}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.subject} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, item) => {
                      const payload = item.payload as { percent?: number }
                      return [`${value} élève${Number(value) > 1 ? "s" : ""} · ${payload.percent ?? 0}%`, "Répartition"]
                    }}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-900">{total}</p>
                  <p className="text-xs text-gray-500">élèves actifs</p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {chartData.map((item) => (
                <div key={item.subject} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-sm font-medium text-gray-800">{item.subject}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-900">{item.percent}%</p>
                    <p className="text-[11px] text-gray-400">{item.count}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
