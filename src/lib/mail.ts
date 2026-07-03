import nodemailer from "nodemailer"

const BREVO_API_KEY = process.env.BREVO_API_KEY ?? ""
const FROM_EMAIL = process.env.FROM_EMAIL ?? "contact@institut-assahaba.com"
const FROM_NAME = process.env.FROM_NAME ?? "Institut As-Sahaba"
const DEFAULT_COMPTA_EMAIL = "comptabilite.institutassahaba@gmail.com"

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  if (!BREVO_API_KEY) {
    console.warn("[mail] BREVO_API_KEY not set — email not sent to", to)
    console.warn("[mail] Subject:", subject)
    return { ok: false, reason: "no_api_key" }
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  })

  return { ok: res.ok, status: res.status }
}

// ─── SMTP Hostinger (compta) ──────────────────────────────────────────────────

function getComptaTransporter() {
  const user = process.env.COMPTA_EMAIL ?? process.env.GMAIL_COMPTA_USER ?? DEFAULT_COMPTA_EMAIL
  const host = process.env.COMPTA_SMTP_HOST ?? (user.endsWith("@gmail.com") ? "smtp.gmail.com" : "smtp.hostinger.com")
  const port = Number(process.env.COMPTA_SMTP_PORT ?? "465")
  const secure = (process.env.COMPTA_SMTP_SECURE ?? "true") !== "false"

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass: process.env.COMPTA_EMAIL_PASSWORD,
    },
  })
}

export async function sendComptaMail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const user = process.env.COMPTA_EMAIL ?? process.env.GMAIL_COMPTA_USER ?? DEFAULT_COMPTA_EMAIL
  if (!user || !process.env.COMPTA_EMAIL_PASSWORD) {
    console.warn("[mail] COMPTA_EMAIL not configured — email not sent to", to)
    return { ok: false, reason: "no_compta_config" }
  }
  const transporter = getComptaTransporter()
  await transporter.sendMail({
    from: `"Institut As-Sahaba — Comptabilité" <${user}>`,
    to,
    cc: user,
    subject,
    html,
  })
  return { ok: true }
}

// ─── Template fin de session ──────────────────────────────────────────────────

