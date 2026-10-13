import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"
import photosRouter from "../routes/photos.js"
import schoolRouter from "../routes/school.js"
import studentRouter from "../routes/student.js"
import usersRouter from "../routes/users.js"
import { requireAuth } from "../middleware/auth.js"
import { User } from "../models/User.js"

const app = express()
app.use(express.json({ limit: "2mb" }))
app.use("/api/photos", requireAuth, photosRouter)
app.use("/api/school", requireAuth, schoolRouter)
app.use("/api/student", requireAuth, studentRouter)
app.use("/api/users", requireAuth, usersRouter)

// 1×1 transparent PNG
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

const cookie = (id: unknown, role: string) => `ts_token=${makeJwt(String(id), role)}`

describe("GET /api/photos/:id", () => {
  it("sends the picture as an image with private, revalidate-every-time caching", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL, profile_photo_updated_at: new Date(1_700_000_000_000) })
    const admin   = await createUser(school._id, "admin")

    const res = await request(app).get(`/api/photos/${teacher._id}`).set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("image/png")
    expect(res.headers["cache-control"]).toBe("private, no-cache")
    expect(res.headers.etag).toBe(`"p-${teacher._id}-1700000000000"`)
    expect(Buffer.compare(res.body as Buffer, Buffer.from(PNG_B64, "base64"))).toBe(0)
  })

  it("answers 304 with no body when the browser already has this version", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL, profile_photo_updated_at: new Date(5000) })
    const admin   = await createUser(school._id, "admin")

    const res = await request(app).get(`/api/photos/${teacher._id}`)
      .set("Cookie", cookie(admin._id, "admin"))
      .set("If-None-Match", `"p-${teacher._id}-5000"`)
    expect(res.status).toBe(304)
  })

  it("a photo saved before versions existed still works (version 0)", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL })
    const admin   = await createUser(school._id, "admin")

    const res = await request(app).get(`/api/photos/${teacher._id}`).set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(200)
    expect(res.headers.etag).toBe(`"p-${teacher._id}-0"`)
  })

  it("refuses another school's photo with 404, even for an admin", async () => {
    const schoolA = await createSchool()
    const schoolB = await createSchool()
    const teacherB = await createUser(schoolB._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL })
    const adminA   = await createUser(schoolA._id, "admin")

    const res = await request(app).get(`/api/photos/${teacherB._id}`).set("Cookie", cookie(adminA._id, "admin"))
    expect(res.status).toBe(404)
  })

  it("lets a student see their own photo and their teachers', but not a classmate's", async () => {
    const school    = await createSchool()
    const teacher   = await createUser(school._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL })
    const cls       = await createClass(school._id, teacher._id)
    const student   = await createUser(school._id, "student", cls._id, { profile_photo_url: PNG_DATA_URL })
    const classmate = await createUser(school._id, "student", cls._id, { profile_photo_url: PNG_DATA_URL })
    const c = cookie(student._id, "student")

    expect((await request(app).get(`/api/photos/${student._id}`).set("Cookie", c)).status).toBe(200)
    expect((await request(app).get(`/api/photos/${teacher._id}`).set("Cookie", c)).status).toBe(200)
    expect((await request(app).get(`/api/photos/${classmate._id}`).set("Cookie", c)).status).toBe(404)
  })

  it("lets a parent see their linked child only", async () => {
    const school = await createSchool()
    const cls    = await createClass(school._id)
    const child  = await createUser(school._id, "student", cls._id, { profile_photo_url: PNG_DATA_URL })
    const other  = await createUser(school._id, "student", cls._id, { profile_photo_url: PNG_DATA_URL })
    const parent = await createUser(school._id, "parent", undefined, { linked_student_id: child._id })
    const c = cookie(parent._id, "parent")

    expect((await request(app).get(`/api/photos/${child._id}`).set("Cookie", c)).status).toBe(200)
    expect((await request(app).get(`/api/photos/${other._id}`).set("Cookie", c)).status).toBe(404)
  })

  it("does not serve a deactivated user's photo", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL, is_active: false })
    const admin   = await createUser(school._id, "admin")

    const res = await request(app).get(`/api/photos/${teacher._id}`).set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(404)
  })

  it("never serves stored data that is not a plain picture (e.g. SVG)", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" })
    const admin   = await createUser(school._id, "admin")

    const res = await request(app).get(`/api/photos/${teacher._id}`).set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(404)
    expect(res.headers["content-type"]).toMatch(/json/)
  })

  it("rejects a malformed id with 400 and a missing sign-in with 401", async () => {
    const school = await createSchool()
    const admin  = await createUser(school._id, "admin")
    expect((await request(app).get("/api/photos/not-an-id").set("Cookie", cookie(admin._id, "admin"))).status).toBe(400)
    expect((await request(app).get(`/api/photos/${admin._id}`)).status).toBe(401)
  })
})

