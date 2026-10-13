import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import express from "express"
import request from "supertest"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"
import studentCertificatesRouter from "../routes/studentCertificates.js"
import certificatesRouter from "../routes/certificates.js"
import { requireAuth } from "../middleware/auth.js"
import { Module } from "../models/Module.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { Certificate } from "../models/Certificate.js"
import { AuditLog } from "../models/AuditLog.js"
import mongoose from "mongoose"

// Chrome is not started in unit tests — PDF building is replaced by a fixed buffer
vi.mock("../lib/pdf.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pdf.js")>()
  return { ...actual, generateCertificatePDF: vi.fn(async () => Buffer.from("%PDF-1.4 test certificate")) }
})

const app = express()
app.use(express.json())
app.use("/api/student-certificates", requireAuth, studentCertificatesRouter)
app.use("/api/certificates", requireAuth, certificatesRouter)

beforeAll(async () => {
  await startDb()
  // The one-subject-certificate-per-student rule lives in a unique index — make sure it exists before race tests
  await Certificate.init()
})
afterAll(stopDb)
beforeEach(clearDb)

const linkItem = (id: mongoose.Types.ObjectId, order: number) => ({
  _id: id, order, type: "link" as const, label: `Item ${order}`, link_url: "https://example.com", link_type: "other" as const,
  gridfs_id: null, pdf_gridfs_id: null, conversion_status: null, file_name: null, file_type: null, file_size: null,
})

/**
 * A class whose Math teacher is `teacher`, with one Math module of `itemCount` items.
 * `done` has viewed every item; `partial` has viewed only the first one.
 */
async function setupMathClass(itemCount = 2) {
  const school  = await createSchool()
  const teacher = await createUser(school._id, "teacher")
  const cls     = await createClass(school._id, teacher._id)       // teacher teaches Math in this class
  const done    = await createUser(school._id, "student", cls._id)
  const partial = await createUser(school._id, "student", cls._id)
  const items   = Array.from({ length: itemCount }, () => new mongoose.Types.ObjectId())
  const mod = await Module.create({
    school_id: school._id, class_id: cls._id, subject: "Math", title: "Algebra", order: 1,
    created_by: teacher._id, items: items.map((id, i) => linkItem(id, i + 1)),
  })
  for (const item of items) await ModuleProgress.create({ student_id: done._id, module_id: mod._id, item_id: item })
  await ModuleProgress.create({ student_id: partial._id, module_id: mod._id, item_id: items[0] })
  return { school, teacher, cls, done, partial, mod, teacherJwt: makeJwt(teacher._id.toString(), "teacher") }
}

describe("Student self-claim is retired", () => {
  it("POST /claim and GET /eligible answer 403 and create nothing", async () => {
    const { done } = await setupMathClass()
    const jwt = makeJwt(done._id.toString(), "student")

    const claim = await request(app).post("/api/student-certificates/claim").set("Cookie", `ts_token=${jwt}`).send({ subject: "Math" })
    const eligible = await request(app).get("/api/student-certificates/eligible").set("Cookie", `ts_token=${jwt}`)

    expect(claim.status).toBe(403)
    expect(eligible.status).toBe(403)
    expect(await Certificate.countDocuments({})).toBe(0)
  })
})

describe("GET /api/certificates/completion", () => {
  it("shows who completed every item, who is in progress, and nothing is issued", async () => {
    const { cls, done, partial, teacherJwt } = await setupMathClass()

    const res = await request(app)
      .get(`/api/certificates/completion?class_id=${cls._id}&subject=Math`)
      .set("Cookie", `ts_token=${teacherJwt}`)

    expect(res.status).toBe(200)
    const byId = Object.fromEntries((res.body.students as Array<{ student_id: string; completed: boolean; viewed: number; total: number }>).map(s => [s.student_id, s]))
    expect(byId[done._id.toString()]).toMatchObject({ completed: true, viewed: 2, total: 2 })
    expect(byId[partial._id.toString()]).toMatchObject({ completed: false, viewed: 1, total: 2 })
    expect(await Certificate.countDocuments({})).toBe(0)
  })

  it("rejects a teacher for a subject they do not teach in that class (403)", async () => {
    const { cls, teacherJwt } = await setupMathClass()
    await Module.create({ school_id: cls.school_id, class_id: cls._id, subject: "Science", title: "Plants", order: 2, created_by: new mongoose.Types.ObjectId(), items: [] })

    const res = await request(app)
      .get(`/api/certificates/completion?class_id=${cls._id}&subject=Science`)
      .set("Cookie", `ts_token=${teacherJwt}`)

    expect(res.status).toBe(403)
  })

  it("lists only the subjects the teacher teaches that have lessons", async () => {
    const { cls, teacher, teacherJwt } = await setupMathClass()
    // Science has lessons but the teacher does not teach it
    await Module.create({ school_id: cls.school_id, class_id: cls._id, subject: "Science", title: "Plants", order: 2, created_by: new mongoose.Types.ObjectId(), items: [] })
    // English is taught by the teacher but has no lessons yet
    await mongoose.model("Class").updateOne({ _id: cls._id }, { $push: { teachers: { teacher_id: teacher._id, subject: "English" } } })

    const res = await request(app)
      .get(`/api/certificates/completion/subjects?class_id=${cls._id}`)
      .set("Cookie", `ts_token=${teacherJwt}`)

    expect(res.status).toBe(200)
    expect(res.body.subjects).toEqual(["Math"])
  })
})

