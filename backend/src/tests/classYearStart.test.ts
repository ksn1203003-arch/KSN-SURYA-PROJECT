// ─────────────────────────────────────────────────────────────────────────────
// classYearStart.test.ts — the class "year start" date, through the real routes (in-memory replica set).
// Covers: the date stored when a class is created and shown by GET /api/school/classes (year_start,
// year_start_effective, has_start_date); PATCH /api/school/classes/:id (strict YYYY-MM-DD check, stale-copy
// conflict, same date = no change, two-years-back / 60-days-ahead range, any date accepted with any number of saved
// sheets, optional cleaned reason of at most 100 characters, sheets_leaving / sheets_entering, one audit row whose
// "before" carries the previous value AND the effective start used for the counts, audit failure = nothing saved);
// the preview route GET /api/school/classes/:id/year-start-preview; the per-admin limit of 10 date changes per hour
// (a hit is counted on arrival and kept when the client hangs up while the change commits; only refusals, "unchanged"
// answers and failures are given back); and the class_history list returned by GET /api/school/student-detail/:id.
// The clock is fixed at 2026-10-12 10:30 IST for the year-start tests.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import http from "node:http"
import type { AddressInfo } from "node:net"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, createSchool, createClass, createUser, makeJwt } from "./helpers.js"
import schoolRouter from "../routes/school.js"
import { Class } from "../models/Class.js"
import { Attendance } from "../models/Attendance.js"
import { AuditLog } from "../models/AuditLog.js"
import { StudentEnrollment } from "../models/StudentEnrollment.js"

const app = express()
app.use(express.json())
app.use("/api/school", schoolRouter)

beforeAll(async () => {
  await startDb()
  await StudentEnrollment.createIndexes()
})
afterAll(stopDb)

const NOW = new Date("2026-10-12T05:00:00Z")           // 10:30 IST on 2026-10-12
const TODAY = "2026-10-12"
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

interface StoredClass {
  name?: string | null
  subjects?: string[]
  year_start?: string | null
  year_start_set_at?: Date | null
}

const bearer = (id: mongoose.Types.ObjectId | string, role: string) => `Bearer ${makeJwt(String(id), role)}`

let sectionCounter = 0
const nextSection = () => `Y${++sectionCounter}`

type World = Awaited<ReturnType<typeof world>>
// Called AFTER the fake clock is set, so the tokens are valid at the fake "now".
// Every world has its own admin, so the per-admin change limit never leaks from one test into another.
async function world() {
  const school = await createSchool()
  const admin = await createUser(school._id, "admin")
  const teacher = await createUser(school._id, "teacher")
  return { school, admin, teacher, auth: bearer(admin._id, "admin"), teacherAuth: bearer(teacher._id, "teacher") }
}

// A class whose start date is stored (or an older class with nothing stored when start is null).
async function classWith(w: World, start: string | null, setAt: Date | null = null, overrides: { grade?: number; name?: string } = {}) {
  const cls = await createClass(w.school._id, undefined, { section: nextSection(), ...overrides, year_start: null })
  if (start !== null) {
    await Class.collection.updateOne({ _id: cls._id }, { $set: { year_start: start, year_start_set_at: setAt } })
  }
  return cls
}

async function sheetOn(w: World, cls: { _id: mongoose.Types.ObjectId }, date: string, period = 1) {
  await Attendance.create({ school_id: w.school._id, class_id: cls._id, teacher_id: w.admin._id, date, period, subject: "", records: [] })
}

// A legacy sheet saved before attendance carried a school id (school_id is not required by the model).
async function legacySheetOn(w: World, cls: { _id: mongoose.Types.ObjectId }, date: string, period = 1) {
  await Attendance.create({ class_id: cls._id, teacher_id: w.admin._id, date, period, subject: "", records: [] })
}

const stored = async (id: mongoose.Types.ObjectId): Promise<StoredClass> => (await Class.findById(id).lean<StoredClass | null>()) ?? {}
const auditRows = () => AuditLog.find({ action: "class.year_start_changed" }).lean()
const patch = (auth: string, id: mongoose.Types.ObjectId | string, body: Record<string, unknown>) =>
  request(app).patch(`/api/school/classes/${id}`).set("Authorization", auth).send(body)
const preview = (auth: string, id: mongoose.Types.ObjectId | string, date?: string) =>
  request(app).get(`/api/school/classes/${id}/year-start-preview`).set("Authorization", auth).query(date === undefined ? {} : { date })

// A real listening server (supertest cannot hang up on purpose). Only the Date clock is faked in these tests, so real
// sockets and real timers work as usual.
async function withServer<T>(fn: (port: number) => Promise<T>): Promise<T> {
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    return await fn((server.address() as AddressInfo).port)
  } finally {
    await new Promise<void>(resolve => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  }
}

