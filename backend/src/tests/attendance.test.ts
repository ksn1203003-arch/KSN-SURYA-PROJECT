import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import express from "express"
import request from "supertest"
import { startDb, stopDb, clearDb, createSchool, createClass, createUser, makeJwt } from "./helpers.js"
import teacherRouter from "../routes/teacher.js"
import schoolRouter from "../routes/school.js"
import { requireAuth } from "../middleware/auth.js"
import { Attendance } from "../models/Attendance.js"
import { Class } from "../models/Class.js"
import { todayIST } from "../lib/dateHelpers.js"

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
app.use("/api/school", schoolRouter)

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

// ─── Route-level: the class's school-year start gate ──────────────────────────
// A sheet can only be saved for a class that has a STORED start date, and not for a day before it.
const NOT_SET_TEXT = "The school year start of this class is not set yet. Please ask your school admin."
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const longDate = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`
const bearer = (id: unknown, role: string) => `Bearer ${makeJwt(String(id), role)}`

// A school with one teacher assigned to one class (stored start date `start`, or none when null), one student and one admin.
async function gateWorld(start: string | null) {
  const school  = await createSchool()
  const teacher = await createUser(school._id, "teacher")
  const admin   = await createUser(school._id, "admin")
  const cls     = await createClass(school._id, teacher._id, { section: "G1", year_start: start })
  const student = await createUser(school._id, "student", cls._id)
  return { school, teacher, admin, cls, student, teacherAuth: bearer(teacher._id, "teacher"), adminAuth: bearer(admin._id, "admin") }
}
type Gate = Awaited<ReturnType<typeof gateWorld>>

const sheetFor = (g: Gate, date: string, period = 1) => ({
  class_id: g.cls._id.toString(),
  date,
  period,
  records: [{ student_id: g.student._id.toString(), student_name: g.student.name, status: "present" }],
})
const save = (auth: string, body: Record<string, unknown>) =>
  request(app).post("/api/teacher/attendance").set("Authorization", auth).send(body)

describe("POST /api/teacher/attendance — start date gate", () => {
  const today = () => todayIST()

  it("a teacher is refused with 409 start_date_not_set on a class with no stored start date, with the exact message, and nothing is saved", async () => {
    const g = await gateWorld(null)
    const res = await save(g.teacherAuth, sheetFor(g, today()))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe("start_date_not_set")
    expect(res.body.error).toBe(NOT_SET_TEXT)
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("the default start date shown on the admin list does not count: the class still shows a default, has_start_date is false, and the save is refused", async () => {
    const g = await gateWorld(null)
    const list = await request(app).get("/api/school/classes").set("Authorization", g.adminAuth)
    expect(list.status).toBe(200)
    const row = (list.body.classes as Array<{ id: string; year_start: string | null; year_start_effective: string; has_start_date: boolean }>)
      .find(c => c.id === String(g.cls._id))
    expect(row?.year_start).toBeNull()
    expect(typeof row?.year_start_effective).toBe("string")
    expect(row?.has_start_date).toBe(false)

    const res = await save(g.teacherAuth, sheetFor(g, today()))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe("start_date_not_set")
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("an admin is refused too (409 start_date_not_set) and nothing is saved", async () => {
    const g = await gateWorld(null)
    const res = await save(g.adminAuth, sheetFor(g, today()))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe("start_date_not_set")
    expect(res.body.error).toBe(NOT_SET_TEXT)
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("a teacher who is NOT assigned to the class still gets 403 (not 409), even when the class has no start date", async () => {
    const g = await gateWorld(null)
    const stranger = await createUser(g.school._id, "teacher")
    const res = await save(bearer(stranger._id, "teacher"), sheetFor(g, today()))
    expect(res.status).toBe(403)
    expect(res.body.error).toBe("You are not assigned to this class")
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("another school's class still gets 403 'Class not found in your school' (not 409), even when it has no start date", async () => {
    const g = await gateWorld("2000-01-01")
    const otherSchool = await createSchool()
    const otherTeacher = await createUser(otherSchool._id, "teacher")
    const otherClass = await createClass(otherSchool._id, otherTeacher._id, { section: "G9", year_start: null })
    const res = await save(g.teacherAuth, { ...sheetFor(g, today()), class_id: otherClass._id.toString() })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe("Class not found in your school")
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("the future-date 400 still comes first, before the start date check", async () => {
    const g = await gateWorld(null)
    const res = await save(g.teacherAuth, sheetFor(g, addDays(today(), 1)))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/future/i)
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("after the admin sets a start date, the SAME teacher's next save succeeds (200) and the sheet is saved", async () => {
    const g = await gateWorld(null)
    const before = await save(g.teacherAuth, sheetFor(g, today()))
    expect(before.status).toBe(409)
    expect(await Attendance.countDocuments({})).toBe(0)

    const set = await request(app).patch(`/api/school/classes/${g.cls._id}`).set("Authorization", g.adminAuth)
      .send({ year_start: addDays(today(), -10), expected_current: null })
    expect(set.status).toBe(200)

    const after = await save(g.teacherAuth, sheetFor(g, today()))
    expect(after.status).toBe(200)
    expect(after.body.success).toBe(true)
    expect(await Attendance.countDocuments({ class_id: g.cls._id })).toBe(1)
  })

  it("a date before the start date is refused with 400 before_start_date, the exact message, and nothing saved; the start day itself is accepted", async () => {
    const start = addDays(today(), -5)
    const g = await gateWorld(start)

    const dayBefore = await save(g.teacherAuth, sheetFor(g, addDays(start, -1)))
    expect(dayBefore.status).toBe(400)
    expect(dayBefore.body.code).toBe("before_start_date")
    expect(dayBefore.body.error).toBe(`This date is before the class's school year starts (${longDate(start)}). Pick a date on or after it.`)
    expect(await Attendance.countDocuments({})).toBe(0)

    const longBefore = await save(g.teacherAuth, sheetFor(g, addDays(start, -90), 2))
    expect(longBefore.status).toBe(400)
    expect(longBefore.body.code).toBe("before_start_date")
    expect(await Attendance.countDocuments({})).toBe(0)

    const startDay = await save(g.teacherAuth, sheetFor(g, start))
    expect(startDay.status).toBe(200)
    expect(await Attendance.countDocuments({ class_id: g.cls._id })).toBe(1)

    const dayAfter = await save(g.teacherAuth, sheetFor(g, addDays(start, 1)))
    expect(dayAfter.status).toBe(200)
    expect(await Attendance.countDocuments({ class_id: g.cls._id })).toBe(2)
  })

  it("an admin is also held to the start date (a day before it is refused with 400 before_start_date)", async () => {
    const start = addDays(today(), -5)
    const g = await gateWorld(start)
    const res = await save(g.adminAuth, sheetFor(g, addDays(start, -1)))
    expect(res.status).toBe(400)
    expect(res.body.code).toBe("before_start_date")
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("moving the start date LATER after sheets exist does not delete any saved sheet", async () => {
    const start = addDays(today(), -20)
    const g = await gateWorld(start)
    expect((await save(g.teacherAuth, sheetFor(g, addDays(today(), -15)))).status).toBe(200)
    expect((await save(g.teacherAuth, sheetFor(g, addDays(today(), -12), 2))).status).toBe(200)
    expect(await Attendance.countDocuments({ class_id: g.cls._id })).toBe(2)

    const moved = await request(app).patch(`/api/school/classes/${g.cls._id}`).set("Authorization", g.adminAuth)
      .send({ year_start: addDays(today(), -10), expected_current: start })
    expect(moved.status).toBe(200)
    expect(moved.body.sheets_leaving).toBe(2)
    expect(await Attendance.countDocuments({ class_id: g.cls._id })).toBe(2)
  })
})

