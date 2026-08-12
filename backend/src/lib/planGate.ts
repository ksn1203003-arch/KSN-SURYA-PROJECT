// ─────────────────────────────────────────────────────────────────────────────
// lib/planGate.ts — Subscription plan enforcement middleware factory.
//
// Usage:
//   router.post("/my-endpoint", requirePlan("starter", "standard", "premium"), handler)
//
// The middleware reads the school's subscription_plan from the DB (same 30-second
// Redis/in-process cache layer as the role cache in middleware/auth.ts) and
// returns 402 Payment Required if the plan is not in the allowed list.
//
// Plans in ascending order: free < starter < standard < premium
// PLAN_ORDER is exported for callers that want to gate by minimum plan level.
// ─────────────────────────────────────────────────────────────────────────────
import { type Response, type NextFunction } from "express"
import { type AuthRequest } from "../middleware/auth.js"
import { School } from "../models/School.js"
import { logger } from "./logger.js"
import { getRedis } from "./redis.js"

export const PLAN_ORDER: Record<string, number> = {
  free:     0,
  starter:  1,
  standard: 2,
  premium:  3,
}

const PLAN_CACHE_TTL_MS = 30_000
const planCacheInProc   = new Map<string, { plan: string; cachedAt: number }>()

async function getSchoolPlan(schoolId: string): Promise<string | null> {
  const cacheKey = `school_plan:${schoolId}`

  // Try Redis first (shared across processes)
  const redis = getRedis()
  if (redis) {
    try {
      const cached = await redis.get(cacheKey)
      if (cached) return cached
    } catch { /* fall through to DB */ }
  }

  // In-process fallback
  const local = planCacheInProc.get(schoolId)
  if (local && Date.now() - local.cachedAt < PLAN_CACHE_TTL_MS) {
    return local.plan
  }

  // DB query
  const school = await School.findById(schoolId).select("subscription_plan").lean()
  const plan   = school?.subscription_plan ?? "free"

  // Warm caches
  if (redis) {
    try { await redis.set(cacheKey, plan, "EX", Math.ceil(PLAN_CACHE_TTL_MS / 1000)) } catch { /* ignore */ }
  }
  planCacheInProc.set(schoolId, { plan, cachedAt: Date.now() })

  return plan
}

/**
 * Returns an Express middleware that allows the request through only if the
 * school's subscription plan is in `allowedPlans`. Returns 402 otherwise.
 */
export function requirePlan(...allowedPlans: string[]) {
  const allowed = new Set(allowedPlans)
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) { res.status(401).json({ error: "Authentication required" }); return }

      // req.schoolId is set by requireAuth middleware — no extra User DB query needed.
      const schoolId = req.schoolId
      if (!schoolId) { res.status(400).json({ error: "No school associated with this account" }); return }

      const plan = await getSchoolPlan(schoolId)
      if (!plan || !allowed.has(plan)) {
        res.status(402).json({
          error: "This feature is not available on your current plan. Please upgrade to access it.",
          current_plan: plan ?? "free",
          required_plans: [...allowed],
        })
        return
      }

      next()
    } catch (err) {
      logger.error({ err }, "[planGate] Failed to check subscription plan")
      res.status(500).json({ error: "Failed to verify subscription. Please try again." })
    }
  }
}
