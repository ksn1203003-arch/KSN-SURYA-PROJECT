import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createUser } from "./helpers.js"
import filesRouter from "../routes/files.js"
import { FileToken } from "../models/FileToken.js"
import { Module } from "../models/Module.js"
import { User } from "../models/User.js"
import { getGridFSBucket } from "../lib/gridfs.js"

const app = express()
app.use(express.json())
app.use("/api/files", filesRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

describe("GET /api/files/:gridfsId — file token consumption", () => {
  it("expired token returns 401", async () => {
    const school = await createSchool()
    const user   = await createUser(school._id, "student")
    const fakeGridfsId = new mongoose.Types.ObjectId().toString()

    // Create an already-expired token
    await FileToken.create({
      token:     "expired-token-abc123",
      userId:    user._id.toString(),
      gridfsId:  fakeGridfsId,
      expiresAt: new Date(Date.now() - 60_000),
    })

    const res = await request(app)
      .get(`/api/files/${fakeGridfsId}?ft=expired-token-abc123`)

    expect(res.status).toBe(401)
  })

  it("token for wrong file returns 403", async () => {
    const school       = await createSchool()
    const user         = await createUser(school._id, "student")
    const correctId    = new mongoose.Types.ObjectId().toString()
    const differentId  = new mongoose.Types.ObjectId().toString()

    await FileToken.create({
      token:     "wrong-file-token",
      userId:    user._id.toString(),
      gridfsId:  correctId,
      expiresAt: new Date(Date.now() + 300_000),
    })

    // Request a different gridfsId with this token
    const res = await request(app)
      .get(`/api/files/${differentId}?ft=wrong-file-token`)

    expect(res.status).toBe(403)
  })

  it("concurrent requests with same token — only one succeeds (atomic findOneAndDelete)", async () => {
    const school      = await createSchool()
    const user        = await createUser(school._id, "student")
    const fakeGridfsId = new mongoose.Types.ObjectId().toString()

    await FileToken.create({
      token:     "race-condition-token",
      userId:    user._id.toString(),
      gridfsId:  fakeGridfsId,
      expiresAt: new Date(Date.now() + 300_000),
    })

    // Fire 5 simultaneous requests with the same token
    // The file won't exist in GridFS so all get 404/500 after token check,
    // but we verify the token is consumed atomically — only one request should
    // pass the token validation step (the rest get 401 "expired or invalid")
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).get(`/api/files/${fakeGridfsId}?ft=race-condition-token`)
      )
    )

    // After all requests, the token must be gone from DB
    const remaining = await FileToken.findOne({ token: "race-condition-token" })
    expect(remaining).toBeNull()

    // Exactly one request should have passed token validation (proceeded past 401)
    const passedTokenCheck = results.filter(r => r.status !== 401)
    const rejectedByToken  = results.filter(r => r.status === 401)

    // At most one passed the token check (the one that atomically deleted it)
    expect(passedTokenCheck.length).toBeLessThanOrEqual(1)
    // The rest must have been rejected with 401
    expect(rejectedByToken.length).toBeGreaterThanOrEqual(4)
  })
})

// ── Video stream links (play in parts; PDFs keep the one-time whole download) ──

const VIDEO_BYTES = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256))

async function storeLessonFile(schoolId: mongoose.Types.ObjectId, name: string): Promise<mongoose.Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const up = getGridFSBucket("lesson_files").openUploadStream(name, { metadata: { school_id: schoolId.toString() } })
    up.on("error", reject)
    up.on("finish", () => resolve(up.id as mongoose.Types.ObjectId))
    up.end(VIDEO_BYTES)
  })
}

async function lessonWith(schoolId: mongoose.Types.ObjectId, createdBy: mongoose.Types.ObjectId, fileType: string, classId?: mongoose.Types.ObjectId) {
  const gridfsId = await storeLessonFile(schoolId, `lesson.${fileType}`)
  await Module.create({
    school_id: schoolId, class_id: classId ?? new mongoose.Types.ObjectId(), subject: "Science", title: "Plants", order: 1,
    created_by: createdBy,
    items: [{ order: 0, type: "file", label: "Clip", gridfs_id: gridfsId, file_name: `clip.${fileType}`, file_type: fileType, file_size: VIDEO_BYTES.length }],
  })
  return gridfsId.toString()
}

const sessionOf = (userId: unknown, role = "student") => `ts_token=${makeJwt(String(userId), role)}`

async function mintStream(userId: unknown, gridfsId: string, role = "student") {
  return request(app).post("/api/files/stream-token").set("Cookie", sessionOf(userId, role)).send({ gridfsId })
}

// A student in a class, and a lesson video for that class
async function studentWithVideo() {
  const school  = await createSchool()
  const teacher = await createUser(school._id, "teacher")
  const classId = new mongoose.Types.ObjectId()
  const student = await createUser(school._id, "student", classId)
  const videoId = await lessonWith(school._id, teacher._id, "mp4", classId)
  return { school, teacher, classId, student, videoId }
}

