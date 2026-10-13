// ─────────────────────────────────────────────────────────────────────────────
// Step 0 guard tests for the student dashboard, attendance and activity routes.
//
// IMPORTANT: this file records TODAY's behaviour of routes/student.ts, NOT the
// desired behaviour. Tests whose name starts with "TODAY:" pin something that a
// later step is expected to change (when that step lands, the test is meant to
// be updated on purpose). Tests without the prefix pin behaviour that should
// stay the same. it.todo entries describe behaviour wanted later.
//
// Dates are pinned with fake timers (only Date is faked, never setTimeout or
// setInterval, so the database driver keeps working): ordinary cases run on
// Wednesday 2026-10-07 at 12:00 IST, week-start cases on Monday 2026-10-05.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"
import studentRouter from "../routes/student.js"
import { requireAuth } from "../middleware/auth.js"
import { Attendance } from "../models/Attendance.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { QuizAttempt } from "../models/QuizAttempt.js"
import { ChallengeSubmission } from "../models/ChallengeSubmission.js"
import { Module } from "../models/Module.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { Class } from "../models/Class.js"
import { User } from "../models/User.js"
import { todayIST, weekStartIST, academicYearStartIST } from "../lib/dateHelpers.js"

const app = express()
app.use(express.json())
app.use("/api/student", requireAuth, studentRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

const WEDNESDAY_NOON_IST = "2026-10-07T12:00:00+05:30"
const MONDAY_NOON_IST    = "2026-10-05T12:00:00+05:30"

type Status = "present" | "absent" | "late"
type Mark = { id: mongoose.Types.ObjectId; name: string; status: Status }

const EMPTY = { total: 0, present: 0, absent: 0, late: 0, rate: 0, recorded: false }

const cookie = (id: unknown, role: string) => `ts_token=${makeJwt(String(id), role)}`

function daysAgo(n: number): string {
  const d = new Date(todayIST() + "T00:00:00+05:30")
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

async function sheet(
  schoolId: mongoose.Types.ObjectId | undefined,
  classId: mongoose.Types.ObjectId,
  date: string,
  period: number,
  marks: Mark[],
) {
  return Attendance.create({
    ...(schoolId ? { school_id: schoolId } : {}),
    class_id: classId, date, period,
    records: marks.map(m => ({ student_id: m.id, student_name: m.name, status: m.status })),
  })
}

async function schoolWithClass(names: string[]) {
  const school  = await createSchool()
  const teacher = await createUser(school._id, "teacher")
  const cls     = await createClass(school._id, teacher._id)
  const students = []
  for (const name of names) students.push(await createUser(school._id, "student", cls._id, { name }))
  return { school, teacher, cls, students }
}

async function dashboardAs(studentId: unknown) {
  return request(app).get("/api/student/dashboard").set("Cookie", cookie(studentId, "student"))
}

async function attendanceAs(studentId: unknown) {
  return request(app).get("/api/student/attendance").set("Cookie", cookie(studentId, "student"))
}

async function rangeAs(studentId: unknown, query: Record<string, string>) {
  return request(app).get("/api/student/attendance/range").query(query).set("Cookie", cookie(studentId, "student"))
}

async function todaysActivity(studentId: mongoose.Types.ObjectId) {
  return StudentActivity.findOne({ student_id: studentId, date: todayIST() }).lean()
}

const fileItem = (label: string) => ({
  _id: new mongoose.Types.ObjectId(), order: 0, type: "file" as const, label,
  file_name: `${label}.pdf`, file_type: "application/pdf", file_size: 1000,
})

describe("student dashboard guard (Step 0: pins today's behaviour before the dashboard load work)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(WEDNESDAY_NOON_IST))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("the pinned clock gives the dates the literal expectations below rely on", () => {
    expect(todayIST()).toBe("2026-10-07")
    expect(weekStartIST()).toBe("2026-10-05")
    expect(daysAgo(1)).toBe("2026-10-06")
  })

  describe("golden attendance numbers", () => {
    async function seedGolden() {
      const { school, cls, students } = await schoolWithClass(["Golden S", "Golden P", "Golden Z"])
      const [s, p, z] = students
      const S = (status: Status): Mark => ({ id: s._id, name: "Golden S", status })
      const P = (status: Status): Mark => ({ id: p._id, name: "Golden P", status })

      // Another school with an identically shaped class: same dates, same periods, everything marked absent
      const other = await schoolWithClass(["Golden X", "Golden Y"])
      const [x, y] = other.students
      const layout: Array<[number, number, Status, Status]> = [
        [3, 1, "present", "late"],
        [2, 1, "late", "present"],
        [2, 2, "absent", "absent"],
        [2, 3, "present", "present"],
        [1, 1, "present", "absent"],
        [1, 2, "late", "present"],
      ]
      for (const [ago, period, sStatus, pStatus] of layout) {
        await sheet(school._id, cls._id, daysAgo(ago), period, [S(sStatus), P(pStatus)])
        await sheet(other.school._id, other.cls._id, daysAgo(ago), period, [
          { id: x._id, name: "Golden X", status: "absent" },
          { id: y._id, name: "Golden Y", status: "absent" },
        ])
      }
      return { s, p, z, x }
    }

    it("TODAY: student S: days_total counts 6 period records (not days) over 3 days, 3 present, 2 late, 1 absent = 66.7%", async () => {
      const { s } = await seedGolden()
      const res = await dashboardAs(s._id)
      expect(res.status).toBe(200)
      expect(res.body.days_total).toBe(6)
      expect(res.body.days_present).toBe(3)
      expect(res.body.days_recorded).toBe(3)
      // (3 + 2 x 0.5) / 6 = 66.666... rounded to one decimal
      expect(res.body.attendance_rate).toBe(66.7)
    })

    it("TODAY: student P: days_total counts 6 period records (not days) over 3 days, 3 present, 1 late, 2 absent = 58.3%", async () => {
      const { p } = await seedGolden()
      const res = await dashboardAs(p._id)
      expect(res.status).toBe(200)
      expect(res.body.days_total).toBe(6)
      expect(res.body.days_present).toBe(3)
      expect(res.body.days_recorded).toBe(3)
      // (3 + 1 x 0.5) / 6 = 58.333... rounded to one decimal
      expect(res.body.attendance_rate).toBe(58.3)
    })

    it("a student with no attendance marks gets 0 records, 0 days and a rate of 0", async () => {
      const { z } = await seedGolden()
      const res = await dashboardAs(z._id)
      expect(res.status).toBe(200)
      expect(res.body.days_total).toBe(0)
      expect(res.body.days_present).toBe(0)
      expect(res.body.days_recorded).toBe(0)
      expect(res.body.attendance_rate).toBe(0)
    })

    it("marks from the identically shaped class in another school add nothing to S or P", async () => {
      const { s, p, x } = await seedGolden()
      const resX = await dashboardAs(x._id)
      expect(resX.status).toBe(200)
      expect(resX.body.days_total).toBe(6)
      expect(resX.body.days_present).toBe(0)
      expect(resX.body.attendance_rate).toBe(0)

      const resS = await dashboardAs(s._id)
      const resP = await dashboardAs(p._id)
      expect(resS.body.days_total).toBe(6)
      expect(resS.body.attendance_rate).toBe(66.7)
      expect(resP.body.days_total).toBe(6)
      expect(resP.body.attendance_rate).toBe(58.3)
    })
  })

  describe("privacy of the student attendance answers", () => {
    it("student A never receives B's or C's id or name, only A's own numbers", async () => {
      const { school, cls, students } = await schoolWithClass(["Zed Alpha", "Zed Bravo"])
      const [a, b] = students
      const outside = await schoolWithClass(["Zed Charlie", "Zed Delta"])
      const [c, d] = outside.students

      await sheet(school._id, cls._id, daysAgo(2), 1, [
        { id: a._id, name: "Zed Alpha", status: "present" },
        { id: b._id, name: "Zed Bravo", status: "absent" },
      ])
      await sheet(school._id, cls._id, daysAgo(1), 1, [
        { id: a._id, name: "Zed Alpha", status: "late" },
        { id: b._id, name: "Zed Bravo", status: "present" },
      ])
      await sheet(outside.school._id, outside.cls._id, daysAgo(2), 1, [
        { id: c._id, name: "Zed Charlie", status: "present" },
        { id: d._id, name: "Zed Delta", status: "present" },
      ])
      await sheet(outside.school._id, outside.cls._id, daysAgo(1), 1, [
        { id: c._id, name: "Zed Charlie", status: "late" },
        { id: d._id, name: "Zed Delta", status: "absent" },
      ])

      const dash  = await dashboardAs(a._id)
      const att   = await attendanceAs(a._id)
      const range = await rangeAs(a._id, { from: daysAgo(5), to: todayIST() })
      expect(dash.status).toBe(200)
      expect(att.status).toBe(200)
      expect(range.status).toBe(200)

      for (const body of [dash.body, att.body, range.body]) {
        const text = JSON.stringify(body)
        for (const hidden of [b._id.toString(), c._id.toString(), d._id.toString(), "Zed Bravo", "Zed Charlie", "Zed Delta"]) {
          expect(text).not.toContain(hidden)
        }
      }

      expect(dash.body.days_total).toBe(2)
      expect(dash.body.days_present).toBe(1)
      expect(dash.body.days_recorded).toBe(2)
      // (1 + 1 x 0.5) / 2 = 75%
      expect(dash.body.attendance_rate).toBe(75)

      expect(att.body.records).toEqual([
        { date: daysAgo(1), period: 1, subject: "", status: "late" },
        { date: daysAgo(2), period: 1, subject: "", status: "present" },
      ])
      expect(range.body.result).toEqual({ total: 2, present: 1, absent: 0, late: 1, rate: 75, recorded: true })
    })
  })

  describe("/attendance summary windows (today, this week, this month, this year)", () => {
    // Routes read academicYearStartIST(): month comes from ACADEMIC_YEAR_START_MONTH (default 6 = June)
    let savedMonth: string | undefined
    beforeEach(() => {
      savedMonth = process.env.ACADEMIC_YEAR_START_MONTH
      process.env.ACADEMIC_YEAR_START_MONTH = "6"
    })
    afterEach(() => {
      if (savedMonth === undefined) delete process.env.ACADEMIC_YEAR_START_MONTH
      else process.env.ACADEMIC_YEAR_START_MONTH = savedMonth
    })

    it("on Wednesday 2026-10-07 each window counts only the sheets inside it; the day before the academic year is excluded from this_year", async () => {
      expect(todayIST()).toBe("2026-10-07")
      expect(weekStartIST()).toBe("2026-10-05")
      expect(academicYearStartIST()).toBe("2026-06-01")

      const { school, cls, students } = await schoolWithClass(["Window Student"])
      const [s] = students
      const M = (status: Status): Mark => ({ id: s._id, name: "Window Student", status })
      await sheet(school._id, cls._id, "2026-10-07", 1, [M("present")]) // today
      await sheet(school._id, cls._id, "2026-10-05", 1, [M("late")])    // Monday of this IST week
      await sheet(school._id, cls._id, "2026-10-01", 1, [M("absent")])  // first day of this IST month
      await sheet(school._id, cls._id, "2026-09-15", 1, [M("present")]) // inside the academic year, outside the month
      await sheet(school._id, cls._id, "2026-05-31", 1, [M("present")]) // day before the academic year starts

      const res = await attendanceAs(s._id)
      expect(res.status).toBe(200)
      expect(res.body.summary).toEqual({
        today:      { total: 1, present: 1, absent: 0, late: 0, rate: 100,  recorded: true },
        // 10-05 late + 10-07 present: (1 + 0.5) / 2 = 75
        this_week:  { total: 2, present: 1, absent: 0, late: 1, rate: 75,   recorded: true },
        // + 10-01 absent: (1 + 0.5) / 3 = 50
        this_month: { total: 3, present: 1, absent: 1, late: 1, rate: 50,   recorded: true },
        // + 09-15 present, and NOT 05-31: (2 + 0.5) / 4 = 62.5
        this_year:  { total: 4, present: 2, absent: 1, late: 1, rate: 62.5, recorded: true },
      })
      // The records list is not limited by any window
      expect((res.body.records as Array<{ date: string }>).map(r => r.date)).toEqual([
        "2026-10-07", "2026-10-05", "2026-10-01", "2026-09-15", "2026-05-31",
      ])
    })

    it("on a Monday the week window is that day only: the Sunday before is in the month but not in the week", async () => {
      vi.setSystemTime(new Date(MONDAY_NOON_IST))
      expect(todayIST()).toBe("2026-10-05")
      expect(weekStartIST()).toBe("2026-10-05")

      const { school, cls, students } = await schoolWithClass(["Monday Student"])
      const [s] = students
      await sheet(school._id, cls._id, "2026-10-04", 1, [{ id: s._id, name: "Monday Student", status: "present" }]) // Sunday
      await sheet(school._id, cls._id, "2026-10-05", 1, [{ id: s._id, name: "Monday Student", status: "absent" }])  // Monday = today

      const res = await attendanceAs(s._id)
      expect(res.status).toBe(200)
      expect(res.body.summary).toEqual({
        today:      { total: 1, present: 0, absent: 1, late: 0, rate: 0,  recorded: true },
        this_week:  { total: 1, present: 0, absent: 1, late: 0, rate: 0,  recorded: true },
        this_month: { total: 2, present: 1, absent: 1, late: 0, rate: 50, recorded: true },
        this_year:  { total: 2, present: 1, absent: 1, late: 0, rate: 50, recorded: true },
      })
    })

    it("a student with no sheets gets the empty shape in every window and an empty list", async () => {
      const { students } = await schoolWithClass(["Nothing Yet"])
      const res = await attendanceAs(students[0]._id)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        summary: { today: EMPTY, this_week: EMPTY, this_month: EMPTY, this_year: EMPTY },
        records: [],
      })
    })
  })

  describe("string-typed student_id in an attendance sheet (stored through the raw collection)", () => {
    async function rawSheet(
      schoolId: mongoose.Types.ObjectId,
      classId: mongoose.Types.ObjectId,
      date: string,
      period: number,
      rows: Array<{ student_id: unknown; status: Status }>,
    ) {
      await mongoose.connection.db!.collection("attendances").insertOne({
        school_id: schoolId, class_id: classId, date, period, subject: "",
        records: rows.map(r => ({ student_id: r.student_id, student_name: "raw", status: r.status })),
      })
    }

    it("TODAY: a sheet whose only row for the student has a string student_id is ignored by the dashboard, /attendance and /attendance/range alike", async () => {
      const { school, cls, students } = await schoolWithClass(["String Only"])
      const [s] = students
      await rawSheet(school._id, cls._id, daysAgo(1), 1, [{ student_id: s._id.toString(), status: "present" }])

      // Dashboard: the $match on records.student_id compares with an ObjectId, so a string-only sheet never reaches the $toString filter
      const dash = await dashboardAs(s._id)
      expect(dash.status).toBe(200)
      expect(dash.body.days_total).toBe(0)
      expect(dash.body.days_present).toBe(0)
      expect(dash.body.days_recorded).toBe(0)
      expect(dash.body.attendance_rate).toBe(0)

      const att = await attendanceAs(s._id)
      expect(att.body.summary.this_year).toEqual(EMPTY)
      expect(att.body.records).toEqual([])

      const range = await rangeAs(s._id, { from: daysAgo(5), to: todayIST() })
      expect(range.body.result).toEqual(EMPTY)
    })

    it("TODAY: the dashboard counts a string-typed student_id record, but /attendance and /attendance/range do not (inconsistent)", async () => {
      // Only true when the same sheet ALSO holds an ObjectId row for the student (that row makes the sheet pass the
      // dashboard's $match; its $toString filter then keeps the string row as well). /attendance and /range
      // $unwind and $match on the ObjectId, so they see only the ObjectId row.
      const { school, cls, students } = await schoolWithClass(["String Mixed"])
      const [s] = students
      await rawSheet(school._id, cls._id, daysAgo(1), 1, [
        { student_id: s._id,            status: "present" },
        { student_id: s._id.toString(), status: "absent" },
      ])

      const dash = await dashboardAs(s._id)
      expect(dash.status).toBe(200)
      expect(dash.body.days_total).toBe(2)
      expect(dash.body.days_present).toBe(1)
      expect(dash.body.days_recorded).toBe(1)
      // 1 / 2 = 50
      expect(dash.body.attendance_rate).toBe(50)

      const att = await attendanceAs(s._id)
      expect(att.body.summary.this_year).toEqual({ total: 1, present: 1, absent: 0, late: 0, rate: 100, recorded: true })
      expect(att.body.records).toEqual([{ date: daysAgo(1), period: 1, subject: "", status: "present" }])

      const range = await rangeAs(s._id, { from: daysAgo(5), to: todayIST() })
      expect(range.body.result).toEqual({ total: 1, present: 1, absent: 0, late: 0, rate: 100, recorded: true })
    })
  })

  describe("which sheets are counted (class and school fixtures)", () => {
    it("a legacy sheet with no school_id is still counted when it has the student's class_id", async () => {
      const { cls, students } = await schoolWithClass(["Legacy Student"])
      const [s] = students
      const doc = await sheet(undefined, cls._id, daysAgo(1), 1, [{ id: s._id, name: "Legacy Student", status: "present" }])
      const raw = await mongoose.connection.db!.collection("attendances").findOne({ _id: doc._id })
      expect(raw && "school_id" in raw).toBe(false)

      const res = await dashboardAs(s._id)
      expect(res.status).toBe(200)
      expect(res.body.days_total).toBe(1)
      expect(res.body.days_present).toBe(1)
      expect(res.body.attendance_rate).toBe(100)
    })

    it("a sheet of the student's OLD class is excluded after the student moves class", async () => {
      const { school, cls: oldCls, students } = await schoolWithClass(["Mover"])
      const [s] = students
      const newCls = await createClass(school._id)
      await sheet(school._id, oldCls._id, daysAgo(2), 1, [{ id: s._id, name: "Mover", status: "present" }])
      await User.updateOne({ _id: s._id }, { $set: { class_id: newCls._id } })
      await sheet(school._id, newCls._id, daysAgo(1), 1, [{ id: s._id, name: "Mover", status: "late" }])

      const dash = await dashboardAs(s._id)
      expect(dash.status).toBe(200)
      expect(dash.body.days_total).toBe(1)
      expect(dash.body.days_present).toBe(0)
      expect(dash.body.days_recorded).toBe(1)
      // 0.5 / 1 = 50
      expect(dash.body.attendance_rate).toBe(50)

      const att = await attendanceAs(s._id)
      expect(att.body.summary.this_year).toEqual({ total: 1, present: 0, absent: 0, late: 1, rate: 50, recorded: true })
      const range = await rangeAs(s._id, { from: daysAgo(5), to: todayIST() })
      expect(range.body.result).toEqual({ total: 1, present: 0, absent: 0, late: 1, rate: 50, recorded: true })
    })

    it("TODAY: a sheet with the student's class_id but a foreign school_id IS counted (attendance is not filtered by school_id)", async () => {
      const { cls, students } = await schoolWithClass(["Foreign Stamp"])
      const [s] = students
      const foreignSchool = await createSchool()
      await sheet(foreignSchool._id, cls._id, daysAgo(1), 1, [{ id: s._id, name: "Foreign Stamp", status: "present" }])

      const dash = await dashboardAs(s._id)
      expect(dash.status).toBe(200)
      expect(dash.body.days_total).toBe(1)
      expect(dash.body.days_present).toBe(1)
      expect(dash.body.attendance_rate).toBe(100)

      const att = await attendanceAs(s._id)
      expect(att.body.summary.this_year).toEqual({ total: 1, present: 1, absent: 0, late: 0, rate: 100, recorded: true })
      const range = await rangeAs(s._id, { from: daysAgo(5), to: todayIST() })
      expect(range.body.result).toEqual({ total: 1, present: 1, absent: 0, late: 0, rate: 100, recorded: true })
    })
  })

  describe("GET /attendance/range", () => {
    async function studentWithSheets(sheets: Array<[string, Status]>) {
      const { school, cls, students } = await schoolWithClass(["Range Student"])
      const [s] = students
      // One sheet per distinct date, so period 1 never collides on the unique class+date+period index
      for (const [date, status] of sheets) {
        await sheet(school._id, cls._id, date, 1, [{ id: s._id, name: "Range Student", status }])
      }
      return s
    }

    it("a malformed or missing date answers 400 with the same message", async () => {
      const { students } = await schoolWithClass(["Bad Dates"])
      const id = students[0]._id
      for (const query of [
        { from: "2026-10-1",           to: "2026-10-05" },
        { from: "2026-10-01",          to: "05-10-2026" },
        { from: "2026-10-01T00:00:00", to: "2026-10-05" },
        { from: "2026-10-01" },
        {},
      ] as Array<Record<string, string>>) {
        const res = await rangeAs(id, query)
        expect(res.status).toBe(400)
        expect(res.body).toEqual({ error: "from and to must be YYYY-MM-DD" })
      }
    })

    it("from later than to is swapped silently, so both ends still count", async () => {
      const s = await studentWithSheets([["2026-10-05", "present"], ["2026-10-06", "absent"]])
      const res = await rangeAs(s._id, { from: "2026-10-06", to: "2026-10-05" })
      expect(res.status).toBe(200)
      expect(res.body.result).toEqual({ total: 2, present: 1, absent: 1, late: 0, rate: 50, recorded: true })
    })

    it("a to date in the future is capped to today, so a sheet dated in the future is not counted", async () => {
      const s = await studentWithSheets([["2026-10-07", "late"], ["2026-10-09", "present"]])
      const res = await rangeAs(s._id, { from: "2026-10-01", to: "2026-10-30" })
      expect(res.status).toBe(200)
      expect(res.body.result).toEqual({ total: 1, present: 0, absent: 0, late: 1, rate: 50, recorded: true })
    })

    it("a range that lies wholly in the future finds nothing (to is capped to today first)", async () => {
      const s = await studentWithSheets([["2026-10-09", "present"]])
      const res = await rangeAs(s._id, { from: "2026-10-08", to: "2026-10-30" })
      expect(res.status).toBe(200)
      expect(res.body.result).toEqual(EMPTY)
    })

    it("both boundary dates are inclusive and nothing outside them is counted", async () => {
      const s = await studentWithSheets([
        ["2026-10-01", "present"],
        ["2026-10-03", "absent"],
        ["2026-10-05", "late"],
        ["2026-10-06", "present"],
      ])
      const res = await rangeAs(s._id, { from: "2026-10-03", to: "2026-10-05" })
      expect(res.status).toBe(200)
      // 10-03 absent + 10-05 late: 0.5 / 2 = 25
      expect(res.body.result).toEqual({ total: 2, present: 0, absent: 1, late: 1, rate: 25, recorded: true })
    })

    it("a range with no sheets gives the empty shape with recorded false", async () => {
      const s = await studentWithSheets([["2026-10-01", "present"]])
      const res = await rangeAs(s._id, { from: "2026-10-03", to: "2026-10-05" })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ result: { total: 0, present: 0, absent: 0, late: 0, rate: 0, recorded: false } })
    })
  })

  describe("duplicate rows for one student in one sheet", () => {
    it("TODAY: a sheet that lists the same student twice counts both rows (days_total 2 for one period)", async () => {
      const { school, cls, students } = await schoolWithClass(["Twice Listed"])
      const [s] = students
      await sheet(school._id, cls._id, daysAgo(1), 1, [
        { id: s._id, name: "Twice Listed", status: "present" },
        { id: s._id, name: "Twice Listed", status: "absent" },
      ])
      const res = await dashboardAs(s._id)
      expect(res.status).toBe(200)
      expect(res.body.days_total).toBe(2)
      expect(res.body.days_present).toBe(1)
      expect(res.body.days_recorded).toBe(1)
      // 1 / 2 = 50
      expect(res.body.attendance_rate).toBe(50)
    })

    it.todo("a sheet that lists the same student twice counts once")
  })

  describe("points as the dashboard computes them today", () => {
    async function oneStudent() {
      const { school, students } = await schoolWithClass(["Points Student"])
      return { school, student: students[0] }
    }

    // The week starts at the date weekStartIST() reports, read as midnight UTC (05:30 IST)
    const mondayNoonIST = () => new Date(weekStartIST() + "T12:00:00+05:30")
    const sundayNoonBeforeIST = () => new Date(mondayNoonIST().getTime() - 86_400_000)

    async function attempt(
      schoolId: mongoose.Types.ObjectId,
      studentId: mongoose.Types.ObjectId,
      percentage: number,
      submittedAt: Date,
    ) {
      return QuizAttempt.create({
        quiz_id: new mongoose.Types.ObjectId(), student_id: studentId, school_id: schoolId,
        answers: [], score: percentage, total: 100, percentage, submitted_at: submittedAt,
      })
    }

    it("(a) logged in today only = 5 points, and 5 is stored", async () => {
      const { school, student } = await oneStudent()
      await StudentActivity.create({ student_id: student._id, school_id: school._id, date: todayIST(), logins: 1, items_viewed: 0, minutes_active: 5 })
      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body.points_total).toBe(5)
      const saved = await User.findById(student._id).select("points").lean()
      expect(saved?.points).toBe(5)
    })

    it("(b) an 80% attempt submitted on Monday of this IST week = 20 points", async () => {
      const { school, student } = await oneStudent()
      await attempt(school._id, student._id, 80, mondayNoonIST())
      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body.points_total).toBe(20)
    })

    it("(b) the same attempt submitted on the Sunday before that Monday = 0 points", async () => {
      const { school, student } = await oneStudent()
      await attempt(school._id, student._id, 80, sundayNoonBeforeIST())
      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body.points_total).toBe(0)
    })

    it("(b) a 79% attempt this week earns nothing", async () => {
      const { school, student } = await oneStudent()
      await attempt(school._id, student._id, 79, mondayNoonIST())
      const res = await dashboardAs(student._id)
      expect(res.body.points_total).toBe(0)
    })

    it("TODAY: the quiz week starts at 05:30 IST on Monday, so an 80% attempt at 00:30 IST that Monday earns nothing", async () => {
      vi.setSystemTime(new Date(MONDAY_NOON_IST))
      expect(weekStartIST()).toBe("2026-10-05")
      const { school, student } = await oneStudent()
      await attempt(school._id, student._id, 80, new Date("2026-10-05T00:30:00+05:30"))
      const res = await dashboardAs(student._id)
      expect(res.body.points_total).toBe(0)
    })

    it("TODAY: the quiz week starts at 05:30 IST on Monday, so an 80% attempt at 05:30 IST that Monday earns 20", async () => {
      vi.setSystemTime(new Date(MONDAY_NOON_IST))
      const { school, student } = await oneStudent()
      await attempt(school._id, student._id, 80, new Date("2026-10-05T05:30:00+05:30"))
      const res = await dashboardAs(student._id)
      expect(res.body.points_total).toBe(20)
    })

    it("(c) no activity row for today gives no login or item points", async () => {
      const { school, student } = await oneStudent()
      await StudentActivity.create({ student_id: student._id, school_id: school._id, date: daysAgo(1), logins: 1, items_viewed: 5, minutes_active: 5 })
      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body.points_total).toBe(0)
      expect(res.body.streak_days).toBe(0)
    })

    it("(d) 3 items viewed today = 10 points; 2 items = 0 points", async () => {
      const { school, student } = await oneStudent()
      await StudentActivity.create({ student_id: student._id, school_id: school._id, date: todayIST(), logins: 0, items_viewed: 3, minutes_active: 0 })
      const three = await dashboardAs(student._id)
      expect(three.body.points_total).toBe(10)

      await StudentActivity.updateOne({ student_id: student._id, date: todayIST() }, { $set: { items_viewed: 2 } })
      const two = await dashboardAs(student._id)
      expect(two.body.points_total).toBe(0)
    })

    it("a login on each of the last 5 days (streak of 5) = 5 for today's login + 25 for the streak", async () => {
      const { school, student } = await oneStudent()
      await StudentActivity.create([0, 1, 2, 3, 4].map(n => ({
        student_id: student._id, school_id: school._id, date: daysAgo(n), logins: 1, items_viewed: 0, minutes_active: 5,
      })))
      const res = await dashboardAs(student._id)
      expect(res.body.streak_days).toBe(5)
      expect(res.body.points_total).toBe(30)
    })

    it("(e) every item of a module viewed = 30 points and modules_completed counts those items", async () => {
      const { school, student } = await oneStudent()
      const cls = await Class.findOne({ school_id: school._id }).lean()
      const teacher = await createUser(school._id, "teacher")
      const items = [fileItem("a"), fileItem("b")]
      const mod = await Module.create({ school_id: school._id, class_id: cls!._id, subject: "Math", title: "Whole module",
        order: 1, created_by: teacher._id, items })
      await ModuleProgress.create(items.map(i => ({ student_id: student._id, module_id: mod._id, item_id: i._id })))

      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body.modules_total).toBe(2)
      expect(res.body.modules_completed).toBe(2)
      expect(res.body.points_total).toBe(30)
      expect(res.body.continue_learning).toEqual([])
    })

    it("(e) a module with one item still unviewed, and a module with no items, earn nothing", async () => {
      const { school, student } = await oneStudent()
      const cls = await Class.findOne({ school_id: school._id }).lean()
      const teacher = await createUser(school._id, "teacher")
      const items = [fileItem("a"), fileItem("b")]
      const partial = await Module.create({ school_id: school._id, class_id: cls!._id, subject: "Math", title: "Partial",
        order: 1, created_by: teacher._id, items })
      await Module.create({ school_id: school._id, class_id: cls!._id, subject: "Math", title: "Empty",
        order: 2, created_by: teacher._id, items: [] })
      await ModuleProgress.create({ student_id: student._id, module_id: partial._id, item_id: items[0]._id })

      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body.modules_total).toBe(2)
      expect(res.body.modules_completed).toBe(1)
      expect(res.body.points_total).toBe(0)
    })

    it("(f) a code submission made this week = 10 points, including one made at exactly the week start (05:30 IST Monday)", async () => {
      const { school, student } = await oneStudent()
      await ChallengeSubmission.create({
        challenge_id: new mongoose.Types.ObjectId(), student_id: student._id, school_id: school._id,
        code: "print(1)", language: "python", submitted_at: new Date("2026-10-05T00:00:00Z"),
      })
      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body.points_total).toBe(10)
    })

    it("(f) a code submission made just before the week start earns nothing", async () => {
      const { school, student } = await oneStudent()
      await ChallengeSubmission.create({
        challenge_id: new mongoose.Types.ObjectId(), student_id: student._id, school_id: school._id,
        code: "print(1)", language: "python", submitted_at: new Date("2026-10-04T23:59:59Z"),
      })
      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body.points_total).toBe(0)
    })

    it("TODAY: stored points stay at 40 while the response reports today's lower score of 5", async () => {
      const { school, student } = await oneStudent()
      await User.updateOne({ _id: student._id }, { $set: { points: 40 } })
      await StudentActivity.create({ student_id: student._id, school_id: school._id, date: todayIST(), logins: 1, items_viewed: 0, minutes_active: 5 })
      const res = await dashboardAs(student._id)
      expect(res.body.points_total).toBe(5)
      const saved = await User.findById(student._id).select("points").lean()
      expect(saved?.points).toBe(40)
    })
  })

  describe("weekly activity chart and a student without a class", () => {
    it("with no timetable every day of the week reports 360 school minutes; activity before this Monday is not shown", async () => {
      const { school, students } = await schoolWithClass(["Chart Student"])
      const [s] = students
      await StudentActivity.create([
        { student_id: s._id, school_id: school._id, date: "2026-10-04", logins: 0, items_viewed: 0, minutes_active: 99 }, // Sunday before this week
        { student_id: s._id, school_id: school._id, date: "2026-10-05", logins: 0, items_viewed: 0, minutes_active: 40 },
        { student_id: s._id, school_id: school._id, date: "2026-10-07", logins: 0, items_viewed: 0, minutes_active: 15 },
      ])
      const res = await dashboardAs(s._id)
      expect(res.status).toBe(200)
      expect(res.body.weekly_activity).toEqual([
        { date: "2026-10-05", day: "Mon", minutes: 40, school_day_minutes: 360 },
        { date: "2026-10-06", day: "Tue", minutes: 0,  school_day_minutes: 360 },
        { date: "2026-10-07", day: "Wed", minutes: 15, school_day_minutes: 360 },
        { date: "2026-10-08", day: "Thu", minutes: 0,  school_day_minutes: 360 },
        { date: "2026-10-09", day: "Fri", minutes: 0,  school_day_minutes: 360 },
        { date: "2026-10-10", day: "Sat", minutes: 0,  school_day_minutes: 360 },
        { date: "2026-10-11", day: "Sun", minutes: 0,  school_day_minutes: 360 },
      ])
    })

    it("with a timetable a day reports last end minus first start; a day with no slot reports 0", async () => {
      const { teacher, cls, students } = await schoolWithClass(["Timetable Student"])
      await Class.updateOne({ _id: cls._id }, { $set: { timetable: [
        { day: "Monday",  period: 1, subject: "Math",    teacher_id: teacher._id, start_time: "09:00", end_time: "09:45" },
        { day: "Monday",  period: 2, subject: "Science", teacher_id: teacher._id, start_time: "13:00", end_time: "14:00" },
        { day: "Tuesday", period: 1, subject: "Math",    teacher_id: teacher._id, start_time: "10:00", end_time: "10:30" },
      ] } })
      const res = await dashboardAs(students[0]._id)
      expect(res.status).toBe(200)
      // Monday 14:00 - 09:00 = 300 minutes, Tuesday 30 minutes, every other day has no slot
      expect((res.body.weekly_activity as Array<{ day: string; school_day_minutes: number }>).map(d => [d.day, d.school_day_minutes])).toEqual([
        ["Mon", 300], ["Tue", 30], ["Wed", 0], ["Thu", 0], ["Fri", 0], ["Sat", 0], ["Sun", 0],
      ])
    })

    it("a student with no class gets HTTP 200 with only an error message", async () => {
      const school = await createSchool()
      const student = await createUser(school._id, "student")
      const res = await dashboardAs(student._id)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ error: "Student not assigned to a class" })
    })
  })

  describe("activity routes as they behave today", () => {
    async function oneStudent() {
      const { students } = await schoolWithClass(["Activity Student"])
      return students[0]
    }
    const post = (path: string, studentId: unknown, body: object) =>
      request(app).post(path).set("Cookie", cookie(studentId, "student")).send(body)

    it("ping with action login adds 1 login and 5 minutes", async () => {
      const student = await oneStudent()
      const res = await post("/api/student/activity/ping", student._id, { action: "login" })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      const act = await todaysActivity(student._id)
      expect(act?.logins).toBe(1)
      expect(act?.minutes_active).toBe(5)
      expect(act?.items_viewed).toBe(0)
      expect(String(act?.school_id)).toBe(String(student.school_id))
    })

    it("ping with action item_viewed adds 5 minutes and no login", async () => {
      const student = await oneStudent()
      const res = await post("/api/student/activity/ping", student._id, { action: "item_viewed" })
      expect(res.body).toEqual({ ok: true })
      const act = await todaysActivity(student._id)
      expect(act?.logins).toBe(0)
      expect(act?.minutes_active).toBe(5)
      expect(act?.items_viewed).toBe(0)
    })

    it("TODAY: ping with an unknown action behaves like item_viewed: 5 minutes, no login", async () => {
      const student = await oneStudent()
      const res = await post("/api/student/activity/ping", student._id, { action: "something-else" })
      expect(res.body).toEqual({ ok: true })
      const act = await todaysActivity(student._id)
      expect(act?.logins).toBe(0)
      expect(act?.minutes_active).toBe(5)
    })

    it("TODAY: ping with no action behaves like login", async () => {
      const student = await oneStudent()
      const res = await post("/api/student/activity/ping", student._id, {})
      expect(res.body).toEqual({ ok: true })
      const act = await todaysActivity(student._id)
      expect(act?.logins).toBe(1)
      expect(act?.minutes_active).toBe(5)
    })

    it("clockout with 30 minutes adds 30", async () => {
      const student = await oneStudent()
      const res = await post("/api/student/activity/clockout", student._id, { minutes: 30 })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
      const act = await todaysActivity(student._id)
      expect(act?.minutes_active).toBe(30)
      expect(act?.logins).toBe(0)
    })

    it("clockout with 9999 minutes adds exactly 600 (the per-call cap)", async () => {
      const student = await oneStudent()
      const res = await post("/api/student/activity/clockout", student._id, { minutes: 9999 })
      expect(res.body).toEqual({ ok: true })
      const act = await todaysActivity(student._id)
      expect(act?.minutes_active).toBe(600)
    })

    it("TODAY: the day total has no limit (a later step adds a daily ceiling)", async () => {
      const student = await oneStudent()
      await post("/api/student/activity/clockout", student._id, { minutes: 600 })
      await post("/api/student/activity/clockout", student._id, { minutes: 600 })
      const act = await todaysActivity(student._id)
      expect(act?.minutes_active).toBe(1200)
    })

    it.todo("a teacher, parent or admin token gets 403 on the student activity routes and creates no StudentActivity row")
    it.todo("a day total of minutes_active never exceeds the daily ceiling")
    it.todo("attendance stored with a string student_id is still counted once the match is hardened")
  })
})
