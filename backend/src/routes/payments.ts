import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/payments.ts — Razorpay payment routes at /api/payments.
// Creates Razorpay orders for subscription upgrades and verifies webhook
// signatures to confirm successful payments.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from "express"
import crypto from "crypto"
import { School } from "../models/School.js"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"

const router = Router()

const PLAN_PRICES: Record<string, number> = { starter: 29900, standard: 49900, premium: 79900 }

const getRazorpay = async () => {
  const Razorpay = (await import("razorpay")).default
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  })
}

// POST /api/payments/order — admin only
router.post("/order", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userRole || !["admin", "super_admin"].includes(req.userRole)) {
      res.status(403).json({ error: "Admin access required" }); return
    }

    const { plan, school_id } = req.body as { plan?: string; school_id?: string }
    if (!plan || !school_id) { res.status(400).json({ error: "plan and school_id are required" }); return }

    // Enforce school boundary — admin can only create orders for their own school
    if (req.schoolId && req.schoolId !== school_id) {
      res.status(403).json({ error: "You can only manage payments for your own school." }); return
    }

    const amount = PLAN_PRICES[plan]
    if (!amount) { res.status(400).json({ error: "Invalid plan. Choose: starter, standard, or premium" }); return }

    const school = await School.findById(school_id).select("_id").lean()
    if (!school) { res.status(404).json({ error: "School not found" }); return }

    const razorpay = await getRazorpay()
    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      notes: { school_id, plan },
    })

    res.json({ order_id: order.id, amount, currency: "INR" })
  } catch (err: unknown) {
    logger.error({ err: err }, "[payments/order]")
    res.status(500).json({ error: "Failed to create payment order. Please try again." })
  }
})

// POST /api/payments/webhook — called by Razorpay (no user auth, HMAC-verified)
// express.raw() in index.ts provides req.body as a Buffer with the original bytes,
// which is required for correct HMAC verification (re-serializing parsed JSON can differ).
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string
    if (!signature) { res.status(400).json({ error: "Missing signature" }); return }

    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) { res.status(500).json({ error: "Webhook not configured" }); return }

    const rawBody = req.body instanceof Buffer ? req.body.toString("utf-8") : JSON.stringify(req.body)
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex")

    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expectedSig)
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      res.status(400).json({ error: "Invalid signature" }); return
    }

    let event: { event?: string; payload?: { payment?: { entity?: { notes?: { school_id?: string; plan?: string } } } } }
    try {
      event = JSON.parse(rawBody)
    } catch {
      res.status(400).json({ error: "Invalid JSON payload" }); return
    }

    if (event.event === "payment.captured") {
      const school_id = event.payload?.payment?.entity?.notes?.school_id
      const plan      = event.payload?.payment?.entity?.notes?.plan
      const validPlans = ["starter", "standard", "premium"] as const
      type Plan = typeof validPlans[number]
      const newPlan = plan && validPlans.includes(plan as Plan) ? plan as Plan : null
      if (school_id && newPlan) {
        await School.findByIdAndUpdate(school_id, { subscription_plan: newPlan })
      }
    }

    res.json({ received: true })
  } catch (err: unknown) {
    logger.error({ err: err }, "[payments/webhook]")
    res.status(500).json({ error: "Webhook processing failed" })
  }
})

export default router
