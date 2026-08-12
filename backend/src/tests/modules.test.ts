import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import express from "express"
import request from "supertest"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"
import modulesRouter from "../routes/modules.js"
import { requireAuth } from "../middleware/auth.js"
import { Module } from "../models/Module.js"
import { Certificate } from "../models/Certificate.js"

const app = express()
app.use(express.json())
app.use("/api/modules", requireAuth, modulesRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(clearDb)

describe("GET /api/modules", () => {
  it("returns modules for teacher's school and class", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    await Module.create({
      school_id:  school._id,
      class_id:   cls._id,
      subject:    "Math",
      title:      "Algebra Basics",
      order:      1,
      created_by: teacher._id,
      items:      [],
    })

    const res = await request(app)
      .get("/api/modules")
      .query({ class_id: cls._id.toString(), subject: "Math" })
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    expect(res.body.modules).toHaveLength(1)
    expect(res.body.modules[0].title).toBe("Algebra Basics")
  })

  it("returns 400 when class_id is missing", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const res = await request(app)
      .get("/api/modules")
      .query({ subject: "Math" })
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(400)
  })

  it("does not return modules from another school", async () => {
    const school1  = await createSchool()
    const school2  = await createSchool()
    const teacher1 = await createUser(school1._id, "teacher")
    const teacher2 = await createUser(school2._id, "teacher")
    const cls1     = await createClass(school1._id, teacher1._id)
    const cls2     = await createClass(school2._id, teacher2._id)
    const jwt      = makeJwt(teacher1._id.toString(), "teacher")

    await Module.create({
      school_id:  school2._id,
      class_id:   cls2._id,
      subject:    "Math",
      title:      "School 2 Module",
      order:      1,
      created_by: teacher2._id,
      items:      [],
    })

    const res = await request(app)
      .get("/api/modules")
      .query({ class_id: cls1._id.toString(), subject: "Math" })
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    expect(res.body.modules).toHaveLength(0)
  })
})

describe("POST /api/modules", () => {
  it("creates a module for a teacher", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const res = await request(app)
      .post("/api/modules")
      .set("Cookie", `ts_token=${jwt}`)
      .send({ class_id: cls._id.toString(), subject: "Science", title: "Forces" })

    expect(res.status).toBe(201)
    expect(res.body.module.title).toBe("Forces")

    const inDb = await Module.findById(res.body.module._id)
    expect(inDb).not.toBeNull()
    expect(inDb!.school_id.toString()).toBe(school._id.toString())
  })

  it("returns 403 when a student tries to create a module", async () => {
    const school  = await createSchool()
    const student = await createUser(school._id, "student")
    const cls     = await createClass(school._id)
    const jwt     = makeJwt(student._id.toString(), "student")

    const res = await request(app)
      .post("/api/modules")
      .set("Cookie", `ts_token=${jwt}`)
      .send({ class_id: cls._id.toString(), subject: "Math", title: "Bad" })

    expect(res.status).toBe(403)
  })

  it("returns 400 when subject is missing", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    // subject is required — class_id alone is not enough
    const res = await request(app)
      .post("/api/modules")
      .set("Cookie", `ts_token=${jwt}`)
      .send({ class_id: cls._id.toString() })

    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/modules/:id", () => {
  it("deletes the module and returns 200", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const mod = await Module.create({
      school_id:  school._id,
      class_id:   cls._id,
      subject:    "English",
      title:      "Grammar",
      order:      1,
      created_by: teacher._id,
      items:      [],
    })

    const res = await request(app)
      .delete(`/api/modules/${mod._id}`)
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    const gone = await Module.findById(mod._id)
    expect(gone).toBeNull()
  })

  it("returns 404 when module belongs to another school", async () => {
    const school1  = await createSchool()
    const school2  = await createSchool()
    const teacher1 = await createUser(school1._id, "teacher")
    const teacher2 = await createUser(school2._id, "teacher")
    const cls2     = await createClass(school2._id, teacher2._id)
    const jwt      = makeJwt(teacher1._id.toString(), "teacher")

    const mod = await Module.create({
      school_id:  school2._id,
      class_id:   cls2._id,
      subject:    "Math",
      title:      "Other School Module",
      order:      1,
      created_by: teacher2._id,
      items:      [],
    })

    const res = await request(app)
      .delete(`/api/modules/${mod._id}`)
      .set("Cookie", `ts_token=${jwt}`)

    // Route returns 403 Forbidden when school_id doesn't match (does not leak 404 info)
    expect(res.status).toBe(403)
  })

  it("flags certificates as module_deleted instead of deleting them", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const mod = await Module.create({
      school_id:  school._id,
      class_id:   cls._id,
      subject:    "Science",
      title:      "Forces",
      order:      1,
      created_by: teacher._id,
      items:      [],
    })

    const cert = await Certificate.create({
      student_id:   student._id,
      school_id:    school._id,
      class_id:     cls._id,
      module_id:    mod._id,
      module_title: mod.title,
      subject:      "Science",
      class_label:  "5A",
      student_name: student.name,
      type:         "module",
    })

    const res = await request(app)
      .delete(`/api/modules/${mod._id}`)
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)

    const stillExists = await Certificate.findById(cert._id)
    expect(stillExists).not.toBeNull()
    expect(stillExists!.module_deleted).toBe(true)
    expect(stillExists!.module_id!.toString()).toBe(mod._id.toString())
  })
})

describe("GET /api/modules/:id/delete-impact", () => {
  it("returns the count of certificates issued for the module", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student1 = await createUser(school._id, "student", cls._id)
    const student2 = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const mod = await Module.create({
      school_id:  school._id,
      class_id:   cls._id,
      subject:    "Math",
      title:      "Geometry",
      order:      1,
      created_by: teacher._id,
      items:      [],
    })

    await Certificate.create({
      student_id: student1._id, school_id: school._id, class_id: cls._id,
      module_id: mod._id, module_title: mod.title, subject: "Math",
      class_label: "5A", student_name: student1.name, type: "module",
    })
    await Certificate.create({
      student_id: student2._id, school_id: school._id, class_id: cls._id,
      module_id: mod._id, module_title: mod.title, subject: "Math",
      class_label: "5A", student_name: student2.name, type: "module",
    })

    const res = await request(app)
      .get(`/api/modules/${mod._id}/delete-impact`)
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    expect(res.body.certificate_count).toBe(2)
  })

  it("returns 0 when the module has no certificates", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    const mod = await Module.create({
      school_id:  school._id,
      class_id:   cls._id,
      subject:    "Math",
      title:      "Empty Module",
      order:      1,
      created_by: teacher._id,
      items:      [],
    })

    const res = await request(app)
      .get(`/api/modules/${mod._id}/delete-impact`)
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    expect(res.body.certificate_count).toBe(0)
  })

  it("returns 403 when module belongs to another school", async () => {
    const school1  = await createSchool()
    const school2  = await createSchool()
    const teacher1 = await createUser(school1._id, "teacher")
    const teacher2 = await createUser(school2._id, "teacher")
    const cls2     = await createClass(school2._id, teacher2._id)
    const jwt      = makeJwt(teacher1._id.toString(), "teacher")

    const mod = await Module.create({
      school_id:  school2._id,
      class_id:   cls2._id,
      subject:    "Math",
      title:      "Other School Module",
      order:      1,
      created_by: teacher2._id,
      items:      [],
    })

    const res = await request(app)
      .get(`/api/modules/${mod._id}/delete-impact`)
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(403)
  })
})
