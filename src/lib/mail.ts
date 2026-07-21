import { existsSync } from "node:fs"
import path from "node:path"
import nodemailer from "nodemailer"
import type { Attachment } from "nodemailer/lib/mailer"
import { whatsappLink } from "@/lib/phone"

const BREVO_API_KEY = process.env.BREVO_API_KEY ?? ""
const FROM_EMAIL = process.env.FROM_EMAIL ?? "contact@institut-assahaba.com"
const FROM_NAME = process.env.FROM_NAME ?? "Institut As-Sahaba"
const DEFAULT_COMPTA_EMAIL = "comptabilite.institutassahaba@gmail.com"
const EMAIL_LOGO_CID = "logo-assahaba@institut-assahaba"
const EMAIL_LOGO_PATH = path.join(process.cwd(), "public", "logo-assahaba.png")
// URL publique du logo pour les e-mails envoyés via l'API Brevo (qui n'attache pas les
// images cid:). Le fichier public/logo-assahaba.png est servi à cette adresse.
const EMAIL_LOGO_URL = process.env.EMAIL_LOGO_URL ?? "https://madrassa-saas-umber.vercel.app/logo-assahaba.png"
const EMAIL_TAGLINE = "Sur les traces des compagnons"

// `useCid` = true pour les e-mails envoyés en SMTP (compta) : le logo est joint en
// image inline (cid:) par sendComptaMail, ce qui garantit son affichage même lorsque le
// client de messagerie bloque les images distantes. Les e-mails Brevo gardent l'URL
// distante (Brevo ne gère pas le cid: de façon fiable).
function emailHeaderHtml(useCid = false) {
  const logoSrc = useCid ? `cid:${EMAIL_LOGO_CID}` : EMAIL_LOGO_URL
  return `
          <td align="center" bgcolor="#0C243C" style="background:#0C243C;padding:30px 20px 24px;">
            <img src="${logoSrc}" alt="Institut As-Sahaba" width="96" style="display:block;margin:0 auto 12px;width:96px;max-width:96px;height:auto;border:0;border-radius:10px;background:#ffffff;" />
            <div style="font-size:19px;letter-spacing:3px;color:#ffffff;font-weight:700;text-transform:uppercase;">Institut As-Sahaba</div>
            <div style="font-size:11px;letter-spacing:1.6px;color:#9CC0DD;margin-top:5px;">${EMAIL_TAGLINE}</div>
          </td>`
}

function emailFooterHtml() {
  return `
            <strong style="color:#17456C;">Institut As-Sahaba</strong> — ${EMAIL_TAGLINE}<br />
            <a href="https://www.institut-assahaba.com" target="_blank" style="color:#235A86;text-decoration:none;">www.institut-assahaba.com</a>`
}

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

  // Logo joint en image inline (cid:) quand le template le référence. En local on lit le
  // fichier public/ ; sur Vercel (où public/ n'est pas sur le disque de la fonction)
  // nodemailer récupère l'URL côté serveur. Dans les deux cas l'image est embarquée dans
  // l'e-mail, donc affichée même si le client de messagerie bloque les images distantes.
  const logoAttachment: Attachment = {
    filename: "logo-assahaba.png",
    cid: EMAIL_LOGO_CID,
    ...(existsSync(EMAIL_LOGO_PATH) ? { path: EMAIL_LOGO_PATH } : { href: EMAIL_LOGO_URL }),
  }

  await transporter.sendMail({
    from: `"Institut As-Sahaba — Comptabilité" <${user}>`,
    to,
    cc: user,
    subject,
    html,
    attachments: html.includes(`cid:${EMAIL_LOGO_CID}`) ? [logoAttachment] : undefined,
  })
  return { ok: true }
}

// ─── Template fin de session ──────────────────────────────────────────────────