describe("GET /api/teacher/my-classes — start date fields", () => {
  it("returns year_start and has_start_date for a class with a stored date and for one without", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const start   = addDays(todayIST(), -3)
    const dated   = await createClass(school._id, teacher._id, { section: "G1", year_start: start })
    const undated = await createClass(school._id, teacher._id, { section: "G2", year_start: null })

    const res = await request(app).get("/api/teacher/my-classes").set("Authorization", bearer(teacher._id, "teacher"))
    expect(res.status).toBe(200)
    const classes = res.body.classes as Array<{ id: string; year_start: string | null; has_start_date: boolean }>
    const datedRow = classes.find(c => c.id === String(dated._id))
    const undatedRow = classes.find(c => c.id === String(undated._id))
    expect(datedRow).toMatchObject({ year_start: start, has_start_date: true })
    expect(undatedRow?.year_start).toBeNull()
    expect(undatedRow?.has_start_date).toBe(false)
  })
})

// ─── G7 — the start date is read once more just before the write ──────────────
// POST /api/teacher/attendance reads the class twice: once for the early gate, and again right before the sheet is
// written (a date change committed in between must be honoured). Between the two reads the route calls
// Attendance.findOne (the "another teacher already marked this period" check). The test hooks that call so that the
// class's start date moves LATER than the sheet's date at exactly that moment; only the late re-read can see it.

