/**
 * Envoi d'email transactionnel via l'API Brevo.
 * Nécessite les variables d'environnement :
 *   BREVO_API_KEY   — clé API Brevo (xkeysib-...)
 *   BREVO_FROM_EMAIL (optionnel, défaut contact@institut-assahaba.com)
 *   BREVO_FROM_NAME  (optionnel, défaut "Institut As-Sahaba")
 */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn("[email] BREVO_API_KEY absente — email non envoyé:", opts.subject)
    return { ok: false, error: "Email non configuré (BREVO_API_KEY manquante)." }
  }

  const fromEmail = process.env.BREVO_FROM_EMAIL ?? "contact@institut-assahaba.com"
  const fromName = process.env.BREVO_FROM_NAME ?? "Institut As-Sahaba"

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
      }),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error("[email] Brevo erreur:", res.status, txt)
      return { ok: false, error: `Brevo ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    console.error("[email] Brevo exception:", e)
    return { ok: false, error: "Erreur réseau lors de l'envoi." }
  }
}
