import { NextResponse } from "next/server"
import { createMonthlyTeacherTableReminder } from "@/lib/notifications"
import { wrap } from "@/lib/api"

export const GET = wrap(async (req: Request) => {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await createMonthlyTeacherTableReminder()
  return NextResponse.json({ message: "Rappels mensuels vérifiés", ...result })
})
