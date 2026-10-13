import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"
import studentRouter from "../routes/student.js"
import teacherRouter from "../routes/teacher.js"
import { requireAuth } from "../middleware/auth.js"
import { Module } from "../models/Module.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { Attendance } from "../models/Attendance.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { QuizAttempt } from "../models/QuizAttempt.js"
import { User } from "../models/User.js"
import { todayIST } from "../lib/dateHelpers.js"

const app = express()
app.use(express.json())
app.use("/api/student", requireAuth, studentRouter)
app.use("/api/teacher", requireAuth, teacherRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

const cookie = (id: unknown, role: string) => `ts_token=${makeJwt(String(id), role)}`

function daysAgo(n: number): string {
  const d = new Date(todayIST() + "T00:00:00+05:30")
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

const fileItem = (label: string) => ({
  _id: new mongoose.Types.ObjectId(), order: 0, type: "file" as const, label,
  file_name: `${label}.pdf`, file_type: "application/pdf", file_size: 1000,
})

async function setupClass() {
  const school  = await createSchool()
  const teacher = await createUser(school._id, "teacher")
  const cls     = await createClass(school._id, teacher._id)
  const student = await createUser(school._id, "student", cls._id)
  const peer    = await createUser(school._id, "student", cls._id)
  return { school, teacher, cls, student, peer }
}

describe("GET /api/student/dashboard — slimmed queries give the same numbers", () => {
  it("counts only this student's attendance marks, even when classmates share the record", async () => {
    const { school, cls, student, peer } = await setupClass()
    const mark = (period: number, mine: "present" | "absent" | "late", theirs: "present" | "absent" | "late") => ({
      school_id: school._id, class_id: cls._id, date: daysAgo(1), period,
      records: [
        { student_id: student._id, student_name: "me", status: mine },
        { student_id: peer._id, student_name: "peer", status: theirs },
      ],
    })
    await Attendance.create([mark(1, "present", "absent"), mark(2, "late", "absent"), mark(3, "absent", "present")])
    // A day in another class must not count
    const other = await createClass(school._id)
    await Attendance.create({ school_id: school._id, class_id: other._id, date: daysAgo(2), period: 1,
      records: [{ student_id: student._id, student_name: "me", status: "present" }] })

    const res = await request(app).get("/api/student/dashboard").set("Cookie", cookie(student._id, "student"))
    expect(res.status).toBe(200)
    expect(res.body.days_total).toBe(3)
    expect(res.body.days_present).toBe(1)
    expect(res.body.days_recorded).toBe(1)
    // (1 + 0.5) / 3 = 50%
    expect(res.body.attendance_rate).toBe(50)
  })

  it("module progress, continue-learning and the quiz average match the full data", async () => {
    const { school, teacher, cls, student } = await setupClass()
    const items = [fileItem("a"), fileItem("b"), fileItem("c")]
    const mod = await Module.create({ school_id: school._id, class_id: cls._id, subject: "Math", title: "Fractions",
      order: 1, created_by: teacher._id, items })
    await ModuleProgress.create({ student_id: student._id, module_id: mod._id, item_id: items[0]._id })
    await QuizAttempt.create([
      { quiz_id: new mongoose.Types.ObjectId(), student_id: student._id, school_id: school._id, answers: [], score: 2, total: 3, percentage: 66.67 },
      { quiz_id: new mongoose.Types.ObjectId(), student_id: student._id, school_id: school._id, answers: [], score: 3, total: 3, percentage: 100 },
    ])

    const res = await request(app).get("/api/student/dashboard").set("Cookie", cookie(student._id, "student"))
    expect(res.status).toBe(200)
    expect(res.body.modules_total).toBe(3)
    expect(res.body.modules_completed).toBe(1)
    expect(res.body.module_progress).toEqual([{ subject: "Math", completed: 1, total: 3 }])
    expect(res.body.continue_learning).toHaveLength(1)
    expect(res.body.continue_learning[0]).toMatchObject({ module_title: "Fractions", subject: "Math", completed: 1, total: 3 })
    expect(res.body.quizzes_taken).toBe(2)
    expect(res.body.avg_quiz_score).toBe(83)
  })

  it("the streak counts back from today and stops at the first missing day", async () => {
    const { school, student } = await setupClass()
    const act = (n: number) => ({ student_id: student._id, school_id: school._id, date: daysAgo(n), logins: 1, items_viewed: 0, minutes_active: 5 })
    await StudentActivity.create([act(0), act(1), act(2), act(4), act(5)])

    const res = await request(app).get("/api/student/dashboard").set("Cookie", cookie(student._id, "student"))
    expect(res.status).toBe(200)
    expect(res.body.streak_days).toBe(3)
  })

  it("stored points never go down", async () => {
    const { student } = await setupClass()
    await User.updateOne({ _id: student._id }, { $set: { points: 500 } })

    const res = await request(app).get("/api/student/dashboard").set("Cookie", cookie(student._id, "student"))
    expect(res.status).toBe(200)
    const saved = await User.findById(student._id).select("points").lean()
    expect(saved?.points).toBe(500)
  })
})

describe("GET /api/teacher/student-progress", () => {
  it("counts only items in this class's lessons, so progress never goes over 100%", async () => {
    const { school, teacher, cls, student, peer } = await setupClass()
    const items = [fileItem("a"), fileItem("b")]
    const mod = await Module.create({ school_id: school._id, class_id: cls._id, subject: "Math", title: "M1",
      order: 1, created_by: teacher._id, items })
    // Progress left over from a module in another class (e.g. before a transfer)
    const otherCls = await createClass(school._id)
    const otherItems = [fileItem("x"), fileItem("y"), fileItem("z")]
    const otherMod = await Module.create({ school_id: school._id, class_id: otherCls._id, subject: "Math", title: "Old",
      order: 1, created_by: teacher._id, items: otherItems })
    await ModuleProgress.create([
      { student_id: student._id, module_id: mod._id, item_id: items[0]._id },
      ...otherItems.map(i => ({ student_id: student._id, module_id: otherMod._id, item_id: i._id })),
    ])
    await Attendance.create({ school_id: school._id, class_id: cls._id, date: daysAgo(1), period: 1,
      records: [{ student_id: student._id, student_name: "s", status: "late" }, { student_id: peer._id, student_name: "p", status: "present" }] })

    const res = await request(app).get("/api/teacher/student-progress")
      .query({ class_id: cls._id.toString() })
      .set("Cookie", cookie(teacher._id, "teacher"))
    expect(res.status).toBe(200)
    const byId = Object.fromEntries((res.body.progress as Array<{ student_id: string; course: number; attendance: number | null }>).map(p => [p.student_id, p]))
    expect(byId[student._id.toString()]).toMatchObject({ course: 50, attendance: 50 })
    expect(byId[peer._id.toString()]).toMatchObject({ course: 0, attendance: 100 })
  })

  it("rejects a malformed class id with 400 instead of failing", async () => {
    const { teacher } = await setupClass()
    const res = await request(app).get("/api/teacher/student-progress")
      .query({ class_id: "not-an-id" })
      .set("Cookie", cookie(teacher._id, "teacher"))
    expect(res.status).toBe(400)
  })

  it("refuses a class from another school", async () => {
    const { teacher } = await setupClass()
    const otherSchool = await createSchool()
    const foreign = await createClass(otherSchool._id)
    const res = await request(app).get("/api/teacher/student-progress")
      .query({ class_id: foreign._id.toString() })
      .set("Cookie", cookie(teacher._id, "teacher"))
    expect(res.status).toBe(403)
  })
})

describe("review fixes — dashboard and progress", () => {
  it("students only see notifications meant for everyone, students, or their own class", async () => {
    const { school, cls, student } = await setupClass()
    const other = await createClass(school._id)
    const soon = new Date(Date.now() + 86_400_000)
    const base = { school_id: school._id, type: "event", message: "m", expires_at: soon, scheduled_at: null, createdAt: new Date() }
    await mongoose.connection.db!.collection("notifications").insertMany([
      { ...base, title: "for-all", target: "all" },
      { ...base, title: "for-students", target: "students" },
      { ...base, title: "for-my-class", target: cls._id.toString() },
      { ...base, title: "staff-only", target: "teachers" },
      { ...base, title: "other-class", target: other._id.toString() },
    ])
    const res = await request(app).get("/api/student/dashboard").set("Cookie", cookie(student._id, "student"))
    expect(res.status).toBe(200)
    const titles = (res.body.upcoming_events as Array<{ title: string }>).map(e => e.title).sort()
    expect(titles).toEqual(["for-all", "for-my-class", "for-students"])
  })

  it("stored points go up when today's score is higher, even when no points were stored before", async () => {
    const { school, student } = await setupClass()
    await User.updateOne({ _id: student._id }, { $unset: { points: 1 } })
    await StudentActivity.create({ student_id: student._id, school_id: school._id, date: todayIST(), logins: 1, items_viewed: 0, minutes_active: 1 })
    await request(app).get("/api/student/dashboard").set("Cookie", cookie(student._id, "student"))
    const saved = await User.findById(student._id).select("points").lean()
    expect(saved?.points).toBe(5)
  })

  it("a teacher who does not teach the class cannot read its progress", async () => {
    const { school, cls } = await setupClass()
    const outsider = await createUser(school._id, "teacher")
    const res = await request(app).get("/api/teacher/student-progress")
      .query({ class_id: cls._id.toString() })
      .set("Cookie", cookie(outsider._id, "teacher"))
    expect(res.status).toBe(403)
  })

  it("deactivated students are not listed in class progress", async () => {
    const { teacher, cls, student, peer } = await setupClass()
    await User.updateOne({ _id: peer._id }, { $set: { is_active: false } })
    const res = await request(app).get("/api/teacher/student-progress")
      .query({ class_id: cls._id.toString() })
      .set("Cookie", cookie(teacher._id, "teacher"))
    expect(res.status).toBe(200)
    expect((res.body.progress as Array<{ student_id: string }>).map(p => p.student_id)).toEqual([student._id.toString()])
  })
})
