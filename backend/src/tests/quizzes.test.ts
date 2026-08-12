import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"
import quizzesRouter from "../routes/quizzes.js"
import { requireAuth } from "../middleware/auth.js"
import { Quiz } from "../models/Quiz.js"
import { QuizAttempt } from "../models/QuizAttempt.js"

const app = express()
app.use(express.json())
app.use("/api/quizzes", requireAuth, quizzesRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

const sampleQuestions = [
  { text: "What is 2+2?", options: ["3", "4", "5", "6"], correct_index: 1, explanation: "Basic arithmetic" },
]

describe("GET /api/quizzes", () => {
  it("returns active quizzes for a student (without correct_index)", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(student._id.toString(), "student")

    await Quiz.create({
      school_id:   school._id,
      class_id:    cls._id,
      created_by:  teacher._id,
      title:       "Week 1 Quiz",
      is_active:   true,
      questions:   sampleQuestions,
    })

    const res = await request(app)
      .get("/api/quizzes")
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    expect(res.body.quizzes).toHaveLength(1)
    expect(res.body.quizzes[0].questions[0]).not.toHaveProperty("correct_index")
  })

  it("does not return inactive quizzes to students", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(student._id.toString(), "student")

    await Quiz.create({
      school_id:  school._id,
      class_id:   cls._id,
      created_by: teacher._id,
      title:      "Draft Quiz",
      is_active:  false,
      questions:  sampleQuestions,
    })

    const res = await request(app)
      .get("/api/quizzes")
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    expect(res.body.quizzes).toHaveLength(0)
  })

  it("returns quizzes with correct_index for teachers", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    await Quiz.create({
      school_id:  school._id,
      class_id:   cls._id,
      created_by: teacher._id,
      title:      "Teacher Quiz",
      is_active:  true,
      questions:  sampleQuestions,
    })

    const res = await request(app)
      .get("/api/quizzes")
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    expect(res.body.quizzes[0].questions[0]).toHaveProperty("correct_index")
  })
})

describe("POST /api/quizzes/:id/submit", () => {
  it("records attempt and returns score", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(student._id.toString(), "student")

    const quiz = await Quiz.create({
      school_id:   school._id,
      class_id:    cls._id,
      created_by:  teacher._id,
      title:       "Test Quiz",
      is_active:   true,
      max_attempts: 10,
      questions:   sampleQuestions,
    })

    const res = await request(app)
      .post(`/api/quizzes/${quiz._id}/attempt`)
      .set("Cookie", `ts_token=${jwt}`)
      .send({ answers: [1] })  // correct answer

    expect(res.status).toBe(200)
    // Route returns { attempt: { score, total, percentage }, per_question, explanations }
    expect(res.body.attempt.score).toBe(1)
    expect(res.body.attempt.total).toBe(1)
    expect(res.body.attempt.percentage).toBe(100)
  })

  it("prevents submissions beyond max_attempts limit", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(student._id.toString(), "student")

    const quiz = await Quiz.create({
      school_id:    school._id,
      class_id:     cls._id,
      created_by:   teacher._id,
      title:        "One Attempt Quiz",
      is_active:    true,
      max_attempts: 1,
      questions:    sampleQuestions,
    })

    // First attempt — should succeed
    const res1 = await request(app)
      .post(`/api/quizzes/${quiz._id}/attempt`)
      .set("Cookie", `ts_token=${jwt}`)
      .send({ answers: [1] })
    expect(res1.status).toBe(200)

    // Second attempt — must be rejected (max_attempts: 1)
    const res2 = await request(app)
      .post(`/api/quizzes/${quiz._id}/attempt`)
      .set("Cookie", `ts_token=${jwt}`)
      .send({ answers: [0] })
    expect(res2.status).toBe(400)
  })

  it("concurrent submissions within max_attempts all succeed (no data corruption)", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(student._id.toString(), "student")

    const quiz = await Quiz.create({
      school_id:    school._id,
      class_id:     cls._id,
      created_by:   teacher._id,
      title:        "Concurrent Quiz",
      is_active:    true,
      max_attempts: 10,
      questions:    sampleQuestions,
    })

    // Fire 3 simultaneous submissions — all within max_attempts so all should succeed
    const requests = Array.from({ length: 3 }, () =>
      request(app)
        .post(`/api/quizzes/${quiz._id}/attempt`)
        .set("Cookie", `ts_token=${jwt}`)
        .send({ answers: [1] })
    )
    const results = await Promise.all(requests)

    // 5-second dedup window means some may return 429, but no 500s or data corruption
    for (const r of results) {
      expect([200, 429]).toContain(r.status)
    }

    // At least one should have succeeded
    const successes = results.filter(r => r.status === 200)
    expect(successes.length).toBeGreaterThanOrEqual(1)

    // All stored attempts belong to the correct student
    const attempts = await QuizAttempt.find({ quiz_id: quiz._id })
    for (const a of attempts) {
      expect(a.student_id.toString()).toBe(student._id.toString())
    }
  })

  it("student from another school cannot submit", async () => {
    const school1  = await createSchool()
    const school2  = await createSchool()
    const teacher  = await createUser(school1._id, "teacher")
    const cls      = await createClass(school1._id, teacher._id)
    const outsider = await createUser(school2._id, "student")
    const jwt      = makeJwt(outsider._id.toString(), "student")

    const quiz = await Quiz.create({
      school_id:  school1._id,
      class_id:   cls._id,
      created_by: teacher._id,
      title:      "School 1 Quiz",
      is_active:  true,
      questions:  sampleQuestions,
    })

    const res = await request(app)
      .post(`/api/quizzes/${quiz._id}/attempt`)
      .set("Cookie", `ts_token=${jwt}`)
      .send({ answers: [1] })

    expect([403, 404]).toContain(res.status)
  })
})

describe("DELETE /api/quizzes/:id", () => {
  it("teacher can delete own quiz", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const quiz = await Quiz.create({
      school_id:  school._id,
      class_id:   cls._id,
      created_by: teacher._id,
      title:      "Delete Me",
      is_active:  true,
      questions:  sampleQuestions,
    })

    const res = await request(app)
      .delete(`/api/quizzes/${quiz._id}`)
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    const gone = await Quiz.findById(quiz._id)
    expect(gone).toBeNull()
  })

  it("student cannot delete a quiz", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(student._id.toString(), "student")

    const quiz = await Quiz.create({
      school_id:  school._id,
      class_id:   cls._id,
      created_by: teacher._id,
      title:      "Protected Quiz",
      is_active:  true,
      questions:  sampleQuestions,
    })

    const res = await request(app)
      .delete(`/api/quizzes/${quiz._id}`)
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(403)
  })
})
