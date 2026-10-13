// ─────────────────────────────────────────────────────────────────────────────
// lib/rateLimitStore.ts — Request-limit counters shared through Redis, so every
// copy of the server counts the same visitor together (5 sign-in attempts means
// 5 in total, not 5 per server). When Redis is not configured or not reachable,
// each server counts in its own memory, exactly as before — a request is never
// refused or delayed because Redis is down.
// ─────────────────────────────────────────────────────────────────────────────
import { MemoryStore, type Options, type Store, type ClientRateLimitInfo } from "express-rate-limit"
import { getRedis } from "./redis.js"

// Counts one hit and starts the window on the first hit. Returns [hits, ms left].
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if hits == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}
`

// If Redis has not answered within this time, count the hit in memory instead,
// and do not ask Redis again for a few seconds (so requests are not each held up)
const REDIS_WAIT_MS = 250
const REDIS_PAUSE_AFTER_FAILURE_MS = 5000

function withinTime<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Redis did not answer in time")), REDIS_WAIT_MS)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/** The small part of an ioredis client this store uses (also lets tests pass a fake). */
export interface RateLimitRedis {
  status: string
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>
  decr(key: string): Promise<number>
  del(key: string): Promise<number>
}

export class SharedRateLimitStore implements Store {
  readonly prefix: string
  readonly localKeys = false
  private windowMs = 60_000
  private readonly memory = new MemoryStore()
  private readonly client: () => RateLimitRedis | null

  /** `name` keeps each limiter's counters apart (e.g. "signin", "api"). */
  constructor(name: string, client: () => RateLimitRedis | null = getRedis) {
    this.prefix = `rl:${name}:`
    this.client = client
  }

  init(options: Options): void {
    this.windowMs = options.windowMs
    this.memory.init(options)
  }

  private ready(): RateLimitRedis | null {
    if (Date.now() < this.redisPausedUntil) return null
    const redis = this.client()
    return redis && redis.status === "ready" ? redis : null
  }

  private redisPausedUntil = 0

  private pauseRedis(): void {
    this.redisPausedUntil = Date.now() + REDIS_PAUSE_AFTER_FAILURE_MS
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redis = this.ready()
    if (redis) {
      try {
        const [hits, ttl] = await withinTime(redis.eval(INCREMENT_SCRIPT, 1, this.prefix + key, String(this.windowMs))) as [number, number]
        return { totalHits: Number(hits), resetTime: new Date(Date.now() + Number(ttl)) }
      } catch {
        // Redis failed or is too slow — count this hit in memory instead of refusing or holding the request
        this.pauseRedis()
      }
    }
    return this.memory.increment(key)
  }

  async decrement(key: string): Promise<void> {
    const redis = this.ready()
    if (redis) {
      try { await withinTime(redis.decr(this.prefix + key)); return } catch { this.pauseRedis() }
    }
    await this.memory.decrement(key)
  }

  async resetKey(key: string): Promise<void> {
    const redis = this.ready()
    if (redis) await withinTime(redis.del(this.prefix + key)).catch(() => 0)
    await this.memory.resetKey(key)
  }
}
