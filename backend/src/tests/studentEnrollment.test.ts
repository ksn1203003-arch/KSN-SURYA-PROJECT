import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, createSchool, createClass, createUser, makeJwt } from "./helpers.js"
import usersRouter from "../routes/users.js"
import teacherRouter from "../routes/teacher.js"
import dpdpRouter from "../routes/dpdp.js"
import schoolRouter from "../routes/school.js"
import signupRouter from "../routes/signup.js"
import { StudentEnrollment, openEnrollment, changeEnrollment } from "../models/StudentEnrollment.js"
import { AuditLog } from "../models/AuditLog.js"
import { DataDeletionRequest } from "../models/DataDeletionRequest.js"
import { PendingSignup } from "../models/PendingSignup.js"
import { Attendance } from "../models/Attendance.js"
import { User } from "../models/User.js"
import { cleanClassName } from "../lib/className.js"
import { todayIST } from "../lib/dateHelpers.js"

// The sign-up route sends an approval email: keep the tests from trying to send one.
vi.mock("../lib/email.js", async importOriginal => ({
  ...(await importOriginal<typeof import("../lib/email.js")>()),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

const app = express()
app.use(express.json())
app.use("/api/users", usersRouter)
app.use("/api/teacher", teacherRouter)
app.use("/api/dpdp", dpdpRouter)
app.use("/api/school", schoolRouter)
app.use("/api/signup", signupRouter)

beforeAll(async () => {
  await startDb()
  await StudentEnrollment.createIndexes()
  await User.createIndexes()
})
afterAll(stopDb)
afterEach(async () => {
  vi.restoreAllMocks()
  await clearDb()
})

const bearer = (id: mongoose.Types.ObjectId | string, role: string) => `Bearer ${makeJwt(String(id), role)}`

let sectionCounter = 0
const nextSection = () => `T${++sectionCounter}`

async function studentWithLine(
  schoolId: mongoose.Types.ObjectId,
  classId: mongoose.Types.ObjectId,
  adminId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  const student = await createUser(schoolId, "student", classId, overrides)
  await openEnrollment({ schoolId, studentId: student._id, classId, createdBy: adminId })
  return student
}

async function setup() {
  const school = await createSchool()
  const cls1 = await createClass(school._id, undefined, { section: nextSection() })
  const cls2 = await createClass(school._id, undefined, { section: nextSection() })
  const admin = await createUser(school._id, "admin")
  return { school, cls1, cls2, admin }
}

const post = (auth: string, body: Record<string, unknown>) => request(app).post("/api/teacher/attendance").set("Authorization", auth).send(body)
const sheet = (classId: mongoose.Types.ObjectId, students: Array<{ _id: mongoose.Types.ObjectId; name: string }>, date = todayIST()) => ({
  class_id: classId.toString(), date, period: 1,
  records: students.map(s => ({ student_id: s._id.toString(), student_name: s.name, status: "present" })),
})

describe("class history — helpers", () => {
  it("changeEnrollment closes the old line, opens a new one and is safe to repeat", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const student = await studentWithLine(school._id, cls1._id, admin._id)
    const args = { schoolId: school._id, studentId: student._id, classId: cls2._id, createdBy: admin._id, reason: "transferred" as const }
    expect(await changeEnrollment(args)).toBe("changed")
    expect(await changeEnrollment(args)).toBe("unchanged")
    const lines = await StudentEnrollment.find({ student_id: student._id }).lean()
    expect(lines).toHaveLength(2)
    expect(lines.filter(l => l.is_current)).toHaveLength(1)
    const closed = lines.find(l => !l.is_current)
    expect(closed).toMatchObject({ end_reason: "transferred", to_date: todayIST() })
    expect(String(closed!.class_id)).toBe(String(cls1._id))
  })

  it("a student with no open line (added before class history) just gets the new line", async () => {
    const { school, cls1, admin } = await setup()
    const student = await createUser(school._id, "student", cls1._id)
    const result = await changeEnrollment({ schoolId: school._id, studentId: student._id, classId: cls1._id, createdBy: admin._id, reason: "transferred" })
    expect(result).toBe("changed")
    expect(await StudentEnrollment.countDocuments({ student_id: student._id })).toBe(1)
  })

  it("the model declares the partial unique open-line index and the database refuses a second open line", async () => {
    const declared = StudentEnrollment.schema.indexes().some(
      ([keys, options]: [Record<string, unknown>, { unique?: boolean; partialFilterExpression?: { is_current?: boolean } } | undefined]) =>
        keys.student_id === 1 && options?.unique === true && options.partialFilterExpression?.is_current === true,
    )
    expect(declared).toBe(true)
    const { school, cls1, cls2, admin } = await setup()
    const student = await studentWithLine(school._id, cls1._id, admin._id)
    await expect(openEnrollment({ schoolId: school._id, studentId: student._id, classId: cls2._id, createdBy: admin._id })).rejects.toMatchObject({ code: 11000 })
  })
})

describe("POST /api/users/add-student and /bulk-students write the first line", () => {
  it("add-student opens a line for the new class", async () => {
    const { cls1, admin } = await setup()
    const res = await request(app).post("/api/users/add-student").set("Authorization", bearer(admin._id, "admin"))
      .send({ name: "Divya Rao", class_id: cls1._id.toString(), roll_no: "R1" })
    expect(res.status).toBe(200)
    const student = await User.findOne({ username: "r1" }).lean()
    const lines = await StudentEnrollment.find({ student_id: student!._id }).lean()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ is_current: true, to_date: null, end_reason: null, from_date: todayIST() })
    expect(String(lines[0].class_id)).toBe(String(cls1._id))
  })

  it("bulk-students opens a line per student and none for a duplicate", async () => {
    const { cls1, admin } = await setup()
    const res = await request(app).post("/api/users/bulk-students").set("Authorization", bearer(admin._id, "admin"))
      .send({ class_id: cls1._id.toString(), students: [{ name: "Anusha K", roll_no: "B1" }, { name: "Asha K", roll_no: "B1" }, { name: "Ravi T", roll_no: "B2" }] })
    expect(res.status).toBe(200)
    expect(res.body.results[0].error).toBeUndefined()
    expect(res.body.results[1].error).toMatch(/already exists/i)
    expect(res.body.results[2].error).toBeUndefined()
    expect(await StudentEnrollment.countDocuments({ class_id: cls1._id })).toBe(2)
  })

  it("if the first line cannot be written, add-student creates no student", async () => {
    const { cls1, admin } = await setup()
    vi.spyOn(StudentEnrollment, "create").mockRejectedValueOnce(new Error("boom"))
    const res = await request(app).post("/api/users/add-student").set("Authorization", bearer(admin._id, "admin"))
      .send({ name: "Divya Rao", class_id: cls1._id.toString(), roll_no: "R2" })
    expect(res.status).toBe(500)
    expect(await User.countDocuments({ username: "r2" })).toBe(0)
  })

  it("if the first line cannot be written, bulk-students reports that row and creates no student for it", async () => {
    const { cls1, admin } = await setup()
    vi.spyOn(StudentEnrollment, "create").mockRejectedValueOnce(new Error("boom"))
    const res = await request(app).post("/api/users/bulk-students").set("Authorization", bearer(admin._id, "admin"))
      .send({ class_id: cls1._id.toString(), students: [{ name: "Anusha K", roll_no: "C1" }, { name: "Ravi T", roll_no: "C2" }] })
    expect(res.status).toBe(200)
    expect(res.body.results[0].error).toMatch(/could not add/i)
    expect(await User.countDocuments({ username: "c1" })).toBe(0)
    expect(await User.countDocuments({ username: "c2" })).toBe(1)
  })
})

