import { describe, it, expect } from "vitest"
import express from "express"
import request from "supertest"
import { rateLimit } from "express-rate-limit"
import { SharedRateLimitStore, type RateLimitRedis } from "../lib/rateLimitStore.js"

// A tiny stand-in for Redis: one shared counter map, like one Redis serving many servers.
function fakeRedis() {
  const counts = new Map<string, number>()
  const client: RateLimitRedis & { broken: boolean } = {
    status: "ready",
    broken: false,
    async eval(_script, _n, key) {
      if (client.broken) throw new Error("connection lost")
      const hits = (counts.get(key) ?? 0) + 1
      counts.set(key, hits)
      return [hits, 60_000]
    },
    async decr(key) { const v = (counts.get(key) ?? 1) - 1; counts.set(key, v); return v },
    async del(key) { return counts.delete(key) ? 1 : 0 },
  }
  return { client, counts }
}

function serverWith(store: SharedRateLimitStore, max = 3) {
  const app = express()
  app.set("trust proxy", 1)
  app.use(rateLimit({ windowMs: 60_000, max, standardHeaders: true, legacyHeaders: false, store }))
  app.get("/", (_req, res) => { res.json({ ok: true }) })
  return app
}

describe("SharedRateLimitStore", () => {
  it("two server copies count the same visitor together through Redis", async () => {
    const { client } = fakeRedis()
    const serverA = serverWith(new SharedRateLimitStore("signin", () => client))
    const serverB = serverWith(new SharedRateLimitStore("signin", () => client))

    expect((await request(serverA).get("/").set("X-Forwarded-For", "1.2.3.4")).status).toBe(200)
    expect((await request(serverB).get("/").set("X-Forwarded-For", "1.2.3.4")).status).toBe(200)
    expect((await request(serverA).get("/").set("X-Forwarded-For", "1.2.3.4")).status).toBe(200)
    // 4th attempt overall is refused, even though each server has seen only 2
    expect((await request(serverB).get("/").set("X-Forwarded-For", "1.2.3.4")).status).toBe(429)
  })

  it("different limiters never share counters", async () => {
    const { client, counts } = fakeRedis()
    const signin = serverWith(new SharedRateLimitStore("signin", () => client))
    const api    = serverWith(new SharedRateLimitStore("api", () => client))
    await request(signin).get("/").set("X-Forwarded-For", "5.6.7.8")
    await request(api).get("/").set("X-Forwarded-For", "5.6.7.8")
    expect([...counts.keys()].sort()).toEqual(["rl:api:5.6.7.8", "rl:signin:5.6.7.8"])
  })

  it("keeps working in memory when Redis is not configured", async () => {
    const app = serverWith(new SharedRateLimitStore("signin", () => null), 2)
    expect((await request(app).get("/")).status).toBe(200)
    expect((await request(app).get("/")).status).toBe(200)
    expect((await request(app).get("/")).status).toBe(429)
  })

  it("never refuses a request because Redis broke — it counts in memory instead", async () => {
    const { client } = fakeRedis()
    client.broken = true
    const app = serverWith(new SharedRateLimitStore("api", () => client), 2)
    expect((await request(app).get("/")).status).toBe(200)
    expect((await request(app).get("/")).status).toBe(200)
    expect((await request(app).get("/")).status).toBe(429)
  })

  it("does not use Redis until its connection is ready", async () => {
    const { client, counts } = fakeRedis()
    client.status = "connecting"
    const app = serverWith(new SharedRateLimitStore("api", () => client))
    expect((await request(app).get("/")).status).toBe(200)
    expect(counts.size).toBe(0)
  })
})

describe("SharedRateLimitStore — Redis that stops answering", () => {
  it("does not hold the request: it counts in memory after a short wait", async () => {
    const hanging: RateLimitRedis = {
      status: "ready",
      eval: () => new Promise(() => undefined),
      decr: () => new Promise(() => undefined),
      del: () => new Promise(() => undefined),
    }
    const app = serverWith(new SharedRateLimitStore("api", () => hanging), 5)
    const started = Date.now()
    const res = await request(app).get("/")
    expect(res.status).toBe(200)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it("after Redis stops answering once, the next requests skip it instead of waiting again", async () => {
    let calls = 0
    const hanging: RateLimitRedis = {
      status: "ready",
      eval: () => { calls++; return new Promise(() => undefined) },
      decr: () => new Promise(() => undefined),
      del: () => new Promise(() => undefined),
    }
    const app = serverWith(new SharedRateLimitStore("api", () => hanging), 50)
    await request(app).get("/")
    const started = Date.now()
    await request(app).get("/")
    await request(app).get("/")
    expect(Date.now() - started).toBeLessThan(200)
    expect(calls).toBe(1)
  })
})
