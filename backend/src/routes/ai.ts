import { logger } from "../lib/logger.js"
import { Router, type Response } from "express"
import { LRUCache } from "lru-cache"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { requirePlan } from "../lib/planGate.js"
import { getLessonAssistantResponse } from "../lib/claude.js"
import { getRedis } from "../lib/redis.js"

const router = Router()
router.use(requireAuth)

const MAX_QUESTION_LEN  = 2000
const MAX_CONTEXT_LEN   = 1000
const VALID_LANGUAGES   = ["english", "hindi"] as const
const AI_TIMEOUT_MS     = 30_000   // abort Anthropic request after 30s

// Per-user rate limit: max 30 AI calls per minute per authenticated user.
// Primary: Redis atomic INCR (survives restarts, shared across processes, race-condition safe).
// Fallback: in-process LRU (used only when Redis is unavailable).
const AI_CALLS_PER_MIN = 30
const memFallback = new LRUCache<string, { count: number; resetAt: number }>({
  max: 10_000,
  ttl: 60_000,
})

async function checkUserAiRate(userId: string): Promise<boolean> {
  const redisKey = `ai_rate:${userId}`
  try {
    const redis = getRedis()
    if (redis) {
      // INCR is atomic — no GET+SET race condition. Set expiry only on first increment.
      const count = await redis.incr(redisKey)
      if (count === 1) await redis.expire(redisKey, 60)
      return count <= AI_CALLS_PER_MIN
    }
  } catch {
    // Redis unavailable — fall back to in-process counter
  }
  const now   = Date.now()
  const entry = memFallback.get(userId)
  if (!entry || entry.resetAt < now) {
    memFallback.set(userId, { count: 1, resetAt: now + 60_000 }); return true
  }
  if (entry.count >= AI_CALLS_PER_MIN) return false
  entry.count++; return true
}

// AI assistant requires at least starter plan — unavailable on free tier
router.post("/lesson-assist", requirePlan("starter", "standard", "premium"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userRole || !["teacher", "admin", "super_admin"].includes(req.userRole)) {
      res.status(403).json({ error: "Only teachers can use the AI assistant" }); return
    }

    const { question, context, language = "english" } = req.body as {
      question?: string
      context?:  string
      language?: string
    }

    // Validate inputs BEFORE consuming a rate-limit slot so invalid requests
    // don't count against the teacher's quota.
    if (!question?.trim()) {
      res.status(400).json({ error: "question is required" }); return
    }
    if (question.length > MAX_QUESTION_LEN) {
      res.status(400).json({ error: `Question must be under ${MAX_QUESTION_LEN} characters` }); return
    }
    if (context && context.length > MAX_CONTEXT_LEN) {
      res.status(400).json({ error: `Context must be under ${MAX_CONTEXT_LEN} characters` }); return
    }

    if (!await checkUserAiRate(req.userId!)) {
      res.status(429).json({ error: "You have reached the AI request limit. Please wait a minute and try again." }); return
    }

    const validLanguage = VALID_LANGUAGES.includes(language as typeof VALID_LANGUAGES[number])
      ? (language as typeof VALID_LANGUAGES[number])
      : "english"

    const lessonContext = context?.trim() || "General CS lesson for Indian school"

    // Enforce a hard timeout on the Anthropic API call so a slow/hung request
    // doesn't hold the HTTP connection open indefinitely.
    const timeoutSignal = AbortSignal.timeout(AI_TIMEOUT_MS)
    const answerPromise = getLessonAssistantResponse(question.trim(), lessonContext, validLanguage)
    const timeoutRace   = new Promise<never>((_, reject) =>
      timeoutSignal.addEventListener("abort", () =>
        reject(new Error("AI request timed out"))
      )
    )

    const answer = await Promise.race([answerPromise, timeoutRace])
    res.json({ answer })
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message === "AI request timed out"
    if (isTimeout) {
      logger.warn("[ai/lesson-assist] Anthropic API timed out after 30s")
      res.status(504).json({ error: "The AI assistant is taking too long. Please try again." }); return
    }
    logger.error({ err: err }, "[ai/lesson-assist]")
    res.status(500).json({ error: "The AI assistant is temporarily unavailable. Please try again." })
  }
})

export default router
