// ─────────────────────────────────────────────────────────────────────────────
// middleware/auth.ts — JWT authentication middleware for Express routes.
// Reads the ts_token httpOnly cookie (or Authorization: Bearer header), verifies
// the JWT, confirms the account is active, and sets req.userId / req.userRole.
// Role is always read from the DB (not the JWT) so role changes propagate within
// the cache TTL (30 seconds) rather than waiting for token expiry (7 days).
//
// Cache strategy (two-tier):
//   1. Redis (distributed) — used when REDIS_URL is set and Redis is reachable.
//      Safe for multi-process deployments (PM2 cluster, Docker replicas).
//   2. In-memory Map (process-local) — fallback when Redis is unavailable.
//      Identical TTL and eviction behaviour; only unsafe for horizontal scale.
//
// IMPORTANT: JWT payload carries a `role` claim — this middleware intentionally
// ignores it and always reads role from the DB / cache. Trusting the JWT role
// would be a one-refactor-away role-escalation vulnerability.
// Exports: requireAuth, requireAdmin, evictAuthCache, AuthRequest
// ─────────────────────────────────────────────────────────────────────────────
import { type Request, type Response, type NextFunction } from "express"
import jwt from "jsonwebtoken"
import { User } from "../models/User.js"
import { redisGet, redisSet, redisDel } from "../lib/redis.js"

export interface AuthRequest extends Request {
  userId?:   string
  userRole?: string
  schoolId?: string
}

const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET env var is required in production")
  return "dev-secret-change-in-production"
})()

const AUTH_CACHE_TTL_MS  = 30_000
const AUTH_CACHE_TTL_SEC = 30

interface CacheEntry { role: string; schoolId: string; is_active: boolean; tokenVersion: number; expires: number }

// In-memory fallback — used when Redis is unavailable
const memCache = new Map<string, CacheEntry>()

// In-flight DB lookups keyed by userId — prevents cache stampede at bell-time
// when 50+ students all hit a cold cache simultaneously and would each fire a DB query.
const _inflight = new Map<string, Promise<CacheEntry | null>>()

async function getCached(userId: string): Promise<CacheEntry | null> {
  // Try Redis first
  try {
    const raw = await redisGet(`auth:${userId}`)
    if (raw) return JSON.parse(raw) as CacheEntry
  } catch { /* fall through to memCache */ }

  // In-memory fallback
  const entry = memCache.get(userId)
  if (entry && entry.expires > Date.now()) return entry
  return null
}

async function setCached(userId: string, entry: CacheEntry): Promise<void> {
  try {
    await redisSet(`auth:${userId}`, AUTH_CACHE_TTL_SEC, JSON.stringify(entry))
  } catch { /* fall through to memCache */ }
  memCache.set(userId, entry)
}

async function delCached(userId: string): Promise<void> {
  try {
    await redisDel(`auth:${userId}`)
  } catch { /* ignore */ }
  memCache.delete(userId)
}

function extractToken(req: Request): string | undefined {
  const cookie = req.headers.cookie ?? ""
  const cookieMatch = cookie.match(/(?:^|;\s*)ts_token=([^;]*)/)
  if (cookieMatch) return decodeURIComponent(cookieMatch[1])

  const authHeader = req.headers.authorization
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7)

  return undefined
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: "Authentication required" }); return
  }

  let payload: { sub: string; role: string; tv?: number; iat: number; exp: number }
  try {
    payload = jwt.verify(token, JWT_SECRET) as typeof payload
  } catch {
    res.status(401).json({ error: "Invalid or expired session. Please log in again." }); return
  }

  const userId = payload.sub
  // tv (token_version) claim is 0 for legacy tokens minted before this feature.
  // New tokens set tv at sign-in; sign-out increments user.token_version in DB.
  const tokenTv = payload.tv ?? 0

  getCached(userId).then(async cached => {
    if (cached) {
      if (!cached.is_active) {
        await delCached(userId)
        res.status(401).json({ error: "Account not found or deactivated. Please log in again." }); return
      }
      // Reject tokens whose version is behind the DB value — token was revoked via sign-out
      if (tokenTv < cached.tokenVersion) {
        res.status(401).json({ error: "Session expired. Please log in again." }); return
      }
      req.userId   = userId
      req.userRole = cached.role
      req.schoolId = cached.schoolId
      next()
      return
    }

    // Cache miss — fetch from DB with promise coalescing to prevent stampede.
    // If 50 concurrent requests arrive for the same userId with a cold cache, only
    // one DB query fires; the rest await the same promise.
    let fetchPromise = _inflight.get(userId)
    if (!fetchPromise) {
      fetchPromise = User.findById(userId)
        .select("_id is_active role school_id token_version")
        .lean()
        .then(async user => {
          if (!user || !user.is_active) { await delCached(userId); return null }
          const dbTv = user.token_version ?? 0
          const schoolId = user.school_id?.toString() ?? ""
          const entry: CacheEntry = {
            role:         user.role,
            schoolId,
            is_active:    user.is_active,
            tokenVersion: dbTv,
            expires:      Date.now() + AUTH_CACHE_TTL_MS,
          }
          await setCached(userId, entry)
          return entry
        })
        .finally(() => { _inflight.delete(userId) })
      _inflight.set(userId, fetchPromise)
    }

    try {
      const entry = await fetchPromise
      if (!entry) {
        res.status(401).json({ error: "Account not found or deactivated. Please log in again." }); return
      }
      if (tokenTv < entry.tokenVersion) {
        res.status(401).json({ error: "Session expired. Please log in again." }); return
      }
      req.userId   = userId
      req.userRole = entry.role  // always use DB role, never JWT claim
      req.schoolId = entry.schoolId
      next()
    } catch {
      res.status(500).json({ error: "Auth check failed" })
    }
  }).catch(() => {
    res.status(500).json({ error: "Auth check failed" })
  })
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.userRole || !["admin", "super_admin"].includes(req.userRole)) {
      res.status(403).json({ error: "Admin access required" }); return
    }
    next()
  })
}

export function evictAuthCache(userId: string): void {
  delCached(userId).catch(() => {})
}
