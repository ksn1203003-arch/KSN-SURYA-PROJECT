import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import express from "express"
import request from "supertest"
import {
  startDb, stopDb, clearDb,
  createSchool, createClass, createUser, makeJwt,
} from "./helpers.js"
import homeworkRouter from "../routes/homework.js"
import { requireAuth } from "../middleware/auth.js"
import { Homework } from "../models/Homework.js"

const app = express()
app.use(express.json())
app.use("/api/homework", requireAuth, homeworkRouter)

beforeAll(startDb)
afterAll(stopDb)
afterEach(clearDb)

describe("Homework — create, submit, re-submit, feedback", () => {
  it("teacher can create homework", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    // Update teacher's class_id to match
    teacher.class_id = cls._id
    await teacher.save()
    const token   = makeJwt(teacher._id.toString(), "teacher")

    const due = new Date(Date.now() + 86400000).toISOString()

    const res = await request(app)
      .post("/api/homework")
      .set("Authorization", `Bearer ${token}`)
      .send({
        class_id:    cls._id.toString(),
        subject:     "Math",
        title:       "Chapter 3 Exercises",
        description: "Complete exercises 1-10",
        due_date:    due,
      })

    expect(res.status).toBe(201)
    expect(res.body.homework.title).toBe("Chapter 3 Exercises")
  })

  it("student can submit homework (upsert)", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)

    const hw = await Homework.create({
      school_id:   school._id,
      class_id:    cls._id,
      created_by:  teacher._id,
      subject:     "Math",
      title:       "HW1",
      description: "Solve",
      due_date:    new Date(Date.now() + 86400000),
      is_active:   true,
    })

    const token = makeJwt(student._id.toString(), "student")

    const res = await request(app)
      .post(`/api/homework/${hw._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answer_text: "My answer" })

    expect(res.status).toBe(200)
    expect(res.body.submission).toBeDefined()
  })

  it("student re-submit overwrites previous answer (upsert)", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)

    const hw = await Homework.create({
      school_id:   school._id,
      class_id:    cls._id,
      created_by:  teacher._id,
      subject:     "Science",
      title:       "HW2",
      description: "Describe",
      due_date:    new Date(Date.now() + 86400000),
      is_active:   true,
    })

    const token = makeJwt(student._id.toString(), "student")

    await request(app)
      .post(`/api/homework/${hw._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answer_text: "First answer" })

    const res2 = await request(app)
      .post(`/api/homework/${hw._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answer_text: "Updated answer" })

    expect(res2.status).toBe(200)
    expect(res2.body.submission.answer_text).toBe("Updated answer")
  })

  it("concurrent submissions produce exactly one record (upsert atomicity)", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)

    const hw = await Homework.create({
      school_id:   school._id,
      class_id:    cls._id,
      created_by:  teacher._id,
      subject:     "Math",
      title:       "Concurrent HW",
      description: "Race test",
      due_date:    new Date(Date.now() + 86400000),
      is_active:   true,
    })

    const token = makeJwt(student._id.toString(), "student")

    // Fire 5 simultaneous submissions
    const requests = Array.from({ length: 5 }, (_, i) =>
      request(app)
        .post(`/api/homework/${hw._id}/submit`)
        .set("Authorization", `Bearer ${token}`)
        .send({ answer_text: `Answer ${i}` })
    )
    const results = await Promise.all(requests)

    // All should succeed (upsert — last write wins)
    for (const r of results) {
      expect([200, 201]).toContain(r.status)
    }

    // Exactly ONE submission document in DB
    const { HomeworkSubmission } = await import("../models/HomeworkSubmission.js")
    const count = await HomeworkSubmission.countDocuments({
      homework_id: hw._id,
      student_id:  student._id,
    })
    expect(count).toBe(1)
  })

  it("student cannot see other students homework answers", async () => {
    const school   = await createSchool()
    const cls      = await createClass(school._id)
    const teacher  = await createUser(school._id, "teacher", cls._id)
    const student1 = await createUser(school._id, "student", cls._id)
    const student2 = await createUser(school._id, "student", cls._id)

    const hw = await Homework.create({
      school_id:   school._id,
      class_id:    cls._id,
      created_by:  teacher._id,
      subject:     "English",
      title:       "HW3",
      description: "Write",
      due_date:    new Date(Date.now() + 86400000),
      is_active:   true,
    })

    // student2 cannot access submissions endpoint (teacher only)
    const token2 = makeJwt(student2._id.toString(), "student")
    const res = await request(app)
      .get(`/api/homework/${hw._id}/submissions`)
      .set("Authorization", `Bearer ${token2}`)

    expect(res.status).toBe(403)
  })

  it("student cannot submit after due_date has passed", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)

    // due_date set 1 day in the PAST
    const hw = await Homework.create({
      school_id:   school._id,
      class_id:    cls._id,
      created_by:  teacher._id,
      subject:     "Math",
      title:       "Past HW",
      description: "Overdue",
      due_date:    new Date(Date.now() - 86400000),
      is_active:   true,
    })

    const token = makeJwt(student._id.toString(), "student")
    const res = await request(app)
      .post(`/api/homework/${hw._id}/submit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answer_text: "Late answer" })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/deadline/i)
  })

  it("teacher can only give feedback on their own homework (ownership check)", async () => {
    const school    = await createSchool()
    const cls       = await createClass(school._id)
    const teacher1  = await createUser(school._id, "teacher", cls._id)
    const teacher2  = await createUser(school._id, "teacher", cls._id)
    const student   = await createUser(school._id, "student", cls._id)

    // teacher1 creates homework
    const hw = await Homework.create({
      school_id:   school._id,
      class_id:    cls._id,
      created_by:  teacher1._id,
      subject:     "Science",
      title:       "T1 HW",
      description: "Describe",
      due_date:    new Date(Date.now() + 86400000),
      is_active:   true,
    })

    // student submits
    const studentToken = makeJwt(student._id.toString(), "student")
    const subRes = await request(app)
      .post(`/api/homework/${hw._id}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ answer_text: "My answer" })
    expect(subRes.status).toBe(200)
    const subId = subRes.body.submission._id

    // teacher2 tries to give feedback on teacher1's homework — must be 403
    const token2 = makeJwt(teacher2._id.toString(), "teacher")
    const res = await request(app)
      .patch(`/api/homework/submissions/${subId}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ feedback: "Good job", marks: 8 })

    expect(res.status).toBe(403)

    // teacher1 (owner) can give feedback — must succeed
    const token1 = makeJwt(teacher1._id.toString(), "teacher")
    const res2 = await request(app)
      .patch(`/api/homework/submissions/${subId}`)
      .set("Authorization", `Bearer ${token1}`)
      .send({ feedback: "Well done", marks: 9 })

    expect(res2.status).toBe(200)
    expect(res2.body.submission.marks).toBe(9)
  })
})
