// ─────────────────────────────────────────────────────────────────────────────
// attendanceStartDate.test.ts — "attendance is counted from the class's school-year start date".
//
// WRITTEN BEFORE THE CODE: these tests state the owner-approved rule and are expected to FAIL (red) against the
// readers that still ignore the date. They are the proof that the readers change.
//
// THE RULE
//   Class.year_start is a string YYYY-MM-DD (IST) or null.
//   - A class WITH a stored date: every attendance reader counts only the sheets dated on or after it
//     (the start day itself counts).
//   - A class with NO stored date (null): every sheet counts, as before. The shown default of 1 June is never used.
//   - A class that cannot be found in the caller's school: empty figures (fail closed), not "all sheets".
//   - Sheets are never deleted: moving the date later hides sheets, moving it back brings them back.
//   - Every reader's JSON carries two top-level fields: `counted_from` (the stored date or null) and
//     `counted_class_label` (the class label such as "Class 7A", or null when no class was found).
//   - Percentages are one decimal everywhere (66.7, not 67).
//   - A start date in the future: empty figures, `recorded: false`, `counted_from` is that date.
//
// READERS COVERED
//   student:  GET /dashboard, GET /attendance (windows + calendar list), GET /attendance/range
//   parent:   GET /child/attendance
//   teacher:  GET /attendance-stats, GET /attendance-range, GET /student-attendance, GET /student-progress (extra)
//   admin:    GET /api/school/student-detail/:id, GET /api/school/student-attendance-detail/:id
//   report card: fetchReportCardData, fetchReportCardDataBatch, the page text, and the stored-PDF rebuild
//
// Dates are pinned with a fake clock (only Date is faked): Wednesday 2026-10-07, 12:00 IST.
// Expected numbers are worked out by hand from the sheets below; the rate formula is not re-implemented.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import crypto from "crypto"
import express from "express"
import request from "supertest"
import mongoose from "mongoose"
import { startDb, stopDb, clearDb, makeJwt, createSchool, createClass, createUser } from "./helpers.js"
import { Attendance } from "../models/Attendance.js"
import { Class } from "../models/Class.js"
import { User } from "../models/User.js"

// The report-card page goes through Puppeteer in production; here the renderer is replaced by one that
// records the page text it was given, so the tests can read what the PDF would say.
const rendered = vi.hoisted(() => ({ count: 0, htmls: [] as string[] }))
vi.mock("../lib/pdf.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pdf.js")>()
  return {
    ...actual,
    renderHtmlToPdf: vi.fn(async (html: string) => {
      rendered.count++
      rendered.htmls.push(html)
      return Buffer.from(`%PDF-1.4 ${html.length}`)
    }),
  }
})

const { default: studentRouter } = await import("../routes/student.js")
const { default: teacherRouter } = await import("../routes/teacher.js")
const { default: parentRouter } = await import("../routes/parent.js")
const { default: schoolRouter } = await import("../routes/school.js")
const { default: marksRouter } = await import("../routes/marks.js")
const { requireAuth } = await import("../middleware/auth.js")
const { fetchReportCardData, fetchReportCardDataBatch } = await import("../services/reportCard.js")
const { buildReportCardHTML } = await import("../lib/reportCardTemplate.js")

const app = express()
app.use(express.json())
app.use("/api/student", requireAuth, studentRouter)
app.use("/api/teacher", requireAuth, teacherRouter)
app.use("/api/parent", requireAuth, parentRouter)
app.use("/api/school", requireAuth, schoolRouter)
app.use("/api/marks", requireAuth, marksRouter)

beforeAll(startDb)
afterAll(stopDb)
beforeEach(async () => {
  await clearDb()
  // clearDb() empties the model collections; the stored PDFs live in their own GridFS collections
  const db = mongoose.connection.db!
  await db.collection("pdf_reports.files").deleteMany({})
  await db.collection("pdf_reports.chunks").deleteMany({})
  rendered.count = 0
  rendered.htmls.length = 0
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-07T12:00:00+05:30"))
})
afterEach(() => {
  vi.useRealTimers()
})

// ── Fixed calendar and people ────────────────────────────────────────────────

const TODAY = "2026-10-07"
const START = "2026-08-01"
// Five sheets before the start, three on or after it. One period a day, so one sheet = one date.
const BEFORE_DATES = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-27", "2026-07-31"]
const AFTER_DATES = ["2026-08-04", "2026-08-18", "2026-08-25"]

type Status = "present" | "absent" | "late"
type Who = "asha" | "bharat"
interface Mark { id: mongoose.Types.ObjectId; name: string; status: Status }

// Asha:   before the start absent x5; on/after present, late, late.   Counted: 1 present, 2 late = (1 + 1) / 3 = 66.7 (67 if rounded)
// Bharat: before the start present x5; on/after absent, present, late. Counted: 1 present, 1 late, 1 absent = 1.5 / 3 = 50
// If the 5 early sheets were wrongly counted: Asha would show 8 sheets = 25, Bharat 8 sheets = 81.3.
const ASHA_AFTER: Status[] = ["present", "late", "late"]
const BHARAT_AFTER: Status[] = ["absent", "present", "late"]

interface Expected { total: number; present: number; late: number; absent: number; rate: number | null; days?: number }
const FIGURE: Record<Who, Expected> = {
  asha:   { total: 3, present: 1, late: 2, absent: 0, rate: 66.7 },
  bharat: { total: 3, present: 1, late: 1, absent: 1, rate: 50 },
}
const NOTHING: Expected = { total: 0, present: 0, late: 0, absent: 0, rate: null }

