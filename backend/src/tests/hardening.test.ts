import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"

// Second review round of the Stage 4–5 work: every case below was a confirmed finding.
const renders = vi.hoisted(() => ({ count: 0 }))
vi.mock("../lib/pdf.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pdf.js")>()
  return { ...actual, renderHtmlToPdf: vi.fn(async () => { renders.count++; return Buffer.from("%PDF-1.4 test") }) }
})

const { requireAuth } = await import("../middleware/auth.js")
const { default: filesRouter, streamPartLimiter } = await import("../routes/files.js")
const { default: photosRouter } = await import("../routes/photos.js")
const { default: schoolRouter } = await import("../routes/school.js")
const { default: studentRouter } = await import("../routes/student.js")
const { default: usersRouter } = await import("../routes/users.js")
const { default: marksRouter } = await import("../routes/marks.js")
const { default: teacherRouter } = await import("../routes/teacher.js")
const { default: dpdpRouter } = await import("../routes/dpdp.js")
const { User } = await import("../models/User.js")
const { Class } = await import("../models/Class.js")
const { Module } = await import("../models/Module.js")
const { FileToken } = await import("../models/FileToken.js")
const { DataDeletionRequest } = await import("../models/DataDeletionRequest.js")
const { getGridFSBucket } = await import("../lib/gridfs.js")

const app = express()
app.set("trust proxy", 1)
app.use(express.json({ limit: "2mb" }))
app.use("/api/files", filesRouter)
app.use("/api/photos", requireAuth, photosRouter)
app.use("/api/school", requireAuth, schoolRouter)
app.use("/api/student", requireAuth, studentRouter)
app.use("/api/users", requireAuth, usersRouter)
app.use("/api/marks", requireAuth, marksRouter)
app.use("/api/teacher", requireAuth, teacherRouter)
app.use("/api/dpdp", requireAuth, dpdpRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(async () => {
  await clearDb()
  const db = mongoose.connection.db!
  for (const c of ["pdf_reports.files", "pdf_reports.chunks", "lesson_files.files", "lesson_files.chunks"]) {
    await db.collection(c).deleteMany({})
  }
  renders.count = 0
})

const cookie = (id: unknown, role: string) => `ts_token=${makeJwt(String(id), role)}`

function store(schoolId: mongoose.Types.ObjectId, name: string, bytes: Buffer): Promise<mongoose.Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const up = getGridFSBucket("lesson_files").openUploadStream(name, { metadata: { school_id: schoolId.toString() } })
    up.on("error", reject)
    up.on("finish", () => resolve(up.id as mongoose.Types.ObjectId))
    up.end(bytes)
  })
}

async function videoLesson(bytes = Buffer.alloc(1000, 7)) {
  const school  = await createSchool()
  const teacher = await createUser(school._id, "teacher")
  const cls     = await createClass(school._id, teacher._id)
  const student = await createUser(school._id, "student", cls._id)
  const gridfsId = await store(school._id, "clip.mp4", bytes)
  await Module.create({ school_id: school._id, class_id: cls._id, subject: "Math", title: "M", order: 1, created_by: teacher._id,
    items: [{ order: 0, type: "file", label: "Clip", gridfs_id: gridfsId, file_name: "clip.mp4", file_type: "mp4", file_size: bytes.length }] })
  return { school, teacher, cls, student, videoId: gridfsId.toString() }
}

describe("marks — malformed ids never crash the server", () => {
  it("answers 400 for a malformed class id or exam id", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const c = cookie(teacher._id, "teacher")
    expect((await request(app).get("/api/marks/exams?class_id=not-an-id").set("Cookie", c)).status).toBe(400)
    expect((await request(app).post("/api/marks/exams").set("Cookie", c)
      .send({ class_id: "not-an-id", title: "T", date: "2026-01-01", subjects: [{ name: "Math", max_marks: 10 }] })).status).toBe(400)
    expect((await request(app).patch("/api/marks/exams/not-an-id").set("Cookie", c).send({ title: "x" })).status).toBe(400)
    expect((await request(app).get("/api/marks/exams/not-an-id/results").set("Cookie", c)).status).toBe(400)
  })
})

describe("report cards — limits and access", () => {
  it("limits report-card downloads per person, not per school network", async () => {
    const school = await createSchool()
    const cls = await createClass(school._id)
    const a = await createUser(school._id, "student", cls._id)
    const b = await createUser(school._id, "student", cls._id)
    let last = 0
    for (let i = 0; i < 11; i++) last = (await request(app).get("/api/marks/my-report-card").set("Cookie", cookie(a._id, "student"))).status
    expect(last).toBe(429)
    expect((await request(app).get("/api/marks/my-report-card").set("Cookie", cookie(b._id, "student"))).status).toBe(200)
  })

  it("a class teacher recorded only as the class's main teacher (older setup) may download", async () => {
    const school = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls = await createClass(school._id)
    await Class.updateOne({ _id: cls._id }, { $set: { teacher_id: teacher._id } })
    const student = await createUser(school._id, "student", cls._id)
    const res = await request(app).get(`/api/marks/report-card/${student._id}`).set("Cookie", cookie(teacher._id, "teacher"))
    expect(res.status).toBe(200)
  })

  it("an approved deletion removes only that student's PDFs; a rejected one removes nothing", async () => {
    const school = await createSchool()
    const admin = await createUser(school._id, "admin")
    const cls = await createClass(school._id)
    const a = await createUser(school._id, "student", cls._id)
    const b = await createUser(school._id, "student", cls._id)
    await request(app).get("/api/marks/my-report-card").set("Cookie", cookie(a._id, "student"))
    await request(app).get("/api/marks/my-report-card").set("Cookie", cookie(b._id, "student"))
    const stored = () => mongoose.connection.db!.collection("pdf_reports.files")
      .find({ "metadata.kind": "report-card" }).toArray().then(fs => fs.map(f => String(f.metadata.student_id)).sort())

    const ask = (u: { _id: mongoose.Types.ObjectId; name: string; email: string }) => DataDeletionRequest.create({
      user_id: u._id, user_name: u.name, user_email: u.email, user_role: "student", school_id: school._id, reason: "r", status: "pending" })
    const askB = await ask(b)
    await request(app).patch(`/api/dpdp/deletion-requests/${askB._id}`).set("Cookie", cookie(admin._id, "admin")).send({ action: "reject" })
    expect(await stored()).toEqual([a._id.toString(), b._id.toString()].sort())

    const askA = await ask(a)
    await request(app).patch(`/api/dpdp/deletion-requests/${askA._id}`).set("Cookie", cookie(admin._id, "admin")).send({ action: "approve" })
    expect(await stored()).toEqual([b._id.toString()])
  })
})

