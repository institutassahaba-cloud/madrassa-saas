export function gmailComposeLink(email: string | null | undefined): string | null {
  const to = email?.trim()
  if (!to) return null
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}`
}
