// ─────────────────────────────────────────────────────────────────────────────
// lib/email.ts — Single email-delivery abstraction for the entire backend.
// Priority: Resend (RESEND_API_KEY) → Nodemailer/Gmail (EMAIL_USER + EMAIL_APP_PASSWORD).
// Falls back gracefully when neither is configured (logs a warning, does not throw).
// All callers use sendEmail() — no route file imports nodemailer or Resend directly.
// ─────────────────────────────────────────────────────────────────────────────
import { logger } from "./logger.js"

export interface EmailPayload {
  to:      string
  subject: string
  html:    string
}

const FROM_EMAIL = process.env.FROM_EMAIL ?? process.env.EMAIL_USER ?? "noreply@teachscript.in"
const FROM_NAME  = "TeachScript"

async function sendViaResend(payload: EmailPayload): Promise<void> {
  const key = process.env.RESEND_API_KEY!
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from:    `${FROM_NAME} <${FROM_EMAIL}>`,
      to:      [payload.to],
      subject: payload.subject,
      html:    payload.html,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)")
    throw new Error(`Resend HTTP ${res.status}: ${body}`)
  }
}

// Module-level singleton — created once, reused across all sendEmail() calls.
// Creating a new transporter per email opens a fresh SMTP connection (TCP + TLS)
// on every invocation, causing connection storms under bulk-invite load.
let _nodemailerTransporter: import("nodemailer").Transporter | null = null

async function getNodemailerTransporter() {
  if (_nodemailerTransporter) return _nodemailerTransporter
  const { default: nodemailer } = await import("nodemailer")
  _nodemailerTransporter = nodemailer.createTransport({
    service: "gmail",
    pool: true,
    auth: { user: process.env.EMAIL_USER!, pass: process.env.EMAIL_APP_PASSWORD! },
  })
  return _nodemailerTransporter
}

async function sendViaNodemailer(payload: EmailPayload): Promise<void> {
  const transporter = await getNodemailerTransporter()
  await transporter.sendMail({
    from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to:      payload.to,
    subject: payload.subject,
    html:    payload.html,
  })
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(payload)
  }
  if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
    return sendViaNodemailer(payload)
  }
  logger.warn({ to: payload.to, subject: payload.subject }, "[email] No email provider configured — email not sent")
}