export function sessionEndEmailHtml({
  studentName,
  teacherName,
  subject,
  completedSessionNumber,
  nextSessionNumber,
  amount,
  paypalLink,
  paypalEmail,
  whatsappLink,
  comptaEmail,
}: {
  studentName: string
  teacherName: string
  subject: string
  completedSessionNumber: number
  nextSessionNumber: number
  amount: string
  paypalLink: string
  paypalEmail: string
  whatsappLink: string
  comptaEmail: string
}) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no" />
  <title>Demande de paiement</title>
  <style type="text/css">
    *{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
    body{margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
    table{border-collapse:collapse;margin:0 auto;}
    div,a,li,td{-webkit-text-size-adjust:none;}
    @media only screen and (max-width:600px){table[class=full]{width:100%!important;}}
  </style>
</head>
<body style="margin:0;padding:0;background:#FBF8F1;">
<table width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#FBF8F1" style="background:#FBF8F1;">
  <tbody>
  <tr>
    <td align="center" style="padding:32px 12px;">

      <table class="full" align="center" width="560" border="0" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E9F1F8;">
        <tbody>

        <!-- Bandeau / Logo -->
        <tr>
          <td align="center" bgcolor="#0C243C" style="background:#0C243C;padding:30px 20px 24px;">
            <img src="https://www.institut-assahaba.com/embleme-white.png" alt="Institut As-Sahaba" width="78" style="display:block;margin:0 auto 12px;width:78px;max-width:78px;height:auto;border:0;" />
            <div style="font-size:19px;letter-spacing:3px;color:#ffffff;font-weight:700;text-transform:uppercase;">Institut As-Sahaba</div>
            <div style="font-size:11px;letter-spacing:2px;color:#9CC0DD;margin-top:5px;text-transform:uppercase;">Comprendre · Apprendre · Progresser</div>
          </td>
        </tr>

        <!-- Titre -->
        <tr>
          <td align="center" style="padding:36px 32px 8px;font-size:22px;line-height:30px;color:#17456C;font-weight:700;">
            Demande de paiement pour la session ${completedSessionNumber}
          </td>
        </tr>

        <!-- Salam -->
        <tr>
          <td align="center" style="padding:6px 32px 0;font-size:17px;line-height:28px;color:#235A86;font-weight:600;" dir="rtl">
            السلام عليكم ورحمة الله وبركاته
          </td>
        </tr>

        <!-- Texte -->
        <tr>
          <td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
            Nous vous informons que votre session ${completedSessionNumber} est terminée.<br /><br />
            Afin de poursuivre les cours sans interruption, nous vous demandons donc le règlement de cette session. La session ${nextSessionNumber} est d'ores et déjà ouverte et pourra démarrer dès réception du paiement.
          </td>
        </tr>

        <!-- Détail de la demande -->
        <tr>
          <td style="padding:18px 36px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FC;border-radius:10px;border:1px solid #E9F1F8;">
              <tbody>
              <tr><td style="padding:16px 20px 4px;font-size:14px;font-weight:700;color:#17456C;">📋 Détail de la demande</td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">🧑‍🎓 Élève concerné : <strong>${studentName}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">👩‍🏫 Enseignant(e) : <strong>${teacherName}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">📘 Matière : <strong>${subject}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">📌 Session à régler : <strong>Session ${completedSessionNumber}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">➡️ Prochaine session : <strong>Session ${nextSessionNumber}</strong></td></tr>
              <tr><td style="padding:6px 20px 16px;font-size:14px;line-height:24px;color:#1A2440;">💶 Montant à régler : <strong>${amount} €</strong></td></tr>
              </tbody>
            </table>
          </td>
        </tr>

        <!-- Moyens de paiement -->
        <tr>
          <td style="padding:18px 36px 4px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF9EE;border-radius:10px;border:1px solid #F0E4CC;">
              <tbody>
              <tr><td style="padding:16px 20px 4px;font-size:14px;font-weight:700;color:#17456C;">💳 Paiement PayPal</td></tr>
              <tr><td style="padding:4px 20px;font-size:13px;color:#1A2440;">${paypalEmail}</td></tr>
              <tr>
                <td style="padding:10px 20px 16px;">
                  <a href="${paypalLink}" target="_blank" style="display:inline-block;padding:10px 22px;font-size:13px;font-weight:700;color:#ffffff;background:#17456C;text-decoration:none;border-radius:7px;">Accéder au paiement PayPal</a>
                </td>
              </tr>
              <tr><td style="padding:0 20px 12px;font-size:12px;color:#8A91A0;">⚠️ Merci de choisir l'option « entre proches » lors du paiement.</td></tr>
              <tr><td style="padding:0 20px 4px;font-size:14px;font-weight:700;color:#17456C;">📌 Virement bancaire</td></tr>
              <tr>
                <td style="padding:4px 20px 16px;font-size:13px;color:#1A2440;">
                  Disponible via WhatsApp 👉 <a href="${whatsappLink}" target="_blank" style="color:#235A86;font-weight:600;text-decoration:none;">Nous contacter</a>
                </td>
              </tr>
              </tbody>
            </table>
          </td>
        </tr>

        <!-- Preuve de paiement -->
        <tr>
          <td style="padding:18px 36px 8px;font-size:14px;line-height:24px;color:#1A2440;">
            📩 <strong>Merci d'envoyer votre preuve de paiement :</strong><br />
            — en répondant directement à ce mail<br />
            — ou à l'adresse : <a href="mailto:${comptaEmail}" style="color:#235A86;text-decoration:none;">${comptaEmail}</a>
          </td>
        </tr>

        <!-- Conclusion -->
        <tr>
          <td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
            Nous restons disponibles pour toute question.<br /><br />
            Qu'Allah vous préserve.
          </td>
        </tr>

        <tr><td height="14"></td></tr>

        <!-- Pied -->
        <tr>
          <td align="center" bgcolor="#F4EFE3" style="background:#F4EFE3;padding:20px 32px;font-size:12px;line-height:20px;color:#5C6577;">
            <strong style="color:#17456C;">Institut As-Sahaba</strong> — Sur la voie des Compagnons<br />
            <a href="https://www.institut-assahaba.com" target="_blank" style="color:#235A86;text-decoration:none;">www.institut-assahaba.com</a>
          </td>
        </tr>

        </tbody>
      </table>

    </td>
  </tr>
  </tbody>
</table>
</body>
</html>`
}

export function paymentThanksEmailHtml({
  studentName,
  teacherName,
  subject,
  amount,
  paidDate,
  method,
}: {
  studentName: string
  teacherName: string
  subject: string
  amount: string
  paidDate: string
  method: string
}) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no" />
  <title>Merci pour votre paiement</title>
  <style type="text/css">
    *{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
    body{margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;}
    table{border-collapse:collapse;margin:0 auto;}
    div,a,li,td{-webkit-text-size-adjust:none;}
    @media only screen and (max-width:600px){table[class=full]{width:100%!important;}}
  </style>
</head>
<body bgcolor="#F4EFE3" style="margin:0;padding:0;background:#F4EFE3;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4EFE3" style="background:#F4EFE3;">
  <tbody>
  <tr>
    <td align="center" style="padding:28px 12px;">

      <table class="full" width="620" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:620px;max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(12,36,60,.08);">
        <tbody>

        <tr>
          <td align="center" bgcolor="#0C243C" style="background:#0C243C;padding:30px 20px 24px;">
            <img src="https://www.institut-assahaba.com/embleme-white.png" alt="Institut As-Sahaba" width="78" style="display:block;margin:0 auto 12px;width:78px;max-width:78px;height:auto;border:0;" />
            <div style="font-size:19px;letter-spacing:3px;color:#ffffff;font-weight:700;text-transform:uppercase;">Institut As-Sahaba</div>
            <div style="font-size:11px;letter-spacing:2px;color:#9CC0DD;margin-top:5px;text-transform:uppercase;">Comprendre · Apprendre · Progresser</div>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:36px 32px 8px;font-size:22px;line-height:30px;color:#17456C;font-weight:700;">
            Paiement bien reçu
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:6px 32px 0;font-size:17px;line-height:28px;color:#235A86;font-weight:600;" dir="rtl">
            السلام عليكم ورحمة الله وبركاته
          </td>
        </tr>

        <tr>
          <td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
            Nous vous confirmons avec plaisir que votre paiement a bien été reçu et validé par la comptabilité.<br /><br />
            Qu&apos;Allah vous récompense pour votre confiance, vous mette la baraka dans vos biens, et facilite à ${studentName} un apprentissage bénéfique et sincère.
          </td>
        </tr>

        <tr>
          <td style="padding:18px 36px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FC;border-radius:10px;border:1px solid #E9F1F8;">
              <tbody>
              <tr><td style="padding:16px 20px 4px;font-size:14px;font-weight:700;color:#17456C;">Détail du paiement</td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">Élève concerné : <strong>${studentName}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">Enseignant(e) : <strong>${teacherName}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">Matière : <strong>${subject}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">Moyen : <strong>${method}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">Date : <strong>${paidDate}</strong></td></tr>
              <tr><td style="padding:6px 20px 16px;font-size:14px;line-height:24px;color:#1A2440;">Montant reçu : <strong>${amount} €</strong></td></tr>
              </tbody>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
            Nous restons disponibles pour toute question.<br /><br />
            Qu&apos;Allah vous préserve.
          </td>
        </tr>

        <tr><td height="14"></td></tr>

        <tr>
          <td align="center" bgcolor="#F4EFE3" style="background:#F4EFE3;padding:20px 32px;font-size:12px;line-height:20px;color:#5C6577;">
            <strong style="color:#17456C;">Institut As-Sahaba</strong> — Sur la voie des Compagnons<br />
            <a href="https://www.institut-assahaba.com" target="_blank" style="color:#235A86;text-decoration:none;">www.institut-assahaba.com</a>
          </td>
        </tr>

        </tbody>
      </table>

    </td>
  </tr>
  </tbody>
</table>
</body>
</html>`
}

export function generatePassword(length = 10): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
  let pwd = ""
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (const byte of array) pwd += chars[byte % chars.length]
  return pwd
}

export function welcomeEmailHtml(name: string, email: string, password: string, loginUrl: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #059669;">Bienvenue sur Institut Assahaba</h2>
      <p>Assalâmu ʿalaykum ${name},</p>
      <p>Votre compte a été créé. Voici vos identifiants :</p>
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Email :</strong> ${email}</p>
        <p style="margin: 4px 0;"><strong>Mot de passe provisoire :</strong> ${password}</p>
      </div>
      <p>Vous devrez changer votre mot de passe lors de votre première connexion.</p>
      <a href="${loginUrl}" style="display: inline-block; background: #059669; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">Se connecter</a>
      <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">Institut Assahaba</p>
    </div>
  `
}
