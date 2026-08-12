// ─────────────────────────────────────────────────────────────────────────────
// lib/sms.ts — SMS delivery abstraction.
// Tries Fast2SMS (FAST2SMS_API_KEY) then Twilio (TWILIO_*) in order.
// Falls back to structured log in dev when neither is configured.
// Exports: sendSms(phone, otp, userName)
// ─────────────────────────────────────────────────────────────────────────────
import { logger } from "./logger.js"

export async function sendSms(phone: string, otp: string, userName: string): Promise<void> {
  const digits = phone.replace(/[^\d]/g, "")
  const msg    = `Hi ${userName}, your TeachScript login code is ${otp}. Valid for 10 minutes. Do not share this code.`

  if (process.env.FAST2SMS_API_KEY) {
    const smsRes = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: process.env.FAST2SMS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ route: "q", message: msg, language: "english", flash: 0, numbers: digits }),
    })
    if (!smsRes.ok) {
      const body = await smsRes.text().catch(() => "")
      throw new Error(`Fast2SMS returned ${smsRes.status}: ${body}`)
    }
    return
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    const url  = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")
    const smsRes = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM_NUMBER, Body: msg }).toString(),
    })
    if (!smsRes.ok) {
      const body = await smsRes.text().catch(() => "")
      throw new Error(`Twilio returned ${smsRes.status}: ${body}`)
    }
    return
  }

  logger.info(`[sms] No SMS provider configured — OTP generated for phone ending ${phone.slice(-4)}`)
}
