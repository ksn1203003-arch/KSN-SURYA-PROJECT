import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import {
  startDb, stopDb, clearDb,
  createSchool, createClass, createUser, makeJwt,
} from "./helpers.js"
import marksRouter from "../routes/marks.js"
import { requireAuth } from "../middleware/auth.js"
import { ExamDefinition } from "../models/ExamDefinition.js"
import type { IGradeScale } from "../models/ExamDefinition.js"

const app = express()
app.use(express.json())
app.use("/api/marks", requireAuth, marksRouter)

beforeAll(startDb)
afterAll(stopDb)
afterEach(clearDb)

// ── Grade calculation ─────────────────────────────────────────────────────────
function calcGrade(pct: number, scale: IGradeScale[]): string {
  const sorted = [...scale].sort((a, b) => b.min - a.min)
  return sorted.find(s => pct >= s.min)?.grade ?? "F"
}

const DEFAULT_SCALE: IGradeScale[] = [
  { min: 90, grade: "A+", label: "Outstanding" },
  { min: 80, grade: "A",  label: "Excellent" },
  { min: 70, grade: "B+", label: "Very Good" },
  { min: 60, grade: "B",  label: "Good" },
  { min: 50, grade: "C",  label: "Average" },
  { min: 40, grade: "D",  label: "Below Average" },
  { min: 0,  grade: "F",  label: "Fail" },
]

describe("Grade calculation", () => {
  it("gives A+ for 95%", () => expect(calcGrade(95, DEFAULT_SCALE)).toBe("A+"))
  it("gives A+ for exactly 90%", () => expect(calcGrade(90, DEFAULT_SCALE)).toBe("A+"))
  it("gives A for 85%", () => expect(calcGrade(85, DEFAULT_SCALE)).toBe("A"))
  it("gives B+ for 70%", () => expect(calcGrade(70, DEFAULT_SCALE)).toBe("B+"))
  it("gives F for 30%", () => expect(calcGrade(30, DEFAULT_SCALE)).toBe("F"))
  it("gives F for 0%", () => expect(calcGrade(0, DEFAULT_SCALE)).toBe("F"))
})

// ── Bulk marks upsert — SEC-5 cross-school boundary ──────────────────────────
describe("POST /api/marks/exams/:id/results — school boundary (SEC-5)", () => {
  it("rejects entries containing a student from another school", async () => {
    const schoolA  = await createSchool()
    const schoolB  = await createSchool()
    const clsA     = await createClass(schoolA._id)
    const teacher  = await createUser(schoolA._id, "teacher", clsA._id)
    const studentA = await createUser(schoolA._id, "student", clsA._id)
    const clsB     = await createClass(schoolB._id)
    const studentB = await createUser(schoolB._id, "student", clsB._id)

    const exam = await ExamDefinition.create({
      school_id:   schoolA._id,
      class_id:    clsA._id,
      title:       "Unit Test 1",
      exam_type:   "unit_test",
      date:        new Date(),
      subjects:    [{ name: "Math", max_marks: 100 }],
      grade_scale: DEFAULT_SCALE,
      created_by:  teacher._id,
    })

    const token = makeJwt(teacher._id.toString(), "teacher")

    const res = await request(app)
      .put(`/api/marks/exams/${exam._id}/results`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        entries: [
          { student_id: studentA._id.toString(), subject: "Math", marks_obtained: 80, is_absent: false },
          { student_id: studentB._id.toString(), subject: "Math", marks_obtained: 70, is_absent: false },
        ],
      })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/do not belong to your school/i)
  })

  it("accepts entries for valid school students", async () => {
    const school   = await createSchool()
    const cls      = await createClass(school._id)
    const teacher  = await createUser(school._id, "teacher", cls._id)
    const student  = await createUser(school._id, "student", cls._id)

    const exam = await ExamDefinition.create({
      school_id:   school._id,
      class_id:    cls._id,
      title:       "Unit Test 2",
      exam_type:   "unit_test",
      date:        new Date(),
      subjects:    [{ name: "Math", max_marks: 100 }],
      grade_scale: DEFAULT_SCALE,
      created_by:  teacher._id,
    })

    const token = makeJwt(teacher._id.toString(), "teacher")

    const res = await request(app)
      .put(`/api/marks/exams/${exam._id}/results`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        entries: [
          { student_id: student._id.toString(), subject: "Math", marks_obtained: 88, is_absent: false },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("returns 400 for out-of-range marks", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)

    const exam = await ExamDefinition.create({
      school_id:   school._id,
      class_id:    cls._id,
      title:       "Unit Test 3",
      exam_type:   "unit_test",
      date:        new Date(),
      subjects:    [{ name: "Math", max_marks: 50 }],
      grade_scale: DEFAULT_SCALE,
      created_by:  teacher._id,
    })

    const token = makeJwt(teacher._id.toString(), "teacher")

    const res = await request(app)
      .put(`/api/marks/exams/${exam._id}/results`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        entries: [
          { student_id: student._id.toString(), subject: "Math", marks_obtained: 99, is_absent: false },
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Math/i)
  })
})