describe("start date re-check just before the write (G7)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("T3: a start date that moves past the sheet's date after the early gate is still refused with 400 before_start_date, and nothing is saved", async () => {
    const start = addDays(todayIST(), -5)
    const sheetDate = addDays(todayIST(), -3)     // on or after the stored start, so the early gate lets it through
    const laterStart = addDays(todayIST(), -1)    // after the sheet's date
    const g = await gateWorld(start)

    // The query is still the real Mongoose query; only its exec() first moves the class's start date, then runs as usual.
    const realFindOne = Attendance.findOne.bind(Attendance)
    const findOneSpy = vi.spyOn(Attendance, "findOne").mockImplementationOnce((...args) => {
      const query = realFindOne(...args)
      const realExec = query.exec.bind(query)
      query.exec = async () => {
        await Class.updateOne({ _id: g.cls._id }, { $set: { year_start: laterStart } })
        return realExec()
      }
      return query
    })

    const res = await save(g.teacherAuth, sheetFor(g, sheetDate))

    // (the hook is a "once" hook, so every later Attendance.findOne call runs the real function; afterEach restores it)
    expect(findOneSpy).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe("before_start_date")
    expect(res.body.error).toBe(`This date is before the class's school year starts (${longDate(laterStart)}). Pick a date on or after it.`)

    // the date change really happened, and no sheet exists for that class, date and period
    const row = await Class.findById(g.cls._id).select("year_start").lean<{ year_start?: string | null } | null>()
    expect(row?.year_start).toBe(laterStart)
    expect(await Attendance.countDocuments({ class_id: g.cls._id, date: sheetDate, period: 1 })).toBe(0)
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("T3b: a start date that is cleared (null) after the early gate is still refused with 409 start_date_not_set, and nothing is saved", async () => {
    const start = addDays(todayIST(), -5)
    const sheetDate = addDays(todayIST(), -3)     // on or after the stored start, so the early gate lets it through
    const g = await gateWorld(start)

    // Same hook as T3: the query is still the real Mongoose query; only its exec() first clears the class's start date.
    const realFindOne = Attendance.findOne.bind(Attendance)
    const findOneSpy = vi.spyOn(Attendance, "findOne").mockImplementationOnce((...args) => {
      const query = realFindOne(...args)
      const realExec = query.exec.bind(query)
      query.exec = async () => {
        await Class.updateOne({ _id: g.cls._id }, { $set: { year_start: null } })
        return realExec()
      }
      return query
    })

    const res = await save(g.teacherAuth, sheetFor(g, sheetDate))

    // (the hook is a "once" hook, so every later Attendance.findOne call runs the real function; afterEach restores it)
    expect(findOneSpy).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe("start_date_not_set")
    expect(res.body.error).toBe(NOT_SET_TEXT)

    // the date really was cleared, and no sheet exists for that class, date and period
    const row = await Class.findById(g.cls._id).select("year_start").lean<{ year_start?: string | null } | null>()
    expect(row?.year_start).toBeNull()
    expect(await Attendance.countDocuments({ class_id: g.cls._id, date: sheetDate, period: 1 })).toBe(0)
    expect(await Attendance.countDocuments({})).toBe(0)
  })
})
