import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/whatsapp.ts — WhatsApp notification route at /api/whatsapp.
// Forwards school announcements and reminders to WhatsApp via the configured
// provider API.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"

const router = Router()
router.use(requireAuth)

interface SendBody { to: string; message: string }

router.post("/send", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userRole || !["teacher", "admin", "super_admin"].includes(req.userRole)) {
      res.status(403).json({ error: "Teachers and admins only" }); return
    }

    const { to, message } = req.body as SendBody
    if (!to || !message) { res.status(400).json({ error: "to and message are required" }); return }

    const digits = to.replace(/\D/g, "")
    if (digits.length < 10 || digits.length > 15) {
      res.status(400).json({ error: "Invalid phone number" }); return
    }
    if (typeof message !== "string" || message.trim().length === 0 || message.length > 4096) {
      res.status(400).json({ error: "Message must be between 1 and 4096 characters" }); return
    }

    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const token = process.env.WHATSAPP_API_TOKEN

    if (!phoneId || !token) { res.status(503).json({ error: "WhatsApp messaging is not configured on this server" }); return }

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: digits,
          type: "text",
          text: { body: message.trim() },
        }),
      }
    )

    if (!response.ok) {
      logger.error({ status: response.status, body: await response.text() }, "[whatsapp/send] Meta API error")
      res.status(502).json({ error: "Failed to send WhatsApp message. Please try again." })
      return
    }

    res.json({ sent: true })
  } catch (err: unknown) {
    logger.error({ err: err }, "[whatsapp/send]")
    res.status(500).json({ error: "Failed to send WhatsApp message. Please try again." })
  }
})

export default router
