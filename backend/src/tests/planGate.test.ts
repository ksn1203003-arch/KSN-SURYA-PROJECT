import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import request from "supertest"
import express, { type Response } from "express"
import { startDb, stopDb, clearDb, createSchool, createUser, makeJwt } from "./helpers.js"
import { requirePlan } from "../lib/planGate.js"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { School } from "../models/School.js"

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use(requireAuth)
  app.get("/gated", requirePlan("starter", "standard", "premium"), (_req: AuthRequest, res: Response) => {
    res.json({ ok: true })
  })
  return app
}

describe("requirePlan middleware", () => {
  beforeAll(startDb)
  afterAll(stopDb)
  afterEach(clearDb)

  it("allows request when school plan is in allowed list", async () => {
    const school  = await createSchool()
    await School.findByIdAndUpdate(school._id, { subscription_plan: "starter" })
    const teacher = await createUser(school._id, "teacher")
    const token   = makeJwt(teacher._id.toString(), "teacher")
    const app     = makeApp()

    const res = await request(app).get("/gated").set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it("returns 402 when school is on free plan", async () => {
    const school  = await createSchool()  // default: free
    const teacher = await createUser(school._id, "teacher")
    const token   = makeJwt(teacher._id.toString(), "teacher")
    const app     = makeApp()

    const res = await request(app).get("/gated").set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(402)
    expect(res.body.current_plan).toBe("free")
    expect(res.body.required_plans).toContain("starter")
  })

  it("allows premium plan (higher than required)", async () => {
    const school  = await createSchool()
    await School.findByIdAndUpdate(school._id, { subscription_plan: "premium" })
    const teacher = await createUser(school._id, "teacher")
    const token   = makeJwt(teacher._id.toString(), "teacher")
    const app     = makeApp()

    const res = await request(app).get("/gated").set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it("returns 401 when no auth token provided", async () => {
    const app = makeApp()
    const res = await request(app).get("/gated")
    expect(res.status).toBe(401)
  })
})