describe("PATCH /api/users/student/:id", () => {
  it("a class change closes the old line, opens a new one, moves the student and is audited", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const student = await studentWithLine(school._id, cls1._id, admin._id)
    const res = await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", bearer(admin._id, "admin")).send({ class_id: cls2._id.toString() })
    expect(res.status).toBe(200)
    const after = await User.findById(student._id).lean()
    expect(String(after!.class_id)).toBe(String(cls2._id))
    const lines = await StudentEnrollment.find({ student_id: student._id }).lean()
    expect(lines).toHaveLength(2)
    expect(lines.find(l => l.is_current)!.class_id.toString()).toBe(String(cls2._id))
    expect(lines.find(l => !l.is_current)).toMatchObject({ end_reason: "transferred" })
    expect(await AuditLog.countDocuments({ action: "student.class_changed" })).toBe(1)
  })

  it("the answer names the class the way the admin screens do: its own name for a custom class, 'Class 5T1' style for a numbered one", async () => {
    const { school, cls1, admin } = await setup()
    const custom = await createClass(school._id, undefined, { grade: 0, section: nextSection(), name: "Sunrise Batch" })
    const student = await studentWithLine(school._id, cls1._id, admin._id)
    const auth = bearer(admin._id, "admin")
    const toCustom = await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", auth).send({ class_id: custom._id.toString() })
    expect(toCustom.status).toBe(200)
    expect(toCustom.body.class_label).toBe("Sunrise Batch")
    const toNumbered = await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", auth).send({ class_id: cls1._id.toString() })
    expect(toNumbered.status).toBe(200)
    expect(toNumbered.body.class_label).toBe(`Class ${cls1.grade}${cls1.section}`)
  })

  it("an empty email box leaves the email alone, so two students can be saved the same way (no null email, no 500)", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const a = await studentWithLine(school._id, cls1._id, admin._id)
    const b = await studentWithLine(school._id, cls1._id, admin._id)
    const auth = bearer(admin._id, "admin")
    for (const s of [a, b]) {
      const res = await request(app).patch(`/api/users/student/${s._id}`).set("Authorization", auth)
        .send({ name: s.name, email: "", phone: "", class_id: cls2._id.toString() })
      expect(res.status).toBe(200)
      expect(res.body.email).toBe(s.email)
      expect((await User.findById(s._id).lean())!.email).toBe(s.email)
    }
  })

  it("saving the same class or only the name writes no history", async () => {
    const { school, cls1, admin } = await setup()
    const student = await studentWithLine(school._id, cls1._id, admin._id)
    const res = await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", bearer(admin._id, "admin"))
      .send({ name: "New Name", class_id: cls1._id.toString() })
    expect(res.status).toBe(200)
    expect(await StudentEnrollment.countDocuments({ student_id: student._id })).toBe(1)
    expect(await AuditLog.countDocuments({ action: "student.class_changed" })).toBe(0)
  })

  it("refuses a class from another school (403), another school's student (404), a bad id (400), an inactive student's move (400), a non-text field (400) and a teacher (403)", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const other = await createSchool()
    const otherClass = await createClass(other._id)
    const otherStudent = await createUser(other._id, "student", otherClass._id)
    const student = await studentWithLine(school._id, cls1._id, admin._id)
    const inactive = await studentWithLine(school._id, cls1._id, admin._id, { is_active: false })
    const teacher = await createUser(school._id, "teacher")
    const auth = bearer(admin._id, "admin")
    expect((await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", auth).send({ class_id: otherClass._id.toString() })).status).toBe(403)
    expect((await request(app).patch(`/api/users/student/${otherStudent._id}`).set("Authorization", auth).send({ name: "X" })).status).toBe(404)
    expect((await request(app).patch("/api/users/student/not-an-id").set("Authorization", auth).send({ name: "X" })).status).toBe(400)
    expect((await request(app).patch(`/api/users/student/${inactive._id}`).set("Authorization", auth).send({ class_id: cls2._id.toString() })).status).toBe(400)
    expect(String((await User.findById(inactive._id).lean())!.class_id)).toBe(String(cls1._id))
    expect((await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", auth).send({ email: ["@"] })).status).toBe(400)
    expect((await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", bearer(teacher._id, "teacher")).send({ class_id: cls2._id.toString() })).status).toBe(403)
  })
})

describe("PATCH /api/users/bulk-transfer", () => {
  it("moves active students of the school, skips the rest with a reason, and is safe to repeat", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const mover = await studentWithLine(school._id, cls1._id, admin._id)
    const inactive = await studentWithLine(school._id, cls1._id, admin._id, { is_active: false })
    const already = await studentWithLine(school._id, cls2._id, admin._id)
    const other = await createSchool()
    const outsider = await createUser(other._id, "student", (await createClass(other._id))._id)
    const auth = bearer(admin._id, "admin")
    const body = { student_ids: [mover, inactive, already, outsider].map(s => s._id.toString()), class_id: cls2._id.toString() }

    const res = await request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send(body)
    expect(res.status).toBe(200)
    expect(res.body.moved).toBe(1)
    expect(res.body.moved_ids).toEqual([mover._id.toString()])
    const reasons = Object.fromEntries(res.body.skipped.map((s: { id: string; reason: string }) => [s.id, s.reason]))
    expect(reasons[inactive._id.toString()]).toBe("not_found_or_inactive")
    expect(reasons[outsider._id.toString()]).toBe("not_found_or_inactive")
    expect(reasons[already._id.toString()]).toBe("already_in_class")
    expect(String((await User.findById(mover._id).lean())!.class_id)).toBe(String(cls2._id))
    expect(String((await User.findById(inactive._id).lean())!.class_id)).toBe(String(cls1._id))
    expect(String((await User.findById(outsider._id).lean())!.class_id)).not.toBe(String(cls2._id))
    expect(await StudentEnrollment.countDocuments({ student_id: mover._id })).toBe(2)
    expect(await AuditLog.countDocuments({ action: "students.class_changed" })).toBe(1)

    // The same list sent again moves nobody and writes nothing new.
    const again = await request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send(body)
    expect(again.status).toBe(200)
    expect(again.body.moved).toBe(0)
    expect(await StudentEnrollment.countDocuments({ student_id: mover._id })).toBe(2)
    expect(await AuditLog.countDocuments({ action: "students.class_changed" })).toBe(1)
  })

  it("treats capital letters in ids like small ones", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const mover = await studentWithLine(school._id, cls1._id, admin._id)
    const auth = bearer(admin._id, "admin")
    const body = { student_ids: [mover._id.toString().toUpperCase()], class_id: cls2._id.toString().toUpperCase() }
    const first = await request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send(body)
    expect(first.body.moved).toBe(1)
    expect(first.body.skipped).toEqual([])
    const again = await request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send(body)
    expect(again.body.moved).toBe(0)
    expect(again.body.skipped).toEqual([{ id: mover._id.toString(), reason: "already_in_class" }])
  })

  it("only moves students who are in from_class_id when it is sent", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const cls3 = await createClass(school._id, undefined, { section: nextSection() })
    const a = await studentWithLine(school._id, cls1._id, admin._id)
    const b = await studentWithLine(school._id, cls3._id, admin._id)
    const res = await request(app).patch("/api/users/bulk-transfer").set("Authorization", bearer(admin._id, "admin"))
      .send({ student_ids: [a._id.toString(), b._id.toString()], class_id: cls2._id.toString(), from_class_id: cls1._id.toString() })
    expect(res.body.moved_ids).toEqual([a._id.toString()])
    expect(res.body.skipped).toEqual([{ id: b._id.toString(), reason: "not_in_from_class" }])
  })

  it("refuses more than 200 ids, a bad id, a class of another school, and a teacher", async () => {
    const { school, cls1, admin } = await setup()
    const other = await createSchool()
    const otherClass = await createClass(other._id)
    const teacher = await createUser(school._id, "teacher")
    const auth = bearer(admin._id, "admin")
    const many = Array.from({ length: 201 }, () => new mongoose.Types.ObjectId().toString())
    expect((await request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send({ student_ids: many, class_id: cls1._id.toString() })).status).toBe(400)
    expect((await request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send({ student_ids: ["nope"], class_id: cls1._id.toString() })).status).toBe(400)
    expect((await request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send({ student_ids: [new mongoose.Types.ObjectId().toString()], class_id: otherClass._id.toString() })).status).toBe(403)
    expect((await request(app).patch("/api/users/bulk-transfer").set("Authorization", bearer(teacher._id, "teacher")).send({ student_ids: [new mongoose.Types.ObjectId().toString()], class_id: cls1._id.toString() })).status).toBe(403)
  })

  it("if saving the class fails, no class-history line changes (saved together or not at all)", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const a = await studentWithLine(school._id, cls1._id, admin._id)
    const b = await studentWithLine(school._id, cls1._id, admin._id)
    vi.spyOn(User, "updateMany").mockRejectedValueOnce(new Error("boom"))
    const res = await request(app).patch("/api/users/bulk-transfer").set("Authorization", bearer(admin._id, "admin"))
      .send({ student_ids: [a._id.toString(), b._id.toString()], class_id: cls2._id.toString() })
    expect(res.status).toBe(500)
    for (const s of [a, b]) {
      const lines = await StudentEnrollment.find({ student_id: s._id }).lean()
      expect(lines).toHaveLength(1)
      expect(lines[0].is_current).toBe(true)
      expect(String(lines[0].class_id)).toBe(String(cls1._id))
      expect(String((await User.findById(s._id).lean())!.class_id)).toBe(String(cls1._id))
    }
  })

  it("two identical moves at the same moment leave one open line that matches the student's class", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const s = await studentWithLine(school._id, cls1._id, admin._id)
    const auth = bearer(admin._id, "admin")
    const body = { student_ids: [s._id.toString()], class_id: cls2._id.toString() }
    const [a, b] = await Promise.all([
      request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send(body),
      request(app).patch("/api/users/bulk-transfer").set("Authorization", auth).send(body),
    ])
    expect([a.status, b.status]).toEqual([200, 200])
    const lines = await StudentEnrollment.find({ student_id: s._id }).lean()
    expect(lines).toHaveLength(2)
    const open = lines.filter(l => l.is_current)
    expect(open).toHaveLength(1)
    expect(String(open[0].class_id)).toBe(String(cls2._id))
    expect(String((await User.findById(s._id).lean())!.class_id)).toBe(String(cls2._id))
  })

  it("moves 200 students (the cap) in one request", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const students = await User.insertMany(Array.from({ length: 200 }, (_, i) => ({
      name: `Pupil ${i}`, email: `move${i}@t.test`, username: `move${i}`, password_hash: "x",
      role: "student", school_id: school._id, class_id: cls1._id, is_active: true,
    })))
    await StudentEnrollment.insertMany(students.map(s => ({
      school_id: school._id, student_id: s._id, class_id: cls1._id, from_date: "2020-01-01", to_date: null,
      is_current: true, end_reason: null, created_by: admin._id,
    })))
    const res = await request(app).patch("/api/users/bulk-transfer").set("Authorization", bearer(admin._id, "admin"))
      .send({ student_ids: students.map(s => s._id.toString()), class_id: cls2._id.toString() })
    expect(res.status).toBe(200)
    expect(res.body.moved).toBe(200)
    expect(await StudentEnrollment.countDocuments({ class_id: cls2._id, is_current: true })).toBe(200)
    expect(await StudentEnrollment.countDocuments({ class_id: cls1._id, is_current: false })).toBe(200)
  })
})