describe("people lists carry a photo address, never the photo", () => {
  it("admin teacher and student lists send photo_url and no base64", async () => {
    const school  = await createSchool()
    const admin   = await createUser(school._id, "admin")
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL, profile_photo_updated_at: new Date(42) })
    const cls     = await createClass(school._id, teacher._id)
    await createUser(school._id, "student", cls._id)
    const c = cookie(admin._id, "admin")

    const teachers = await request(app).get("/api/school/teachers").set("Cookie", c)
    expect(teachers.status).toBe(200)
    expect(teachers.text).not.toContain("base64")
    expect(teachers.body.teachers[0].photo_url).toBe(`/api/photos/${teacher._id}?v=42`)
    expect(teachers.body.teachers[0]).not.toHaveProperty("profile_photo_url")

    const students = await request(app).get("/api/school/students").set("Cookie", c)
    expect(students.status).toBe(200)
    expect(students.body.students[0].photo_url).toBeNull()
    expect(students.body.students[0]).not.toHaveProperty("profile_photo_url")
  })

  it("the student's teacher list sends photo_url", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL })
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)

    const res = await request(app).get("/api/student/teachers").set("Cookie", cookie(student._id, "student"))
    expect(res.status).toBe(200)
    expect(res.text).not.toContain("base64")
    expect(res.body.teachers[0].photo_url).toBe(`/api/photos/${teacher._id}?v=0`)
  })
})

describe("PATCH /api/users/profile photo", () => {
  it("accepts a PNG and stamps a new version that the photo address then carries", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")

    const res = await request(app).patch("/api/users/profile")
      .set("Cookie", cookie(teacher._id, "teacher"))
      .send({ profile_photo_url: PNG_DATA_URL })
    expect(res.status).toBe(200)
    const saved = await User.findById(teacher._id).select("profile_photo_updated_at").lean()
    expect(saved?.profile_photo_updated_at).toBeInstanceOf(Date)
  })

  it("refuses an SVG or anything that is not image data", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const c = cookie(teacher._id, "teacher")

    for (const bad of ["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "javascript:alert(1)", "https://example.com/a.png"]) {
      const res = await request(app).patch("/api/users/profile").set("Cookie", c).send({ profile_photo_url: bad })
      expect(res.status).toBe(400)
    }
    const saved = await User.findById(teacher._id).select("profile_photo_url").lean()
    expect(saved?.profile_photo_url).toBeNull()
  })

  it("removing the photo clears the version", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: PNG_DATA_URL, profile_photo_updated_at: new Date() })

    const res = await request(app).patch("/api/users/profile")
      .set("Cookie", cookie(teacher._id, "teacher"))
      .send({ profile_photo_url: "" })
    expect(res.status).toBe(200)
    const saved = await User.findById(teacher._id).select("profile_photo_url profile_photo_updated_at").lean()
    expect(saved?.profile_photo_url).toBeNull()
    expect(saved?.profile_photo_updated_at).toBeNull()
  })
})

describe("review fixes — photos", () => {
  it("deactivated people get no photo address in lists", async () => {
    const school = await createSchool()
    const admin  = await createUser(school._id, "admin")
    await createUser(school._id, "student", undefined, { profile_photo_url: PNG_DATA_URL, is_active: false })
    const res = await request(app).get("/api/school/students").set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(200)
    expect(res.body.students[0].photo_url).toBeNull()
  })

  it("refuses a photo whose bytes are not the picture type it claims", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const fakePng = `data:image/png;base64,${Buffer.from("<html><script>alert(1)</script></html>").toString("base64")}`
    const res = await request(app).patch("/api/users/profile").set("Cookie", cookie(teacher._id, "teacher")).send({ profile_photo_url: fakePng })
    expect(res.status).toBe(400)
  })

  it("never serves stored bytes that do not match their claimed picture type", async () => {
    const school  = await createSchool()
    const fakePng = `data:image/png;base64,${Buffer.from("not a png at all").toString("base64")}`
    const teacher = await createUser(school._id, "teacher", undefined, { profile_photo_url: fakePng })
    const admin   = await createUser(school._id, "admin")
    const res = await request(app).get(`/api/photos/${teacher._id}`).set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(404)
  })

  it("the students list rejects a class filter that is not a plain id", async () => {
    const school = await createSchool()
    const admin  = await createUser(school._id, "admin")
    const res = await request(app).get("/api/school/students?class_id[$ne]=x").set("Cookie", cookie(admin._id, "admin"))
    expect(res.status).toBe(400)
  })
})