async function sheet(
  schoolId: mongoose.Types.ObjectId | undefined,
  classId: mongoose.Types.ObjectId,
  date: string,
  period: number,
  marks: Mark[],
) {
  return Attendance.create({
    ...(schoolId ? { school_id: schoolId } : {}),
    class_id: classId, date, period,
    records: marks.map(m => ({ student_id: m.id, student_name: m.name, status: m.status })),
  })
}

// Writes a sheet straight into the collection, the way legacy rows may exist (string ids and so on).
async function rawSheet(
  schoolId: mongoose.Types.ObjectId,
  classId: mongoose.Types.ObjectId,
  date: string,
  period: number,
  rows: Array<{ student_id: unknown; status: Status }>,
) {
  await mongoose.connection.db!.collection("attendances").insertOne({
    school_id: schoolId, class_id: classId, date, period, subject: "",
    records: rows.map(r => ({ student_id: r.student_id, student_name: "raw", status: r.status })),
  })
}

interface WorldOptions { start?: string | null; seed?: boolean; grade?: number; section?: string; name?: string }

// One school, one class (Class 7A unless overridden), a teacher, an admin, three students and a parent for each of two.
async function world(opts: WorldOptions = {}) {
  const start = opts.start === undefined ? START : opts.start
  const school = await createSchool()
  const teacher = await createUser(school._id, "teacher")
  const admin = await createUser(school._id, "admin")
  const cls = await createClass(school._id, teacher._id, {
    grade: opts.grade ?? 7, section: opts.section ?? "A", year_start: start,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
  })
  const asha = await createUser(school._id, "student", cls._id, { name: "Asha Rao" })
  const bharat = await createUser(school._id, "student", cls._id, { name: "Bharat Nair" })
  const chandra = await createUser(school._id, "student", cls._id, { name: "Chandra Iyer" })
  const parents = {
    asha:   await createUser(school._id, "parent", undefined, { linked_student_id: asha._id }),
    bharat: await createUser(school._id, "parent", undefined, { linked_student_id: bharat._id }),
  }
  if (opts.seed !== false) {
    for (const date of BEFORE_DATES) {
      await sheet(school._id, cls._id, date, 1, [mark(asha, "absent"), mark(bharat, "present")])
    }
    for (let i = 0; i < AFTER_DATES.length; i++) {
      await sheet(school._id, cls._id, AFTER_DATES[i], 1, [mark(asha, ASHA_AFTER[i]), mark(bharat, BHARAT_AFTER[i])])
    }
  }
  return { school, teacher, admin, cls, asha, bharat, chandra, parents }
}
type World = Awaited<ReturnType<typeof world>>

function mark(user: { _id: mongoose.Types.ObjectId; name: string }, status: Status): Mark {
  return { id: user._id, name: user.name, status }
}

// The stored date is changed straight in the collection (the admin screen's own rules are tested elsewhere).
async function setStart(w: World, date: string | null) {
  await Class.collection.updateOne({ _id: w.cls._id }, { $set: { year_start: date } })
}

const auth = (u: { _id: unknown; role: string }) => `Bearer ${makeJwt(String(u._id), u.role)}`

async function getJson(
  path: string,
  who: { _id: unknown; role: string },
  query: Record<string, string> = {},
): Promise<unknown> {
  const res = await request(app).get(path).query(query).set("Authorization", auth(who))
  expect(res.status, `${path} answered ${res.status}`).toBe(200)
  return res.body
}

// ── A common shape for what every reader says about one student ──────────────

interface Seen {
  total: number; present: number; late: number; absent: number
  rate: number | null          // null when nothing was counted
  recorded: boolean
  days: number                 // distinct days (dashboard only)
  counted_from: unknown        // undefined = the field is missing from the answer
  counted_class_label: unknown
}
type Field = "total" | "present" | "late" | "absent" | "rate" | "recorded" | "days"

const BLANK: Seen = {
  total: 0, present: 0, late: 0, absent: 0, rate: null, recorded: false, days: 0,
  counted_from: undefined, counted_class_label: undefined,
}

interface Slot { total: number; present: number; late: number; absent: number; rate: number; recorded: boolean }
interface CountedBody { counted_from?: unknown; counted_class_label?: unknown }

function fromSlot(s: Slot | undefined, b: CountedBody): Seen {
  return {
    ...BLANK,
    ...(s ? {
      total: s.total, present: s.present, late: s.late, absent: s.absent,
      rate: s.total > 0 ? s.rate : null, recorded: s.recorded,
    } : {}),
    counted_from: b.counted_from,
    counted_class_label: b.counted_class_label,
  }
}

interface Reader {
  name: string
  fields: Field[]            // what this reader reports (the others are not compared)
  counted: boolean           // carries counted_from / counted_class_label
  classFromStudent: boolean  // the class is the student's own class (not a class id in the URL)
  range: boolean             // accepts a from/to range
  read: (w: World, who: Who, q?: { from: string; to: string }) => Promise<Seen>
}

const DEFAULT_RANGE = { from: "2026-06-01", to: TODAY }
const ALL_SIX: Field[] = ["total", "present", "late", "absent", "rate", "recorded"]
const FOUR: Field[] = ["total", "present", "late", "absent"]

const defineReader = (r: Reader): Reader => r