describe("POST /api/teacher/attendance — every student must belong to the class", () => {
  it("rejects a student of another class, of another school, an inactive newcomer, a student twice and a malformed body", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const auth = bearer(admin._id, "admin")
    const mine = await createUser(school._id, "student", cls1._id)
    const stranger = await createUser(school._id, "student", cls2._id)
    const inactive = await createUser(school._id, "student", cls1._id, { is_active: false })
    const other = await createSchool()
    const outsider = await createUser(other._id, "student", (await createClass(other._id))._id)
    expect((await post(auth, sheet(cls1._id, [mine, stranger]))).status).toBe(400)
    expect((await post(auth, sheet(cls1._id, [mine, outsider]))).status).toBe(400)
    expect((await post(auth, sheet(cls1._id, [mine, inactive]))).status).toBe(400)
    const twice = await post(auth, sheet(cls1._id, [mine, mine]))
    expect(twice.status).toBe(400)
    expect(twice.body.error).toMatch(/more than once/i)
    expect((await post(auth, { ...sheet(cls1._id, [mine]), records: [{ student_id: "not-an-id", student_name: "x", status: "present" }] })).status).toBe(400)
    expect((await post(auth, { ...sheet(cls1._id, [mine]), records: [null] })).status).toBe(400)
    expect((await post(auth, { ...sheet(cls1._id, [mine]), class_id: [cls1._id.toString()] })).status).toBe(400)
    expect(await Attendance.countDocuments({})).toBe(0)
  })

  it("saves the name from the student's record and ignores the one the browser sent", async () => {
    const { school, cls1, admin } = await setup()
    const mine = await createUser(school._id, "student", cls1._id)
    const res = await post(bearer(admin._id, "admin"), { ...sheet(cls1._id, [mine]), records: [{ student_id: mine._id.toString(), student_name: "Someone Else", status: "present" }] })
    expect(res.status).toBe(200)
    const saved = await Attendance.findOne({ class_id: cls1._id }).lean()
    expect(saved!.records[0].student_name).toBe(mine.name)
  })

  it("a student who is already on the saved sheet may stay on it when the sheet is corrected", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const moved = await createUser(school._id, "student", cls1._id)
    await Attendance.create({ school_id: school._id, class_id: cls1._id, teacher_id: admin._id, date: "2020-03-02", period: 1, subject: "", records: [{ student_id: moved._id, student_name: moved.name, status: "present" }] })
    await User.updateOne({ _id: moved._id }, { $set: { class_id: cls2._id } })
    const res = await post(bearer(admin._id, "admin"), sheet(cls1._id, [moved], "2020-03-02"))
    expect(res.status).toBe(200)
  })

  it("history lines decide by date: before the move the old class counts, after it the new class", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const moved = await createUser(school._id, "student", cls2._id)
    const base = { school_id: school._id, student_id: moved._id, created_by: admin._id }
    await StudentEnrollment.create({ ...base, class_id: cls1._id, from_date: "2020-01-01", to_date: "2020-06-30", is_current: false, end_reason: "transferred" })
    await StudentEnrollment.create({ ...base, class_id: cls2._id, from_date: "2020-06-30", to_date: null, is_current: true, end_reason: null })
    const auth = bearer(admin._id, "admin")
    expect((await post(auth, sheet(cls1._id, [moved], "2020-03-02"))).status).toBe(200)
    expect((await post(auth, sheet(cls1._id, [moved], "2020-09-01"))).status).toBe(400)
    expect((await post(auth, sheet(cls2._id, [moved], "2020-03-02"))).status).toBe(400)
    expect((await post(auth, sheet(cls2._id, [moved], "2020-09-01"))).status).toBe(200)
  })

  it("the day of a move belongs to both classes, and the day before the first line belongs to neither", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const moved = await createUser(school._id, "student", cls2._id)
    const base = { school_id: school._id, student_id: moved._id, created_by: admin._id }
    await StudentEnrollment.create({ ...base, class_id: cls1._id, from_date: "2020-01-10", to_date: "2020-06-30", is_current: false, end_reason: "transferred" })
    await StudentEnrollment.create({ ...base, class_id: cls2._id, from_date: "2020-06-30", to_date: null, is_current: true, end_reason: null })
    const auth = bearer(admin._id, "admin")
    expect((await post(auth, sheet(cls1._id, [moved], "2020-01-10"))).status).toBe(200)   // first day of the old line
    expect((await post(auth, sheet(cls1._id, [moved], "2020-06-30"))).status).toBe(200)   // last day of the old line = day of the move
    expect((await post(auth, sheet(cls2._id, [moved], "2020-06-30"))).status).toBe(200)   // first day of the new line = day of the move
    expect((await post(auth, sheet(cls1._id, [moved], "2020-01-09"))).status).toBe(400)   // the day before he joined
    expect((await post(auth, sheet(cls2._id, [moved], "2020-06-29"))).status).toBe(400)   // before the new line started
  })

  it("an old sheet refuses a student whose line starts later, and accepts one with no history who is in the class now", async () => {
    const { school, cls1, admin } = await setup()
    const late = await createUser(school._id, "student", cls1._id)
    const plain = await createUser(school._id, "student", cls1._id)
    await StudentEnrollment.create({ school_id: school._id, student_id: late._id, class_id: cls1._id, from_date: "2020-06-01", to_date: null, is_current: true, end_reason: null, created_by: admin._id })
    const auth = bearer(admin._id, "admin")
    expect((await post(auth, sheet(cls1._id, [late], "2020-03-02"))).status).toBe(400)
    expect((await post(auth, sheet(cls1._id, [plain], "2020-03-02"))).status).toBe(200)
  })

  it("accepts a sheet of 500 students", async () => {
    const { school, cls1, admin } = await setup()
    const pupils = await User.insertMany(Array.from({ length: 500 }, (_, i) => ({
      name: `Pupil ${i}`, email: `pupil${i}@t.test`, username: `pupil${i}`, password_hash: "x",
      role: "student", school_id: school._id, class_id: cls1._id, is_active: true,
    })))
    const res = await post(bearer(admin._id, "admin"), sheet(cls1._id, pupils.map(p => ({ _id: p._id, name: p.name }))))
    expect(res.status).toBe(200)
    expect((await Attendance.findOne({ class_id: cls1._id }).lean())!.records).toHaveLength(500)
  })
})

