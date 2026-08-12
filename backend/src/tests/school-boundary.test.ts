import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import {
  startDb, stopDb, clearDb,
  createSchool, createClass, createUser, makeJwt,
} from "./helpers.js"
import marksRouter from "../routes/marks.js"
import homeworkRouter from "../routes/homework.js"
import { requireAuth } from "../middleware/auth.js"
import { ExamDefinition } from "../models/ExamDefinition.js"
import { Homework } from "../models/Homework.js"

const app = express()
app.use(express.json())
app.use("/api/marks",    requireAuth, marksRouter)
app.use("/api/homework", requireAuth, homeworkRouter)

beforeAll(startDb)
afterAll(stopDb)
afterEach(clearDb)

describe("School boundary — cross-school data isolation", () => {
  it("teacher from school A cannot view exams from school B", async () => {
    const schoolA = await createSchool()
    const schoolB = await createSchool()
    const clsA    = await createClass(schoolA._id)
    const clsB    = await createClass(schoolB._id)
    const teacherA = await createUser(schoolA._id, "teacher", clsA._id)
    const teacherB = await createUser(schoolB._id, "teacher", clsB._id)

    // Create an exam in school B
    await ExamDefinition.create({
      school_id:   schoolB._id,
      class_id:    clsB._id,
      title:       "School B Exam",
      exam_type:   "unit_test",
      date:        new Date(),
      subjects:    [{ name: "Math", max_marks: 100 }],
      grade_scale: [],
      created_by:  teacherB._id,
    })

    // Teacher A queries exams for class B — should return empty, not school B data
    const tokenA = makeJwt(teacherA._id.toString(), "teacher")
    const res = await request(app)
      .get("/api/marks/exams")
      .query({ class_id: clsB._id.toString() })
      .set("Authorization", `Bearer ${tokenA}`)

    expect(res.status).toBe(200)
    // School boundary: teacher A's school_id is used in the query,
    // so school B exams should not appear
    expect(res.body.exams).toHaveLength(0)
  })

  it("student from school A cannot submit homework from school B", async () => {
    const schoolA = await createSchool()
    const schoolB = await createSchool()
    const clsA    = await createClass(schoolA._id)
    const clsB    = await createClass(schoolB._id)
    const teacherB = await createUser(schoolB._id, "teacher", clsB._id)
    const studentA = await createUser(schoolA._id, "student", clsA._id)

    const hw = await Homework.create({
      school_id:   schoolB._id,
      class_id:    clsB._id,
      created_by:  teacherB._id,
      subject:     "Math",
      title:       "School B HW",
      description: "Do it",
      due_date:    new Date(Date.now() + 86400000),
      is_active:   true,
    })

    const tokenA = makeJwt(studentA._id.toString(), "student")
    const res = await request(app)
      .post(`/api/homework/${hw._id}/submit`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ answer_text: "Attempting cross-school access" })

    // Should be blocked — student's school_id won't match homework's school_id
    expect([403, 404]).toContain(res.status)
  })

  it("unauthenticated request is blocked on all routes", async () => {
    const [r1, r2] = await Promise.all([
      request(app).get("/api/marks/exams").query({ class_id: new mongoose.Types.ObjectId().toString() }),
      request(app).get("/api/homework"),
    ])
    expect(r1.status).toBe(401)
    expect(r2.status).toBe(401)
  })
})
