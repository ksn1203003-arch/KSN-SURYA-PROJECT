import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"

const renders = vi.hoisted(() => ({ count: 0 }))
vi.mock("../lib/pdf.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pdf.js")>()
  return {
    ...actual,
    renderHtmlToPdf: vi.fn(async (html: string) => {
      renders.count++
      return Buffer.from(`%PDF-1.4 ${html.length}`)
    }),
  }
})

const { default: marksRouter } = await import("../routes/marks.js")
const { requireAuth } = await import("../middleware/auth.js")
const { ExamDefinition } = await import("../models/ExamDefinition.js")
const { ExamResult } = await import("../models/ExamResult.js")
const { default: dpdpRouter } = await import("../routes/dpdp.js")
const { DataDeletionRequest } = await import("../models/DataDeletionRequest.js")

const app = express()
app.use(express.json())
app.use("/api/marks", requireAuth, marksRouter)
app.use("/api/dpdp", requireAuth, dpdpRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(async () => {
  await clearDb()
  // clearDb() only empties model collections; the GridFS PDF store is separate
  const db = mongoose.connection.db!
  await db.collection("pdf_reports.files").deleteMany({})
  await db.collection("pdf_reports.chunks").deleteMany({})
  renders.count = 0
})

const cookie = (id: unknown, role: string) => `ts_token=${makeJwt(String(id), role)}`

async function storedReportCards() {
  const db = mongoose.connection.db!
  return db.collection("pdf_reports.files").find({ "metadata.kind": "report-card" }).toArray()
}

async function setup() {
  const school  = await createSchool()
  const teacher = await createUser(school._id, "teacher")
  const cls     = await createClass(school._id, teacher._id)
  const student = await createUser(school._id, "student", cls._id)
  const exam = await ExamDefinition.create({
    school_id: school._id, class_id: cls._id, created_by: teacher._id, title: "Unit Test 1",
    exam_type: "unit_test", date: new Date(), subjects: [{ name: "Math", max_marks: 50 }],
  })
  await ExamResult.create({ exam_id: exam._id, student_id: student._id, school_id: school._id, class_id: cls._id,
    subject: "Math", marks_obtained: 40, is_absent: false })
  return { school, teacher, cls, student, exam }
}

describe("report-card PDFs are built once per version", () => {
  it("a second download of an unchanged report card reuses the stored PDF", async () => {
    const { student } = await setup()
    const c = cookie(student._id, "student")

    const first = await request(app).get("/api/marks/my-report-card").set("Cookie", c)
    expect(first.status).toBe(200)
    expect(first.headers["content-type"]).toBe("application/pdf")
    expect(first.headers["cache-control"]).toBe("private, no-store")

    const second = await request(app).get("/api/marks/my-report-card").set("Cookie", c)
    expect(second.status).toBe(200)
    expect(Buffer.compare(first.body as Buffer, second.body as Buffer)).toBe(0)
    expect(renders.count).toBe(1)
    expect(await storedReportCards()).toHaveLength(1)
  })

  it("changed marks build a new PDF and the old version is removed", async () => {
    const { student, exam } = await setup()
    const c = cookie(student._id, "student")

    await request(app).get("/api/marks/my-report-card").set("Cookie", c)
    await ExamResult.updateOne({ exam_id: exam._id, student_id: student._id }, { $set: { marks_obtained: 45 } })
    const after = await request(app).get("/api/marks/my-report-card").set("Cookie", c)
    expect(after.status).toBe(200)
    expect(renders.count).toBe(2)

    // Old-version removal runs after the response; give it a moment to finish
    await expect.poll(async () => (await storedReportCards()).length).toBe(1)
  })

  it("the teacher's download and the student's own download share one stored PDF", async () => {
    const { teacher, student } = await setup()
    await request(app).get("/api/marks/my-report-card").set("Cookie", cookie(student._id, "student"))
    const byTeacher = await request(app).get(`/api/marks/report-card/${student._id}`).set("Cookie", cookie(teacher._id, "teacher"))
    expect(byTeacher.status).toBe(200)
    expect(renders.count).toBe(1)
  })

  it("never hands one student's stored PDF to another student", async () => {
    const { school, cls, student } = await setup()
    const other = await createUser(school._id, "student", cls._id)
    await request(app).get("/api/marks/my-report-card").set("Cookie", cookie(student._id, "student"))
    const res = await request(app).get("/api/marks/my-report-card").set("Cookie", cookie(other._id, "student"))
    expect(res.status).toBe(200)
    expect(renders.count).toBe(2)
    const files = await storedReportCards()
    expect(new Set(files.map(f => f.metadata.student_id))).toEqual(new Set([student._id.toString(), other._id.toString()]))
  })

  it("a teacher from another school cannot download the report card", async () => {
    const { student } = await setup()
    const otherSchool = await createSchool()
    const outsider = await createUser(otherSchool._id, "teacher")
    const res = await request(app).get(`/api/marks/report-card/${student._id}`).set("Cookie", cookie(outsider._id, "teacher"))
    expect(res.status).toBe(404)
    expect(renders.count).toBe(0)
  })
})

describe("who may download a student's report card", () => {
  it("a parent cannot use the staff route, even inside the same school", async () => {
    const { school, student } = await setup()
    const parent = await createUser(school._id, "parent")
    const res = await request(app).get(`/api/marks/report-card/${student._id}`).set("Cookie", cookie(parent._id, "parent"))
    expect(res.status).toBe(403)
    expect(renders.count).toBe(0)
  })

  it("a teacher who does not teach the student's class is refused", async () => {
    const { school, student } = await setup()
    const otherTeacher = await createUser(school._id, "teacher")
    await createClass(school._id, otherTeacher._id)
    const res = await request(app).get(`/api/marks/report-card/${student._id}`).set("Cookie", cookie(otherTeacher._id, "teacher"))
    expect(res.status).toBe(403)
    expect(renders.count).toBe(0)
  })

  it("an admin of the school can download it", async () => {
    const { school, student } = await setup()
    const admin = await createUser(school._id, "admin")
    const res = await request(app).get(`/api/marks/report-card/${student._id}`).set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(200)
  })

  it("a malformed student id is a clean 400, not a crash", async () => {
    const { teacher } = await setup()
    const res = await request(app).get("/api/marks/report-card/not-an-id").set("Cookie", cookie(teacher._id, "teacher"))
    expect(res.status).toBe(400)
  })

  it("an upper-case copy of the id does not create a second stored PDF", async () => {
    const { teacher, student } = await setup()
    await request(app).get(`/api/marks/report-card/${student._id}`).set("Cookie", cookie(teacher._id, "teacher"))
    await request(app).get(`/api/marks/report-card/${student._id.toString().toUpperCase()}`).set("Cookie", cookie(teacher._id, "teacher"))
    expect(renders.count).toBe(1)
  })
})

describe("data deletion (DPDP)", () => {
  it("approving a student's deletion request also removes their stored report-card PDFs", async () => {
    const { school, student } = await setup()
    const admin = await createUser(school._id, "admin")
    await request(app).get("/api/marks/my-report-card").set("Cookie", cookie(student._id, "student"))
    expect(await storedReportCards()).toHaveLength(1)

    const ask = await DataDeletionRequest.create({
      user_id: student._id, user_name: student.name, user_email: student.email, user_role: "student",
      school_id: school._id, reason: "test", status: "pending",
    })
    const res = await request(app).patch(`/api/dpdp/deletion-requests/${ask._id}`)
      .set("Cookie", cookie(admin._id, "admin")).send({ action: "approve" })
    expect(res.status).toBe(200)
    expect(await storedReportCards()).toHaveLength(0)
  })
})