describe("DPDP approval erases the student's class history", () => {
  it("deletes that student's lines and no one else's, and records that in the audit entry", async () => {
    const { school, cls1, admin } = await setup()
    const student = await studentWithLine(school._id, cls1._id, admin._id)
    const other = await studentWithLine(school._id, cls1._id, admin._id)
    const deletion = await DataDeletionRequest.create({ user_id: student._id, user_name: student.name, user_email: student.email, user_role: "student", school_id: school._id, reason: "test", status: "pending" })
    const res = await request(app).patch(`/api/dpdp/deletion-requests/${deletion._id}`).set("Authorization", bearer(admin._id, "admin")).send({ action: "approve" })
    expect(res.status).toBe(200)
    expect(await StudentEnrollment.countDocuments({ student_id: student._id })).toBe(0)
    expect(await StudentEnrollment.countDocuments({ student_id: other._id })).toBe(1)
    expect(await AuditLog.countDocuments({ action: "dpdp.deletion_approved", "after.history_erased": true })).toBe(1)
  })
})

describe("GET /api/school/student-detail/:id", () => {
  it("answers 400 for a malformed id, 404 for another school's student and 200 for a student of the school", async () => {
    const { school, cls1, admin } = await setup()
    const other = await createSchool()
    const outsider = await createUser(other._id, "student", (await createClass(other._id))._id)
    const mine = await createUser(school._id, "student", cls1._id)
    const auth = bearer(admin._id, "admin")
    expect((await request(app).get("/api/school/student-detail/not-an-id").set("Authorization", auth)).status).toBe(400)
    expect((await request(app).get(`/api/school/student-detail/${outsider._id}`).set("Authorization", auth)).status).toBe(404)
    expect((await request(app).get(`/api/school/student-detail/${mine._id}`).set("Authorization", auth)).status).toBe(200)
  })
})

