import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createUser } from "./helpers.js"
import { requireAuth } from "../middleware/auth.js"
import { School } from "../models/School.js"

// Mock the Claude SDK before importing the AI router so the test never
// makes real network calls.
vi.mock("../lib/claude.js", () => ({
  getLessonAssistantResponse: vi.fn().mockResolvedValue("This is a test AI response about the lesson."),
}))

const { default: aiRouter } = await import("../routes/ai.js")

const app = express()
app.use(express.json())
app.use("/api/ai", requireAuth, aiRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

describe("POST /api/ai/lesson-assist", () => {
  it("returns AI response for a valid teacher request", async () => {
    const school  = await createSchool()
    await School.findByIdAndUpdate(school._id, { subscription_plan: "starter" })
    const teacher = await createUser(school._id, "teacher")
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const res = await request(app)
      .post("/api/ai/lesson-assist")
      .set("Cookie", `ts_token=${jwt}`)
      .send({ question: "Explain photosynthesis for Class 5", language: "english" })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("answer")
    expect(typeof res.body.answer).toBe("string")
    expect(res.body.answer.length).toBeGreaterThan(0)
  })

  it("returns 400 when question is missing", async () => {
    const school  = await createSchool()
    await School.findByIdAndUpdate(school._id, { subscription_plan: "starter" })
    const teacher = await createUser(school._id, "teacher")
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const res = await request(app)
      .post("/api/ai/lesson-assist")
      .set("Cookie", `ts_token=${jwt}`)
      .send({ language: "english" })

    expect(res.status).toBe(400)
  })

  it("returns 402 or 403 when a student tries to use the AI assistant", async () => {
    // requirePlan runs before role check — free-plan school returns 402.
    // A paid-plan school would return 403 (role denied). Either is correct access denial.
    const school  = await createSchool()
    const cls     = await import("./helpers.js").then(h => h.createClass(school._id))
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(student._id.toString(), "student")

    const res = await request(app)
      .post("/api/ai/lesson-assist")
      .set("Cookie", `ts_token=${jwt}`)
      .send({ question: "What is gravity?" })

    expect([402, 403]).toContain(res.status)
  })

  it("returns 401 when no JWT is provided", async () => {
    const res = await request(app)
      .post("/api/ai/lesson-assist")
      .send({ question: "Explain gravity" })

    expect(res.status).toBe(401)
  })

  it("passes language preference through to Claude", async () => {
    const { getLessonAssistantResponse } = await import("../lib/claude.js")
    const school  = await createSchool()
    await School.findByIdAndUpdate(school._id, { subscription_plan: "starter" })
    const teacher = await createUser(school._id, "teacher")
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    await request(app)
      .post("/api/ai/lesson-assist")
      .set("Cookie", `ts_token=${jwt}`)
      .send({ question: "गुरुत्वाकर्षण क्या है?", language: "hindi" })

    expect(getLessonAssistantResponse).toHaveBeenCalledWith(
      expect.any(String),   // question
      expect.any(String),   // context
      "hindi",
    )
  })
})