// Writes a complete request and destroys the socket straight away, without waiting for any answer.
// The "socket hang up" error this causes on the client side is the point of the call, so it is only recorded.
function sendAndAbort(port: number, method: string, path: string, auth: string, body: Record<string, unknown>): Promise<string> {
  return new Promise<string>(resolve => {
    const payload = JSON.stringify(body)
    let clientSide = "closed without error"
    const req = http.request({
      host: "127.0.0.1", port, method, path,
      headers: { authorization: auth, "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
    })
    req.on("error", (err: Error) => { clientSide = err.message })
    req.on("close", () => resolve(clientSide))
    req.end(payload, () => { req.destroy() })
  })
}

// Polls (real timers, up to ~5 s) until check() is true; fails loudly if it never becomes true.
async function waitUntil(check: () => Promise<boolean>, what: string, maxMs = 5000): Promise<void> {
  const started = performance.now()
  while (performance.now() - started < maxMs) {
    if (await check()) return
    await new Promise<void>(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for: ${what}`)
}

function expectRefusal(res: { status: number; body: { error?: unknown; code?: unknown } }, status: number, code: string) {
  expect(res.status).toBe(status)
  expect(res.body.code).toBe(code)
  expect(typeof res.body.error).toBe("string")
  expect((res.body.error as string).length).toBeGreaterThan(0)
}

async function expectClassUnchanged(id: mongoose.Types.ObjectId, start: string | null, setAt: Date | null) {
  const now = await stored(id)
  expect(now.year_start ?? null).toBe(start)
  expect(now.year_start_set_at ? new Date(now.year_start_set_at).getTime() : null).toBe(setAt ? setAt.getTime() : null)
}

// Same, and no year-start audit row exists at all (use only in a test that has made no successful change).
async function expectUnchanged(id: mongoose.Types.ObjectId, start: string | null, setAt: Date | null) {
  await expectClassUnchanged(id, start, setAt)
  expect(await auditRows()).toHaveLength(0)
}

const REASON = "Entered the wrong date by mistake"
const conflictText = (d: string) => `Someone else just changed this date to ${d}. Nothing was saved. Check the new date and try again.`
const LIMIT_TEXT = "Too many date changes. Please wait and try again."
const TOO_LONG_TEXT = "Please keep the reason under 100 characters."
// Invisible and look-alike characters, built from code points so they are visible in this file.
const ZWSP = String.fromCharCode(0x200b)          // zero-width space: removed
const ZWNJ = String.fromCharCode(0x200c)          // zero-width non-joiner: kept (Persian, Indic scripts)
const ZWJ = String.fromCharCode(0x200d)           // zero-width joiner: kept
const WORD_JOINER = String.fromCharCode(0x2060)   // removed
const BOM = String.fromCharCode(0xfeff)           // removed
const ARABIC_LIGATURE = String.fromCharCode(0xfdfd)   // one character that becomes 18 under NFKC

describe("class year start", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
  })
  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await clearDb()
  })

  // ── A / B / C — stored at create, shown in the list ───────────────────────────
  describe("a new class stores a start date and the list shows it", () => {
    it("POST /classes stores 1 June of the current academic year and the time it was set", async () => {
      const w = await world()
      const res = await request(app).post("/api/school/classes").set("Authorization", w.auth).send({ name: "Orchids" })
      expect(res.status).toBe(200)
      expect(res.body.class.year_start).toBe("2026-06-01")
      expect(res.body.class.year_start_effective).toBe("2026-06-01")
      const row = await stored(new mongoose.Types.ObjectId(res.body.class.id as string))
      expect(row.year_start).toBe("2026-06-01")
      expect(new Date(row.year_start_set_at as Date).getTime()).toBe(NOW.getTime())
    })

    it("honours ACADEMIC_YEAR_START_MONTH=4: the year begins on 1 April", async () => {
      vi.stubEnv("ACADEMIC_YEAR_START_MONTH", "4")
      const w = await world()
      const res = await request(app).post("/api/school/classes").set("Authorization", w.auth).send({ name: "Lilies" })
      expect(res.status).toBe(200)
      expect(res.body.class.year_start).toBe("2026-04-01")
      expect(res.body.class.year_start_effective).toBe("2026-04-01")
    })

    it("with the April start the March-to-April switch follows Indian time (22:30 IST on 31 Mar is the old year, 01:30 IST on 1 Apr the new one)", async () => {
      vi.stubEnv("ACADEMIC_YEAR_START_MONTH", "4")
      const w = await world()
      vi.setSystemTime(new Date("2026-03-31T17:00:00Z"))   // 22:30 IST, 31 Mar
      const before = await request(app).post("/api/school/classes").set("Authorization", bearer(w.admin._id, "admin")).send({ name: "Before April" })
      expect(before.status).toBe(200)
      expect(before.body.class.year_start).toBe("2025-04-01")
      vi.setSystemTime(new Date("2026-03-31T20:00:00Z"))   // 01:30 IST, 1 Apr
      const after = await request(app).post("/api/school/classes").set("Authorization", bearer(w.admin._id, "admin")).send({ name: "After April" })
      expect(after.status).toBe(200)
      expect(after.body.class.year_start).toBe("2026-04-01")
    })

    it("with the default June start the switch follows Indian time (22:30 IST on 31 May is the old year, 01:30 IST on 1 Jun the new one)", async () => {
      const w = await world()
      vi.setSystemTime(new Date("2026-05-31T17:00:00Z"))   // 22:30 IST, 31 May
      const before = await request(app).post("/api/school/classes").set("Authorization", bearer(w.admin._id, "admin")).send({ name: "Before June" })
      expect(before.body.class.year_start).toBe("2025-06-01")
      vi.setSystemTime(new Date("2026-05-31T20:00:00Z"))   // 01:30 IST, 1 Jun
      const after = await request(app).post("/api/school/classes").set("Authorization", bearer(w.admin._id, "admin")).send({ name: "After June" })
      expect(after.body.class.year_start).toBe("2026-06-01")
    })

    it("an explicit valid year_start in the body is stored; a date that does not exist creates no class", async () => {
      const w = await world()
      const ok = await request(app).post("/api/school/classes").set("Authorization", w.auth).send({ name: "Roses", year_start: "2026-04-01" })
      expect(ok.status).toBe(200)
      expect(ok.body.class.year_start).toBe("2026-04-01")
      expect(ok.body.class.year_start_effective).toBe("2026-04-01")
      const bad = await request(app).post("/api/school/classes").set("Authorization", w.auth).send({ name: "Jasmine", year_start: "2026-02-31" })
      expect(bad.status).toBe(400)
      expect(await Class.countDocuments({ school_id: w.school._id })).toBe(1)
    })

    it("GET /classes returns year_start (stored, or null for an older class) and year_start_effective (stored, or this year's June 1)", async () => {
      const w = await world()
      const legacy = await classWith(w, null)
      const set = await classWith(w, "2026-04-15", daysAgo(3))
      const res = await request(app).get("/api/school/classes").set("Authorization", w.auth)
      expect(res.status).toBe(200)
      const rows = res.body.classes as Array<{ id: string; year_start: string | null; year_start_effective: string }>
      const legacyRow = rows.find(r => r.id === String(legacy._id))
      const setRow = rows.find(r => r.id === String(set._id))
      expect(legacyRow).toMatchObject({ year_start: null, year_start_effective: "2026-06-01" })
      expect(setRow).toMatchObject({ year_start: "2026-04-15", year_start_effective: "2026-04-15" })
    })

    it("GET /classes: an older class's effective start follows ACADEMIC_YEAR_START_MONTH", async () => {
      vi.stubEnv("ACADEMIC_YEAR_START_MONTH", "4")
      const w = await world()
      const legacy = await classWith(w, null)
      const res = await request(app).get("/api/school/classes").set("Authorization", w.auth)
      const row = (res.body.classes as Array<{ id: string; year_start: string | null; year_start_effective: string }>).find(r => r.id === String(legacy._id))
      expect(row).toMatchObject({ year_start: null, year_start_effective: "2026-04-01" })
    })

    // C — has_start_date is true only when a start date is STORED; the shown default does not count.
    it("GET /classes: has_start_date is true for a class with a stored date and false for an older class, even though the older class shows a default start", async () => {
      const w = await world()
      const legacy = await classWith(w, null)
      const set = await classWith(w, "2026-04-15", daysAgo(3))
      const created = await request(app).post("/api/school/classes").set("Authorization", w.auth).send({ name: "Orchids" })
      const res = await request(app).get("/api/school/classes").set("Authorization", w.auth)
      expect(res.status).toBe(200)
      const rows = res.body.classes as Array<{ id: string; has_start_date: boolean; year_start: string | null; year_start_effective: string }>
      const legacyRow = rows.find(r => r.id === String(legacy._id))
      const setRow = rows.find(r => r.id === String(set._id))
      const createdRow = rows.find(r => r.id === (created.body.class.id as string))
      expect(legacyRow?.has_start_date).toBe(false)
      expect(legacyRow?.year_start_effective).toBe("2026-06-01")
      expect(setRow?.has_start_date).toBe(true)
      expect(createdRow?.has_start_date).toBe(true)
    })
  })

  // ── Rule 1 — the value must be a real YYYY-MM-DD date ──────────────────────────
  describe("PATCH — rule 1: the date must be a real YYYY-MM-DD string", () => {
    const BAD: Array<[string, unknown]> = [
      ["month without a leading zero", "2026-6-1"],
      ["a day that does not exist", "2026-02-31"],
      ["29 Feb of a non-leap year", "2025-02-29"],
      ["month 13", "2026-13-01"],
      ["day 00", "2026-06-00"],
      ["full-width digits", "２０２６-０６-０１"],
      ["a leading space", " 2026-06-01"],
      ["a trailing newline", "2026-06-01\n"],
      ["an empty string", ""],
      ["null while a date is stored", null],
      ["an array", ["2026-06-01"]],
      ["an object like a query operator", { $gt: "" }],
      ["a number", 20260601],
    ]

    it.each(BAD)("refuses %s with 400 invalid_date and saves nothing", async (_label, value) => {
      const w = await world()
      const setAt = daysAgo(1)
      const cls = await classWith(w, "2026-06-01", setAt)
      const res = await patch(w.auth, cls._id, { year_start: value, expected_current: "2026-06-01" })
      expectRefusal(res, 400, "invalid_date")
      await expectUnchanged(cls._id, "2026-06-01", setAt)
    })

    it("a bad date is refused before the stale-copy check, and a good name sent with it is not saved either", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(1))
      const before = await stored(cls._id)
      const res = await patch(w.auth, cls._id, { year_start: "2026-02-31", expected_current: "1999-01-01", name: "Renamed" })
      expectRefusal(res, 400, "invalid_date")
      expect((await stored(cls._id)).name).toBe(before.name)
    })
  })

  // ── Rule 2 — stale copy / two people at once ──────────────────────────────────
  describe("PATCH — rule 2: expected_current must match what is stored", () => {
    it("a stale expected_current answers 409 conflict with the date someone else saved, and saves nothing", async () => {
      const w = await world()
      const setAt = daysAgo(1)
      const cls = await classWith(w, "2026-06-01", setAt)
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-05-01" })
      expectRefusal(res, 409, "conflict")
      expect(res.body.error).toBe(conflictText("1 Jun 2026"))
      expect(res.body.year_start).toBe("2026-06-01")
      expect(res.body.year_start_effective).toBe("2026-06-01")
      await expectUnchanged(cls._id, "2026-06-01", setAt)
    })

    it("a missing expected_current on a class that has a stored date is a conflict", async () => {
      const w = await world()
      const setAt = daysAgo(1)
      const cls = await classWith(w, "2026-06-01", setAt)
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01" })
      expectRefusal(res, 409, "conflict")
      await expectUnchanged(cls._id, "2026-06-01", setAt)
    })

    it("on an older class with nothing stored, a missing and a null expected_current both mean 'not stored' and are accepted", async () => {
      const w = await world()
      const a = await classWith(w, null)
      const b = await classWith(w, null)
      const first = await patch(w.auth, a._id, { year_start: "2026-07-01" })
      expect(first.status).toBe(200)
      const second = await patch(w.auth, b._id, { year_start: "2026-07-01", expected_current: null })
      expect(second.status).toBe(200)
      expect((await stored(a._id)).year_start).toBe("2026-07-01")
      expect((await stored(b._id)).year_start).toBe("2026-07-01")
    })

    // R1 — the screen shows the default start for an older class, so the server must accept that date as "what I saw".
    it("on an older class, an expected_current that is neither 'nothing stored' nor the shown default start (here one day off the default) is a conflict and the answer says nothing is stored", async () => {
      const w = await world()
      const cls = await classWith(w, null)
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-05-31" })
      expectRefusal(res, 409, "conflict")
      expect(res.body.year_start).toBeNull()
      expect(res.body.year_start_effective).toBe("2026-06-01")
      expect((await stored(cls._id)).year_start ?? null).toBeNull()
      expect(await auditRows()).toHaveLength(0)
    })

    it("on an older class an expected_current equal to the shown default start (year_start_effective) is accepted (200) and the date is saved", async () => {
      const w = await world()
      const cls = await classWith(w, null)
      const shown = (await request(app).get("/api/school/classes").set("Authorization", w.auth)).body.classes
        .find((r: { id: string }) => r.id === String(cls._id)).year_start_effective as string
      expect(shown).toBe("2026-06-01")
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: shown })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, year_start: "2026-07-01", year_start_effective: "2026-07-01" })
      const row = await stored(cls._id)
      expect(row.year_start).toBe("2026-07-01")
      expect(new Date(row.year_start_set_at as Date).getTime()).toBe(NOW.getTime())
      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].before).toEqual({ year_start: null, effective: "2026-06-01" })
    })

    it("the default start accepted for an older class follows ACADEMIC_YEAR_START_MONTH (April: 2026-04-01 accepted, 2026-06-01 is a conflict)", async () => {
      vi.stubEnv("ACADEMIC_YEAR_START_MONTH", "4")
      const w = await world()
      const wrong = await classWith(w, null)
      const refused = await patch(w.auth, wrong._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expectRefusal(refused, 409, "conflict")
      expect(refused.body.year_start_effective).toBe("2026-04-01")
      const right = await classWith(w, null)
      const ok = await patch(w.auth, right._id, { year_start: "2026-07-01", expected_current: "2026-04-01" })
      expect(ok.status).toBe(200)
      expect((await stored(right._id)).year_start).toBe("2026-07-01")
    })

    it("on a class WITH a stored date only the stored value is accepted: the default start is a conflict when it differs from what is stored", async () => {
      const w = await world()
      const setAt = daysAgo(3)
      const cls = await classWith(w, "2026-04-15", setAt)
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })   // 2026-06-01 is the default, not the stored date
      expectRefusal(res, 409, "conflict")
      expect(res.body.year_start).toBe("2026-04-15")
      expect(res.body.year_start_effective).toBe("2026-04-15")
      expect(res.body.error).toBe(conflictText("15 Apr 2026"))
      await expectUnchanged(cls._id, "2026-04-15", setAt)
    })

    it("the stale-copy check comes before the 'same value' check", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(30))
      const res = await patch(w.auth, cls._id, { year_start: "2026-06-01", expected_current: "2026-05-01" })
      expectRefusal(res, 409, "conflict")
    })

    it("two identical requests at the same moment: one 200, one 409, one audit row, and the stored date is the winner's", async () => {
      const w = await world()
      const cls = await classWith(w, null)
      const body = { year_start: "2026-07-01", expected_current: null }
      const [a, b] = await Promise.all([patch(w.auth, cls._id, body), patch(w.auth, cls._id, body)])
      expect([a.status, b.status].sort()).toEqual([200, 409])
      const loser = a.status === 409 ? a : b
      expect(loser.body.code).toBe("conflict")
      expect((await stored(cls._id)).year_start).toBe("2026-07-01")
      expect(await auditRows()).toHaveLength(1)
    })

    it("two different requests at the same moment: exactly one wins, the other is told the winner's date", async () => {
      const w = await world()
      const cls = await classWith(w, null)
      const [a, b] = await Promise.all([
        patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: null }),
        patch(w.auth, cls._id, { year_start: "2026-08-01", expected_current: null }),
      ])
      expect([a.status, b.status].sort()).toEqual([200, 409])
      const winnerDate = a.status === 200 ? "2026-07-01" : "2026-08-01"
      const loser = a.status === 409 ? a : b
      expect(loser.body.code).toBe("conflict")
      expect(loser.body.year_start).toBe(winnerDate)
      expect((await stored(cls._id)).year_start).toBe(winnerDate)
      expect(await auditRows()).toHaveLength(1)
    })
  })

  // ── Rule 3 — same value ───────────────────────────────────────────────────────
  describe("PATCH — rule 3: saving the same date again changes nothing", () => {
    it("answers 200, writes no audit row and keeps the time it was set", async () => {
      const w = await world()
      const setAt = daysAgo(30)
      const cls = await classWith(w, "2026-06-01", setAt)
      const res = await patch(w.auth, cls._id, { year_start: "2026-06-01", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, year_start: "2026-06-01", year_start_effective: "2026-06-01" })
      await expectUnchanged(cls._id, "2026-06-01", setAt)
    })

    it("also with saved attendance and no reason", async () => {
      const w = await world()
      const setAt = daysAgo(30)
      const cls = await classWith(w, "2026-06-01", setAt)
      await sheetOn(w, cls, "2026-06-10")
      const res = await patch(w.auth, cls._id, { year_start: "2026-06-01", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      await expectUnchanged(cls._id, "2026-06-01", setAt)
    })

    it("a stored date older than the two-year floor can be saved again unchanged", async () => {
      const w = await world()
      const setAt = daysAgo(400)
      const cls = await classWith(w, "2023-01-01", setAt)
      const res = await patch(w.auth, cls._id, { year_start: "2023-01-01", expected_current: "2023-01-01" })
      expect(res.status).toBe(200)
      await expectUnchanged(cls._id, "2023-01-01", setAt)
    })

    it("the preview of the same date shows nothing leaving and nothing entering", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(30))
      await sheetOn(w, cls, "2026-06-10")
      const res = await preview(w.auth, cls._id, "2026-06-01")
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ current: "2026-06-01", date: "2026-06-01", sheets_leaving: 0, sheets_entering: 0 })
    })
  })

  // ── Rule 4 — limits ───────────────────────────────────────────────────────────
  describe("PATCH — rule 4: not older than two years, not more than 60 days ahead", () => {
    it("accepts the very first allowed day (2024-10-12) and refuses the day before it with the exact message", async () => {
      const w = await world()
      const ok = await classWith(w, "2026-06-01", daysAgo(100))
      const okRes = await patch(w.auth, ok._id, { year_start: "2024-10-12", expected_current: "2026-06-01" })
      expect(okRes.status).toBe(200)
      expect((await stored(ok._id)).year_start).toBe("2024-10-12")

      const early = await classWith(w, "2026-06-01", daysAgo(100))
      const res = await patch(w.auth, early._id, { year_start: "2024-10-11", expected_current: "2026-06-01" })
      expectRefusal(res, 400, "too_early")
      expect(res.body.error).toBe("Choose a date after 12 Oct 2024.")
      expect((await stored(early._id)).year_start).toBe("2026-06-01")
    })

    it("accepts the last allowed day (2026-12-11) and refuses the day after it with the exact message", async () => {
      const w = await world()
      const ok = await classWith(w, "2026-06-01", daysAgo(100))
      const okRes = await patch(w.auth, ok._id, { year_start: "2026-12-11", expected_current: "2026-06-01" })
      expect(okRes.status).toBe(200)
      expect((await stored(ok._id)).year_start).toBe("2026-12-11")

      const far = await classWith(w, "2026-06-01", daysAgo(100))
      const res = await patch(w.auth, far._id, { year_start: "2026-12-12", expected_current: "2026-06-01" })
      expectRefusal(res, 400, "too_far")
      expect(res.body.error).toBe("Choose a date on or before 11 Dec 2026.")
      expect((await stored(far._id)).year_start).toBe("2026-06-01")
    })

    it("the limits also apply to a class that has saved attendance", async () => {
      const w = await world()
      const a = await classWith(w, "2026-06-01", daysAgo(2))
      await sheetOn(w, a, "2026-06-10")
      expectRefusal(await patch(w.auth, a._id, { year_start: "2024-10-11", expected_current: "2026-06-01", reason: REASON }), 400, "too_early")

      const b = await classWith(w, "2026-11-01", daysAgo(100))
      await sheetOn(w, b, "2026-05-01")
      expectRefusal(await patch(w.auth, b._id, { year_start: "2026-12-12", expected_current: "2026-11-01" }), 400, "too_far")
      expect(await auditRows()).toHaveLength(0)
    })
  })

  // ── Rule 5 — a class with no attendance sheet ─────────────────────────────────
  describe("PATCH — rule 5: a class with no attendance sheet accepts any date in range without a reason", () => {
    it.each(["2024-10-12", "2025-09-01", "2026-10-12", "2026-11-15", "2026-12-11"])("accepts %s even though it was set long ago", async (date) => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(100))
      const res = await patch(w.auth, cls._id, { year_start: date, expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      const row = await stored(cls._id)
      expect(row.year_start).toBe(date)
      expect(new Date(row.year_start_set_at as Date).getTime()).toBe(NOW.getTime())
      expect(await auditRows()).toHaveLength(1)
    })

    it("an attendance sheet of ANOTHER class changes nothing for this class (nothing leaving, nothing entering)", async () => {
      const w = await world()
      const mine = await classWith(w, "2026-06-01", daysAgo(100))
      const other = await classWith(w, "2026-06-01", daysAgo(100))
      await sheetOn(w, other, "2026-06-10")
      const res = await patch(w.auth, mine._id, { year_start: "2026-11-15", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ sheets_leaving: 0, sheets_entering: 0 })
    })
  })

  // ── A — a class WITH saved sheets: no window, no first-sheet rule, no future refusal ─────────
  describe("PATCH — any number of saved sheets: any date in range is accepted, any number of times, with no reason", () => {
    const WHEN: Array<[string, number]> = [["8 days", 8], ["30 days", 30], ["400 days", 400]]

    it.each(WHEN)("a class with saved sheets whose date was set %s ago accepts a new date, saves it, moves the set time to now and writes one audit row", async (_label, setDaysAgo) => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(setDaysAgo))
      await sheetOn(w, cls, "2026-06-10")
      await sheetOn(w, cls, "2026-06-20")
      const res = await patch(w.auth, cls._id, { year_start: "2026-06-05", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, year_start: "2026-06-05", year_start_effective: "2026-06-05" })
      const row = await stored(cls._id)
      expect(row.year_start).toBe("2026-06-05")
      expect(new Date(row.year_start_set_at as Date).getTime()).toBe(NOW.getTime())
      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].after).toMatchObject({ year_start: "2026-06-05", reason: null })
    })

    it("a date AFTER the class's first saved sheet is accepted (the old 'not after the first sheet' rule is gone)", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(2))
      await sheetOn(w, cls, "2026-06-10")
      const res = await patch(w.auth, cls._id, { year_start: "2026-06-20", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect((await stored(cls._id)).year_start).toBe("2026-06-20")
      expect(await auditRows()).toHaveLength(1)
    })

    it.each([[TODAY], ["2026-10-13"], ["2026-11-20"], ["2026-12-11"]])("a date today or in the future (%s, up to 60 days ahead) is accepted on a class with sheets", async (date) => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(2))
      await sheetOn(w, cls, "2026-06-10")
      const res = await patch(w.auth, cls._id, { year_start: date, expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect((await stored(cls._id)).year_start).toBe(date)
      expect(await auditRows()).toHaveLength(1)
    })

    it("a future stored start WITH a saved sheet moves to an earlier day, with no reason (this was refused before)", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-11-01", daysAgo(100))
      await sheetOn(w, cls, TODAY)
      const res = await patch(w.auth, cls._id, { year_start: "2026-10-11", expected_current: "2026-11-01" })
      expect(res.status).toBe(200)
      const row = await stored(cls._id)
      expect(row.year_start).toBe("2026-10-11")
      expect(new Date(row.year_start_set_at as Date).getTime()).toBe(NOW.getTime())
    })

    it("the same class can be changed again and again: three changes in a row are all accepted, each moves the set time to now and writes its own audit row", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(1))
      await sheetOn(w, cls, "2026-06-10")
      let previous = "2026-06-01"
      for (const date of ["2026-06-05", "2026-06-20", "2026-06-02"]) {
        const res = await patch(w.auth, cls._id, { year_start: date, expected_current: previous })
        expect(res.status).toBe(200)
        previous = date
      }
      const row = await stored(cls._id)
      expect(row.year_start).toBe("2026-06-02")
      expect(new Date(row.year_start_set_at as Date).getTime()).toBe(NOW.getTime())
      expect(await auditRows()).toHaveLength(3)
    })

    it("a class whose date was set long ago, moved after time has passed (set 20 days ago, today is later): still accepted", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(20))
      await sheetOn(w, cls, "2026-06-10")
      vi.setSystemTime(new Date(NOW.getTime() + 40 * 86_400_000))   // the date was set 60 days ago
      const res = await patch(bearer(w.admin._id, "admin"), cls._id, { year_start: "2026-06-15", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect((await stored(cls._id)).year_start).toBe("2026-06-15")
    })
  })

  // ── Per-admin limit: 10 successful changes per hour ───────────────────────────
  describe("PATCH — at most 10 date changes per hour per admin", () => {
    const TEN = Array.from({ length: 10 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`)

    it("10 changes in a row all succeed and write exactly one audit row each; the 11th is 429 rate_limited and saves nothing", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(5))
      await sheetOn(w, cls, "2026-06-10")
      let previous = "2026-06-01"
      for (const date of TEN) {
        const res = await patch(w.auth, cls._id, { year_start: date, expected_current: previous })
        expect(res.status).toBe(200)
        previous = date
      }
      const rows = await auditRows()
      expect(rows).toHaveLength(10)
      expect(rows.map(r => (r.after as { year_start: string }).year_start).sort()).toEqual(TEN)

      const eleventh = await patch(w.auth, cls._id, { year_start: "2026-07-11", expected_current: "2026-07-10" })
      expectRefusal(eleventh, 429, "rate_limited")
      expect(eleventh.body.error).toBe(LIMIT_TEXT)
      expect((await stored(cls._id)).year_start).toBe("2026-07-10")
      expect(await auditRows()).toHaveLength(10)
    })

    it("a different admin is not limited by the first admin's changes", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(5))
      let previous = "2026-06-01"
      for (const date of TEN) {
        expect((await patch(w.auth, cls._id, { year_start: date, expected_current: previous })).status).toBe(200)
        previous = date
      }
      expect((await patch(w.auth, cls._id, { year_start: "2026-07-11", expected_current: previous })).status).toBe(429)

      const second = await createUser(w.school._id, "admin")
      const other = await classWith(w, "2026-06-01", daysAgo(5))
      const res = await patch(bearer(second._id, "admin"), other._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect((await stored(other._id)).year_start).toBe("2026-07-01")
    })

    it("refused requests do not use up the budget: 12 refusals, then 10 changes still succeed", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(5))
      for (let i = 0; i < 12; i++) {
        expectRefusal(await patch(w.auth, cls._id, { year_start: "2026-02-31", expected_current: "2026-06-01" }), 400, "invalid_date")
      }
      let previous = "2026-06-01"
      for (const date of TEN) {
        const res = await patch(w.auth, cls._id, { year_start: date, expected_current: previous })
        expect(res.status).toBe(200)
        previous = date
      }
      expect(await auditRows()).toHaveLength(10)
    })

    it("name-and-subjects-only changes are not counted against the limit", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(5))
      for (let i = 0; i < 12; i++) {
        expect((await patch(w.auth, cls._id, { name: `Batch ${i}` })).status).toBe(200)
      }
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
    })
  })

  // ── What uses the budget: a hit is counted on arrival; only server refusals and "unchanged" are given back ─────
  describe("PATCH — the hourly budget: a hit is kept when the client hangs up, and given back only for a server refusal or an unchanged date", () => {
    const TEN = Array.from({ length: 10 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`)

    // R1 — the old limiter gave the hit back whenever the client's connection closed before the answer was written.
    it("a request whose client hangs up but whose change COMMITS stays counted: after 10 such changes the 11th normal change is 429 rate_limited and saves nothing", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(5))
      await sheetOn(w, cls, "2026-06-10")
      await withServer(async (port) => {
        let previous = "2026-06-01"
        for (let i = 0; i < TEN.length; i++) {
          await sendAndAbort(port, "PATCH", `/api/school/classes/${cls._id}`, w.auth, { year_start: TEN[i], expected_current: previous })
          // The handler keeps running after the client has gone: wait for its committed audit row.
          await waitUntil(async () => (await auditRows()).length === i + 1, `the audit row of aborted change ${i + 1}`)
          previous = TEN[i]
        }
      })
      expect((await stored(cls._id)).year_start).toBe(TEN[9])
      const rows = await auditRows()
      expect(rows).toHaveLength(10)
      expect(rows.map(r => (r.after as { year_start: string }).year_start).sort()).toEqual(TEN)

      const eleventh = await patch(w.auth, cls._id, { year_start: "2026-07-11", expected_current: TEN[9] })
      expectRefusal(eleventh, 429, "rate_limited")
      expect(eleventh.body.error).toBe(LIMIT_TEXT)
      expect((await stored(cls._id)).year_start).toBe(TEN[9])
      expect(await auditRows()).toHaveLength(10)
    })

    // R2 — saving the same date again changes nothing, so it does not use the budget.
    it("saving the SAME date again (200, nothing changed) does not use the budget: 12 of them, then a real change still succeeds", async () => {
      const w = await world()
      const setAt = daysAgo(5)
      const cls = await classWith(w, "2026-06-01", setAt)
      for (let i = 0; i < 12; i++) {
        const res = await patch(w.auth, cls._id, { year_start: "2026-06-01", expected_current: "2026-06-01" })
        expect(res.status).toBe(200)
      }
      await expectUnchanged(cls._id, "2026-06-01", setAt)
      const real = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expect(real.status).toBe(200)
      expect((await stored(cls._id)).year_start).toBe("2026-07-01")
      expect(await auditRows()).toHaveLength(1)
    })

    it("409 conflicts and 404s (another school's class) are given back too: 6 of each, then 10 real changes still succeed and the 11th is refused", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(5))
      const other = await createSchool()
      const foreign = await createClass(other._id, undefined, { section: nextSection(), year_start: null })
      for (let i = 0; i < 6; i++) {
        expectRefusal(await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-05-01" }), 409, "conflict")
        expect((await patch(w.auth, foreign._id, { year_start: "2026-07-01", expected_current: null })).status).toBe(404)
      }
      let previous = "2026-06-01"
      for (const date of TEN) {
        expect((await patch(w.auth, cls._id, { year_start: date, expected_current: previous })).status).toBe(200)
        previous = date
      }
      expect(await auditRows()).toHaveLength(10)
      expectRefusal(await patch(w.auth, cls._id, { year_start: "2026-07-11", expected_current: previous }), 429, "rate_limited")
    })
  })

  // ── The reason is optional, cleaned and at most 100 characters ────────────────
  describe("PATCH — the reason is optional, cleaned, and at most 100 characters", () => {
    async function fresh() {
      const w = await world()
      const setAt = daysAgo(5)
      const cls = await classWith(w, "2026-06-01", setAt)
      return { w, cls, setAt }
    }
    const go = (f: Awaited<ReturnType<typeof fresh>>, extra: Record<string, unknown>) =>
      patch(f.w.auth, f.cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01", ...extra })

    it("no reason at all is accepted and the audit row stores null", async () => {
      const f = await fresh()
      const res = await go(f, {})
      expect(res.status).toBe(200)
      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].after).toMatchObject({ year_start: "2026-07-01", reason: null })
    })

    it("an empty or blank reason (spaces, a newline, zero-width characters only) is stored as null", async () => {
      for (const reason of ["", "   ", "\n\t", "​​"]) {
        const f = await fresh()
        const res = await go(f, { reason })
        expect(res.status).toBe(200)
      }
      const rows = await auditRows()
      expect(rows).toHaveLength(4)
      for (const row of rows) expect((row.after as { reason: unknown }).reason).toBeNull()
    })

    it("a reason is stored CLEANED: zero-width characters and a line break removed, tabs and repeated spaces collapsed", async () => {
      const f = await fresh()
      const res = await go(f, { reason: "  Fixed​\nby admin \t today  " })
      expect(res.status).toBe(200)
      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].after).toMatchObject({ year_start: "2026-07-01", reason: "Fixed by admin today" })
      expect(JSON.stringify(rows[0].after)).not.toMatch(/\\n|\\t|\\u200b/)
    })

    it("zero-width characters inside a word are removed", async () => {
      const f = await fresh()
      const res = await go(f, { reason: `ab${ZWSP}cd${ZWSP}ef` })
      expect(res.status).toBe(200)
      expect((await auditRows())[0].after).toMatchObject({ reason: "abcdef" })
    })

    it("there is no minimum number of letters: a short reason, a reason of dashes and a reason of digits are all accepted as written", async () => {
      for (const reason of ["x", "----------", "1111111111"]) {
        const f = await fresh()
        const res = await go(f, { reason })
        expect(res.status).toBe(200)
      }
      const reasons = (await auditRows()).map(r => (r.after as { reason: string }).reason).sort()
      expect(reasons).toEqual(["----------", "1111111111", "x"])
    })

    it("a Hindi reason is stored as written", async () => {
      const f = await fresh()
      const reason = "गलत तारीख डाली थी"
      const res = await go(f, { reason })
      expect(res.status).toBe(200)
      expect((await auditRows())[0].after).toMatchObject({ reason })
    })

    it("a 101-character reason is refused with 400 reason_too_long and the exact message, and nothing is saved", async () => {
      const f = await fresh()
      const res = await go(f, { reason: "a".repeat(101) })
      expectRefusal(res, 400, "reason_too_long")
      expect(res.body.error).toBe(TOO_LONG_TEXT)
      await expectUnchanged(f.cls._id, "2026-06-01", f.setAt)
    })

    it("exactly 100 characters are accepted and stored whole", async () => {
      const f = await fresh()
      const res = await go(f, { reason: "a".repeat(100) })
      expect(res.status).toBe(200)
      expect((await auditRows())[0].after).toMatchObject({ reason: "a".repeat(100) })
    })

    it("the limit counts the CLEANED text: 110 raw characters with 10 zero-width ones is 100 and is accepted; 101 real ones plus a zero-width one is refused", async () => {
      const ok = await fresh()
      const raw = "a".repeat(50) + "​".repeat(10) + "b".repeat(50)
      expect(raw.length).toBe(110)
      expect((await go(ok, { reason: raw })).status).toBe(200)
      expect((await auditRows())[0].after).toMatchObject({ reason: "a".repeat(50) + "b".repeat(50) })

      const refused = await fresh()
      const res = await go(refused, { reason: "a".repeat(101) + "​" })
      expectRefusal(res, 400, "reason_too_long")
      await expectClassUnchanged(refused.cls._id, "2026-06-01", refused.setAt)
    })

    // R3 — a raw text longer than 400 characters is refused before any cleaning (so a huge text is never normalised).
    it("a 5,000-character reason is refused with 400 reason_too_long and the exact message, and nothing is saved", async () => {
      const f = await fresh()
      const res = await go(f, { reason: "a".repeat(5000) })
      expectRefusal(res, 400, "reason_too_long")
      expect(res.body.error).toBe(TOO_LONG_TEXT)
      await expectUnchanged(f.cls._id, "2026-06-01", f.setAt)
    })

    it("the 400-character raw limit is checked BEFORE cleaning: 401 raw characters that would clean down to 100 are refused, exactly 400 are accepted", async () => {
      const refused = await fresh()
      const padded = "a".repeat(100) + ZWSP.repeat(301)
      expect(padded.length).toBe(401)
      const res = await go(refused, { reason: padded })
      expectRefusal(res, 400, "reason_too_long")
      expect(res.body.error).toBe(TOO_LONG_TEXT)
      await expectUnchanged(refused.cls._id, "2026-06-01", refused.setAt)

      const accepted = await fresh()
      const edge = "a".repeat(100) + ZWSP.repeat(300)
      expect(edge.length).toBe(400)
      expect((await go(accepted, { reason: edge })).status).toBe(200)
      expect((await auditRows())[0].after).toMatchObject({ reason: "a".repeat(100) })
    })

    it("a short text that grows under Unicode normalisation (120 times U+FDFD) is refused for length", async () => {
      const f = await fresh()
      const raw = ARABIC_LIGATURE.repeat(120)
      expect(raw.length).toBe(120)
      const res = await go(f, { reason: raw })
      expectRefusal(res, 400, "reason_too_long")
      expect(res.body.error).toBe(TOO_LONG_TEXT)
      await expectUnchanged(f.cls._id, "2026-06-01", f.setAt)
    })

    // R3 — U+200C / U+200D are real letters-joiners in Persian, Malayalam and other scripts, so they are kept.
    it("U+200C (zero-width non-joiner) and U+200D (zero-width joiner) are KEPT in the stored reason; U+200B, U+2060 and U+FEFF are still removed", async () => {
      const kept = await fresh()
      const persian = "می" + ZWNJ + "خواهم"   // a Persian word with a non-joiner inside
      const malayalam = "ക്" + ZWJ + "ഷ"                        // a Malayalam conjunct written with a joiner
      expect((await go(kept, { reason: `${persian} ${malayalam}` })).status).toBe(200)
      const first = (await auditRows())[0].after as { reason: string }
      expect(first.reason).toBe(`${persian} ${malayalam}`)
      expect(first.reason).toContain(ZWNJ)
      expect(first.reason).toContain(ZWJ)

      const mixed = await fresh()
      expect((await go(mixed, { reason: `x${ZWSP}${ZWNJ}y${ZWJ}z${WORD_JOINER}w${BOM}v` })).status).toBe(200)
      const rows = await auditRows()
      const second = rows.find(r => r.resource_id === String(mixed.cls._id))?.after as { reason: string }
      expect(second.reason).toBe(`x${ZWNJ}y${ZWJ}zwv`)
    })

    it("a too-long reason is refused even for a class with saved sheets, and a good name sent with it is not saved either", async () => {
      const f = await fresh()
      await sheetOn(f.w, f.cls, "2026-06-10")
      const before = await stored(f.cls._id)
      const res = await go(f, { reason: "a".repeat(101), name: "Renamed" })
      expectRefusal(res, 400, "reason_too_long")
      expect((await stored(f.cls._id)).name).toBe(before.name)
      await expectUnchanged(f.cls._id, "2026-06-01", f.setAt)
    })
  })

  // ── sheets_leaving / sheets_entering ──────────────────────────────────────────
  describe("PATCH — the answer and the audit row say how many saved sheets leave or enter the school year", () => {
    it("moving the start LATER: sheets dated from the old start up to (not including) the new start are leaving; they are counted as sheets, not days", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(10))
      await sheetOn(w, cls, "2026-05-15")        // before the old start: not counted
      await sheetOn(w, cls, "2026-06-05", 1)     // in the gap
      await sheetOn(w, cls, "2026-06-05", 2)     // in the gap (same day, another period = another sheet)
      await sheetOn(w, cls, "2026-06-20")        // in the gap
      await sheetOn(w, cls, "2026-07-01")        // on the new start: stays in
      await sheetOn(w, cls, "2026-07-10")        // after: stays in
      const other = await classWith(w, "2026-06-01", daysAgo(10))
      await sheetOn(w, other, "2026-06-10")      // another class: not counted
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01", reason: REASON })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, year_start: "2026-07-01", sheets_leaving: 3, sheets_entering: 0 })
      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].action).toBe("class.year_start_changed")
      expect(rows[0].before).toEqual({ year_start: "2026-06-01", effective: "2026-06-01" })
      expect(rows[0].after).toEqual({ year_start: "2026-07-01", reason: REASON, sheets_leaving: 3, sheets_entering: 0 })
    })

    it("moving the start EARLIER: sheets dated from the new start up to (not including) the old start are entering", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(10))
      await sheetOn(w, cls, "2026-04-20")        // before the new start: not counted
      await sheetOn(w, cls, "2026-05-01")        // on the new start: entering
      await sheetOn(w, cls, "2026-05-20")        // in the gap: entering
      await sheetOn(w, cls, "2026-06-01")        // on the old start: already in
      await sheetOn(w, cls, "2026-06-15")        // already in
      const res = await patch(w.auth, cls._id, { year_start: "2026-05-01", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ year_start: "2026-05-01", sheets_leaving: 0, sheets_entering: 2 })
      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].after).toEqual({ year_start: "2026-05-01", reason: null, sheets_leaving: 0, sheets_entering: 2 })
    })

    it("a move over a stretch with no saved sheets is 0 and 0, even when the class has sheets elsewhere", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(10))
      await sheetOn(w, cls, "2026-05-10")
      await sheetOn(w, cls, "2026-08-10")
      const later = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expect(later.body).toMatchObject({ sheets_leaving: 0, sheets_entering: 0 })
      const earlier = await patch(w.auth, cls._id, { year_start: "2026-06-15", expected_current: "2026-07-01" })
      expect(earlier.body).toMatchObject({ sheets_leaving: 0, sheets_entering: 0 })
      const rows = await auditRows()
      expect(rows).toHaveLength(2)
      for (const row of rows) expect(row.after).toMatchObject({ sheets_leaving: 0, sheets_entering: 0 })
    })

    it("an older class with no stored date counts from the default effective start (1 June), later and earlier", async () => {
      const w = await world()
      const later = await classWith(w, null)
      await sheetOn(w, later, "2026-05-20")      // before 1 Jun: not counted
      await sheetOn(w, later, "2026-06-10")      // in the gap
      await sheetOn(w, later, "2026-06-20")      // in the gap
      await sheetOn(w, later, "2026-07-01")      // on the new start
      const res = await patch(w.auth, later._id, { year_start: "2026-07-01", expected_current: null })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ sheets_leaving: 2, sheets_entering: 0 })
      const first = await auditRows()
      expect(first).toHaveLength(1)
      expect(first[0].before).toEqual({ year_start: null, effective: "2026-06-01" })
      expect(first[0].after).toEqual({ year_start: "2026-07-01", reason: null, sheets_leaving: 2, sheets_entering: 0 })

      const earlier = await classWith(w, null)
      await sheetOn(w, earlier, "2026-04-20")    // before the new start
      await sheetOn(w, earlier, "2026-05-15")    // in the gap
      await sheetOn(w, earlier, "2026-06-01")    // on the default start: already in
      const res2 = await patch(w.auth, earlier._id, { year_start: "2026-05-01", expected_current: "2026-06-01" })
      expect(res2.status).toBe(200)
      expect(res2.body).toMatchObject({ sheets_leaving: 0, sheets_entering: 1 })
    })

    it("the default effective start used for an older class follows ACADEMIC_YEAR_START_MONTH", async () => {
      vi.stubEnv("ACADEMIC_YEAR_START_MONTH", "4")
      const w = await world()
      const cls = await classWith(w, null)
      await sheetOn(w, cls, "2026-04-10")
      await sheetOn(w, cls, "2026-05-10")
      const res = await patch(w.auth, cls._id, { year_start: "2026-05-01", expected_current: null })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ sheets_leaving: 1, sheets_entering: 0 })
    })

    // R6 — attendance lookups use the class id only
    it("a legacy sheet saved WITHOUT a school id still counts", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(10))
      await legacySheetOn(w, cls, "2026-06-10")
      await sheetOn(w, cls, "2026-06-12")
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ sheets_leaving: 2, sheets_entering: 0 })
      expect((await auditRows())[0].after).toMatchObject({ sheets_leaving: 2, sheets_entering: 0 })
      const back = await preview(w.auth, cls._id, "2026-06-01")
      expect(back.body).toMatchObject({ sheets_leaving: 0, sheets_entering: 2 })
    })
  })

  // ── B — preview ───────────────────────────────────────────────────────────────
  describe("GET /classes/:id/year-start-preview", () => {
    it("returns the current effective start, the date, and the numbers that PATCH then reports; it writes nothing", async () => {
      const w = await world()
      const setAt = daysAgo(10)
      const cls = await classWith(w, "2026-06-01", setAt)
      await sheetOn(w, cls, "2026-05-20")
      await sheetOn(w, cls, "2026-06-05")
      await sheetOn(w, cls, "2026-06-20")

      const later = await preview(w.auth, cls._id, "2026-07-01")
      expect(later.status).toBe(200)
      expect(later.body).toEqual({ current: "2026-06-01", date: "2026-07-01", sheets_leaving: 2, sheets_entering: 0 })
      const earlier = await preview(w.auth, cls._id, "2026-05-01")
      expect(earlier.status).toBe(200)
      expect(earlier.body).toEqual({ current: "2026-06-01", date: "2026-05-01", sheets_leaving: 0, sheets_entering: 1 })
      await expectUnchanged(cls._id, "2026-06-01", setAt)

      const saved = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expect(saved.status).toBe(200)
      expect(saved.body).toMatchObject({ sheets_leaving: later.body.sheets_leaving, sheets_entering: later.body.sheets_entering })
    })

    it("for an older class the current start is the default effective start, and it needs no expected_current", async () => {
      const w = await world()
      const cls = await classWith(w, null)
      await sheetOn(w, cls, "2026-06-10")
      const res = await preview(w.auth, cls._id, "2026-07-01")
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ current: "2026-06-01", date: "2026-07-01", sheets_leaving: 1, sheets_entering: 0 })
      await expectUnchanged(cls._id, null, null)
    })

    it("answers 403 for a teacher, 404 for another school's class, 400 for a malformed id, and shows no numbers in those answers", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(10))
      await sheetOn(w, cls, "2026-06-10")
      const teacher = await preview(w.teacherAuth, cls._id, "2026-07-01")
      expect(teacher.status).toBe(403)
      expect(teacher.body.sheets_leaving).toBeUndefined()

      const other = await createSchool()
      const otherClass = await createClass(other._id, undefined, { section: nextSection() })
      const notFound = await preview(w.auth, otherClass._id, "2026-07-01")
      expect(notFound.status).toBe(404)
      expect(notFound.body.sheets_leaving).toBeUndefined()

      expect((await preview(w.auth, "not-an-id", "2026-07-01")).status).toBe(400)
    })

    it("refuses a missing or invalid date (400 invalid_date) and an out-of-range date (too_early / too_far) with the same words as PATCH", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(10))
      for (const bad of [undefined, "", "2026-02-31", "2026-6-1", "not-a-date"]) {
        expectRefusal(await preview(w.auth, cls._id, bad), 400, "invalid_date")
      }
      const early = await preview(w.auth, cls._id, "2024-10-11")
      expectRefusal(early, 400, "too_early")
      expect(early.body.error).toBe("Choose a date after 12 Oct 2024.")
      const far = await preview(w.auth, cls._id, "2026-12-12")
      expectRefusal(far, 400, "too_far")
      expect(far.body.error).toBe("Choose a date on or before 11 Dec 2026.")
      expect((await preview(w.auth, cls._id, "2024-10-12")).status).toBe(200)
      expect((await preview(w.auth, cls._id, "2026-12-11")).status).toBe(200)
    })

    it("writes nothing at all, however often it is called (no class change, no audit row)", async () => {
      const w = await world()
      const setAt = daysAgo(10)
      const cls = await classWith(w, "2026-06-01", setAt)
      for (let i = 0; i < 5; i++) await preview(w.auth, cls._id, "2026-07-01")
      await expectUnchanged(cls._id, "2026-06-01", setAt)
    })
  })

  // ── Rule 7 — the audit row ────────────────────────────────────────────────────
  describe("PATCH — rule 7: a real change saves the date, the time, and exactly one audit row", () => {
    it("writes the exact audit row (ids, role, before, after with the reason and the sheet numbers, the server-seen address, no names)", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(100), { name: "Orchids Batch" })
      const reason = "Board register shows April start"
      const res = await request(app).patch(`/api/school/classes/${cls._id}`).set("Authorization", w.auth).set("X-Forwarded-For", "203.0.113.9")
        .send({ year_start: "2026-04-01", expected_current: "2026-06-01", reason })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, year_start: "2026-04-01", year_start_effective: "2026-04-01", sheets_leaving: 0, sheets_entering: 0 })
      expect(Object.keys(res.body).sort()).toEqual(["name", "sheets_entering", "sheets_leaving", "subjects", "success", "year_start", "year_start_effective"])

      const now = await stored(cls._id)
      expect(now.year_start).toBe("2026-04-01")
      expect(new Date(now.year_start_set_at as Date).getTime()).toBe(NOW.getTime())

      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      const row = rows[0]
      expect(row.resource_type).toBe("Class")
      expect(row.resource_id).toBe(String(cls._id))
      expect(String(row.school_id)).toBe(String(w.school._id))
      expect(String(row.actor_id)).toBe(String(w.admin._id))
      expect(row.actor_role).toBe("admin")
      expect(row.before).toEqual({ year_start: "2026-06-01", effective: "2026-06-01" })
      expect(row.after).toEqual({ year_start: "2026-04-01", reason, sheets_leaving: 0, sheets_entering: 0 })
      expect(typeof row.ip).toBe("string")
      expect(row.ip.length).toBeGreaterThan(0)
      expect(row.ip).not.toBe("203.0.113.9")   // taken from req.ip, not from a header the sender wrote
      const text = JSON.stringify([row.before, row.after])
      expect(text).not.toContain(w.admin.name)
      expect(text).not.toContain("Orchids Batch")
    })

    // R5 — "before" carries the previous stored value and the effective start that the sheet counts were made from.
    it("the audit row's before has the effective start used for the counts: the stored date, or for an older class the default 1 June (1 April with ACADEMIC_YEAR_START_MONTH=4)", async () => {
      const w = await world()
      const older = await classWith(w, null)
      await sheetOn(w, older, "2026-06-10")
      expect((await patch(w.auth, older._id, { year_start: "2026-07-01", expected_current: null })).status).toBe(200)

      const dated = await classWith(w, "2026-04-15", daysAgo(3))
      expect((await patch(w.auth, dated._id, { year_start: "2026-05-01", expected_current: "2026-04-15" })).status).toBe(200)

      vi.stubEnv("ACADEMIC_YEAR_START_MONTH", "4")
      const olderApril = await classWith(w, null)
      expect((await patch(w.auth, olderApril._id, { year_start: "2026-07-01", expected_current: null })).status).toBe(200)

      const rows = await auditRows()
      expect(rows).toHaveLength(3)
      const beforeOf = (id: mongoose.Types.ObjectId) => rows.find(r => r.resource_id === String(id))?.before
      expect(beforeOf(older._id)).toEqual({ year_start: null, effective: "2026-06-01" })
      expect(beforeOf(dated._id)).toEqual({ year_start: "2026-04-15", effective: "2026-04-15" })
      expect(beforeOf(olderApril._id)).toEqual({ year_start: null, effective: "2026-04-01" })
    })

    it("a refused change writes no audit row", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(100))
      await patch(w.auth, cls._id, { year_start: "2024-10-11", expected_current: "2026-06-01" })
      expect(await auditRows()).toHaveLength(0)
    })
  })

  // ── Rule 8 — audit failure refuses the whole change ───────────────────────────
  describe("PATCH — rule 8: if the audit row cannot be written, nothing is changed", () => {
    it("answers 500, leaves the stored date and time as they were, and the same request works once the audit store is back", async () => {
      const w = await world()
      const setAt = daysAgo(100)
      const cls = await classWith(w, "2026-06-01", setAt)
      vi.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("boom"))
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expect(res.status).toBe(500)
      expect(res.body.error).toBe("Could not save. Please try again.")
      const after = await stored(cls._id)
      expect(after.year_start).toBe("2026-06-01")
      expect(new Date(after.year_start_set_at as Date).getTime()).toBe(setAt.getTime())

      const again = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })
      expect(again.status).toBe(200)
      expect((await stored(cls._id)).year_start).toBe("2026-07-01")
      expect(await auditRows()).toHaveLength(1)
    })
  })

  // ── Rule 9 — name/subjects keep working ───────────────────────────────────────
  describe("PATCH — rule 9: name and subjects still work, with or without a date", () => {
    it("a name-and-subjects-only change succeeds, leaves the start untouched and writes no year-start audit row", async () => {
      const w = await world()
      const legacy = await classWith(w, null)
      const res = await patch(w.auth, legacy._id, { name: "Orchids", subjects: ["Math", "Hindi"] })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ success: true, name: "Orchids", subjects: ["Math", "Hindi"], year_start: null, year_start_effective: "2026-06-01" })
      const row = await stored(legacy._id)
      expect(row.year_start ?? null).toBeNull()
      expect(row.year_start_set_at ?? null).toBeNull()
      expect(await auditRows()).toHaveLength(0)

      const setAt = daysAgo(3)
      const withStart = await classWith(w, "2026-06-01", setAt)
      const res2 = await patch(w.auth, withStart._id, { name: "Lilies" })
      expect(res2.status).toBe(200)
      expect(res2.body).toMatchObject({ year_start: "2026-06-01", year_start_effective: "2026-06-01" })
      await expectUnchanged(withStart._id, "2026-06-01", setAt)
    })

    it("a name and a date sent together are saved together", async () => {
      const w = await world()
      const cls = await classWith(w, null)
      const res = await patch(w.auth, cls._id, { name: "Roses", year_start: "2026-07-01", expected_current: null })
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ name: "Roses", year_start: "2026-07-01" })
      const row = await stored(cls._id)
      expect(row.name).toBe("Roses")
      expect(row.year_start).toBe("2026-07-01")
    })
  })

  // ── who may change it ─────────────────────────────────────────────────────────
  describe("PATCH — who may change a start date", () => {
    it("refuses a teacher (403), a malformed id (400) and another school's class (404), and saves nothing", async () => {
      const w = await world()
      const setAt = daysAgo(1)
      const cls = await classWith(w, "2026-06-01", setAt)
      const body = { year_start: "2026-07-01", expected_current: "2026-06-01" }

      expect((await patch(w.teacherAuth, cls._id, body)).status).toBe(403)

      const badId = await patch(w.auth, "not-an-id", body)
      expect(badId.status).toBe(400)

      const other = await createSchool()
      const otherClass = await createClass(other._id, undefined, { section: nextSection(), year_start: null })
      expect((await patch(w.auth, otherClass._id, body)).status).toBe(404)
      expect((await stored(otherClass._id)).year_start ?? null).toBeNull()

      await expectUnchanged(cls._id, "2026-06-01", setAt)
    })
  })
})

// ── E — class history in the student detail ─────────────────────────────────────
describe("GET /api/school/student-detail/:id — class_history", () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await clearDb()
  })

  const KEYS = ["class_deleted", "class_label", "end_reason", "from_date", "is_current", "to_date"]

  interface HistoryLine {
    class_label: string | null
    class_deleted: boolean
    from_date: string
    to_date: string | null
    end_reason: string | null
    is_current: boolean
  }

  const dayN = (n: number) => new Date(Date.UTC(2024, 0, 1 + n)).toISOString().slice(0, 10)

  function lineDoc(
    w: World,
    studentId: mongoose.Types.ObjectId,
    classId: mongoose.Types.ObjectId,
    o: { from: string; to?: string | null; open?: boolean; reason?: string | null; label?: string | null; schoolId?: mongoose.Types.ObjectId },
  ): Record<string, unknown> {
    return {
      school_id: o.schoolId ?? w.school._id, student_id: studentId, class_id: classId,
      class_year_start: "2026-06-01", class_year_label: "2026-27",
      class_label: o.label ?? null,
      from_date: o.from, to_date: o.open ? null : (o.to ?? o.from), is_current: o.open ?? false,
      end_reason: o.open ? null : (o.reason ?? "promoted"),
      created_by: w.admin._id, run_id: "run-secret-123",
    }
  }

  const detail = (auth: string, id: mongoose.Types.ObjectId | string) =>
    request(app).get(`/api/school/student-detail/${id}`).set("Authorization", auth)

  async function setup() {
    const w = await world()
    const cls1 = await createClass(w.school._id, undefined, { section: nextSection() })
    const cls2 = await createClass(w.school._id, undefined, { section: nextSection() })
    const student = await createUser(w.school._id, "student", cls2._id)
    return { ...w, cls1, cls2, student }
  }

  it("lists the student's lines oldest first, keeps creation order for lines that start the same day, and returns exactly the allowed keys", async () => {
    const s = await setup()
    // Saved newest-first on purpose, so the order the answer shows is the answer's own.
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls1._id, { from: "2026-06-01", to: "2026-06-01", reason: "correction", label: "Class 5A" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls2._id, { from: "2026-06-01", open: true, label: "Class 5B" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls1._id, { from: "2026-04-01", to: "2026-05-31", reason: "promoted", label: "Class 4A" }))

    const res = await detail(s.auth, s.student._id)
    expect(res.status).toBe(200)
    const history = res.body.class_history as HistoryLine[]
    expect(history).toStrictEqual([
      { class_label: "Class 4A", class_deleted: false, from_date: "2026-04-01", to_date: "2026-05-31", end_reason: "promoted", is_current: false },
      { class_label: "Class 5A", class_deleted: false, from_date: "2026-06-01", to_date: "2026-06-01", end_reason: "correction", is_current: false },
      // the current line shows the LIVE class label (R7), not the label saved with it ("Class 5B")
      { class_label: `Class ${s.cls2.grade}${s.cls2.section}`, class_deleted: false, from_date: "2026-06-01", to_date: null, end_reason: null, is_current: true },
    ])
    for (const line of history) expect(Object.keys(line).sort()).toEqual(KEYS)
    const text = JSON.stringify(history)
    for (const secret of ["run-secret-123", String(s.school._id), String(s.student._id), String(s.cls1._id), String(s.cls2._id), String(s.admin._id), "2026-27"]) {
      expect(text).not.toContain(secret)
    }
  })

  it("is an empty list for a student with no lines (nothing is invented) and the other fields are still there", async () => {
    const s = await setup()
    const res = await detail(s.auth, s.student._id)
    expect(res.status).toBe(200)
    expect(res.body.class_history).toEqual([])
    expect(res.body).toHaveProperty("attendance_breakdown")
    expect(res.body).toHaveProperty("certificates_count")
  })

  // R7 — a CLOSED line keeps the label saved with it (a snapshot); the CURRENT line always shows the live class label.
  it("a closed line keeps its saved label (a later rename does not change it); a closed line with no saved label falls back to the live label ('Class 5Y1' style, its name, or its section)", async () => {
    const s = await setup()
    const custom = await createClass(s.school._id, undefined, { grade: 0, section: nextSection(), name: "Sunrise Batch" })
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls1._id, { from: "2026-01-01", label: "Class 4Z (old name)" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls1._id, { from: "2026-02-01" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, custom._id, { from: "2026-03-01" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls2._id, { from: "2026-04-01", open: true }))
    await Class.updateOne({ _id: s.cls1._id }, { $set: { section: "RENAMED" } })

    const res = await detail(s.auth, s.student._id)
    const byFrom = Object.fromEntries((res.body.class_history as HistoryLine[]).map(l => [l.from_date, l.class_label]))
    expect(byFrom["2026-01-01"]).toBe("Class 4Z (old name)")                 // closed + saved label: snapshot kept after the rename
    expect(byFrom["2026-02-01"]).toBe(`Class ${s.cls1.grade}RENAMED`)        // closed + no saved label: live label
    expect(byFrom["2026-03-01"]).toBe("Sunrise Batch")
  })

  it("the CURRENT line shows the live class label even when it has an older saved label, and follows a rename at once", async () => {
    const s = await setup()
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls1._id, { from: "2026-01-01", label: "Class 4Z (old name)" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls2._id, { from: "2026-02-01", open: true, label: "Stale saved label" }))

    const before = await detail(s.auth, s.student._id)
    const currentBefore = (before.body.class_history as HistoryLine[]).find(l => l.is_current) as HistoryLine
    expect(currentBefore.class_label).toBe(`Class ${s.cls2.grade}${s.cls2.section}`)
    expect(currentBefore.class_deleted).toBe(false)

    await Class.updateOne({ _id: s.cls2._id }, { $set: { section: "NOWLIVE" } })
    const after = await detail(s.auth, s.student._id)
    const history = after.body.class_history as HistoryLine[]
    expect(history.find(l => l.is_current)?.class_label).toBe(`Class ${s.cls2.grade}NOWLIVE`)
    expect(history.find(l => !l.is_current)?.class_label).toBe("Class 4Z (old name)")
  })

  it("a custom-named class and an unnamed class show their live label on the current line (the name, or the section)", async () => {
    const s = await setup()
    const unnamed = await createClass(s.school._id, undefined, { grade: 0, section: nextSection(), name: "Temp" })
    await unnamed.updateOne({ $set: { name: null } })
    await StudentEnrollment.create(lineDoc(s, s.student._id, unnamed._id, { from: "2026-04-01", open: true, label: "Stale saved label" }))
    const res = await detail(s.auth, s.student._id)
    expect((res.body.class_history as HistoryLine[])[0].class_label).toBe(unnamed.section)

    await Class.updateOne({ _id: unnamed._id }, { $set: { name: "Sunrise Batch" } })
    const named = await detail(s.auth, s.student._id)
    expect((named.body.class_history as HistoryLine[])[0].class_label).toBe("Sunrise Batch")
  })

  it("a CURRENT line whose class was deleted has no live label, so the saved label is shown and class_deleted is true", async () => {
    const s = await setup()
    const gone = await createClass(s.school._id, undefined, { section: nextSection() })
    await StudentEnrollment.create(lineDoc(s, s.student._id, gone._id, { from: "2026-04-01", open: true, label: "Class 3C (saved)" }))
    await Class.deleteOne({ _id: gone._id })
    const res = await detail(s.auth, s.student._id)
    expect(res.status).toBe(200)
    expect((res.body.class_history as HistoryLine[])).toStrictEqual([
      { class_label: "Class 3C (saved)", class_deleted: true, from_date: "2026-04-01", to_date: null, end_reason: null, is_current: true },
    ])
  })

  it("a class that no longer exists is flagged class_deleted, keeps its saved label, and shows no label when none was saved", async () => {
    const s = await setup()
    const gone = await createClass(s.school._id, undefined, { section: nextSection() })
    await StudentEnrollment.create(lineDoc(s, s.student._id, gone._id, { from: "2026-01-01", label: "Class 3C" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, gone._id, { from: "2026-02-01" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls1._id, { from: "2026-03-01", open: true }))
    await Class.deleteOne({ _id: gone._id })

    const res = await detail(s.auth, s.student._id)
    expect(res.status).toBe(200)
    const byFrom = Object.fromEntries((res.body.class_history as HistoryLine[]).map(l => [l.from_date, l]))
    expect(byFrom["2026-01-01"]).toMatchObject({ class_label: "Class 3C", class_deleted: true })
    expect(byFrom["2026-02-01"]).toMatchObject({ class_label: null, class_deleted: true })
    expect(byFrom["2026-03-01"]).toMatchObject({ class_deleted: false })
  })

  it("shows only this student's lines in this school", async () => {
    const s = await setup()
    const other = await createSchool()
    const otherClass = await createClass(other._id, undefined, { section: nextSection() })
    const classmate = await createUser(s.school._id, "student", s.cls1._id)
    await StudentEnrollment.create(lineDoc(s, s.student._id, s.cls1._id, { from: "2026-01-01", label: "Mine" }))
    await StudentEnrollment.create(lineDoc(s, classmate._id, s.cls1._id, { from: "2026-01-02", label: "Classmate" }))
    await StudentEnrollment.create(lineDoc(s, s.student._id, otherClass._id, { from: "2026-01-03", label: "Other school", schoolId: other._id }))

    const res = await detail(s.auth, s.student._id)
    expect((res.body.class_history as HistoryLine[]).map(l => l.class_label)).toEqual(["Mine"])
  })

  // R8 — more than 50 lines: the NEWEST 50, shown oldest first, so the current line is always included.
  it("returns at most 50 lines: with 60 saved it returns the newest 50 (lines 10 to 59), oldest first, and the last one is the current line", async () => {
    const s = await setup()
    await StudentEnrollment.insertMany(Array.from({ length: 60 }, (_, i) =>
      lineDoc(s, s.student._id, s.cls1._id, { from: dayN(i), open: i === 59, label: `Line ${i}` })))
    const res = await detail(s.auth, s.student._id)
    expect(res.status).toBe(200)
    const history = res.body.class_history as HistoryLine[]
    expect(history).toHaveLength(50)
    expect(history.map(l => l.from_date)).toEqual(Array.from({ length: 50 }, (_, i) => dayN(i + 10)))
    expect(history[49].is_current).toBe(true)
    expect(history.filter(l => l.is_current)).toHaveLength(1)
    expect(history[0].class_label).toBe("Line 10")
  })

  it("a student with exactly 50 lines gets all 50, oldest first", async () => {
    const s = await setup()
    await StudentEnrollment.insertMany(Array.from({ length: 50 }, (_, i) =>
      lineDoc(s, s.student._id, s.cls1._id, { from: dayN(i), open: i === 49, label: `Line ${i}` })))
    const res = await detail(s.auth, s.student._id)
    const history = res.body.class_history as HistoryLine[]
    expect(history.map(l => l.from_date)).toEqual(Array.from({ length: 50 }, (_, i) => dayN(i)))
    expect(history[49].is_current).toBe(true)
  })

  it("a student with 200 lines still gets one successful answer with the newest 50 lines, oldest first, the last being the current one", async () => {
    const s = await setup()
    await StudentEnrollment.insertMany(Array.from({ length: 200 }, (_, i) =>
      lineDoc(s, s.student._id, s.cls1._id, { from: dayN(i), open: i === 199 })))
    const res = await detail(s.auth, s.student._id)
    expect(res.status).toBe(200)
    const history = res.body.class_history as HistoryLine[]
    expect(history).toHaveLength(50)
    expect(history[0].from_date).toBe(dayN(150))
    expect(history[49].from_date).toBe(dayN(199))
    expect(history[49].is_current).toBe(true)
  })

  it("answers 404 for another school's student, 400 for a malformed id and 403 for a teacher, and shows no history in those answers", async () => {
    const s = await setup()
    const other = await createSchool()
    const otherClass = await createClass(other._id, undefined, { section: nextSection() })
    const outsider = await createUser(other._id, "student", otherClass._id)
    await StudentEnrollment.create(lineDoc(s, outsider._id, otherClass._id, { from: "2026-01-01", label: "Hidden", schoolId: other._id }))

    const notFound = await detail(s.auth, outsider._id)
    expect(notFound.status).toBe(404)
    expect(notFound.body.class_history).toBeUndefined()
    expect(JSON.stringify(notFound.body)).not.toContain("Hidden")
    expect((await detail(s.auth, "not-an-id")).status).toBe(400)
    const forbidden = await detail(s.teacherAuth, s.student._id)
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.class_history).toBeUndefined()
  })
})

// ── G6 — a server without transactions (standalone MongoDB) ───────────────────
// runInTransaction() asks mongoose.startSession() for a session and runs the work inside session.withTransaction().
// A standalone server answers "Transaction numbers are only allowed on a replica set"; the helper then runs the work
// once WITHOUT a session. These tests reach that branch on the in-memory replica set by handing the route a real
// session whose withTransaction() throws that message (startSession itself cannot be made to reject: the call sits
// before the try in runInTransaction). Without a session nothing rolls back by itself, so saveYearStart() puts the old
// date and set-at time back by hand when the audit row cannot be written, but only if the date it wrote is still the
// stored one (the write filter is `year_start: <the date it saved>`).
describe("year start change on a server without transactions (G6)", () => {
  const NO_REPLICA_SET = "Transaction numbers are only allowed on a replica set"

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
  })
  afterEach(async () => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    await clearDb()
  })

  // A real session whose withTransaction() answers like a standalone server; startSession() hands it out once.
  async function standaloneLikeSession() {
    const session = await mongoose.startSession()
    const calls = { withTransaction: 0 }
    session.withTransaction = async () => {
      calls.withTransaction += 1
      throw new Error(NO_REPLICA_SET)
    }
    const startSessionSpy = vi.spyOn(mongoose, "startSession").mockResolvedValueOnce(session)
    return { session, calls, startSessionSpy }
  }

  it("T1a: a class with a stored date — the audit row fails, the answer is 500 and the date and set-at time are put back by hand, with no audit row", async () => {
    const w = await world()
    const setAt = daysAgo(100)
    const cls = await classWith(w, "2026-06-01", setAt)
    const { session, calls, startSessionSpy } = await standaloneLikeSession()
    const auditSpy = vi.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("boom"))
    try {
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe("Could not save. Please try again.")
      // the no-transaction branch really ran, and the audit write really failed
      expect(startSessionSpy).toHaveBeenCalledTimes(1)
      expect(calls.withTransaction).toBe(1)
      expect(auditSpy).toHaveBeenCalledTimes(1)

      await expectClassUnchanged(cls._id, "2026-06-01", setAt)
      const rows = await auditRows()
      expect(rows.filter(r => r.resource_id === String(cls._id))).toHaveLength(0)
      expect(rows).toHaveLength(0)
    } finally {
      await session.endSession()
    }
  })

  it("T1b: an older class with no stored date (year_start and set-at are null) — after the failure both are null again", async () => {
    const w = await world()
    const cls = await classWith(w, null)
    await expectClassUnchanged(cls._id, null, null)
    const { session, calls, startSessionSpy } = await standaloneLikeSession()
    const auditSpy = vi.spyOn(AuditLog, "create").mockRejectedValueOnce(new Error("boom"))
    try {
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: null })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe("Could not save. Please try again.")
      expect(startSessionSpy).toHaveBeenCalledTimes(1)
      expect(calls.withTransaction).toBe(1)
      expect(auditSpy).toHaveBeenCalledTimes(1)

      await expectClassUnchanged(cls._id, null, null)
      const rows = await auditRows()
      expect(rows.filter(r => r.resource_id === String(cls._id))).toHaveLength(0)
      expect(rows).toHaveLength(0)
    } finally {
      await session.endSession()
    }
  })

  it("T2: the undo is skipped when another date landed meanwhile — the other date stays stored", async () => {
    const w = await world()
    const setAt = daysAgo(100)
    const cls = await classWith(w, "2026-06-01", setAt)
    const otherDate = "2026-08-01"
    const { session, calls } = await standaloneLikeSession()
    // The audit write fails, but just before it fails another request has saved a different date.
    vi.spyOn(AuditLog, "create").mockImplementationOnce(async () => {
      await Class.updateOne({ _id: cls._id }, { $set: { year_start: otherDate } })
      throw new Error("boom")
    })
    try {
      const res = await patch(w.auth, cls._id, { year_start: "2026-07-01", expected_current: "2026-06-01" })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe("Could not save. Please try again.")
      expect(calls.withTransaction).toBe(1)

      // The undo only matches while the stored date is the one this request wrote ("2026-07-01"), so it did nothing.
      const now = await stored(cls._id)
      expect(now.year_start).toBe(otherDate)
      // ...and it did not put the old set-at time back either (the time written by this request is still there).
      expect(new Date(now.year_start_set_at as Date).getTime()).toBe(NOW.getTime())
      expect(await auditRows()).toHaveLength(0)
    } finally {
      await session.endSession()
    }
  })
})