describe("class names typed by a person are cleaned", () => {
  it("POST and PATCH /api/school/classes accept real names and refuse markup, long names and bad text", async () => {
    const { admin } = await setup()
    const auth = bearer(admin._id, "admin")
    expect((await request(app).post("/api/school/classes").set("Authorization", auth).send({ name: "<b>x</b>" })).status).toBe(400)
    expect((await request(app).post("/api/school/classes").set("Authorization", auth).send({ name: "A".repeat(41) })).status).toBe(400)
    const ok = await request(app).post("/api/school/classes").set("Authorization", auth).send({ name: "  Class   5-A " })
    expect(ok.status).toBe(200)
    expect(ok.body.class.name).toBe("Class 5-A")
    expect((await request(app).post("/api/school/classes").set("Authorization", auth).send({ name: "कक्षा 5-ए" })).status).toBe(200)
    const id = ok.body.class.id as string
    expect((await request(app).patch(`/api/school/classes/${id}`).set("Authorization", auth).send({ name: "<i>" })).status).toBe(400)
    const cleared = await request(app).patch(`/api/school/classes/${id}`).set("Authorization", auth).send({ name: "" })
    expect(cleared.status).toBe(200)
    expect(cleared.body.name).toBeNull()
  })

  it("editing a class's subjects does not re-check a name that did not change, and another school's class is not found", async () => {
    const { school, admin } = await setup()
    const old = await createClass(school._id, undefined, { section: nextSection(), name: "St. Mary's & Co (Gr 5)" })
    const other = await createSchool()
    const otherClass = await createClass(other._id)
    const auth = bearer(admin._id, "admin")
    expect((await request(app).patch(`/api/school/classes/${old._id}`).set("Authorization", auth).send({ name: "St. Mary's & Co (Gr 5)", subjects: ["Math"] })).status).toBe(200)
    expect((await request(app).patch(`/api/school/classes/${old._id}`).set("Authorization", auth).send({ name: "St. Mary's <b>", subjects: ["Math"] })).status).toBe(400)
    expect((await request(app).patch(`/api/school/classes/${otherClass._id}`).set("Authorization", auth).send({ subjects: ["Math"] })).status).toBe(404)
  })

  it("cleanClassName handles Indian scripts, invisible characters and unsafe text", () => {
    expect(cleanClassName("  Class   5-A ")).toEqual({ ok: true, value: "Class 5-A", key: "class 5-a" })
    expect(cleanClassName("कक्षा 5-ए").ok).toBe(true)
    expect(cleanClassName("<b>x</b>").ok).toBe(false)
    expect(cleanClassName("A".repeat(40)).ok).toBe(true)
    expect(cleanClassName("A".repeat(41)).ok).toBe(false)
    expect(cleanClassName("").ok).toBe(false)
    expect(cleanClassName(42).ok).toBe(false)
    expect(cleanClassName("5​A")).toMatchObject({ ok: true, value: "5A" })
    expect(cleanClassName("क‍ष")).toMatchObject({ ok: true, value: "क‍ष" })
    expect(cleanClassName("‍A")).toMatchObject({ ok: true, value: "A" })
  })
})

