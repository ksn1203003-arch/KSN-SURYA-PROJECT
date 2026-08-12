import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import express from "express"
import request from "supertest"
import bcrypt from "bcryptjs"
import {
  startDb, stopDb, clearDb,
  createSchool, createUser,
} from "./helpers.js"
import authRouter from "../routes/auth.js"
import { User } from "../models/User.js"

const app = express()
app.use(express.json())
app.use("/api/auth", authRouter)

beforeAll(startDb)
afterAll(stopDb)
afterEach(clearDb)

describe("POST /api/auth/signin", () => {
  it("returns 400 when identifier or password is missing", async () => {
    const res = await request(app)
      .post("/api/auth/signin")
      .send({ identifier: "someone@test.com" })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain("required")
  })

  it("returns 401 for unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/signin")
      .send({ identifier: "nobody@unknown.com", password: "anything" })

    expect(res.status).toBe(401)
  })

  it("returns 401 for wrong password", async () => {
    const school = await createSchool()
    const user   = await createUser(school._id, "teacher")

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ identifier: user.email, password: "WrongPassword!" })

    expect(res.status).toBe(401)
    expect(res.body.error).toBeTruthy()
  })

  it("signs in successfully with correct credentials and sets ts_token cookie", async () => {
    const school = await createSchool()
    const password = "Correct@Pass1"
    const password_hash = await bcrypt.hash(password, 10)
    const suffix = Math.random().toString(36).slice(2, 8)

    const user = await User.create({
      name: "Sign In Test",
      email: `signin-${suffix}@test.com`,
      phone: null,
      password_hash,
      role: "teacher",
      school_id: school._id,
      is_active: true,
    })

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ identifier: user.email, password })

    expect(res.status).toBe(200)
    expect(res.body.user).toBeDefined()
    expect(res.body.user.email).toBe(user.email)
    expect(res.body.user.password_hash).toBeUndefined()

    // ts_token cookie must be set
    const cookies = res.headers["set-cookie"] as string[] | string | undefined
    const cookieStr = Array.isArray(cookies) ? cookies.join(";") : (cookies ?? "")
    expect(cookieStr).toContain("ts_token")
    expect(cookieStr).toContain("HttpOnly")
  })

  it("rejects login for deactivated account", async () => {
    const school = await createSchool()
    const password = "Active@Pass1"
    const password_hash = await bcrypt.hash(password, 10)
    const suffix = Math.random().toString(36).slice(2, 8)

    const user = await User.create({
      name: "Deactivated",
      email: `deact-${suffix}@test.com`,
      phone: null,
      password_hash,
      role: "student",
      school_id: school._id,
      is_active: false,
    })

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ identifier: user.email, password })

    expect(res.status).toBe(401)
    expect(res.body.error).toBeTruthy()
  })

  it("signs in by username", async () => {
    const school = await createSchool()
    const password = "Username@Pass1"
    const password_hash = await bcrypt.hash(password, 10)
    const suffix = Math.random().toString(36).slice(2, 8)

    await User.create({
      name: "Username User",
      email: `uname-${suffix}@test.com`,
      phone: null,
      username: `student_${suffix}`,
      password_hash,
      role: "student",
      school_id: school._id,
      is_active: true,
    })

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ identifier: `student_${suffix}`, password })

    expect(res.status).toBe(200)
    expect(res.body.user).toBeDefined()
  })

  it("never returns password_hash in response", async () => {
    const school = await createSchool()
    const password = "NoHash@Pass1"
    const password_hash = await bcrypt.hash(password, 10)
    const suffix = Math.random().toString(36).slice(2, 8)

    const user = await User.create({
      name: "No Hash",
      email: `nohash-${suffix}@test.com`,
      phone: null,
      password_hash,
      role: "teacher",
      school_id: school._id,
      is_active: true,
    })

    const res = await request(app)
      .post("/api/auth/signin")
      .send({ identifier: user.email, password })

    expect(res.status).toBe(200)
    const body = JSON.stringify(res.body)
    expect(body).not.toContain("password_hash")
    expect(body).not.toContain("$2b$")
  })
})
