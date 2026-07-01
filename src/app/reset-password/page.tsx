import { ResetClient } from "./reset-client"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <ResetClient token={token ?? ""} />
}