export function sessionEndEmailHtml({
  studentName,
  teacherName,
  subject,
  completedSessionNumber,
  requestedSessionNumber,
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
  requestedSessionNumber: number
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
${emailHeaderHtml(true)}
        </tr>

        <!-- Titre -->
        <tr>
          <td align="center" style="padding:36px 32px 8px;font-size:22px;line-height:30px;color:#17456C;font-weight:700;">
            Demande de paiement pour la session ${requestedSessionNumber}
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
            Afin de poursuivre les cours sans interruption, nous vous demandons donc le règlement de la session ${requestedSessionNumber}.
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
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">✅ Session terminée : <strong>Session ${completedSessionNumber}</strong></td></tr>
              <tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">📌 Session à régler : <strong>Session ${requestedSessionNumber}</strong></td></tr>
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
${emailFooterHtml()}
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
${emailHeaderHtml(true)}
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
${emailFooterHtml()}
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

// « Professeur de Coran », « Professeur de langue arabe »… Le libellé sert d'intitulé
// pour chaque enseignant listé dans l'e-mail de bienvenue.
export function subjectTeacherLabel(subject: string | null | undefined): string {
  const s = (subject ?? "").trim()
  if (!s) return "Professeur"
  return `Professeur de ${s}`
}

export type WelcomeCourse = {
  subject: string | null
  teacherName: string
  teacherPhone: string | null
  meetingLink: string | null
  // Libellé du prochain cours, ex. « dimanche 12 juillet à 10h00 » (optionnel).
  nextLesson?: string | null
}

// E-mail de bienvenue envoyé à l'inscription : accueil + coordonnées (WhatsApp + Zoom)
// de chaque professeur assigné, un bloc par matière.
export function studentWelcomeEmailHtml({
  studentName,
  courses,
  intro,
}: {
  studentName: string
  courses: WelcomeCourse[]
  // Message d'accueil personnalisé (saisi par le directeur). À défaut, message par défaut.
  intro?: string
}) {
  const escapeHtml = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  const waLink = (phone: string | null) =>
    whatsappLink(phone)
  const introHtml = (intro && intro.trim())
    ? escapeHtml(intro.trim()).replace(/\r?\n/g, "<br />")
    : `Nous sommes heureux d&apos;accueillir <strong>${escapeHtml(studentName)}</strong> à l&apos;Institut As-Sahaba.`

  const courseBlocks = courses.map((course) => {
    const label = escapeHtml(subjectTeacherLabel(course.subject))
    const wa = waLink(course.teacherPhone)
    const rows: string[] = [
      `<tr><td style="padding:16px 20px 4px;font-size:14px;font-weight:700;color:#17456C;">${label}</td></tr>`,
      `<tr><td style="padding:2px 20px;font-size:15px;line-height:24px;color:#1A2440;"><strong>${escapeHtml(course.teacherName)}</strong></td></tr>`,
    ]
    if (course.nextLesson) {
      rows.push(
        `<tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">📅 Prochain cours : <strong>${escapeHtml(course.nextLesson)}</strong></td></tr>`,
      )
    }
    if (wa) {
      rows.push(
        `<tr><td style="padding:6px 20px;font-size:14px;line-height:24px;color:#1A2440;">📱 WhatsApp : <a href="${wa}" style="color:#128C7E;text-decoration:none;font-weight:600;">${escapeHtml(course.teacherPhone ?? "")}</a></td></tr>`,
      )
    }
    if (course.meetingLink) {
      const link = escapeHtml(course.meetingLink)
      rows.push(
        `<tr><td style="padding:6px 20px 16px;font-size:14px;line-height:24px;color:#1A2440;">🎥 Lien du cours (Zoom) : <a href="${link}" style="color:#235A86;text-decoration:none;font-weight:600;">${link}</a></td></tr>`,
      )
    } else {
      rows.push(`<tr><td style="padding:0 20px 16px;"></td></tr>`)
    }
    return `
          <td style="padding:10px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FC;border-radius:10px;border:1px solid #E9F1F8;">
              <tbody>${rows.join("")}</tbody>
            </table>
          </td>`
  }).map((td) => `<tr>${td}</tr>`).join("\n        ")

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no" />
  <title>Bienvenue à l'Institut As-Sahaba</title>
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
${emailHeaderHtml()}
        </tr>

        <tr>
          <td align="center" style="padding:36px 32px 8px;font-size:22px;line-height:30px;color:#17456C;font-weight:700;">
            Bienvenue à l&apos;Institut As-Sahaba
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:6px 32px 0;font-size:17px;line-height:28px;color:#235A86;font-weight:600;" dir="rtl">
            السلام عليكم ورحمة الله وبركاته
          </td>
        </tr>

        <tr>
          <td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
            ${introHtml}<br /><br />
            Voici les coordonnées ${courses.length > 1 ? "de vos professeurs" : "de votre professeur"} pour prendre contact et rejoindre ${courses.length > 1 ? "les cours" : "le cours"} :
          </td>
        </tr>

        ${courseBlocks}

        <tr>
          <td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
            N&apos;hésitez pas à contacter directement ${courses.length > 1 ? "vos professeurs" : "votre professeur"} sur WhatsApp pour convenir des créneaux.<br /><br />
            Qu&apos;Allah facilite à ${escapeHtml(studentName)} un apprentissage bénéfique et sincère.
          </td>
        </tr>

        <tr><td height="14"></td></tr>

        <tr>
          <td align="center" bgcolor="#F4EFE3" style="background:#F4EFE3;padding:20px 32px;font-size:12px;line-height:20px;color:#5C6577;">
${emailFooterHtml()}
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

export type TeacherNewStudentCourse = {
  className: string | null
  subject: string | null
  studentNames: string[]
  nextLesson?: string | null
}

// E-mail envoyé au professeur pour le prévenir d'une nouvelle inscription : classe,
// matière, élève(s) et date du premier cours. Même charte que les autres e-mails.
export function teacherNewStudentEmailHtml({
  teacherName,
  courses,
}: {
  teacherName: string
  courses: TeacherNewStudentCourse[]
}) {
  const escapeHtml = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

  const courseBlocks = courses.map((course) => {
    const heading = escapeHtml([course.className, course.subject].filter(Boolean).join(" — ") || "Nouveau cours")
    const studentsLine = escapeHtml(course.studentNames.join(", "))
    const rows: string[] = [
      `<tr><td style="padding:16px 20px 4px;font-size:14px;font-weight:700;color:#17456C;">${heading}</td></tr>`,
      `<tr><td style="padding:2px 20px;font-size:15px;line-height:24px;color:#1A2440;">👤 Élève${course.studentNames.length > 1 ? "s" : ""} : <strong>${studentsLine}</strong></td></tr>`,
    ]
    if (course.nextLesson) {
      rows.push(
        `<tr><td style="padding:6px 20px 16px;font-size:14px;line-height:24px;color:#1A2440;">📅 Premier cours : <strong>${escapeHtml(course.nextLesson)}</strong></td></tr>`,
      )
    } else {
      rows.push(`<tr><td style="padding:0 20px 16px;"></td></tr>`)
    }
    return `
          <td style="padding:10px 36px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FC;border-radius:10px;border:1px solid #E9F1F8;">
              <tbody>${rows.join("")}</tbody>
            </table>
          </td>`
  }).map((td) => `<tr>${td}</tr>`).join("\n        ")

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nouvel élève — Institut As-Sahaba</title>
</head>
<body bgcolor="#F4EFE3" style="margin:0;padding:0;background:#F4EFE3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4EFE3" style="background:#F4EFE3;">
  <tbody>
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table class="full" width="620" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:620px;max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(12,36,60,.08);">
        <tbody>
        <tr>
${emailHeaderHtml()}
        </tr>
        <tr>
          <td align="center" style="padding:36px 32px 8px;font-size:22px;line-height:30px;color:#17456C;font-weight:700;">
            Nouvel élève inscrit
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:6px 32px 0;font-size:17px;line-height:28px;color:#235A86;font-weight:600;" dir="rtl">
            السلام عليكم ورحمة الله وبركاته
          </td>
        </tr>
        <tr>
          <td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
            Assalâmu ʿalaykum <strong>${escapeHtml(teacherName)}</strong>,<br /><br />
            Une nouvelle inscription rejoint votre tableau. Voici les informations :
          </td>
        </tr>
        ${courseBlocks}
        <tr>
          <td style="padding:18px 36px 8px;font-size:15px;line-height:25px;color:#1A2440;">
            Merci de contacter ${courses.length > 1 || courses.some((c) => c.studentNames.length > 1) ? "les élèves" : "l'élève"} pour convenir des modalités du cours.<br /><br />
            Qu&apos;Allah facilite ce nouvel apprentissage.
          </td>
        </tr>
        <tr><td height="14"></td></tr>
        <tr>
          <td align="center" bgcolor="#F4EFE3" style="background:#F4EFE3;padding:20px 32px;font-size:12px;line-height:20px;color:#5C6577;">
${emailFooterHtml()}
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
      <h2 style="color: #059669;">Bienvenue sur Institut As-Sahaba</h2>
      <p>Assalâmu ʿalaykum ${name},</p>
      <p>Votre compte a été créé. Voici vos identifiants :</p>
      <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Email :</strong> ${email}</p>
        <p style="margin: 4px 0;"><strong>Mot de passe provisoire :</strong> ${password}</p>
      </div>
      <p>Vous devrez changer votre mot de passe lors de votre première connexion.</p>
      <a href="${loginUrl}" style="display: inline-block; background: #059669; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">Se connecter</a>
      <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">Institut As-Sahaba — ${EMAIL_TAGLINE}</p>
    </div>
  `
}