describe("video stream links", () => {
  it("plays a lesson video in parts, and the same link works for every part", async () => {
    const { student, videoId } = await studentWithVideo()
    const minted = await mintStream(student._id, videoId)
    expect(minted.status).toBe(200)
    const st = minted.body.streamToken as string

    const part1 = await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", sessionOf(student._id)).set("Range", "bytes=0-99").buffer(true)
    expect(part1.status).toBe(206)
    expect(part1.headers["content-range"]).toBe("bytes 0-99/1000")
    expect(part1.headers["content-type"]).toBe("video/mp4")
    expect(part1.headers["cross-origin-resource-policy"]).toBe("same-site")
    expect(Buffer.compare(part1.body as Buffer, VIDEO_BYTES.subarray(0, 100))).toBe(0)

    const part2 = await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", sessionOf(student._id)).set("Range", "bytes=-10").buffer(true)
    expect(part2.status).toBe(206)
    expect(part2.headers["content-range"]).toBe("bytes 990-999/1000")
    expect(await FileToken.countDocuments({ token: st })).toBe(1)
  })

  it("a copied link is useless without the viewer's own signed-in session", async () => {
    const { school, classId, student, videoId } = await studentWithVideo()
    const st = (await mintStream(student._id, videoId)).body.streamToken as string
    const classmate = await createUser(school._id, "student", classId)

    expect((await request(app).get(`/api/files/${videoId}?st=${st}`).set("Range", "bytes=0-9")).status).toBe(401)
    expect((await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", sessionOf(classmate._id)).set("Range", "bytes=0-9")).status).toBe(403)
  })

  it("a student cannot stream another class's video, even in the same school", async () => {
    const { school, teacher, student } = await studentWithVideo()
    const otherClassVideo = await lessonWith(school._id, teacher._id, "mp4", new mongoose.Types.ObjectId())
    expect((await mintStream(student._id, otherClassVideo)).status).toBe(403)
  })

  it("staff can stream any lesson video in their school; parents cannot stream", async () => {
    const { school, teacher, videoId } = await studentWithVideo()
    const admin  = await createUser(school._id, "admin")
    const parent = await createUser(school._id, "parent")
    expect((await mintStream(teacher._id, videoId, "teacher")).status).toBe(200)
    expect((await mintStream(admin._id, videoId, "admin")).status).toBe(200)
    expect((await mintStream(parent._id, videoId, "parent")).status).toBe(403)
  })

  it("refuses to make a stream link for anything that is not a lesson video (PDFs stay whole, one-time)", async () => {
    const { school, teacher, classId, student } = await studentWithVideo()
    const pdfId = await lessonWith(school._id, teacher._id, "pdf", classId)
    expect((await mintStream(student._id, pdfId)).status).toBe(400)
  })

  it("refuses another school's video", async () => {
    const { student } = await studentWithVideo()
    const schoolB = await createSchool()
    const teacherB = await createUser(schoolB._id, "teacher")
    const videoB = await lessonWith(schoolB._id, teacherB._id, "mp4")
    expect((await mintStream(student._id, videoB)).status).toBe(403)
  })

  it("a stream link cannot be spent as a one-time token, and is not deleted by trying", async () => {
    const { student, videoId } = await studentWithVideo()
    const st = (await mintStream(student._id, videoId)).body.streamToken as string
    const res = await request(app).get(`/api/files/${videoId}?ft=${st}`)
    expect(res.status).toBe(401)
    expect(await FileToken.countDocuments({ token: st })).toBe(1)
  })

  it("stops working as soon as the user signs out", async () => {
    const { student, videoId } = await studentWithVideo()
    const st = (await mintStream(student._id, videoId)).body.streamToken as string
    await User.updateOne({ _id: student._id }, { $inc: { token_version: 1 } })
    const res = await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", sessionOf(student._id)).set("Range", "bytes=0-9")
    expect(res.status).toBe(401)
  })

  it("is refused after it expires, and only works for its own file", async () => {
    const { school, teacher, classId, student, videoId } = await studentWithVideo()
    const otherId = await lessonWith(school._id, teacher._id, "mp4", classId)
    const st = (await mintStream(student._id, videoId)).body.streamToken as string
    const c = sessionOf(student._id)

    expect((await request(app).get(`/api/files/${otherId}?st=${st}`).set("Cookie", c).set("Range", "bytes=0-9")).status).toBe(403)
    await FileToken.updateOne({ token: st }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", c).set("Range", "bytes=0-9")).status).toBe(401)
  })

  it("stays alive while the video is watched, but never past its 3-hour cap", async () => {
    const { student, videoId } = await studentWithVideo()
    const st = (await mintStream(student._id, videoId)).body.streamToken as string
    const cap = new Date(Date.now() + 2 * 60_000)
    await FileToken.updateOne({ token: st }, { $set: { expiresAt: new Date(Date.now() + 60_000), maxExpiresAt: cap } })
    await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", sessionOf(student._id)).set("Range", "bytes=0-9")
    const after = await FileToken.findOne({ token: st }).lean()
    expect(after!.expiresAt.getTime()).toBe(cap.getTime())
  })

  it("answers 416 for a range it cannot serve", async () => {
    const { student, videoId } = await studentWithVideo()
    const st = (await mintStream(student._id, videoId)).body.streamToken as string
    for (const bad of ["bytes=abc", "bytes=5000-6000", "bytes=50-10", "bytes=-0"]) {
      const res = await request(app).get(`/api/files/${videoId}?st=${st}`).set("Cookie", sessionOf(student._id)).set("Range", bad)
      expect(res.status, bad).toBe(416)
    }
  })
})
