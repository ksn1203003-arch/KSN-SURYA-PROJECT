// ─────────────────────────────────────────────────────────────────────────────
// classYearStartBulk.test.ts — written BEFORE the feature exists (tests first).
// Covers the bulk route POST /api/school/classes-year-start: an admin sets the school-year start of
// up to 200 classes in one call. Each class is handled on its own (own transaction, own audit row) and
// gets its own status. At most 3 bulk calls per hour per admin that CHANGE something: a call is counted on arrival,
// stays counted when the client hangs up while the change commits, and is given back only when it saved nothing
// (updated === 0) or was refused as a whole (400). The same class id sent twice in one call is handled once, and every
// audit row's "before" carries the previous stored value AND the effective start used for the sheet counts.
// The clock is fixed at 2026-10-12 10:30 IST (range: 2024-10-12 to 2026-12-11; default effective start 2026-06-01).
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

const app = express()
app.use(express.json())
app.use("/api/school", schoolRouter)

beforeAll(startDb)
afterAll(stopDb)

const NOW = new Date("2026-10-12T05:00:00Z")           // 10:30 IST on 2026-10-12
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
const bearer = (id: mongoose.Types.ObjectId | string, role: string) => `Bearer ${makeJwt(String(id), role)}`

interface StoredClass { year_start?: string | null; year_start_set_at?: Date | null }
interface Item { id: string; expected_current?: string | null }
interface BulkResult { id: string; status: string }

let sectionCounter = 0
const nextSection = () => `K${++sectionCounter}`

type World = Awaited<ReturnType<typeof world>>
// Called AFTER the fake clock is set. Every world has its own admin, so the per-admin call limit never leaks between tests.
async function world() {
  const school = await createSchool()
  const admin = await createUser(school._id, "admin")
  const teacher = await createUser(school._id, "teacher")
  return { school, admin, teacher, auth: bearer(admin._id, "admin"), teacherAuth: bearer(teacher._id, "teacher") }
}

// A class whose start date is stored (or an older class with nothing stored when start is null).
async function classWith(w: World, start: string | null, setAt: Date | null = null) {
  const cls = await createClass(w.school._id, undefined, { section: nextSection(), year_start: null })
  if (start !== null) {
    await Class.collection.updateOne({ _id: cls._id }, { $set: { year_start: start, year_start_set_at: setAt } })
  }
  return cls
}

async function sheetOn(w: World, cls: { _id: mongoose.Types.ObjectId }, date: string, period = 1) {
  await Attendance.create({ school_id: w.school._id, class_id: cls._id, teacher_id: w.admin._id, date, period, subject: "", records: [] })
}

const stored = async (id: mongoose.Types.ObjectId): Promise<StoredClass> => (await Class.findById(id).lean<StoredClass | null>()) ?? {}
const auditRows = () => AuditLog.find({ action: "class.year_start_changed" }).lean()
const bulk = (auth: string, body: Record<string, unknown>) =>
  request(app).post("/api/school/classes-year-start").set("Authorization", auth).send(body)
const item = (cls: { _id: mongoose.Types.ObjectId }, expected: string | null = null): Item => ({ id: String(cls._id), expected_current: expected })
const itemWithoutExpected = (cls: { _id: mongoose.Types.ObjectId }): Item => ({ id: String(cls._id) })
// A new admin of the same school: a loop that needs many calls uses one per call, so the per-admin call limit is never what is being tested.
const anotherAdmin = async (w: World) => bearer((await createUser(w.school._id, "admin"))._id, "admin")
const statusById = (res: { body: { results: BulkResult[] } }) => Object.fromEntries(res.body.results.map(r => [r.id, r.status]))
const DEFAULT_EFFECTIVE = "2026-06-01"   // the default effective start of an older class at the fixed clock

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

async function expectClassUnchanged(id: mongoose.Types.ObjectId, start: string | null, setAt: Date | null) {
  const now = await stored(id)
  expect(now.year_start ?? null).toBe(start)
  expect(now.year_start_set_at ? new Date(now.year_start_set_at).getTime() : null).toBe(setAt ? setAt.getTime() : null)
}

