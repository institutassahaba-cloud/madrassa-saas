import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { MonCompteClient } from "./mon-compte-client"

export default async function MonComptePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const user = session.user

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true, name: true, email: true },
  })

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mon compte</h1>
      <p className="text-sm text-gray-500 mb-6">{dbUser?.name} — {dbUser?.email}</p>
      <MonCompteClient
        mustChangePassword={dbUser?.mustChangePassword ?? false}
        currentEmail={dbUser?.email ?? ""}
      />
    </div>
  )
}
