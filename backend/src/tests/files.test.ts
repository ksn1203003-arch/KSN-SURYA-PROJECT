import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createUser } from "./helpers.js"
import filesRouter from "../routes/files.js"
import { FileToken } from "../models/FileToken.js"

const app = express()
app.use(express.json())
app.use("/api/files", filesRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

describe("GET /api/files/:gridfsId — file token consumption", () => {
  it("expired token returns 401", async () => {
    const school = await createSchool()
    const user   = await createUser(school._id, "student")
    const fakeGridfsId = new mongoose.Types.ObjectId().toString()

    // Create an already-expired token
    await FileToken.create({
      token:     "expired-token-abc123",
      userId:    user._id.toString(),
      gridfsId:  fakeGridfsId,
      expiresAt: new Date(Date.now() - 60_000),
    })

    const res = await request(app)
      .get(`/api/files/${fakeGridfsId}?ft=expired-token-abc123`)

    expect(res.status).toBe(401)
  })

  it("token for wrong file returns 403", async () => {
    const school       = await createSchool()
    const user         = await createUser(school._id, "student")
    const correctId    = new mongoose.Types.ObjectId().toString()
    const differentId  = new mongoose.Types.ObjectId().toString()

    await FileToken.create({
      token:     "wrong-file-token",
      userId:    user._id.toString(),
      gridfsId:  correctId,
      expiresAt: new Date(Date.now() + 300_000),
    })

    // Request a different gridfsId with this token
    const res = await request(app)
      .get(`/api/files/${differentId}?ft=wrong-file-token`)

    expect(res.status).toBe(403)
  })

  it("concurrent requests with same token — only one succeeds (atomic findOneAndDelete)", async () => {
    const school      = await createSchool()
    const user        = await createUser(school._id, "student")
    const fakeGridfsId = new mongoose.Types.ObjectId().toString()

    await FileToken.create({
      token:     "race-condition-token",
      userId:    user._id.toString(),
      gridfsId:  fakeGridfsId,
      expiresAt: new Date(Date.now() + 300_000),
    })

    // Fire 5 simultaneous requests with the same token
    // The file won't exist in GridFS so all get 404/500 after token check,
    // but we verify the token is consumed atomically — only one request should
    // pass the token validation step (the rest get 401 "expired or invalid")
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).get(`/api/files/${fakeGridfsId}?ft=race-condition-token`)
      )
    )

    // After all requests, the token must be gone from DB
    const remaining = await FileToken.findOne({ token: "race-condition-token" })
    expect(remaining).toBeNull()

    // Exactly one request should have passed token validation (proceeded past 401)
    const passedTokenCheck = results.filter(r => r.status !== 401)
    const rejectedByToken  = results.filter(r => r.status === 401)

    // At most one passed the token check (the one that atomically deleted it)
    expect(passedTokenCheck.length).toBeLessThanOrEqual(1)
    // The rest must have been rejected with 401
    expect(rejectedByToken.length).toBeGreaterThanOrEqual(4)
  })
})