function expectRefusal(res: { status: number; body: { error?: unknown; code?: unknown } }, status: number, code: string) {
  expect(res.status).toBe(status)
  expect(res.body.code).toBe(code)
  expect(typeof res.body.error).toBe("string")
  expect((res.body.error as string).length).toBeGreaterThan(0)
}

describe("POST /api/school/classes-year-start", () => {
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

  // ── who may call ──────────────────────────────────────────────────────────────
  describe("who may call it", () => {
    it("refuses a teacher (403) and a caller who is not signed in (401), and touches nothing", async () => {
      const w = await world()
      const cls = await classWith(w, null)
      const body = { year_start: "2026-07-01", classes: [item(cls)] }
      expect((await bulk(w.teacherAuth, body)).status).toBe(403)
      const anonymous = await request(app).post("/api/school/classes-year-start").send(body)
      expect(anonymous.status).toBe(401)
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)
    })
  })

  // ── the request itself is checked before anything is touched ──────────────────
  describe("a bad request is refused as a whole and nothing is touched", () => {
    async function untouched(w: World) {
      const cls = await classWith(w, null)
      return { cls, items: [item(cls)] }
    }

    it("classes missing, not a list, or empty -> 400", async () => {
      const w = await world()
      const { cls } = await untouched(w)
      for (const classes of [undefined, "abc", { id: String(cls._id) }, 5, []]) {
        const res = await bulk(await anotherAdmin(w), { year_start: "2026-07-01", classes })
        expect(res.status).toBe(400)
      }
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)
    })

    it("201 classes -> 400 (the limit is 200), even when the first one is a real class", async () => {
      const w = await world()
      const { cls } = await untouched(w)
      const extra = Array.from({ length: 200 }, () => ({ id: String(new mongoose.Types.ObjectId()), expected_current: null }))
      const res = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(cls), ...extra] })
      expect(res.status).toBe(400)
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)
    })

    it("one bad id (not an id, empty, missing, or a number) refuses the WHOLE request with 400, even when the other classes are fine", async () => {
      const w = await world()
      const { cls } = await untouched(w)
      for (const bad of [{ id: "not-an-id", expected_current: null }, { id: "", expected_current: null }, { expected_current: null }, { id: 123, expected_current: null }]) {
        const res = await bulk(await anotherAdmin(w), { year_start: "2026-07-01", classes: [item(cls), bad] })
        expect(res.status).toBe(400)
      }
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)
    })

    it.each([
      ["a month without a leading zero", "2026-6-1"],
      ["a day that does not exist", "2026-02-31"],
      ["an empty string", ""],
      ["null", null],
      ["a number", 20260601],
      ["an object", { $gt: "" }],
    ])("an invalid date (%s) -> 400 invalid_date", async (_label, value) => {
      const w = await world()
      const { cls, items } = await untouched(w)
      const res = await bulk(w.auth, { year_start: value, classes: items })
      expectRefusal(res, 400, "invalid_date")
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)
    })

    it("a missing date -> 400 invalid_date", async () => {
      const w = await world()
      const { cls, items } = await untouched(w)
      expectRefusal(await bulk(w.auth, { classes: items }), 400, "invalid_date")
      await expectClassUnchanged(cls._id, null, null)
    })

    it("a date older than two years -> 400 too_early with the exact message; the first allowed day (2024-10-12) is accepted", async () => {
      const w = await world()
      const { cls, items } = await untouched(w)
      const early = await bulk(w.auth, { year_start: "2024-10-11", classes: items })
      expectRefusal(early, 400, "too_early")
      expect(early.body.error).toBe("Choose a date after 12 Oct 2024.")
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)

      const ok = await bulk(w.auth, { year_start: "2024-10-12", classes: items })
      expect(ok.status).toBe(200)
      expect((await stored(cls._id)).year_start).toBe("2024-10-12")
    })

    it("a date more than 60 days ahead -> 400 too_far with the exact message; the last allowed day (2026-12-11) is accepted", async () => {
      const w = await world()
      const { cls, items } = await untouched(w)
      const far = await bulk(w.auth, { year_start: "2026-12-12", classes: items })
      expectRefusal(far, 400, "too_far")
      expect(far.body.error).toBe("Choose a date on or before 11 Dec 2026.")
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)

      const ok = await bulk(w.auth, { year_start: "2026-12-11", classes: items })
      expect(ok.status).toBe(200)
      expect((await stored(cls._id)).year_start).toBe("2026-12-11")
    })

    it("a reason of 101 characters -> 400 reason_too_long with the exact message; nothing is saved", async () => {
      const w = await world()
      const { cls, items } = await untouched(w)
      const res = await bulk(w.auth, { year_start: "2026-07-01", classes: items, reason: "a".repeat(101) })
      expectRefusal(res, 400, "reason_too_long")
      expect(res.body.error).toBe("Please keep the reason under 100 characters.")
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)
    })
  })

  // ── each class gets its own status ────────────────────────────────────────────
  describe("each class is handled on its own and gets its own status", () => {
    it("a mix: saved, skipped_has_date, conflict, not_found (missing and another school's), unchanged — exact statuses, one audit row per SAVED class and none for the others", async () => {
      const w = await world()
      const otherSchool = await createSchool()
      const foreign = await createClass(otherSchool._id, undefined, { section: nextSection(), year_start: null })
      const missingId = String(new mongoose.Types.ObjectId())

      const setB = daysAgo(30)
      const a = await classWith(w, null)                    // unset -> saved
      const b = await classWith(w, "2026-04-15", setB)      // has a date, include_dated not sent -> skipped_has_date
      const c = await classWith(w, null)                    // unset, stale expected_current -> conflict

      const first = await bulk(w.auth, {
        year_start: "2026-07-01",
        classes: [item(a, null), item(b, "2026-04-15"), item(c, "1999-01-01"), { id: missingId, expected_current: null }, item(foreign, null)],
      })
      expect(first.status).toBe(200)
      expect(first.body.results).toHaveLength(5)
      expect(statusById(first)).toEqual({
        [String(a._id)]: "saved",
        [String(b._id)]: "skipped_has_date",
        [String(c._id)]: "conflict",
        [missingId]: "not_found",
        [String(foreign._id)]: "not_found",
      })
      expect(first.body.updated).toBe(1)
      expect((await stored(a._id)).year_start).toBe("2026-07-01")
      expect(new Date((await stored(a._id)).year_start_set_at as Date).getTime()).toBe(NOW.getTime())
      await expectClassUnchanged(b._id, "2026-04-15", setB)
      await expectClassUnchanged(c._id, null, null)
      await expectClassUnchanged(foreign._id, null, null)
      expect(await auditRows()).toHaveLength(1)

      // second call, a day later: include_dated = true reaches the dated classes too
      vi.setSystemTime(new Date(NOW.getTime() + 86_400_000))
      const later = bearer(w.admin._id, "admin")
      const setE = daysAgo(10)
      const setF = daysAgo(10)
      const e = await classWith(w, "2026-08-01", setE)      // already has exactly this date -> unchanged
      const f = await classWith(w, "2026-05-01", setF)      // stale expected_current -> conflict
      const h = await classWith(w, null)                    // unset -> saved even though include_dated is true
      await sheetOn(w, b, "2026-04-10")                     // before the old start: not counted
      await sheetOn(w, b, "2026-05-01")                     // in the gap: leaving
      await sheetOn(w, b, "2026-06-01")                     // in the gap: leaving
      await sheetOn(w, b, "2026-08-10")                     // after the new start: stays
      await sheetOn(w, h, "2026-06-10")                     // in the gap from the default start (1 Jun): leaving

      const second = await bulk(later, {
        year_start: "2026-08-01", include_dated: true, reason: "Board calendar",
        classes: [item(b, "2026-04-15"), item(e, "2026-08-01"), item(f, "2026-04-01"), item(h, null)],
      })
      expect(second.status).toBe(200)
      expect(statusById(second)).toEqual({
        [String(b._id)]: "saved",
        [String(e._id)]: "unchanged",
        [String(f._id)]: "conflict",
        [String(h._id)]: "saved",
      })
      expect(second.body.updated).toBe(2)
      expect((await stored(b._id)).year_start).toBe("2026-08-01")
      expect((await stored(h._id)).year_start).toBe("2026-08-01")
      await expectClassUnchanged(e._id, "2026-08-01", setE)
      await expectClassUnchanged(f._id, "2026-05-01", setF)

      // one audit row per SAVED class (a, b, h) and none for the others
      const rows = await auditRows()
      expect(rows).toHaveLength(3)
      const rowFor = (id: mongoose.Types.ObjectId) => rows.filter(r => r.resource_id === String(id))
      expect(rowFor(a._id)).toHaveLength(1)
      expect(rowFor(b._id)).toHaveLength(1)
      expect(rowFor(h._id)).toHaveLength(1)
      for (const untouched of [c, e, f, foreign]) expect(rowFor(untouched._id)).toHaveLength(0)

      // "before" carries the previous stored value AND the effective start the sheet counts were made from
      expect(rowFor(a._id)[0].before).toEqual({ year_start: null, effective: DEFAULT_EFFECTIVE })
      expect(rowFor(a._id)[0].after).toEqual({ year_start: "2026-07-01", reason: null, sheets_leaving: 0, sheets_entering: 0 })
      expect(rowFor(b._id)[0].before).toEqual({ year_start: "2026-04-15", effective: "2026-04-15" })
      expect(rowFor(b._id)[0].after).toEqual({ year_start: "2026-08-01", reason: "Board calendar", sheets_leaving: 2, sheets_entering: 0 })
      expect(rowFor(h._id)[0].before).toEqual({ year_start: null, effective: DEFAULT_EFFECTIVE })
      expect(rowFor(h._id)[0].after).toEqual({ year_start: "2026-08-01", reason: "Board calendar", sheets_leaving: 1, sheets_entering: 0 })
      for (const row of rows) {
        expect(row.resource_type).toBe("Class")
        expect(String(row.school_id)).toBe(String(w.school._id))
        expect(String(row.actor_id)).toBe(String(w.admin._id))
        expect(row.actor_role).toBe("admin")
      }
    })

    it("an earlier date reports sheets_entering in the class's own audit row", async () => {
      const w = await world()
      const cls = await classWith(w, "2026-06-01", daysAgo(10))
      await sheetOn(w, cls, "2026-05-10")
      await sheetOn(w, cls, "2026-05-20")
      await sheetOn(w, cls, "2026-04-20")
      const res = await bulk(w.auth, { year_start: "2026-05-01", include_dated: true, classes: [item(cls, "2026-06-01")] })
      expect(res.status).toBe(200)
      expect(statusById(res)).toEqual({ [String(cls._id)]: "saved" })
      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].before).toEqual({ year_start: "2026-06-01", effective: "2026-06-01" })
      expect(rows[0].after).toEqual({ year_start: "2026-05-01", reason: null, sheets_leaving: 0, sheets_entering: 2 })
    })

    it("an older class's audit row records the default effective start it was counted from, and follows ACADEMIC_YEAR_START_MONTH", async () => {
      vi.stubEnv("ACADEMIC_YEAR_START_MONTH", "4")
      const w = await world()
      const older = await classWith(w, null)
      await sheetOn(w, older, "2026-04-10")      // in the gap from the April default to the new start
      await sheetOn(w, older, "2026-05-10")      // in the gap
      await sheetOn(w, older, "2026-06-10")      // on the new start: stays
      const res = await bulk(w.auth, { year_start: "2026-06-01", classes: [item(older, null)] })
      expect(res.status).toBe(200)
      expect(statusById(res)).toEqual({ [String(older._id)]: "saved" })
      const rows = await auditRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].before).toEqual({ year_start: null, effective: "2026-04-01" })
      expect(rows[0].after).toEqual({ year_start: "2026-06-01", reason: null, sheets_leaving: 2, sheets_entering: 0 })
    })

    it("another school's class is reported exactly like a missing one and is left untouched, with no audit row", async () => {
      const w = await world()
      const otherSchool = await createSchool()
      const foreign = await createClass(otherSchool._id, undefined, { section: nextSection(), year_start: null })
      const missingId = String(new mongoose.Types.ObjectId())
      const res = await bulk(w.auth, { year_start: "2026-07-01", include_dated: true, classes: [item(foreign, null), { id: missingId, expected_current: null }] })
      expect(res.status).toBe(200)
      const [foreignResult, missingResult] = res.body.results as BulkResult[]
      expect(foreignResult.status).toBe("not_found")
      expect(missingResult.status).toBe("not_found")
      expect(Object.keys(foreignResult).sort()).toEqual(Object.keys(missingResult).sort())
      expect(res.body.updated).toBe(0)
      await expectClassUnchanged(foreign._id, null, null)
      expect(await auditRows()).toHaveLength(0)
    })

    it("an older class accepts expected_current null, the default start the list shows, or none at all; a different date is a conflict", async () => {
      const w = await world()
      const withNull = await classWith(w, null)
      const withDefault = await classWith(w, null)
      const withNone = await classWith(w, null)
      const wrong = await classWith(w, null)
      const res = await bulk(w.auth, {
        year_start: "2026-07-01",
        classes: [item(withNull, null), item(withDefault, "2026-06-01"), itemWithoutExpected(withNone), item(wrong, "2026-05-31")],
      })
      expect(res.status).toBe(200)
      expect(statusById(res)).toEqual({
        [String(withNull._id)]: "saved",
        [String(withDefault._id)]: "saved",
        [String(withNone._id)]: "saved",
        [String(wrong._id)]: "conflict",
      })
      expect(res.body.updated).toBe(3)
      for (const c of [withNull, withDefault, withNone]) expect((await stored(c._id)).year_start).toBe("2026-07-01")
      await expectClassUnchanged(wrong._id, null, null)
      expect(await auditRows()).toHaveLength(3)
    })

    it("a dated class is skipped (skipped_has_date) unless include_dated is exactly true", async () => {
      const w = await world()
      const setAt = daysAgo(20)
      const absent = await classWith(w, "2026-04-15", setAt)
      const explicitFalse = await classWith(w, "2026-04-15", setAt)
      const res = await bulk(w.auth, { year_start: "2026-07-01", include_dated: false, classes: [item(absent, "2026-04-15"), item(explicitFalse, "2026-04-15")] })
      expect(res.status).toBe(200)
      expect(statusById(res)).toEqual({ [String(absent._id)]: "skipped_has_date", [String(explicitFalse._id)]: "skipped_has_date" })
      const omitted = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(absent, "2026-04-15")] })
      expect(statusById(omitted)).toEqual({ [String(absent._id)]: "skipped_has_date" })
      await expectClassUnchanged(absent._id, "2026-04-15", setAt)
      await expectClassUnchanged(explicitFalse._id, "2026-04-15", setAt)
      expect(await auditRows()).toHaveLength(0)
    })
  })

  // ── the reason ────────────────────────────────────────────────────────────────
  describe("the reason is optional, cleaned like PATCH, and stored in each saved class's audit row", () => {
    it("is stored cleaned (zero-width characters and line breaks removed) in every saved row; exactly 100 characters are accepted", async () => {
      const w = await world()
      const a = await classWith(w, null)
      const b = await classWith(w, null)
      const res = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(a), item(b)], reason: "  Fixed​\nby admin \t today  " })
      expect(res.status).toBe(200)
      const rows = await auditRows()
      expect(rows).toHaveLength(2)
      for (const row of rows) expect(row.after).toMatchObject({ reason: "Fixed by admin today" })

      const c = await classWith(w, null)
      const exact = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(c)], reason: "a".repeat(100) })
      expect(exact.status).toBe(200)
      expect((await auditRows()).filter(r => r.resource_id === String(c._id))[0].after).toMatchObject({ reason: "a".repeat(100) })
    })

    it("a blank reason is stored as null", async () => {
      const w = await world()
      const a = await classWith(w, null)
      const res = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(a)], reason: "  ​ " })
      expect(res.status).toBe(200)
      expect((await auditRows())[0].after).toMatchObject({ reason: null })
    })
  })

  // ── 200 classes, repeat, call limit ───────────────────────────────────────────
  describe("size, repeating and the call limit", () => {
    it("200 classes in one call all succeed, each with its own audit row", async () => {
      const w = await world()
      await Class.insertMany(Array.from({ length: 200 }, (_, i) => ({
        school_id: w.school._id, grade: 7, section: `BULK${i}`, name: `Bulk ${i}`, subjects: [], teachers: [], timetable: [], timetable_versions: [], year_start: null,
      })))
      const classes = await Class.find({ school_id: w.school._id }).select("_id").lean()
      expect(classes).toHaveLength(200)
      const res = await bulk(w.auth, { year_start: "2026-07-01", classes: classes.map(c => ({ id: String(c._id), expected_current: null })) })
      expect(res.status).toBe(200)
      expect(res.body.results).toHaveLength(200)
      expect((res.body.results as BulkResult[]).every(r => r.status === "saved")).toBe(true)
      expect(res.body.updated).toBe(200)
      expect(await Class.countDocuments({ school_id: w.school._id, year_start: "2026-07-01" })).toBe(200)
      expect(await auditRows()).toHaveLength(200)
    }, 120_000)

    it("repeating the same call changes nothing the second time: every status is unchanged or skipped_has_date, no new audit rows, the set time does not move", async () => {
      const w = await world()
      const a = await classWith(w, null)
      const b = await classWith(w, null)
      const body = { year_start: "2026-07-01", classes: [item(a), item(b)] }
      const first = await bulk(w.auth, body)
      expect(first.status).toBe(200)
      expect(first.body.updated).toBe(2)
      const firstSetAt = (await stored(a._id)).year_start_set_at as Date

      vi.setSystemTime(new Date(NOW.getTime() + 86_400_000))
      const second = await bulk(bearer(w.admin._id, "admin"), body)
      expect(second.status).toBe(200)
      for (const r of second.body.results as BulkResult[]) expect(["unchanged", "skipped_has_date"]).toContain(r.status)
      expect(second.body.updated).toBe(0)
      expect(await auditRows()).toHaveLength(2)
      expect((await stored(a._id)).year_start).toBe("2026-07-01")
      expect(new Date((await stored(a._id)).year_start_set_at as Date).getTime()).toBe(new Date(firstSetAt).getTime())
    })

    it("repeating it with include_dated true and the date now stored as expected_current answers unchanged and writes nothing", async () => {
      const w = await world()
      const a = await classWith(w, null)
      expect((await bulk(w.auth, { year_start: "2026-07-01", classes: [item(a)] })).status).toBe(200)
      const again = await bulk(w.auth, { year_start: "2026-07-01", include_dated: true, classes: [item(a, "2026-07-01")] })
      expect(again.status).toBe(200)
      expect(statusById(again)).toEqual({ [String(a._id)]: "unchanged" })
      expect(again.body.updated).toBe(0)
      expect(await auditRows()).toHaveLength(1)
    })

    it("the 4th call within an hour is 429 rate_limited and changes nothing; a different admin is not limited", async () => {
      const w = await world()
      const classes = [await classWith(w, null), await classWith(w, null), await classWith(w, null), await classWith(w, null)]
      for (const cls of classes.slice(0, 3)) {
        const res = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(cls)] })
        expect(res.status).toBe(200)
      }
      const fourth = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(classes[3])] })
      expectRefusal(fourth, 429, "rate_limited")
      await expectClassUnchanged(classes[3]._id, null, null)
      expect(await auditRows()).toHaveLength(3)

      const second = await createUser(w.school._id, "admin")
      const ok = await bulk(bearer(second._id, "admin"), { year_start: "2026-07-01", classes: [item(classes[3])] })
      expect(ok.status).toBe(200)
      expect((await stored(classes[3]._id)).year_start).toBe("2026-07-01")
    })
  })

  // ── what uses the call budget ─────────────────────────────────────────────────
  // A call is counted on arrival. It stays counted when the client hangs up while the change commits. It is given
  // back only when it saved nothing (updated === 0) or was refused as a whole (400).
  describe("the hourly call budget: kept when the client hangs up, given back when nothing was saved", () => {
    // R1 — the old limiter gave the hit back whenever the client's connection closed before the answer was written.
    it("a call whose client hangs up but whose change COMMITS stays counted: after 3 such calls the 4th normal call is 429 rate_limited and saves nothing", async () => {
      const w = await world()
      const classes = [await classWith(w, null), await classWith(w, null), await classWith(w, null), await classWith(w, null)]
      await withServer(async (port) => {
        for (let i = 0; i < 3; i++) {
          // Each aborted call changes one fresh, unset class.
          await sendAndAbort(port, "POST", "/api/school/classes-year-start", w.auth, { year_start: "2026-07-01", classes: [item(classes[i])] })
          // The handler keeps running after the client has gone: wait for the committed audit row of that class.
          await waitUntil(
            async () => (await auditRows()).some(r => r.resource_id === String(classes[i]._id)),
            `the audit row of aborted bulk call ${i + 1}`,
          )
        }
      })
      for (const cls of classes.slice(0, 3)) expect((await stored(cls._id)).year_start).toBe("2026-07-01")
      expect(await auditRows()).toHaveLength(3)

      const fourth = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(classes[3])] })
      expectRefusal(fourth, 429, "rate_limited")
      expect(fourth.body.results).toBeUndefined()
      await expectClassUnchanged(classes[3]._id, null, null)
      expect(await auditRows()).toHaveLength(3)
    })

    // R2 — a call that saved nothing does not use the budget (the answer was a pure no-op).
    it("calls that save nothing do not use the budget: four of them (not_found, skipped_has_date, conflict, unchanged), then three real calls succeed and the 4th real one is 429", async () => {
      const w = await world()
      const otherSchool = await createSchool()
      const foreign = await createClass(otherSchool._id, undefined, { section: nextSection(), year_start: null })
      const setAt = daysAgo(20)
      const dated = await classWith(w, "2026-04-15", setAt)
      const unset = await classWith(w, null)
      const sameDate = await classWith(w, "2026-07-01", setAt)

      const notFound = await bulk(w.auth, { year_start: "2026-07-01", classes: [{ id: String(new mongoose.Types.ObjectId()), expected_current: null }, item(foreign, null)] })
      expect(notFound.status).toBe(200)
      expect(notFound.body.updated).toBe(0)

      const skipped = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(dated, "2026-04-15")] })
      expect(skipped.status).toBe(200)
      expect(statusById(skipped)).toEqual({ [String(dated._id)]: "skipped_has_date" })
      expect(skipped.body.updated).toBe(0)

      const conflict = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(unset, "1999-01-01")] })
      expect(conflict.status).toBe(200)
      expect(statusById(conflict)).toEqual({ [String(unset._id)]: "conflict" })
      expect(conflict.body.updated).toBe(0)

      const unchanged = await bulk(w.auth, { year_start: "2026-07-01", include_dated: true, classes: [item(sameDate, "2026-07-01")] })
      expect(unchanged.status).toBe(200)
      expect(statusById(unchanged)).toEqual({ [String(sameDate._id)]: "unchanged" })
      expect(unchanged.body.updated).toBe(0)

      await expectClassUnchanged(dated._id, "2026-04-15", setAt)
      await expectClassUnchanged(unset._id, null, null)
      await expectClassUnchanged(sameDate._id, "2026-07-01", setAt)
      expect(await auditRows()).toHaveLength(0)

      // The whole budget (3 calls that change something) is still there.
      const real = [await classWith(w, null), await classWith(w, null), await classWith(w, null), await classWith(w, null)]
      for (const cls of real.slice(0, 3)) {
        const res = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(cls)] })
        expect(res.status).toBe(200)
        expect(res.body.updated).toBe(1)
      }
      expect(await auditRows()).toHaveLength(3)
      const refused = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(real[3])] })
      expectRefusal(refused, 429, "rate_limited")
      await expectClassUnchanged(real[3]._id, null, null)
      expect(await auditRows()).toHaveLength(3)
    })

    it("a call refused as a whole (400: bad date, bad id, empty list, 201 classes) does not use the budget either: four of them, then three real calls succeed", async () => {
      const w = await world()
      const cls = await classWith(w, null)
      const tooMany = Array.from({ length: 201 }, () => ({ id: String(new mongoose.Types.ObjectId()), expected_current: null }))
      expectRefusal(await bulk(w.auth, { year_start: "2026-02-31", classes: [item(cls)] }), 400, "invalid_date")
      expect((await bulk(w.auth, { year_start: "2026-07-01", classes: [{ id: "not-an-id", expected_current: null }] })).status).toBe(400)
      expect((await bulk(w.auth, { year_start: "2026-07-01", classes: [] })).status).toBe(400)
      expect((await bulk(w.auth, { year_start: "2026-07-01", classes: tooMany })).status).toBe(400)
      await expectClassUnchanged(cls._id, null, null)
      expect(await auditRows()).toHaveLength(0)

      for (let i = 0; i < 3; i++) {
        const fresh = await classWith(w, null)
        const res = await bulk(w.auth, { year_start: "2026-07-01", classes: [item(fresh)] })
        expect(res.status).toBe(200)
        expect(res.body.updated).toBe(1)
      }
      expect(await auditRows()).toHaveLength(3)
    })
  })

  // ── the same class id twice in one call ───────────────────────────────────────
  describe("a class id sent more than once in one call is handled once", () => {
    // R4
    it("a duplicate id gives ONE results entry, ONE audit row, and updated counts it once", async () => {
      const w = await world()
      const a = await classWith(w, null)
      const b = await classWith(w, null)
      const missingId = String(new mongoose.Types.ObjectId())
      const res = await bulk(w.auth, {
        year_start: "2026-07-01",
        classes: [item(a, null), item(a, null), item(b, null), { id: missingId, expected_current: null }, { id: missingId, expected_current: null }, item(b, null)],
      })
      expect(res.status).toBe(200)
      const results = res.body.results as BulkResult[]
      expect(results).toHaveLength(3)
      expect(results.map(r => r.id).sort()).toEqual([String(a._id), String(b._id), missingId].sort())
      expect(statusById(res)).toEqual({ [String(a._id)]: "saved", [String(b._id)]: "saved", [missingId]: "not_found" })
      expect(res.body.updated).toBe(2)
      expect((await stored(a._id)).year_start).toBe("2026-07-01")
      expect((await stored(b._id)).year_start).toBe("2026-07-01")
      const rows = await auditRows()
      expect(rows).toHaveLength(2)
      expect(rows.filter(r => r.resource_id === String(a._id))).toHaveLength(1)
      expect(rows.filter(r => r.resource_id === String(b._id))).toHaveLength(1)
    })

    it("a list of 200 entries made of 100 classes each sent twice gives 100 results, 100 audit rows and updated 100", async () => {
      const w = await world()
      await Class.insertMany(Array.from({ length: 100 }, (_, i) => ({
        school_id: w.school._id, grade: 7, section: `DUP${i}`, name: `Dup ${i}`, subjects: [], teachers: [], timetable: [], timetable_versions: [], year_start: null,
      })))
      const classes = await Class.find({ school_id: w.school._id }).select("_id").lean()
      expect(classes).toHaveLength(100)
      const entries = [...classes, ...classes].map(c => ({ id: String(c._id), expected_current: null }))
      expect(entries).toHaveLength(200)
      const res = await bulk(w.auth, { year_start: "2026-07-01", classes: entries })
      expect(res.status).toBe(200)
      const results = res.body.results as BulkResult[]
      expect(results).toHaveLength(100)
      expect(new Set(results.map(r => r.id)).size).toBe(100)
      expect(results.every(r => r.status === "saved")).toBe(true)
      expect(res.body.updated).toBe(100)
      expect(await Class.countDocuments({ school_id: w.school._id, year_start: "2026-07-01" })).toBe(100)
      expect(await auditRows()).toHaveLength(100)
    }, 120_000)

    it("200 distinct ids are still all handled (each its own result and audit row)", async () => {
      const w = await world()
      await Class.insertMany(Array.from({ length: 200 }, (_, i) => ({
        school_id: w.school._id, grade: 7, section: `DST${i}`, name: `Distinct ${i}`, subjects: [], teachers: [], timetable: [], timetable_versions: [], year_start: null,
      })))
      const classes = await Class.find({ school_id: w.school._id }).select("_id").lean()
      const res = await bulk(w.auth, { year_start: "2026-07-01", classes: classes.map(c => ({ id: String(c._id), expected_current: null })) })
      expect(res.status).toBe(200)
      expect(res.body.results).toHaveLength(200)
      expect(res.body.updated).toBe(200)
      expect(await auditRows()).toHaveLength(200)
    }, 120_000)
  })
})