describe("video stream links — abuse limits", () => {
  it("rejects a stream link that is not in the issued format before any lookup", async () => {
    const id = new mongoose.Types.ObjectId().toString()
    expect((await request(app).get(`/api/files/${id}?st=not-a-real-token`).set("Range", "bytes=0-9")).status).toBe(400)
  })

  it("serves video parts only: a stream request needs a Range, and one part is at most 8 MB", async () => {
    const big = Buffer.alloc(9 * 1024 * 1024, 3)
    const { student, videoId } = await videoLesson(big)
    const c = cookie(student._id, "student")
    const st = (await request(app).post("/api/files/stream-token").set("Cookie", c).send({ gridfsId: videoId })).body.streamToken as string

    expect((await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", c)).status).toBe(400)
    const part = await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", c).set("Range", "bytes=0-").buffer(true)
    expect(part.status).toBe(206)
    expect(part.headers["content-range"]).toBe(`bytes 0-${8 * 1024 * 1024 - 1}/${big.length}`)
  })

  it("keeps at most 5 live stream links per person", async () => {
    const { student, videoId } = await videoLesson()
    const c = cookie(student._id, "student")
    for (let i = 0; i < 7; i++) await request(app).post("/api/files/stream-token").set("Cookie", c).send({ gridfsId: videoId })
    expect(await FileToken.countDocuments({ userId: student._id.toString(), kind: "stream" })).toBe(5)
  })

  it("limits video-part requests per network address, whatever link value is sent", async () => {
    const limited = express()
    limited.set("trust proxy", 1)
    limited.use("/f", streamPartLimiter(3), (_req, res) => { res.json({ ok: true }) })
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      statuses.push((await request(limited).get(`/f/x?st=${"a".repeat(47)}${i}`).set("X-Forwarded-For", "9.9.9.9")).status)
    }
    expect(statuses).toEqual([200, 200, 200, 429])
  })
})

// Minimal real headers for each allowed picture type
const IMAGES: Record<string, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
  "image/gif":  Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(8, 0)]),
  "image/webp": Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(8, 0)]),
}

describe("photos — every allowed picture type, and deactivated people", () => {
  for (const [type, bytes] of Object.entries(IMAGES)) {
    it(`accepts and serves a real ${type} photo`, async () => {
      const school  = await createSchool()
      const teacher = await createUser(school._id, "teacher")
      const admin   = await createUser(school._id, "admin")
      const up = await request(app).patch("/api/users/profile").set("Cookie", cookie(teacher._id, "teacher"))
        .send({ profile_photo_url: `data:${type};base64,${bytes.toString("base64")}` })
      expect(up.status).toBe(200)
      const got = await request(app).get(`/api/photos/${teacher._id}`).set("Cookie", cookie(admin._id, "admin"))
      expect(got.status).toBe(200)
      expect(got.headers["content-type"]).toBe(type)
    })
  }

  it("a deactivated teacher gets no photo address in the admin list and is not shown to students", async () => {
    const school  = await createSchool()
    const admin   = await createUser(school._id, "admin")
    const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString("base64")}`
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: png, is_active: false })
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)

    const list = await request(app).get("/api/school/teachers").set("Cookie", cookie(admin._id, "admin"))
    expect(list.body.teachers[0].photo_url).toBeNull()
    const mine = await request(app).get("/api/student/teachers").set("Cookie", cookie(student._id, "student"))
    expect(mine.status).toBe(200)
    expect(mine.body.teachers).toEqual([])
  })
})

describe("people lists — stable pages", () => {
  it("students with the same name are never repeated or skipped across pages", async () => {
    const school = await createSchool()
    const admin  = await createUser(school._id, "admin")
    const ids = new Set<string>()
    for (let i = 0; i < 4; i++) ids.add((await createUser(school._id, "student", undefined, { name: "Aarav Kumar" }))._id.toString())
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const res = await request(app).get(`/api/school/students?page=${page}&limit=1`).set("Cookie", cookie(admin._id, "admin"))
      seen.push(res.body.students[0].id)
    }
    expect(new Set(seen)).toEqual(ids)
  })
})

describe("teacher progress — admins still see every class", () => {
  it("an admin of the school gets the class progress", async () => {
    const school = await createSchool()
    const admin  = await createUser(school._id, "admin")
    const cls    = await createClass(school._id)
    await createUser(school._id, "student", cls._id)
    const res = await request(app).get(`/api/teacher/student-progress?class_id=${cls._id}`).set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(200)
    expect(res.body.progress).toHaveLength(1)
  })
})