describe("POST /api/signup/request checks the first-class fields", () => {
  const base = {
    school: { name: "Sri Vidya School", board: "State", city: "Hyderabad", state: "Telangana", totalStudents: "400" },
    admin: { name: "Ramesh Kumar", email: "ramesh@example.com", phone: "9876543210" },
    firstTeacher: { name: "Sunitha", email: "sunitha@example.com", phone: "9876543211" },
  }
  const send = (firstClass: Record<string, unknown>) => request(app).post("/api/signup/request").send({ ...base, firstClass })

  it("refuses a grade that is not a number, markup in the section or name, and a negative student count", async () => {
    expect((await send({ grade: "abc", section: "A", numStudents: "35" })).status).toBe(400)
    expect((await send({ grade: "5", section: "<script>", numStudents: "35" })).status).toBe(400)
    expect((await send({ name: "<img src=x>", numStudents: "35" })).status).toBe(400)
    expect((await send({ grade: "5", section: "A", numStudents: "-5" })).status).toBe(400)
    expect(await PendingSignup.countDocuments({})).toBe(0)
  })

  it("stores a valid first class, including a free class name", async () => {
    const res = await send({ grade: "5", section: "A", numStudents: "35", name: "Class 5-A" })
    expect(res.status).toBe(200)
    const saved = await PendingSignup.findOne({}).lean()
    expect(saved).toMatchObject({ first_class_grade: 5, first_class_section: "A", first_class_name: "Class 5-A", first_class_students: 35 })
  })
})

