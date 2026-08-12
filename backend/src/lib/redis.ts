import Redis from "ioredis"

// Redis client singleton — used for distributed auth cache.
// Fails silently: if REDIS_URL is missing or Redis is unreachable,
// all operations become no-ops and the auth middleware falls back to
// its in-memory Map. The app functions normally without Redis.

let _redis: Redis | null = null
let _failed = false

function getRedis(): Redis | null {
  if (_failed) return null
  if (_redis) return _redis

  const url = process.env.REDIS_URL
  if (!url) return null

  try {
    _redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: false,
      connectTimeout: 3000,
    })

    _redis.on("error", () => {
      // Silence recurring errors — we already know Redis is down
    })

    _redis.on("end", () => {
      _redis = null
    })

    return _redis
  } catch {
    _failed = true
    return null
  }
}

export async function redisGet(key: string): Promise<string | null> {
  try {
    return await getRedis()?.get(key) ?? null
  } catch {
    return null
  }
}

export async function redisSet(key: string, ttlSeconds: number, value: string): Promise<void> {
  try {
    await getRedis()?.setex(key, ttlSeconds, value)
  } catch {
    // ignore
  }
}

export async function redisDel(key: string): Promise<void> {
  try {
    await getRedis()?.del(key)
  } catch {
    // ignore
  }
}

export function isRedisAvailable(): boolean {
  return getRedis()?.status === "ready"
}

export { getRedis }

// Returns a plain connection-options object for BullMQ (which bundles its own ioredis).
// Passing our ioredis instance causes a TS type conflict because BullMQ's bundled
// ioredis types differ from the top-level ioredis package types.
export function getBullMQConnection(): { url: string } | null {
  const url = process.env.REDIS_URL
  return url ? { url } : null
}