const R = {
  dashboard: defineReader({
    name: "student GET /dashboard",
    fields: ["total", "present", "rate", "days"],
    counted: true, classFromStudent: true, range: false,
    read: async (w, who) => {
      const b = await getJson("/api/student/dashboard", w[who]) as
        { days_total: number; days_present: number; days_recorded: number; attendance_rate: number } & CountedBody
      return {
        ...BLANK,
        total: b.days_total, present: b.days_present,
        rate: b.days_total > 0 ? b.attendance_rate : null, days: b.days_recorded,
        counted_from: b.counted_from, counted_class_label: b.counted_class_label,
      }
    },
  }),

  studentAttendance: defineReader({
    name: "student GET /attendance (this_year)",
    fields: ALL_SIX,
    counted: true, classFromStudent: true, range: false,
    read: async (w, who) => {
      const b = await getJson("/api/student/attendance", w[who]) as { summary?: { this_year?: Slot } } & CountedBody
      return fromSlot(b.summary?.this_year, b)
    },
  }),

  studentRange: defineReader({
    name: "student GET /attendance/range",
    fields: ALL_SIX,
    counted: true, classFromStudent: true, range: true,
    read: async (w, who, q = DEFAULT_RANGE) => {
      const b = await getJson("/api/student/attendance/range", w[who], q) as { result?: Slot } & CountedBody
      return fromSlot(b.result, b)
    },
  }),

  parent: defineReader({
    name: "parent GET /child/attendance",
    fields: ["total", "present", "late", "absent", "rate"],
    counted: true, classFromStudent: true, range: false,
    read: async (w, who) => {
      const b = await getJson("/api/parent/child/attendance", w.parents[who]) as
        { total: number; present: number; late: number; absent: number; rate: number | null } & CountedBody
      return {
        ...BLANK,
        total: b.total, present: b.present, late: b.late, absent: b.absent,
        rate: b.total > 0 ? b.rate : null,
        counted_from: b.counted_from, counted_class_label: b.counted_class_label,
      }
    },
  }),

  teacherStats: defineReader({
    name: "teacher GET /attendance-stats (this_year)",
    fields: ALL_SIX,
    counted: true, classFromStudent: false, range: false,
    read: async (w, who) => {
      const b = await getJson("/api/teacher/attendance-stats", w.teacher, { class_id: w.cls._id.toString() }) as
        { students?: Array<{ student_id: string; this_year: Slot }> } & CountedBody
      const row = (b.students ?? []).find(s => s.student_id === w[who]._id.toString())
      return fromSlot(row?.this_year, b)
    },
  }),

  teacherRange: defineReader({
    name: "teacher GET /attendance-range",
    fields: ALL_SIX,
    counted: true, classFromStudent: false, range: true,
    read: async (w, who, q = DEFAULT_RANGE) => {
      const b = await getJson("/api/teacher/attendance-range", w.teacher, { class_id: w.cls._id.toString(), ...q }) as
        { students?: Array<{ student_id: string; slot: Slot }> } & CountedBody
      const row = (b.students ?? []).find(s => s.student_id === w[who]._id.toString())
      return fromSlot(row?.slot, b)
    },
  }),

  teacherStudentAttendance: defineReader({
    name: "teacher GET /student-attendance (the student's own list)",
    fields: FOUR,
    counted: true, classFromStudent: true, range: false,
    read: async (w, who) => {
      const b = await getJson("/api/teacher/student-attendance", w[who]) as { records?: Array<{ status: string }> } & CountedBody
      const recs = b.records ?? []
      return {
        ...BLANK,
        total: recs.length,
        present: recs.filter(r => r.status === "present").length,
        late: recs.filter(r => r.status === "late").length,
        absent: recs.filter(r => r.status === "absent").length,
        counted_from: b.counted_from, counted_class_label: b.counted_class_label,
      }
    },
  }),

  studentDetail: defineReader({
    name: "admin GET /student-detail/:id",
    fields: ["total", "present", "late", "absent", "rate"],
    counted: true, classFromStudent: true, range: false,
    read: async (w, who) => {
      const b = await getJson(`/api/school/student-detail/${w[who]._id}`, w.admin) as
        { attendance_rate: number | null; attendance_breakdown: { present: number; late: number; absent: number; total: number } } & CountedBody
      const t = b.attendance_breakdown
      return {
        ...BLANK,
        total: t.total, present: t.present, late: t.late, absent: t.absent,
        rate: t.total > 0 ? b.attendance_rate : null,
        counted_from: b.counted_from, counted_class_label: b.counted_class_label,
      }
    },
  }),

  adminDetail: defineReader({
    name: "admin GET /student-attendance-detail/:id",
    fields: ["total", "present", "late", "absent", "rate"],
    counted: true, classFromStudent: true, range: true,
    read: async (w, who, q) => {
      const query: Record<string, string> = q ? { period: "custom", from: q.from, to: q.to } : { period: "year" }
      const b = await getJson(`/api/school/student-attendance-detail/${w[who]._id}`, w.admin, query) as
        { summary: { total: number; present: number; late: number; absent: number; rate: number | null } } & CountedBody
      const s = b.summary
      return {
        ...BLANK,
        total: s.total, present: s.present, late: s.late, absent: s.absent,
        rate: s.total > 0 ? s.rate : null,
        counted_from: b.counted_from, counted_class_label: b.counted_class_label,
      }
    },
  }),

  // EXTRA reader found in the code (not in the brief): the attendance % in the teacher's student-progress list.
  teacherProgress: defineReader({
    name: "teacher GET /student-progress (attendance %)",
    fields: ["rate"],
    counted: false, classFromStudent: false, range: false,
    read: async (w, who) => {
      const b = await getJson("/api/teacher/student-progress", w.teacher, { class_id: w.cls._id.toString() }) as
        { progress?: Array<{ student_id: string; attendance: number | null }> }
      const row = (b.progress ?? []).find(p => p.student_id === w[who]._id.toString())
      return { ...BLANK, rate: row?.attendance ?? null }
    },
  }),
}

