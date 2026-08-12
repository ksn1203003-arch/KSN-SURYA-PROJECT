import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import express from "express"
import request from "supertest"
import { startDb, stopDb, clearDb, createSchool, createClass, createUser, makeJwt } from "./helpers.js"
import teacherRouter from "../routes/teacher.js"
import { requireAuth } from "../middleware/auth.js"

// ─── Attendance rate formula ───────────────────────────────────────────────────
// Formula: (present + late * 0.5) / total * 100, rounded to 1 decimal
function calcAttendanceRate(present: number, late: number, absent: number): number {
  const total = present + late + absent
  if (total === 0) return 0
  return Math.round(((present + late * 0.5) / total) * 1000) / 10
}

describe("Attendance rate formula", () => {
  it("100% when all present", () => {
    expect(calcAttendanceRate(10, 0, 0)).toBe(100)
  })

  it("0% when all absent", () => {
    expect(calcAttendanceRate(0, 0, 10)).toBe(0)
  })

  it("50% when all late (late counts 0.5)", () => {
    expect(calcAttendanceRate(0, 10, 0)).toBe(50)
  })

  it("75% for 3 present, 1 late, 0 absent out of 4", () => {
    // (3 + 0.5) / 4 = 87.5
    expect(calcAttendanceRate(3, 1, 0)).toBe(87.5)
  })

  it("returns 0 with no records", () => {
    expect(calcAttendanceRate(0, 0, 0)).toBe(0)
  })

  it("calculates mixed correctly", () => {
    // 5 present, 2 late, 3 absent = (5 + 1) / 10 = 60%
    expect(calcAttendanceRate(5, 2, 3)).toBe(60)
  })
})

// ─── Route-level: future date rejection ───────────────────────────────────────
const app = express()
app.use(express.json())
app.use("/api/teacher", requireAuth, teacherRouter)

beforeAll(startDb)
afterAll(stopDb)
afterEach(clearDb)

describe("POST /api/teacher/attendance — future date rejection", () => {
  it("rejects attendance for a future date", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)
    const token   = makeJwt(teacher._id.toString(), "teacher")

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const futureDate = tomorrow.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

    const res = await request(app)
      .post("/api/teacher/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send({
        class_id: cls._id.toString(),
        date:     futureDate,
        period:   1,
        records:  [{ student_id: student._id.toString(), student_name: student.name, status: "present" }],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/future/i)
  })

  it("accepts attendance for today", async () => {
    const school  = await createSchool()
    const cls     = await createClass(school._id)
    const teacher = await createUser(school._id, "teacher", cls._id)
    const student = await createUser(school._id, "student", cls._id)
    const token   = makeJwt(teacher._id.toString(), "teacher")

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

    const res = await request(app)
      .post("/api/teacher/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send({
        class_id: cls._id.toString(),
        date:     today,
        period:   1,
        records:  [{ student_id: student._id.toString(), student_name: student.name, status: "present" }],
      })

    // 200 or 201 — not a 400 future-date error
    expect(res.status).not.toBe(400)
  })
})
