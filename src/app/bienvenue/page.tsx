import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { BienvenueClient } from "./bienvenue-client"

export default async function BienvenuePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, hasOnboarded: true, contactEmail: true },
  })
  if (dbUser?.hasOnboarded) redirect("/dashboard")

  return (
    <BienvenueClient
      name={dbUser?.name ?? session.user.name ?? ""}
      currentEmail={dbUser?.contactEmail ?? ""}
    />
  )
}