describe("POST /api/certificates/issue-completion", () => {
  it("requires a template", async () => {
    const { cls, done, teacherJwt } = await setupMathClass()
    const res = await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${teacherJwt}`)
      .send({ class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString()] })
    expect(res.status).toBe(400)
    expect(await Certificate.countDocuments({})).toBe(0)
  })

  it("issues only to students who completed the subject, skips the rest, and writes the audit log", async () => {
    const { cls, done, partial, teacher, teacherJwt } = await setupMathClass()

    const res = await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${teacherJwt}`)
      .send({ class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString(), partial._id.toString()], cert_template: "academic_excellence" })

    expect(res.status).toBe(200)
    expect(res.body.issued).toBe(1)
    expect(res.body.skipped).toHaveLength(1)
    expect(res.body.skipped[0].student_id).toBe(partial._id.toString())

    const certs = await Certificate.find({}).lean()
    expect(certs).toHaveLength(1)
    expect(certs[0].student_id.toString()).toBe(done._id.toString())
    expect(certs[0].cert_template).toBe("academic_excellence")
    expect(certs[0].issued_by?.toString()).toBe(teacher._id.toString())
    const audit = await AuditLog.findOne({ action: "certificate.issued", resource_id: certs[0]._id.toString() }).lean()
    expect(audit).not.toBeNull()
    expect(audit!.actor_id.toString()).toBe(teacher._id.toString())
    expect(audit!.school_id.toString()).toBe(cls.school_id.toString())
  })

  it("does not issue a second certificate to a student who already has one", async () => {
    const { cls, done, teacherJwt } = await setupMathClass()
    const body = { class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString()], cert_template: "course_completion" }

    await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${teacherJwt}`).send(body)
    const again = await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${teacherJwt}`).send(body)

    expect(again.status).toBe(200)
    expect(again.body.issued).toBe(0)
    expect(again.body.skipped[0].reason).toMatch(/already/i)
    expect(await Certificate.countDocuments({})).toBe(1)
  })

  it("rejects a teacher who does not teach this class (403)", async () => {
    const { school, cls, done } = await setupMathClass()
    const outsider = await createUser(school._id, "teacher")
    const jwt = makeJwt(outsider._id.toString(), "teacher")

    const res = await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${jwt}`)
      .send({ class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString()], cert_template: "course_completion" })

    expect(res.status).toBe(403)
    expect(await Certificate.countDocuments({})).toBe(0)
  })

  it("a timetable slot alone does not grant certificate powers (only the admin-managed teacher list does)", async () => {
    const { school, cls, done } = await setupMathClass()
    // A teacher who added themselves to this class's timetable but is not assigned by the admin
    const intruder = await createUser(school._id, "teacher")
    await mongoose.model("Class").updateOne(
      { _id: cls._id },
      { $push: { timetable: { day: "Monday", period: 1, subject: "Math", teacher_id: intruder._id, start_time: "08:00", end_time: "08:40" } } },
    )
    const jwt = makeJwt(intruder._id.toString(), "teacher")

    const completion = await request(app).get(`/api/certificates/completion?class_id=${cls._id}&subject=Math`).set("Cookie", `ts_token=${jwt}`)
    const issue = await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${jwt}`)
      .send({ class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString()], cert_template: "course_completion" })

    expect(completion.status).toBe(403)
    expect(issue.status).toBe(403)
    expect(await Certificate.countDocuments({})).toBe(0)
  })

  it("rejects a teacher from another school (403)", async () => {
    const { cls, done } = await setupMathClass()
    const otherSchool = await createSchool()
    const otherTeacher = await createUser(otherSchool._id, "teacher")
    const jwt = makeJwt(otherTeacher._id.toString(), "teacher")

    const res = await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${jwt}`)
      .send({ class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString()], cert_template: "course_completion" })

    expect(res.status).toBe(403)
  })
})

describe("Revoking keeps the certificate (status revoked)", () => {
  it("marks it revoked, blocks downloads, audits it, and re-issuing re-activates the same record", async () => {
    const { cls, done, teacherJwt } = await setupMathClass()
    const issueBody = { class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString()], cert_template: "course_completion" }
    await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${teacherJwt}`).send(issueBody)
    const cert = await Certificate.findOne({}).lean()

    const revoke = await request(app).post(`/api/certificates/${cert!._id}/revoke`).set("Cookie", `ts_token=${teacherJwt}`)
      .send({ reason: "Issued to the wrong student" })
    expect(revoke.status).toBe(200)

    const stored = await Certificate.findById(cert!._id).lean()
    expect(stored).not.toBeNull()
    expect(stored!.status).toBe("revoked")
    expect(stored!.revoke_reason).toBe("Issued to the wrong student")
    expect(await AuditLog.countDocuments({ action: "certificate.revoked", resource_id: cert!._id.toString() })).toBe(1)

    const studentJwt = makeJwt(done._id.toString(), "student")
    const download = await request(app).get(`/api/student-certificates/download/${cert!._id}`).set("Cookie", `ts_token=${studentJwt}`)
    expect(download.status).toBe(410)

    const twice = await request(app).post(`/api/certificates/${cert!._id}/revoke`).set("Cookie", `ts_token=${teacherJwt}`).send({})
    expect(twice.status).toBe(409)

    const reissue = await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${teacherJwt}`).send(issueBody)
    expect(reissue.body.issued).toBe(1)
    const all = await Certificate.find({}).lean()
    expect(all).toHaveLength(1)
    expect(all[0]._id.toString()).toBe(cert!._id.toString())
    expect(all[0].status).toBe("active")
    expect(all[0].revoked_at).toBeNull()
    expect(all[0].revoke_reason).toBe("")
  })
})

describe("GET /api/certificates/download/:id — parents", () => {
  it("a parent can open their own child's certificate but not another child's", async () => {
    const { school, cls, done, partial, teacher } = await setupMathClass()
    const ownCert = await Certificate.create({
      student_id: done._id, school_id: school._id, class_id: cls._id, module_id: null, module_title: "Math",
      subject: "Math", class_label: "5A", student_name: done.name, type: "module", issued_by: teacher._id,
    })
    const otherCert = await Certificate.create({
      student_id: partial._id, school_id: school._id, class_id: cls._id, module_id: null, module_title: "Science",
      subject: "Science", class_label: "5A", student_name: partial.name, type: "module", issued_by: teacher._id,
    })
    const parent = await createUser(school._id, "parent", undefined, { linked_student_id: done._id })
    const jwt = makeJwt(parent._id.toString(), "parent")

    const own = await request(app).get(`/api/certificates/download/${ownCert._id}`).set("Cookie", `ts_token=${jwt}`)
    const other = await request(app).get(`/api/certificates/download/${otherCert._id}`).set("Cookie", `ts_token=${jwt}`)

    expect(own.status).toBe(200)
    expect(own.headers["content-type"]).toContain("application/pdf")
    expect(other.status).toBe(403)
  })
})

describe("GET /api/certificates/class/:classId", () => {
  it("separates certified modules, empty modules, subject certs, and removed-module certs", async () => {
    const school  = await createSchool()
    const teacher = await createUser(school._id, "teacher")
    const cls     = await createClass(school._id, teacher._id)
    const student = await createUser(school._id, "student", cls._id)
    const jwt     = makeJwt(teacher._id.toString(), "teacher")

    // A live module with a certificate
    const liveMod = await Module.create({
      school_id: school._id, class_id: cls._id, subject: "Math",
      title: "Algebra", order: 1, created_by: teacher._id, items: [],
    })
    await Certificate.create({
      student_id: student._id, school_id: school._id, class_id: cls._id,
      module_id: liveMod._id, module_title: liveMod.title, subject: "Math",
      class_label: "5A", student_name: student.name, type: "module",
    })

    // A live module with zero certificates
    await Module.create({
      school_id: school._id, class_id: cls._id, subject: "Science",
      title: "Empty Module", order: 2, created_by: teacher._id, items: [],
    })

    // An intentional subject-completion certificate (module_id null by design)
    await Certificate.create({
      student_id: student._id, school_id: school._id, class_id: cls._id,
      module_id: null, module_title: "English", subject: "English",
      class_label: "5A", student_name: student.name, type: "module",
    })

    // A certificate whose module was deleted (module_deleted flag set, module_id dangling)
    const deletedModId = new mongoose.Types.ObjectId()
    await Certificate.create({
      student_id: student._id, school_id: school._id, class_id: cls._id,
      module_id: deletedModId, module_title: "Old Module", subject: "History",
      class_label: "5A", student_name: student.name, type: "module",
      module_deleted: true,
    })

    const res = await request(app)
      .get(`/api/certificates/class/${cls._id}`)
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)

    // Live modules: one with a cert, one empty
    const liveModuleEntry = res.body.modules.find((m: { module_id: string }) => m.module_id === liveMod._id.toString())
    expect(liveModuleEntry.certificates).toHaveLength(1)
    const emptyModuleEntry = res.body.modules.find((m: { module_title: string }) => m.module_title === "Empty Module")
    expect(emptyModuleEntry.certificates).toHaveLength(0)

    // Subject-completion cert appears as a virtual module entry, not in removed_modules
    const subjectEntry = res.body.modules.find((m: { subject: string }) => m.subject === "English")
    expect(subjectEntry).toBeDefined()
    expect(subjectEntry.certificates).toHaveLength(1)

    // Removed-module cert is isolated in its own group, not merged with subject certs
    expect(res.body.removed_modules).toHaveLength(1)
    expect(res.body.removed_modules[0].module_title).toBe("Old Module")
    expect(res.body.removed_modules[0].certificates).toHaveLength(1)
  })
})

describe("GET /api/student-certificates/mine", () => {
  it("returns only the current student's certificates", async () => {
    const school   = await createSchool()
    const teacher  = await createUser(school._id, "teacher")
    const cls      = await createClass(school._id, teacher._id)
    const student1 = await createUser(school._id, "student", cls._id)
    const student2 = await createUser(school._id, "student", cls._id)
    const jwt      = makeJwt(student1._id.toString(), "student")

    // Certificate for student1
    await Certificate.create({
      student_id: student1._id, school_id: school._id, class_id: cls._id,
      module_id: null, module_title: "Math", subject: "Math",
      class_label: "5A", student_name: student1.name, type: "module",
    })
    // Certificate for student2 — must NOT appear in student1's list
    await Certificate.create({
      student_id: student2._id, school_id: school._id, class_id: cls._id,
      module_id: null, module_title: "Science", subject: "Science",
      class_label: "5A", student_name: student2.name, type: "module",
    })

    const res = await request(app)
      .get("/api/student-certificates/mine")
      .set("Cookie", `ts_token=${jwt}`)

    expect(res.status).toBe(200)
    expect(res.body.certificates).toHaveLength(1)
    expect(res.body.certificates[0].student_id).toBe(student1._id.toString())
  })
})

describe("Certificate access edge cases", () => {
  it("two teachers issuing to the same student at the same time produce exactly one certificate", async () => {
    const { school, cls, done, teacherJwt } = await setupMathClass()
    const admin = await createUser(school._id, "admin")
    const adminJwt = makeJwt(admin._id.toString(), "admin")
    const body = { class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString()], cert_template: "course_completion" }

    const [a, b] = await Promise.all([
      request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${teacherJwt}`).send(body),
      request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${adminJwt}`).send(body),
    ])

    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(a.body.issued + b.body.issued).toBe(1)
    expect(await Certificate.countDocuments({})).toBe(1)
    expect(await AuditLog.countDocuments({ action: "certificate.issued" })).toBe(1)
  })

  it("a revoked certificate cannot be downloaded by a teacher or a parent either (410)", async () => {
    const { school, cls, done, teacher, teacherJwt } = await setupMathClass()
    const cert = await Certificate.create({
      student_id: done._id, school_id: school._id, class_id: cls._id, module_id: null, module_title: "Math",
      subject: "Math", class_label: "5A", student_name: done.name, type: "module", issued_by: teacher._id,
      status: "revoked", revoked_at: new Date(), revoked_by: teacher._id,
    })
    const parent = await createUser(school._id, "parent", undefined, { linked_student_id: done._id })

    const asTeacher = await request(app).get(`/api/certificates/download/${cert._id}`).set("Cookie", `ts_token=${teacherJwt}`)
    const asParent = await request(app).get(`/api/certificates/download/${cert._id}`).set("Cookie", `ts_token=${makeJwt(parent._id.toString(), "parent")}`)

    expect(asTeacher.status).toBe(410)
    expect(asParent.status).toBe(410)
  })

  it("a teacher who does not teach the class cannot download its certificates (403)", async () => {
    const { school, cls, done, teacher } = await setupMathClass()
    const cert = await Certificate.create({
      student_id: done._id, school_id: school._id, class_id: cls._id, module_id: null, module_title: "Math",
      subject: "Math", class_label: "5A", student_name: done.name, type: "module", issued_by: teacher._id,
    })
    const outsider = await createUser(school._id, "teacher")

    const res = await request(app).get(`/api/certificates/download/${cert._id}`).set("Cookie", `ts_token=${makeJwt(outsider._id.toString(), "teacher")}`)

    expect(res.status).toBe(403)
  })

  it("template changes are written to the audit log", async () => {
    const { teacherJwt } = await setupMathClass()
    const res = await request(app).post("/api/certificates/template").set("Cookie", `ts_token=${teacherJwt}`)
      .send({ footer_left: "Ms. Priya" })
    expect(res.status).toBe(200)
    expect(await AuditLog.countDocuments({ action: "certificate_template.updated" })).toBe(1)
  })
})

describe("Revoking is refused for everyone who may not do it", () => {
  type Caller = { label: string; jwt: (ctx: Awaited<ReturnType<typeof setupMathClass>>) => Promise<string> }
  const callers: Caller[] = [
    { label: "a teacher who does not teach the class", jwt: async ({ school }) => {
      const t = await createUser(school._id, "teacher"); return makeJwt(t._id.toString(), "teacher") } },
    { label: "a teacher with only a timetable slot", jwt: async ({ school, cls }) => {
      const t = await createUser(school._id, "teacher")
      await mongoose.model("Class").updateOne({ _id: cls._id }, { $push: { timetable: { day: "Monday", period: 1, subject: "Math", teacher_id: t._id, start_time: "08:00", end_time: "08:40" } } })
      return makeJwt(t._id.toString(), "teacher") } },
    { label: "a teacher from another school", jwt: async () => {
      const other = await createSchool(); const t = await createUser(other._id, "teacher"); return makeJwt(t._id.toString(), "teacher") } },
    { label: "the student who holds it", jwt: async ({ done }) => makeJwt(done._id.toString(), "student") },
    { label: "the student's parent", jwt: async ({ school, done }) => {
      const p = await createUser(school._id, "parent", undefined, { linked_student_id: done._id }); return makeJwt(p._id.toString(), "parent") } },
  ]

  for (const caller of callers) {
    it(`${caller.label} cannot revoke — the certificate stays active and nothing is audited`, async () => {
      const ctx = await setupMathClass()
      const cert = await Certificate.create({
        student_id: ctx.done._id, school_id: ctx.school._id, class_id: ctx.cls._id, module_id: null, module_title: "Math",
        subject: "Math", class_label: "5A", student_name: ctx.done.name, type: "module", issued_by: ctx.teacher._id,
      })

      const res = await request(app).post(`/api/certificates/${cert._id}/revoke`)
        .set("Cookie", `ts_token=${await caller.jwt(ctx)}`).send({ reason: "not allowed" })

      expect([403, 404]).toContain(res.status)
      const stored = await Certificate.findById(cert._id).lean()
      expect(stored!.status ?? "active").toBe("active")
      expect(await AuditLog.countDocuments({ action: "certificate.revoked" })).toBe(0)
    })
  }

  it("an unknown template value is rejected and nothing is issued", async () => {
    const { cls, done, teacherJwt } = await setupMathClass()
    const res = await request(app).post("/api/certificates/issue-completion").set("Cookie", `ts_token=${teacherJwt}`)
      .send({ class_id: cls._id.toString(), subject: "Math", student_ids: [done._id.toString()], cert_template: "gold_star" })
    expect(res.status).toBe(400)
    expect(await Certificate.countDocuments({})).toBe(0)
  })
})
