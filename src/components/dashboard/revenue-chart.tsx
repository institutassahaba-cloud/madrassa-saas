"use client"
import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MONTHS_FR } from "@/lib/utils"

interface RevenueChartProps {
  tenantId: string
}

export function RevenueChart({ tenantId }: RevenueChartProps) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    fetch("/api/dashboard/revenue")
      .then((r) => r.json())
      .then(setData)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenus mensuels</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: any) => [`${value} €`, "Revenus"]}
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
            />
            <Bar dataKey="amount" fill="#059669" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