// ── class_label saved on every new class-history line (written before the code exists) ──
interface LabelledLine { class_id: mongoose.Types.ObjectId; class_label?: string | null; is_current: boolean }

async function openLine(studentId: mongoose.Types.ObjectId): Promise<LabelledLine | undefined> {
  const lines = await StudentEnrollment.find({ student_id: studentId, is_current: true }).lean<LabelledLine[]>()
  return lines[0]
}

describe("class history lines save the class label at the time of the move", () => {
  // Rule: a numbered class is "Class <grade><section>"; otherwise its own name; otherwise its section.

  it("add-student: a numbered class gives 'Class 5T1' style, a custom class gives its name", async () => {
    const { school, cls1, admin } = await setup()
    const custom = await createClass(school._id, undefined, { grade: 0, section: nextSection(), name: "Sunrise Batch" })
    const auth = bearer(admin._id, "admin")
    const first = await request(app).post("/api/users/add-student").set("Authorization", auth)
      .send({ name: "Meera Iyer", class_id: cls1._id.toString(), roll_no: "LB1" })
    const second = await request(app).post("/api/users/add-student").set("Authorization", auth)
      .send({ name: "Kabir Menon", class_id: custom._id.toString(), roll_no: "LB2" })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const a = await User.findOne({ username: "lb1" }).lean()
    const b = await User.findOne({ username: "lb2" }).lean()
    expect(await openLine(a!._id)).toMatchObject({ class_label: `Class ${cls1.grade}${cls1.section}` })
    expect(await openLine(b!._id)).toMatchObject({ class_label: "Sunrise Batch" })
  })

  it("bulk-students: every new line carries the label, and a custom class with no name falls back to its section", async () => {
    const { school, cls1, admin } = await setup()
    const unnamed = await createClass(school._id, undefined, { grade: 0, section: nextSection(), name: "Temp" })
    await unnamed.updateOne({ $set: { name: null } })
    const auth = bearer(admin._id, "admin")
    const numbered = await request(app).post("/api/users/bulk-students").set("Authorization", auth)
      .send({ class_id: cls1._id.toString(), students: [{ name: "Ishaan Verma", roll_no: "LC1" }, { name: "Pooja Nair", roll_no: "LC2" }] })
    const fallback = await request(app).post("/api/users/bulk-students").set("Authorization", auth)
      .send({ class_id: unnamed._id.toString(), students: [{ name: "Tanvi Joshi", roll_no: "LC3" }] })
    expect(numbered.status).toBe(200)
    expect(fallback.status).toBe(200)
    for (const roll of ["lc1", "lc2"]) {
      const s = await User.findOne({ username: roll }).lean()
      expect(await openLine(s!._id)).toMatchObject({ class_label: `Class ${cls1.grade}${cls1.section}` })
    }
    const t = await User.findOne({ username: "lc3" }).lean()
    expect(await openLine(t!._id)).toMatchObject({ class_label: unnamed.section })
  })

  it("PATCH student class change: the new line carries the new class's label and an older line keeps the label it was saved with", async () => {
    const { school, cls1, cls2, admin } = await setup()
    const custom = await createClass(school._id, undefined, { grade: 0, section: nextSection(), name: "Sunrise Batch" })
    const student = await studentWithLine(school._id, cls1._id, admin._id)
    const auth = bearer(admin._id, "admin")
    const toCustom = await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", auth).send({ class_id: custom._id.toString() })
    expect(toCustom.status).toBe(200)
    expect(await openLine(student._id)).toMatchObject({ class_label: "Sunrise Batch" })

    const toNumbered = await request(app).patch(`/api/users/student/${student._id}`).set("Authorization", auth).send({ class_id: cls2._id.toString() })
    expect(toNumbered.status).toBe(200)
    expect(await openLine(student._id)).toMatchObject({ class_label: `Class ${cls2.grade}${cls2.section}` })
    const closed = (await StudentEnrollment.find({ student_id: student._id, is_current: false }).lean<LabelledLine[]>())
      .find(l => String(l.class_id) === String(custom._id))
    expect(closed?.class_label).toBe("Sunrise Batch")
  })

  it("bulk-transfer: every moved student gets a new line with the target's label, and a later rename of the class does not change it", async () => {
    const { school, cls1, admin } = await setup()
    const custom = await createClass(school._id, undefined, { grade: 0, section: nextSection(), name: "Sunrise Batch" })
    const a = await studentWithLine(school._id, cls1._id, admin._id)
    const b = await studentWithLine(school._id, cls1._id, admin._id)
    const auth = bearer(admin._id, "admin")
    const res = await request(app).patch("/api/users/bulk-transfer").set("Authorization", auth)
      .send({ student_ids: [a._id.toString(), b._id.toString()], class_id: custom._id.toString() })
    expect(res.status).toBe(200)
    expect(res.body.moved).toBe(2)
    for (const s of [a, b]) {
      expect(await openLine(s._id)).toMatchObject({ class_label: "Sunrise Batch" })
    }

    const renamed = await request(app).patch(`/api/school/classes/${custom._id}`).set("Authorization", auth).send({ name: "Renamed Batch" })
    expect(renamed.status).toBe(200)
    expect(await openLine(a._id)).toMatchObject({ class_label: "Sunrise Batch" })
  })
})
