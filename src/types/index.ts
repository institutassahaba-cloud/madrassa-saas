import type { Role } from "@prisma/client"

export type { Role }

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  tenantId: string
  tenantSlug: string
  tenantName: string
}

export interface DashboardStats {
  totalStudents: number
  activeStudents: number
  latePayments: number
  monthlyRevenue: number
  pendingSalaries: number
  totalTeachers: number
  attendanceRate: number
  averageGrade: number
}

export interface PaymentWithStudent {
  id: string
  amount: number
  status: string
  month: number
  year: number
  paidDate: Date | null
  student: {
    id: string
    firstName: string
    lastName: string
  }
}
