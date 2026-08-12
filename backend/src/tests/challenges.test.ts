import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"
import challengesRouter from "../routes/challenges.js"
import { requireAuth } from "../middleware/auth.js"
import { CodeChallenge } from "../models/CodeChallenge.js"
import { ChallengeSubmission } from "../models/ChallengeSubmission.js"

const app = express()
app.use(express.json())
app.use("/api/challenges", requireAuth, challengesRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

describe("POST /api/challenges/:id/submit", () => {
  it("stores challenge.language (not body language) in submission", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)

    const challenge = await CodeChallenge.create({
      school_id:       school._id,
      class_id:        cls._id,
      created_by:      teacher._id,
      title:           "Hello World",
      difficulty:      "Easy",
      language:        "python",
      description:     "Print hello world",
      constraints:     "",
      expected_output: "Hello World",
      deadline:        null,
      is_active:       true,
    })

    const token = makeJwt(student._id.toString(), "student")

    // Student sends language: "javascript" in body — but challenge is python
    const res = await request(app)
      .post(`/api/challenges/${challenge._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "print('Hello World')", language: "javascript" })

    expect(res.status).toBe(200)

    // Stored language must match the challenge definition, not the body value
    const sub = await ChallengeSubmission.findOne({ challenge_id: challenge._id, student_id: student._id }).lean()
    expect(sub?.language).toBe("python")
  })

  it("re-submission overwrites code (upsert)", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)

    const challenge = await CodeChallenge.create({
      school_id: school._id, class_id: cls._id, created_by: teacher._id,
      title: "Loop", difficulty: "Easy", language: "javascript",
      description: "Write a loop", constraints: "", expected_output: "1 2 3",
      deadline: null, is_active: true,
    })

    const token = makeJwt(student._id.toString(), "student")

    await request(app)
      .post(`/api/challenges/${challenge._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "for(let i=1;i<=3;i++) console.log(i)" })

    const res2 = await request(app)
      .post(`/api/challenges/${challenge._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "console.log('1 2 3')" })

    expect(res2.status).toBe(200)

    // Exactly one submission record
    const count = await ChallengeSubmission.countDocuments({ challenge_id: challenge._id, student_id: student._id })
    expect(count).toBe(1)
  })

  it("student from different class cannot submit", async () => {
    const school   = await createSchool()
    const cls1     = await createClass(school._id)
    const cls2     = await createClass(school._id)
    const teacher  = await createUser(school._id, "teacher", cls1._id)
    const student2 = await createUser(school._id, "student", cls2._id)

    const challenge = await CodeChallenge.create({
      school_id: school._id, class_id: cls1._id, created_by: teacher._id,
      title: "Class boundary", difficulty: "Easy", language: "python",
      description: "Test", constraints: "", expected_output: "",
      deadline: null, is_active: true,
    })

    const token = makeJwt(student2._id.toString(), "student")
    const res = await request(app)
      .post(`/api/challenges/${challenge._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "print('hi')" })

    expect(res.status).toBe(403)
  })
})

describe("DELETE /api/challenges/:id", () => {
  it("teacher can delete their own challenge", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)

    const challenge = await CodeChallenge.create({
      school_id: school._id, class_id: cls._id, created_by: teacher._id,
      title: "Delete me", difficulty: "Easy", language: "javascript",
      description: "Test", constraints: "", expected_output: "",
      deadline: null, is_active: true,
    })

    const token = makeJwt(teacher._id.toString(), "teacher")
    const res = await request(app)
      .delete(`/api/challenges/${challenge._id}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("teacher cannot delete another teacher's challenge — returns 403", async () => {
    const school   = await createSchool()
    const cls      = await createClass(school._id)
    const teacher1 = await createUser(school._id, "teacher", cls._id)
    const teacher2 = await createUser(school._id, "teacher", cls._id)

    const challenge = await CodeChallenge.create({
      school_id: school._id, class_id: cls._id, created_by: teacher1._id,
      title: "Teacher1 challenge", difficulty: "Easy", language: "python",
      description: "Test", constraints: "", expected_output: "",
      deadline: null, is_active: true,
    })

    const token2 = makeJwt(teacher2._id.toString(), "teacher")
    const res = await request(app)
      .delete(`/api/challenges/${challenge._id}`)
      .set("Authorization", `Bearer ${token2}`)

    expect(res.status).toBe(403)
  })

  it("cross-school probe returns 404 not 403 (no information disclosure)", async () => {
    const school1  = await createSchool()
    const school2  = await createSchool()
    const cls1     = await createClass(school1._id)
    const teacher1 = await createUser(school1._id, "teacher", cls1._id)
    const teacher2 = await createUser(school2._id, "teacher")

    const challenge = await CodeChallenge.create({
      school_id: school1._id, class_id: cls1._id, created_by: teacher1._id,
      title: "School1 only", difficulty: "Easy", language: "javascript",
      description: "Test", constraints: "", expected_output: "",
      deadline: null, is_active: true,
    })

    // teacher2 from school2 probes the challenge ID from school1
    const token2 = makeJwt(teacher2._id.toString(), "teacher")
    const res = await request(app)
      .delete(`/api/challenges/${challenge._id}`)
      .set("Authorization", `Bearer ${token2}`)

    // Must be 404 — not 403 which would confirm the resource exists
    expect(res.status).toBe(404)
  })
})