const READERS: Reader[] = Object.values(R)
const RANGE_READERS = READERS.filter(r => r.range)
const OWN_CLASS_READERS = READERS.filter(r => r.classFromStudent)

function expectFigures(seen: Seen, reader: Reader, e: Expected) {
  const want: Record<Field, number | boolean | null> = {
    total: e.total, present: e.present, late: e.late, absent: e.absent, rate: e.rate,
    recorded: e.total > 0, days: e.days ?? e.total,
  }
  for (const f of reader.fields) expect(seen[f], `${reader.name}: ${f}`).toBe(want[f])
}

// label === undefined means "not checked"
function expectCounted(seen: Seen, reader: Reader, from: string | null, label?: string | null) {
  if (!reader.counted) return
  expect(seen.counted_from, `${reader.name}: counted_from`).toBe(from)
  if (label !== undefined) expect(seen.counted_class_label, `${reader.name}: counted_class_label`).toBe(label)
}

async function waitUntil(check: () => Promise<boolean>, what: string, maxMs = 5000): Promise<void> {
  const started = performance.now()
  while (performance.now() - started < maxMs) {
    if (await check()) return
    await new Promise<void>(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for: ${what}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PARITY MATRIX
// ─────────────────────────────────────────────────────────────────────────────
describe("1. parity matrix: every reader shows the same 3 counted sheets", () => {
  for (const reader of READERS) {
    for (const who of ["asha", "bharat"] as const) {
      it(`${reader.name}, ${who}: only the 3 sheets on/after ${START} are counted`, async () => {
        const w = await world()
        const seen = await reader.read(w, who)
        expectFigures(seen, reader, FIGURE[who])
        expectCounted(seen, reader, START, "Class 7A")
      })
    }
  }

  for (const who of ["asha", "bharat"] as const) {
    it(`the parent's figure equals the student's own figure (${who}), to one decimal`, async () => {
      const w = await world()
      const own = await R.studentAttendance.read(w, who)
      const par = await R.parent.read(w, who)
      for (const f of ["total", "present", "late", "absent", "rate"] as const) {
        expect(par[f], `parent vs student: ${f}`).toBe(own[f])
      }
      // Asha's 66.666... must read 66.7 in the parent portal too (the parent route rounded to a whole number)
      expect(par.rate).toBe(FIGURE[who].rate)
    })
  }
})

describe("1b. class totals for the teacher", () => {
  // Asha + Bharat: present 2, late 3, absent 1, total 6 = (2 + 1.5) / 6 = 58.3 (58 if rounded). Chandra has no marks.
  const CLASS_FIGURE = { total: 6, present: 2, late: 3, absent: 1, rate: 58.3, recorded: true }

  it("attendance-stats class_total.this_year counts only the sheets from the start date", async () => {
    const w = await world()
    const b = await getJson("/api/teacher/attendance-stats", w.teacher, { class_id: w.cls._id.toString() }) as
      { class_total: { this_year: Slot } } & CountedBody
    expect(b.class_total.this_year).toEqual(CLASS_FIGURE)
    expect(b.counted_from).toBe(START)
    expect(b.counted_class_label).toBe("Class 7A")
  })

  it("attendance-range class_total counts only the sheets from the start date", async () => {
    const w = await world()
    const b = await getJson("/api/teacher/attendance-range", w.teacher, { class_id: w.cls._id.toString(), ...DEFAULT_RANGE }) as
      { class_total: Slot } & CountedBody
    expect(b.class_total).toEqual(CLASS_FIGURE)
    expect(b.counted_from).toBe(START)
    expect(b.counted_class_label).toBe("Class 7A")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOVE LATER AND BACK
// ─────────────────────────────────────────────────────────────────────────────
describe("2. moving the start date later hides sheets and moving it back brings them back", () => {
  for (const reader of READERS) {
    it(`${reader.name}: ${START} gives 3, 2026-09-01 gives 0, ${START} again gives 3`, async () => {
      const w = await world()

      expectFigures(await reader.read(w, "asha"), reader, FIGURE.asha)

      await setStart(w, "2026-09-01")
      const hidden = await reader.read(w, "asha")
      expectFigures(hidden, reader, NOTHING)
      expectCounted(hidden, reader, "2026-09-01", "Class 7A")
      // nothing was deleted: all 8 sheets are still stored
      expect(await Attendance.countDocuments({ class_id: w.cls._id })).toBe(8)

      await setStart(w, START)
      const back = await reader.read(w, "asha")
      expectFigures(back, reader, FIGURE.asha)
      expectCounted(back, reader, START, "Class 7A")
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────
describe("3. boundary: the start day counts, the day before does not", () => {
  for (const reader of READERS) {
    it(`${reader.name}: start 2026-07-31 counts the 07-31 sheet (and not 07-27); start 2026-08-05 drops the 08-04 sheet`, async () => {
      const w = await world()

      // Asha from 07-31: absent (07-31), present (08-04), late, late = 4 sheets, 1 present 2 late 1 absent = 2 / 4 = 50
      await setStart(w, "2026-07-31")
      const onStartDay = await reader.read(w, "asha")
      expectFigures(onStartDay, reader, { total: 4, present: 1, late: 2, absent: 1, rate: 50 })
      expectCounted(onStartDay, reader, "2026-07-31")

      // Asha from 08-05: the 08-04 sheet is the day before the start. late, late = 2 sheets, 1 / 2 = 50
      await setStart(w, "2026-08-05")
      const dayAfter = await reader.read(w, "asha")
      expectFigures(dayAfter, reader, { total: 2, present: 0, late: 2, absent: 0, rate: 50 })
      expectCounted(dayAfter, reader, "2026-08-05")
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. NULL DATE AND FUTURE DATE
// ─────────────────────────────────────────────────────────────────────────────
describe("4. a class with no stored date counts every sheet; a start in the future shows nothing", () => {
  for (const reader of READERS) {
    it(`${reader.name}: null date counts all 8 sheets and counted_from is null`, async () => {
      const w = await world({ start: null })
      const seen = await reader.read(w, "asha")
      // all 8 sheets: present 1, late 2, absent 5 = 2 / 8 = 25
      expectFigures(seen, reader, { total: 8, present: 1, late: 2, absent: 5, rate: 25 })
      expectCounted(seen, reader, null)
    })

    it(`${reader.name}: a start date in the future (2026-10-20) gives empty figures with recorded false`, async () => {
      const w = await world({ start: "2026-10-20" })
      const seen = await reader.read(w, "asha")
      expectFigures(seen, reader, NOTHING)
      expectCounted(seen, reader, "2026-10-20", "Class 7A")
    })
  }

  it("with no stored date the shown default of 1 June is never applied: a 20 May sheet still counts", async () => {
    const w = await world({ start: null })
    await sheet(w.school._id, w.cls._id, "2026-05-20", 1, [mark(w.asha, "late")])
    // Readers that look at all time (the dashboard, the parent portal, the admin detail, the student's own list).
    // All 9 sheets: present 1, late 3, absent 5 = 2.5 / 9 = 27.8
    const expected: Expected = { total: 9, present: 1, late: 3, absent: 5, rate: 27.8 }
    for (const reader of [R.dashboard, R.parent, R.studentDetail, R.teacherStudentAttendance]) {
      const seen = await reader.read(w, "asha")
      expectFigures(seen, reader, expected)
      expectCounted(seen, reader, null)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. CUSTOM RANGE CLAMP AND SUMMARY WINDOWS
// ─────────────────────────────────────────────────────────────────────────────
describe("5. a custom range that begins before the start is clamped to the start", () => {
  for (const reader of RANGE_READERS) {
    it(`${reader.name}: from 2026-07-15 to 2026-08-10 returns only the 08-04 sheet`, async () => {
      const w = await world()
      // Before the start inside the range: 07-20, 07-21, 07-22, 07-27, 07-31 (all hidden). After: 08-04 present.
      const seen = await reader.read(w, "asha", { from: "2026-07-15", to: "2026-08-10" })
      expectFigures(seen, reader, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
      expectCounted(seen, reader, START, "Class 7A")
    })

    it(`${reader.name}: a range wholly before the start is empty (recorded false)`, async () => {
      const w = await world()
      const seen = await reader.read(w, "asha", { from: "2026-07-01", to: "2026-07-31" })
      expectFigures(seen, reader, NOTHING)
      expectCounted(seen, reader, START, "Class 7A")
    })

    it(`${reader.name}: a range wholly after the start is unchanged (08-10 to 08-20 holds the 08-18 sheet)`, async () => {
      const w = await world()
      const seen = await reader.read(w, "asha", { from: "2026-08-10", to: "2026-08-20" })
      expectFigures(seen, reader, { total: 1, present: 0, late: 1, absent: 0, rate: 50 })
      expectCounted(seen, reader, START, "Class 7A")
    })
  }

  // Start 2026-10-06 (Tuesday). Asha: 10-01 present and 10-05 absent are BEFORE the start; 10-06 late and 10-07 present count.
  // Today is Wednesday 10-07, the week began Monday 10-05, the month began 10-01.
  async function windowWorld() {
    const w = await world({ start: "2026-10-06", seed: false })
    await sheet(w.school._id, w.cls._id, "2026-10-01", 1, [mark(w.asha, "present")])
    await sheet(w.school._id, w.cls._id, "2026-10-05", 1, [mark(w.asha, "absent")])
    await sheet(w.school._id, w.cls._id, "2026-10-06", 1, [mark(w.asha, "late")])
    await sheet(w.school._id, w.cls._id, "2026-10-07", 1, [mark(w.asha, "present")])
    return w
  }
  // 10-06 late + 10-07 present: (1 + 0.5) / 2 = 75
  const TWO_SHEETS = { total: 2, present: 1, absent: 0, late: 1, rate: 75, recorded: true }
  const TODAY_ONLY = { total: 1, present: 1, absent: 0, late: 0, rate: 100, recorded: true }

  it("student GET /attendance: today / this_week / this_month / this_year never reach before the start", async () => {
    const w = await windowWorld()
    const b = await getJson("/api/student/attendance", w.asha) as
      { summary: Record<string, Slot>; records: unknown[] } & CountedBody
    expect(b.summary).toEqual({
      today: TODAY_ONLY,
      this_week: TWO_SHEETS,   // not 3: the Monday 10-05 sheet is before the start
      this_month: TWO_SHEETS,  // not 4
      this_year: TWO_SHEETS,
    })
    expect(b.counted_from).toBe("2026-10-06")
    expect(b.counted_class_label).toBe("Class 7A")
  })

  it("teacher GET /attendance-stats: the same four windows for the same student", async () => {
    const w = await windowWorld()
    const b = await getJson("/api/teacher/attendance-stats", w.teacher, { class_id: w.cls._id.toString() }) as
      { students: Array<{ student_id: string } & Record<"today" | "this_week" | "this_month" | "this_year", Slot>> } & CountedBody
    const row = b.students.find(s => s.student_id === w.asha._id.toString())
    expect(row).toBeDefined()
    expect(row!.today).toEqual(TODAY_ONLY)
    expect(row!.this_week).toEqual(TWO_SHEETS)
    expect(row!.this_month).toEqual(TWO_SHEETS)
    expect(row!.this_year).toEqual(TWO_SHEETS)
    expect(b.counted_from).toBe("2026-10-06")
  })

  it("student GET /dashboard counts the same 2 sheets on 2 days", async () => {
    const w = await windowWorld()
    const seen = await R.dashboard.read(w, "asha")
    expectFigures(seen, R.dashboard, { total: 2, present: 1, late: 1, absent: 0, rate: 75, days: 2 })
    expect(seen.counted_from).toBe("2026-10-06")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. PARENT
// ─────────────────────────────────────────────────────────────────────────────
describe("6. parent portal", () => {
  it("a child who moved from class 7A to class 8B: the parent's figure equals the student's (current class only)", async () => {
    const w = await world()
    const classB = await createClass(w.school._id, w.teacher._id, { grade: 8, section: "B", year_start: "2026-09-01" })
    await User.updateOne({ _id: w.asha._id }, { $set: { class_id: classB._id } })
    await sheet(w.school._id, classB._id, "2026-09-10", 1, [mark(w.asha, "present")])
    await sheet(w.school._id, classB._id, "2026-09-11", 1, [mark(w.asha, "late")])

    // Class 8B from 2026-09-01: present + late = 1.5 / 2 = 75. The 8 sheets of class 7A are not counted.
    const expected: Expected = { total: 2, present: 1, late: 1, absent: 0, rate: 75 }
    for (const reader of OWN_CLASS_READERS) {
      const seen = await reader.read(w, "asha")
      expectFigures(seen, reader, expected)
      expectCounted(seen, reader, "2026-09-01", "Class 8B")
    }
  })

  it("a parent linked to a student of ANOTHER school gets empty figures and no sheets", async () => {
    const mine = await world()
    const theirs = await world()
    await User.updateOne({ _id: mine.parents.asha._id }, { $set: { linked_student_id: theirs.asha._id } })

    const body = await getJson("/api/parent/child/attendance", mine.parents.asha) as
      { records?: unknown[]; total?: number } & CountedBody
    expect(body.records ?? []).toEqual([])
    expect(body.total ?? 0).toBe(0)
    expect(JSON.stringify(body)).not.toContain(theirs.asha._id.toString())
    expect(body.counted_from).toBe(null)
    expect(body.counted_class_label).toBe(null)
  })

  it("a sheet that carries the parent's school id but belongs to the other school's class is not counted", async () => {
    const mine = await world()
    const theirs = await world()
    await User.updateOne({ _id: mine.parents.asha._id }, { $set: { linked_student_id: theirs.asha._id } })
    // A wrongly stamped sheet: the other school's class, the other school's student, but MY school's id
    await sheet(mine.school._id, theirs.cls._id, "2026-08-10", 2, [mark(theirs.asha, "present")])

    const seen = await R.parent.read(mine, "asha")
    expectFigures(seen, R.parent, NOTHING)
    expectCounted(seen, R.parent, null, null)
  })

  it("an inactive child gets empty figures", async () => {
    const w = await world()
    await User.updateOne({ _id: w.asha._id }, { $set: { is_active: false } })
    const seen = await R.parent.read(w, "asha")
    expectFigures(seen, R.parent, NOTHING)
    expectCounted(seen, R.parent, null, null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6b. FAIL CLOSED: the class cannot be found in the caller's school
// ─────────────────────────────────────────────────────────────────────────────
describe("6b. a class that cannot be found in the student's school gives empty figures", () => {
  async function strandedWorld(kind: "other school" | "no such class") {
    const w = await world()
    let classId: mongoose.Types.ObjectId
    let stampedWith: mongoose.Types.ObjectId
    if (kind === "other school") {
      const elsewhere = await createSchool()
      const foreignClass = await createClass(elsewhere._id, undefined, { grade: 9, section: "Z", year_start: "2000-01-01" })
      classId = foreignClass._id
      stampedWith = elsewhere._id
    } else {
      classId = new mongoose.Types.ObjectId()
      stampedWith = w.school._id
    }
    await sheet(stampedWith, classId, "2026-08-10", 1, [mark(w.asha, "present"), mark(w.bharat, "late")])
    await User.updateOne({ _id: w.asha._id }, { $set: { class_id: classId } })
    return w
  }

  for (const kind of ["other school", "no such class"] as const) {
    for (const reader of OWN_CLASS_READERS) {
      it(`${reader.name}: class in ${kind} -> empty figures, counted_from and counted_class_label null`, async () => {
        const w = await strandedWorld(kind)
        const seen = await reader.read(w, "asha")
        expectFigures(seen, reader, NOTHING)
        expectCounted(seen, reader, null, null)
      })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 6c. LABELS AND CALENDAR LISTS
// ─────────────────────────────────────────────────────────────────────────────
describe("6c. the class label and the calendar lists", () => {
  it("a custom-named class (class level 0) is labelled with its own name", async () => {
    const w = await world({ grade: 0, section: "S", name: "Nursery Sunflower" })
    for (const reader of [R.studentAttendance, R.parent, R.dashboard]) {
      const seen = await reader.read(w, "asha")
      expectCounted(seen, reader, START, "Nursery Sunflower")
    }
  })

  it("student GET /attendance records lists only the 3 counted sheets, newest first", async () => {
    const w = await world()
    const b = await getJson("/api/student/attendance", w.asha) as { records: unknown[] }
    expect(b.records).toEqual([
      { date: "2026-08-25", period: 1, subject: "", status: "late" },
      { date: "2026-08-18", period: 1, subject: "", status: "late" },
      { date: "2026-08-04", period: 1, subject: "", status: "present" },
    ])
  })

  it("teacher GET /student-attendance records lists only the 3 counted sheets, oldest first", async () => {
    const w = await world()
    const b = await getJson("/api/teacher/student-attendance", w.asha) as { records: unknown[] }
    expect(b.records).toEqual([
      { date: "2026-08-04", period: 1, subject: "", status: "present" },
      { date: "2026-08-18", period: 1, subject: "", status: "late" },
      { date: "2026-08-25", period: 1, subject: "", status: "late" },
    ])
  })

  it("admin GET /student-attendance-detail records lists only the 3 counted sheets, oldest first", async () => {
    const w = await world()
    const b = await getJson(`/api/school/student-attendance-detail/${w.asha._id}`, w.admin, { period: "year" }) as { records: unknown[] }
    expect(b.records).toEqual([
      { date: "2026-08-04", period: 1, subject: "", status: "present" },
      { date: "2026-08-18", period: 1, subject: "", status: "late" },
      { date: "2026-08-25", period: 1, subject: "", status: "late" },
    ])
  })

  it("parent GET /child/attendance records lists only the 3 counted sheets", async () => {
    const w = await world()
    const b = await getJson("/api/parent/child/attendance", w.parents.asha) as { records: Array<{ date: string }> }
    expect(b.records.map(r => r.date).sort()).toEqual(AFTER_DATES)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. REPORT CARD
// ─────────────────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// "Attendance (from <date>)" with the date as 2026-08-01, 1 Aug 2026 or 1 August 2026 (the wording of the date is
// not fixed by the rule; the words around it are).
function fromLabel(ymd: string): RegExp {
  const [y, m, d] = ymd.split("-")
  const day = String(Number(d))
  const month = MONTH_NAMES[Number(m) - 1]
  const short = month.slice(0, 3)
  return new RegExp(`Attendance \\(from (${ymd}|0?${day} ${short}t? ${y}|0?${day} ${month} ${y})\\)`)
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex")

async function downloadOwnCard(w: World, who: Who = "asha"): Promise<void> {
  const res = await request(app).get("/api/marks/my-report-card").set("Authorization", auth(w[who]))
  expect(res.status, "my-report-card").toBe(200)
}

async function storedReportCards() {
  return mongoose.connection.db!.collection("pdf_reports.files").find({ "metadata.kind": "report-card" }).toArray()
}

describe("7. report card", () => {
  it("fetchReportCardData: attendance is the 3 counted sheets and the page says where it starts", async () => {
    const w = await world()
    const data = await fetchReportCardData(
      { name: w.asha.name, class_id: w.cls._id, school_id: w.school._id },
      w.asha._id.toString(),
    )
    expect(data.attPct).toBe(66.7)
    expect(buildReportCardHTML(data)).toMatch(fromLabel(START))
  })

  it("fetchReportCardDataBatch: each student gets the counted figure and the page says where it starts", async () => {
    const w = await world()
    const entries = await fetchReportCardDataBatch([
      { _id: w.asha._id, name: w.asha.name, class_id: w.cls._id, school_id: w.school._id },
      { _id: w.bharat._id, name: w.bharat.name, class_id: w.cls._id, school_id: w.school._id },
    ])
    const asha = entries.find(e => e.studentId === w.asha._id.toString())
    const bharat = entries.find(e => e.studentId === w.bharat._id.toString())
    expect(asha?.attPct).toBe(66.7)
    expect(bharat?.attPct).toBe(50)
    expect(buildReportCardHTML(asha!)).toMatch(fromLabel(START))
    expect(buildReportCardHTML(bharat!)).toMatch(fromLabel(START))
  })

  it("with no stored date the figure covers every sheet and the page has no 'from' wording", async () => {
    const w = await world({ start: null })
    const data = await fetchReportCardData(
      { name: w.asha.name, class_id: w.cls._id, school_id: w.school._id },
      w.asha._id.toString(),
    )
    expect(data.attPct).toBe(25)
    expect(buildReportCardHTML(data)).not.toContain("Attendance (from")
  })

  it("a class that cannot be found in the school gives no attendance figure", async () => {
    const w = await world()
    const elsewhere = await createSchool()
    const foreignClass = await createClass(elsewhere._id, undefined, { grade: 9, section: "Z", year_start: "2000-01-01" })
    await sheet(elsewhere._id, foreignClass._id, "2026-08-10", 1, [mark(w.asha, "present")])
    const data = await fetchReportCardData(
      { name: w.asha.name, class_id: foreignClass._id, school_id: w.school._id },
      w.asha._id.toString(),
    )
    expect(data.attPct).toBe(null)
    expect(buildReportCardHTML(data)).not.toContain("Attendance (from")
  })

  it("the student's downloaded page says 'Attendance (from <date>)' and shows 66.7%", async () => {
    const w = await world()
    await downloadOwnCard(w)
    expect(rendered.htmls).toHaveLength(1)
    expect(rendered.htmls[0]).toMatch(fromLabel(START))
    expect(rendered.htmls[0]).toContain("66.7%")
  })

  it("changing the class start changes the page, so the stored PDF is rebuilt and the older copy is removed", async () => {
    const w = await world()

    await downloadOwnCard(w)
    expect(rendered.count).toBe(1)
    expect(await storedReportCards()).toHaveLength(1)

    // Start moved later: every sheet is hidden, the page now says N/A from 2026-09-01
    await setStart(w, "2026-09-01")
    await downloadOwnCard(w)
    expect(rendered.count).toBe(2)
    expect(rendered.htmls[1]).toMatch(fromLabel("2026-09-01"))
    expect(rendered.htmls[1]).not.toBe(rendered.htmls[0])
    await waitUntil(async () => (await storedReportCards()).length === 1, "the older stored copy to be removed")
    const [second] = await storedReportCards()
    expect(second.metadata.html_hash).toBe(sha256(rendered.htmls[1]))

    // Start moved back: the original page is rebuilt (same words, same date of issue) and again only one copy is kept
    await setStart(w, START)
    await downloadOwnCard(w)
    expect(rendered.count).toBe(3)
    expect(rendered.htmls[2]).toBe(rendered.htmls[0])
    await waitUntil(async () => (await storedReportCards()).length === 1, "the middle copy to be removed")
    const [third] = await storedReportCards()
    expect(third.metadata.html_hash).toBe(sha256(rendered.htmls[2]))
  })

  it("downloading again without any change reuses the stored PDF", async () => {
    const w = await world()
    await downloadOwnCard(w)
    await downloadOwnCard(w)
    expect(rendered.count).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. LEGACY ROWS: only the date window is new
// ─────────────────────────────────────────────────────────────────────────────
describe("8. legacy rows keep today's behaviour, except that the date window applies", () => {
  const OWN = [R.dashboard, R.studentAttendance, R.studentRange]

  async function readAll(w: World) {
    return {
      dash:  await R.dashboard.read(w, "asha"),
      att:   await R.studentAttendance.read(w, "asha"),
      range: await R.studentRange.read(w, "asha"),
    }
  }

  it("a sheet whose only row for the student has a string student_id is ignored by all three, even after the start", async () => {
    const w = await world({ seed: false })
    await rawSheet(w.school._id, w.cls._id, "2026-08-10", 1, [{ student_id: w.asha._id.toString(), status: "present" }])
    const seen = await readAll(w)
    expectFigures(seen.dash, R.dashboard, NOTHING)
    expectFigures(seen.att, R.studentAttendance, NOTHING)
    expectFigures(seen.range, R.studentRange, NOTHING)
    for (const reader of OWN) expectCounted(await reader.read(w, "asha"), reader, START)
  })

  it("a sheet with an ObjectId row AND a string row, dated after the start: the dashboard counts 2, the other two count 1", async () => {
    const w = await world({ seed: false })
    await rawSheet(w.school._id, w.cls._id, "2026-08-10", 1, [
      { student_id: w.asha._id, status: "present" },
      { student_id: w.asha._id.toString(), status: "absent" },
    ])
    const seen = await readAll(w)
    // dashboard: 2 period rows on 1 day, 1 present = 1 / 2 = 50
    expectFigures(seen.dash, R.dashboard, { total: 2, present: 1, late: 0, absent: 1, rate: 50, days: 1 })
    expectFigures(seen.att, R.studentAttendance, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
    expectFigures(seen.range, R.studentRange, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
  })

  it("the same mixed sheet dated BEFORE the start is not counted by any of the three", async () => {
    const w = await world({ seed: false })
    await rawSheet(w.school._id, w.cls._id, "2026-07-10", 1, [
      { student_id: w.asha._id, status: "present" },
      { student_id: w.asha._id.toString(), status: "absent" },
    ])
    const seen = await readAll(w)
    expectFigures(seen.dash, R.dashboard, NOTHING)
    expectFigures(seen.att, R.studentAttendance, NOTHING)
    expectFigures(seen.range, R.studentRange, NOTHING)
    expect(seen.dash.counted_from).toBe(START)
  })

  it("a legacy sheet with no school id is counted when it is on/after the start, and not before it", async () => {
    const w = await world({ seed: false })
    await sheet(undefined, w.cls._id, "2026-08-10", 1, [mark(w.asha, "present")])
    await sheet(undefined, w.cls._id, "2026-07-10", 1, [mark(w.asha, "absent")])
    const seen = await readAll(w)
    expectFigures(seen.dash, R.dashboard, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
    expectFigures(seen.att, R.studentAttendance, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
    expectFigures(seen.range, R.studentRange, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
  })

  it("a sheet stamped with another school id is counted as today when on/after the start, and not before it", async () => {
    const w = await world({ seed: false })
    const stranger = await createSchool()
    await sheet(stranger._id, w.cls._id, "2026-08-10", 1, [mark(w.asha, "present")])
    await sheet(stranger._id, w.cls._id, "2026-07-10", 1, [mark(w.asha, "absent")])
    const seen = await readAll(w)
    expectFigures(seen.dash, R.dashboard, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
    expectFigures(seen.att, R.studentAttendance, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
    expectFigures(seen.range, R.studentRange, { total: 1, present: 1, late: 0, absent: 0, rate: 100 })
  })

  it("a student with no class gets empty figures from the dashboard-side readers, as before", async () => {
    const w = await world()
    await User.updateOne({ _id: w.asha._id }, { $set: { class_id: null } })
    const att = await R.studentAttendance.read(w, "asha")
    const range = await R.studentRange.read(w, "asha")
    expectFigures(att, R.studentAttendance, NOTHING)
    expectFigures(range, R.studentRange, NOTHING)
  })
})
