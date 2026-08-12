import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/teacher.ts — Teacher-specific routes mounted at /api/teacher.
// Handles attendance recording (per date + period), fetching a teacher's
// assigned classes, and the student timetable read-only view.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { User } from "../models/User.js"
import { Class } from "../models/Class.js"
import mongoose from "mongoose"
import { Notification } from "../models/Notification.js"
import { NotifRead } from "../models/NotifRead.js"
import { TeacherSession } from "../models/TeacherSession.js"
import { Module } from "../models/Module.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { Attendance } from "../models/Attendance.js"
import { todayIST, weekStartIST, academicYearStartIST } from "../lib/dateHelpers.js"
import { calculateAttendanceRate } from "../lib/attendanceHelpers.js"

const router = Router()
router.use(requireAuth)

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TeacherInfo { school_id: string; role: string }

async function resolveTeacher(userId: string): Promise<{ teacher: TeacherInfo } | { error: string; status: number }> {
  const t = await User.findById(userId).select("school_id role").lean()
  if (!t) return { error: "User not found", status: 404 }
  if (!["teacher", "admin", "super_admin"].includes(t.role as string)) return { error: "Teacher access required", status: 403 }
  if (!t.school_id) return { error: "No school assigned to this account", status: 400 }
  return { teacher: { school_id: (t.school_id as { toString(): string }).toString(), role: t.role as string } }
}

const ATT_EMPTY = { total: 0, present: 0, absent: 0, late: 0, rate: 0, recorded: false }

// ── POST /api/teacher/attendance ──────────────────────────────────────────────

router.post("/attendance", async (req: AuthRequest, res: Response) => {
  const ctx = await resolveTeacher(req.userId!)
  if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

  const { class_id, date, period, subject, records } = req.body as {
    class_id: string; date: string; period: number; subject?: string
    records: Array<{ student_id: string; student_name: string; status: "present" | "absent" | "late" }>
  }

  if (!class_id || !date || !period || !Array.isArray(records) || !records.length) {
    res.status(400).json({ error: "class_id, date, period, and records[] are required" }); return
  }
  if (records.length > 500) {
    res.status(400).json({ error: "records[] cannot exceed 500 entries" }); return
  }
  const VALID_STATUSES = ["present", "absent", "late"]
  for (const r of records) {
    if (!VALID_STATUSES.includes(r.status)) {
      res.status(400).json({ error: `Invalid status "${r.status}". Must be present, absent, or late.` }); return
    }
  }
  if (subject && subject.trim().length > 50) {
    res.status(400).json({ error: "Subject must be under 50 characters" }); return
  }

  const periodNum = Number(period)
  if (!Number.isInteger(periodNum) || periodNum < 1 || periodNum > 8) {
    res.status(400).json({ error: "period must be an integer between 1 and 8" }); return
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" }); return
  }

  // Reject invalid calendar dates (e.g. Feb 31) — Date constructor silently rolls over
  const parsedDate = new Date(date + "T00:00:00.000Z")
  if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    res.status(400).json({ error: "Invalid calendar date" }); return
  }

  // Reject future dates — attendance cannot be marked for days that haven't happened yet
  if (date > todayIST()) {
    res.status(400).json({ error: "Attendance cannot be marked for a future date" }); return
  }

  try {
    // Verify the class belongs to the teacher's school
    const cls = await Class.findOne({ _id: class_id, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) }).lean()
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    // Verify the teacher is assigned to this class (admins can mark for any class)
    if (ctx.teacher.role === "teacher") {
      const isAssigned = ((cls as unknown as { teachers?: Array<{ teacher_id: mongoose.Types.ObjectId }> }).teachers ?? [])
        .some(t => t.teacher_id.toString() === req.userId!)
      if (!isAssigned) {
        res.status(403).json({ error: "You are not assigned to this class" }); return
      }
    }

    // Prevent overwriting another teacher's attendance record
    const existing = await Attendance.findOne({
      class_id: new mongoose.Types.ObjectId(class_id), date, period
    }).select("teacher_id").lean() as { teacher_id?: { toString(): string } } | null

    if (existing && existing.teacher_id && existing.teacher_id.toString() !== req.userId!) {
      // Another teacher already marked attendance for this period — allow admins to overwrite
      if (ctx.teacher.role === "teacher") {
        res.status(403).json({ error: "Another teacher has already marked attendance for this period" }); return
      }
    }

    await Attendance.findOneAndUpdate(
      { class_id: new mongoose.Types.ObjectId(class_id), date, period },
      {
        $set: {
          school_id:  ctx.teacher.school_id,
          teacher_id: new mongoose.Types.ObjectId(req.userId!),
          class_id:   new mongoose.Types.ObjectId(class_id),
          date, period, subject: subject ?? "",
          records: records.map(r => ({
            student_id:   new mongoose.Types.ObjectId(r.student_id),
            student_name: r.student_name,
            status:       r.status,
          })),
        },
      },
      { upsert: true, returnDocument: "after" }
    )
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[teacher/attendance POST]")
    res.status(500).json({ error: "Failed to save attendance. Please try again." })
  }
})

// ── GET /api/teacher/attendance?class_id=&date=&period= ──────────────────────

router.get("/attendance", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveTeacher(req.userId!)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { class_id, date, period } = req.query as { class_id?: string; date?: string; period?: string }
    if (!class_id || !date) { res.status(400).json({ error: "class_id and date are required" }); return }

    const cls = await Class.findOne({ _id: class_id, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) }).lean()
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    const query: Record<string, unknown> = { class_id: new mongoose.Types.ObjectId(class_id), date }
    if (period) query.period = Number(period)

    const record = await Attendance.findOne(query).lean()
    res.json({ attendance: record ?? null })
  } catch (err) {
    logger.error({ err: err }, "[teacher/attendance GET]")
    res.status(500).json({ error: "Failed to load attendance" })
  }
})

// ── GET /api/teacher/attendance-stats?class_id= ──────────────────────────────
// Returns per-student + class-aggregate attendance percentages across 4 time
// ranges (today / this week / this month / this academic year) in one DB call.

router.get("/attendance-stats", async (req: AuthRequest, res: Response) => {
  const SAFE = { class_total: { today: ATT_EMPTY, this_week: ATT_EMPTY, this_month: ATT_EMPTY, this_year: ATT_EMPTY }, students: [] }
  try {
    const ctx = await resolveTeacher(req.userId!)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { class_id } = req.query as { class_id?: string }
    if (!class_id) { res.status(400).json({ error: "class_id is required" }); return }

    const cls = await Class.findOne({ _id: class_id, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) }).lean()
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    const db = mongoose.connection.db
    if (!db) { res.json(SAFE); return }

    const studentDocs = await User.find({ class_id, role: "student", is_active: true })
      .select("_id name").sort("name").lean()
    if (!studentDocs.length) { res.json(SAFE); return }

    const studentIds = studentDocs.map(s => s._id as mongoose.Types.ObjectId)
    const classOid   = new mongoose.Types.ObjectId(class_id)
    const today      = todayIST()
    const weekStart  = weekStartIST()
    const monthStart = `${today.slice(0, 7)}-01`
    const yearStart  = academicYearStartIST()

    // Single aggregation pass: group by student, conditional sums for each range
    const rows = await db.collection("attendances").aggregate([
      { $match: { class_id: classOid, date: { $gte: yearStart, $lte: today } } },
      { $match: { "records.student_id": { $in: studentIds } } },
      { $unwind: "$records" },
      { $match: { "records.student_id": { $in: studentIds } } },
      { $group: {
        _id: "$records.student_id",

        year_t: { $sum: 1 },
        year_p: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } },
        year_l: { $sum: { $cond: [{ $eq: ["$records.status", "late"]    }, 1, 0] } },
        year_a: { $sum: { $cond: [{ $eq: ["$records.status", "absent"]  }, 1, 0] } },

        month_t: { $sum: { $cond: [{ $gte: ["$date", monthStart] }, 1, 0] } },
        month_p: { $sum: { $cond: [{ $and: [{ $gte: ["$date", monthStart] }, { $eq: ["$records.status", "present"] }] }, 1, 0] } },
        month_l: { $sum: { $cond: [{ $and: [{ $gte: ["$date", monthStart] }, { $eq: ["$records.status", "late"]    }] }, 1, 0] } },
        month_a: { $sum: { $cond: [{ $and: [{ $gte: ["$date", monthStart] }, { $eq: ["$records.status", "absent"]  }] }, 1, 0] } },

        week_t: { $sum: { $cond: [{ $gte: ["$date", weekStart] }, 1, 0] } },
        week_p: { $sum: { $cond: [{ $and: [{ $gte: ["$date", weekStart] }, { $eq: ["$records.status", "present"] }] }, 1, 0] } },
        week_l: { $sum: { $cond: [{ $and: [{ $gte: ["$date", weekStart] }, { $eq: ["$records.status", "late"]    }] }, 1, 0] } },
        week_a: { $sum: { $cond: [{ $and: [{ $gte: ["$date", weekStart] }, { $eq: ["$records.status", "absent"]  }] }, 1, 0] } },

        day_t: { $sum: { $cond: [{ $eq: ["$date", today] }, 1, 0] } },
        day_p: { $sum: { $cond: [{ $and: [{ $eq: ["$date", today] }, { $eq: ["$records.status", "present"] }] }, 1, 0] } },
        day_l: { $sum: { $cond: [{ $and: [{ $eq: ["$date", today] }, { $eq: ["$records.status", "late"]    }] }, 1, 0] } },
        day_a: { $sum: { $cond: [{ $and: [{ $eq: ["$date", today] }, { $eq: ["$records.status", "absent"]  }] }, 1, 0] } },
      }},
    ]).toArray() as Array<{
      _id: mongoose.Types.ObjectId
      year_t: number; year_p: number; year_l: number; year_a: number
      month_t: number; month_p: number; month_l: number; month_a: number
      week_t: number; week_p: number; week_l: number; week_a: number
      day_t: number; day_p: number; day_l: number; day_a: number
    }>

    const statsById = new Map(rows.map(r => [r._id.toString(), r]))

    function toSlot(t: number, p: number, l: number, a: number) {
      if (!t) return ATT_EMPTY
      return { total: t, present: p, late: l, absent: a, rate: calculateAttendanceRate(p, l, t) ?? 0, recorded: true }
    }

    const students = studentDocs.map(s => {
      const sid = (s._id as mongoose.Types.ObjectId).toString()
      const r   = statsById.get(sid)
      if (!r) return { student_id: sid, name: s.name as string, today: ATT_EMPTY, this_week: ATT_EMPTY, this_month: ATT_EMPTY, this_year: ATT_EMPTY }
      return {
        student_id: sid, name: s.name as string,
        today:      toSlot(r.day_t,   r.day_p,   r.day_l,   r.day_a),
        this_week:  toSlot(r.week_t,  r.week_p,  r.week_l,  r.week_a),
        this_month: toSlot(r.month_t, r.month_p, r.month_l, r.month_a),
        this_year:  toSlot(r.year_t,  r.year_p,  r.year_l,  r.year_a),
      }
    })

    function classSlot(key: "today" | "this_week" | "this_month" | "this_year") {
      const rel = students.filter(s => s[key].recorded)
      if (!rel.length) return ATT_EMPTY
      const acc = rel.reduce((a, s) => ({
        total: a.total + s[key].total, present: a.present + s[key].present,
        late: a.late + s[key].late,    absent: a.absent  + s[key].absent,
      }), { total: 0, present: 0, late: 0, absent: 0 })
      return { ...acc, rate: calculateAttendanceRate(acc.present, acc.late, acc.total) ?? 0, recorded: true }
    }

    res.json({
      class_total: {
        today:      classSlot("today"),
        this_week:  classSlot("this_week"),
        this_month: classSlot("this_month"),
        this_year:  classSlot("this_year"),
      },
      students,
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher/attendance-stats]")
    res.json(SAFE)
  }
})

// ── GET /api/teacher/attendance-range?class_id=&from=YYYY-MM-DD&to=YYYY-MM-DD ─
// Returns per-student + class-aggregate stats for a custom date range.
// Silently swaps from/to if entered in wrong order; caps to at today.

router.get("/attendance-range", async (req: AuthRequest, res: Response) => {
  const SAFE = { class_total: ATT_EMPTY, students: [] as { student_id: string; name: string; slot: typeof ATT_EMPTY }[] }
  try {
    const ctx = await resolveTeacher(req.userId!)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { class_id } = req.query as { class_id?: string }
    let from = (req.query.from as string) ?? ""
    let to   = (req.query.to   as string) ?? ""

    if (!class_id) { res.status(400).json({ error: "class_id is required" }); return }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRe.test(from) || !dateRe.test(to)) {
      res.status(400).json({ error: "from and to must be YYYY-MM-DD" }); return
    }

    if (from > to) { const tmp = from; from = to; to = tmp }
    const cap = todayIST()
    if (to > cap) to = cap

    const cls = await Class.findOne({ _id: class_id, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) }).lean()
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    const db = mongoose.connection.db
    if (!db) { res.json(SAFE); return }

    const studentDocs = await User.find({ class_id, role: "student", is_active: true })
      .select("_id name").sort("name").lean()
    if (!studentDocs.length) { res.json(SAFE); return }

    const studentIds = studentDocs.map(s => s._id as mongoose.Types.ObjectId)
    const classOid   = new mongoose.Types.ObjectId(class_id)

    const rows = await db.collection("attendances").aggregate([
      { $match: { class_id: classOid, date: { $gte: from, $lte: to } } },
      { $match: { "records.student_id": { $in: studentIds } } },
      { $unwind: "$records" },
      { $match: { "records.student_id": { $in: studentIds } } },
      { $group: {
        _id:     "$records.student_id",
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ["$records.status", "late"]    }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ["$records.status", "absent"]  }, 1, 0] } },
      }},
    ]).toArray() as Array<{ _id: mongoose.Types.ObjectId; total: number; present: number; late: number; absent: number }>

    const statsById = new Map(rows.map(r => [r._id.toString(), r]))

    function toSlot(t: number, p: number, l: number, a: number) {
      if (!t) return ATT_EMPTY
      return { total: t, present: p, late: l, absent: a, rate: calculateAttendanceRate(p, l, t) ?? 0, recorded: true }
    }

    const students = studentDocs.map(s => {
      const sid = (s._id as mongoose.Types.ObjectId).toString()
      const r   = statsById.get(sid)
      return {
        student_id: sid,
        name: s.name as string,
        slot: r ? toSlot(r.total, r.present, r.late, r.absent) : ATT_EMPTY,
      }
    })

    const recorded = students.filter(s => s.slot.recorded)
    const classTotal = (() => {
      if (!recorded.length) return ATT_EMPTY
      const acc = recorded.reduce((a, s) => ({
        total: a.total + s.slot.total, present: a.present + s.slot.present,
        late:  a.late  + s.slot.late,  absent:  a.absent  + s.slot.absent,
      }), { total: 0, present: 0, late: 0, absent: 0 })
      return { ...acc, rate: calculateAttendanceRate(acc.present, acc.late, acc.total) ?? 0, recorded: true }
    })()

    res.json({ class_total: classTotal, students, from, to })
  } catch (err) {
    logger.error({ err: err }, "[teacher/attendance-range]")
    res.json(SAFE)
  }
})

// ── GET /api/teacher/student-attendance ──────────────────────────────────────
// Student fetches their own full attendance history

router.get("/student-attendance", async (req: AuthRequest, res: Response) => {
  try {
    const student = await User.findById(req.userId!).select("class_id role").lean()
    if (!student) { res.status(404).json({ error: "User not found" }); return }
    if (student.role !== "student") { res.status(403).json({ error: "Student access only" }); return }
    if (!student.class_id) { res.json({ records: [] }); return }

    const docs = await Attendance.find({ class_id: student.class_id })
      .select("date period subject records")
      .sort({ date: 1, period: 1 })
      .lean() as unknown as Array<{
        date: string; period: number; subject: string
        records: Array<{ student_id: { toString(): string }; status: string }>
      }>

    const myId = req.userId!
    const result = docs.flatMap(doc => {
      const mine = doc.records.find(r => r.student_id.toString() === myId)
      if (!mine) return []
      return [{ date: doc.date, period: doc.period, subject: doc.subject, status: mine.status }]
    })

    res.json({ records: result })
  } catch (err) {
    logger.error({ err: err }, "[teacher/student-attendance]")
    res.status(500).json({ error: "Failed to load attendance" })
  }
})

// ── GET /api/teacher/class-students?class_id= ────────────────────────────────
// Teacher fetches students for any class in their school (for attendance)

router.get("/class-students", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveTeacher(req.userId!)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { class_id } = req.query as { class_id?: string }
    if (!class_id) { res.status(400).json({ error: "class_id is required" }); return }

    const cls = await Class.findOne({ _id: class_id, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) })
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    const students = await User.find({ class_id, role: "student", is_active: true })
      .select("name username is_active")
      .sort("name")
      .lean()

    res.json({
      students: students.map(s => ({
        id: (s._id as { toString(): string }).toString(),
        name: s.name,
        username: s.username,
        is_active: s.is_active,
      }))
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher/class-students]")
    res.status(500).json({ error: "Failed to load students" })
  }
})

// ── GET /api/teacher/my-class ─────────────────────────────────────────────────
// Returns the class assigned to this teacher (teacher_id = me)

router.get("/my-class", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveTeacher(req.userId!)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const cls = await Class.findOne({
      school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id),
      $or: [
        { teacher_id: new mongoose.Types.ObjectId(req.userId!) },
        { "teachers.teacher_id": new mongoose.Types.ObjectId(req.userId!) },
      ]
    }).select("grade section").lean()
    if (!cls) { res.json({ class: null, students: [] }); return }

    const students = await User.find({ class_id: cls._id, role: "student" })
      .select("name username is_active")
      .sort("name")
      .lean()

    res.json({
      class: {
        id: (cls._id as { toString(): string }).toString(),
        grade: cls.grade,
        section: cls.section,
        label: `Class ${cls.grade}${cls.section}`,
      },
      students: students.map(s => ({
        id: (s._id as { toString(): string }).toString(),
        name: s.name,
        username: s.username,
        is_active: s.is_active,
      })),
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher/my-class]")
    res.status(500).json({ error: "Failed to load class" })
  }
})

// ── GET /api/teacher/timetable?class_id= ─────────────────────────────────────
// Teacher fetches timetable for any class in their school

router.get("/timetable", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveTeacher(req.userId!)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { class_id } = req.query as { class_id?: string }
    if (!class_id) { res.status(400).json({ error: "class_id is required" }); return }

    const cls = await Class.findOne({ _id: class_id, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) })
      .select("grade section name timetable timetable_updated_by_name timetable_updated_at")
      .lean()
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    res.json({
      class: { id: (cls._id as { toString(): string }).toString(), grade: cls.grade, section: cls.section, name: cls.name ?? null },
      timetable: (cls.timetable ?? []).map(s => ({
        day: s.day, period: s.period, subject: s.subject,
        teacher_id: s.teacher_id?.toString() ?? null,
        start_time: s.start_time, end_time: s.end_time,
      })),
      timetable_updated_by_name: cls.timetable_updated_by_name ?? null,
      timetable_updated_at: cls.timetable_updated_at ?? null,
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher/timetable]")
    res.status(500).json({ error: "Failed to load timetable" })
  }
})

// ── PUT /api/teacher/timetable/:class_id ─────────────────────────────────────
// Teacher saves timetable (stores version history, max 2)

router.put("/timetable/:class_id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveTeacher(req.userId!)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { slots } = req.body as { slots: Array<{ day: string; period: number; subject: string; teacher_id?: string; start_time: string; end_time: string }> }
    if (!Array.isArray(slots)) { res.status(400).json({ error: "slots[] required" }); return }
    if (slots.length > 200) { res.status(400).json({ error: "Timetable cannot have more than 200 slots" }); return }
    const VALID_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    for (const slot of slots) {
      if (!VALID_DAYS.includes(slot.day)) { res.status(400).json({ error: `Invalid day: ${slot.day}` }); return }
      if (!Number.isInteger(slot.period) || slot.period < 1 || slot.period > 12) {
        res.status(400).json({ error: "Period must be an integer between 1 and 12" }); return
      }
      if (!slot.subject?.trim() || slot.subject.trim().length > 50) {
        res.status(400).json({ error: "Each slot must have a subject under 50 characters" }); return
      }
    }

    const [cls, editor] = await Promise.all([
      Class.findOne({ _id: req.params.class_id, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) }),
      User.findById(req.userId!).select("name").lean(),
    ])
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    const newSlots = slots.map(s => ({
      day: s.day, period: s.period, subject: s.subject,
      teacher_id: s.teacher_id ? new mongoose.Types.ObjectId(s.teacher_id) : null,
      start_time: s.start_time, end_time: s.end_time,
    })) as typeof cls.timetable

    const assignedSlots = slots.filter(s => s.teacher_id?.trim())
    if (assignedSlots.length > 0) {
      const orConditions = assignedSlots.map(s => ({
        timetable: {
          $elemMatch: {
            teacher_id: new mongoose.Types.ObjectId(s.teacher_id!),
            day: s.day,
            period: s.period,
          },
        },
      }))
      const conflictingClass = await Class.findOne({
        _id: { $ne: new mongoose.Types.ObjectId(String(req.params.class_id)) },
        school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id),
        $or: orConditions,
      }).select("name grade section").lean()
      if (conflictingClass) {
        const label = (conflictingClass as unknown as { name?: string | null }).name ?? `Class ${conflictingClass.grade}${conflictingClass.section}`
        res.status(409).json({ error: `Schedule conflict: a teacher is already assigned to ${label} on the same day and period.` }); return
      }
    }

    if (cls.timetable?.length) {
      const versions = cls.timetable_versions ?? []
      versions.push({
        slots: cls.timetable,
        updated_by_id: new mongoose.Types.ObjectId(cls.timetable_updated_by_id?.toString() ?? req.userId!),
        updated_by_name: cls.timetable_updated_by_name ?? (editor as { name: string } | null)?.name ?? "Unknown",
        updated_at: cls.timetable_updated_at ?? new Date(),
      } as never)
      cls.timetable_versions = versions.slice(-10) as typeof cls.timetable_versions
    }

    cls.timetable = newSlots
    cls.timetable_updated_by_id = new mongoose.Types.ObjectId(req.userId!)
    cls.timetable_updated_by_name = (editor as { name: string } | null)?.name ?? null
    cls.timetable_updated_at = new Date()
    await cls.save()
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[teacher/timetable PUT]")
    res.status(500).json({ error: "Failed to save timetable" })
  }
})

// ── GET /api/teacher/my-classes ───────────────────────────────────────────────
// Returns all classes assigned to this teacher (via teachers[])

router.get("/my-classes", async (req: AuthRequest, res: Response) => {
  try {
  const ctx = await resolveTeacher(req.userId!)
  if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

  const tid = new mongoose.Types.ObjectId(req.userId!)
  const classes = await Class.find({
    school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id),
    $or: [
      { teacher_id: tid },
      { "teachers.teacher_id": tid },
      { "timetable.teacher_id": tid },
    ],
  }).select("grade section name subjects timetable timetable_updated_by_name timetable_updated_at").lean()

  // resolve all teacher_ids across all class timetables into names
  const allTeacherIds = [...new Set(
    classes.flatMap(c => (c.timetable ?? []).map(s => s.teacher_id?.toString()).filter((id): id is string => Boolean(id)))
  )]
  const teacherDocs = allTeacherIds.length
    ? await User.find({ _id: { $in: allTeacherIds } }).select("name").lean()
    : []
  const teacherMap = Object.fromEntries(teacherDocs.map(t => [(t._id as { toString(): string }).toString(), t.name as string]))

  res.json({
    classes: classes.map(c => ({
      id: (c._id as { toString(): string }).toString(),
      grade: c.grade,
      section: c.section,
      name: c.name ?? null,
      subjects: c.subjects ?? [],
      timetable: (c.timetable ?? []).map(s => ({
        day: s.day, period: s.period, subject: s.subject,
        teacher_id: s.teacher_id?.toString() ?? null,
        teacher_name: s.teacher_id ? (teacherMap[s.teacher_id.toString()] ?? null) : null,
        start_time: s.start_time, end_time: s.end_time,
      })),
      timetable_updated_by_name: c.timetable_updated_by_name ?? null,
      timetable_updated_at: c.timetable_updated_at ?? null,
    })),
  })
  } catch (err) {
    logger.error({ err: err }, "[teacher/my-classes]")
    res.status(500).json({ error: "Failed to load classes" })
  }
})

// ── GET /api/teacher/student-timetable ───────────────────────────────────────
// Student fetches their own class timetable (read-only)

router.get("/student-timetable", async (req: AuthRequest, res: Response) => {
  try {
    const student = await User.findById(req.userId!).select("class_id school_id role").lean()
    if (!student) { res.status(404).json({ error: "User not found" }); return }
    if (student.role !== "student") { res.status(403).json({ error: "Student access only" }); return }
    if (!student.class_id) { res.json({ timetable: [], class: null }); return }

    const cls = await Class.findById(student.class_id)
      .select("grade section name subjects timetable timetable_updated_by_name timetable_updated_at")
      .lean()
    if (!cls) { res.json({ timetable: [], class: null }); return }

    const teacherIds = [...new Set((cls.timetable ?? []).map(s => s.teacher_id?.toString()).filter((id): id is string => Boolean(id)))]
    const teacherDocs = teacherIds.length
      ? await User.find({ _id: { $in: teacherIds } }).select("name").lean()
      : []
    const teacherMap = Object.fromEntries(teacherDocs.map(t => [(t._id as { toString(): string }).toString(), t.name as string]))

    res.json({
      class: { id: (cls._id as { toString(): string }).toString(), grade: cls.grade, section: cls.section, name: cls.name ?? null },
      subjects: cls.subjects ?? [],
      timetable: (cls.timetable ?? []).map(s => ({
        day: s.day, period: s.period, subject: s.subject,
        teacher_id: s.teacher_id?.toString() ?? null,
        teacher_name: s.teacher_id ? (teacherMap[s.teacher_id.toString()] ?? null) : null,
        start_time: s.start_time, end_time: s.end_time,
      })),
      timetable_updated_by_name: cls.timetable_updated_by_name ?? null,
      timetable_updated_at: cls.timetable_updated_at ?? null,
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher/student-timetable]")
    res.status(500).json({ error: "Failed to load timetable" })
  }
})

// ── GET /api/teacher/notifications ───────────────────────────────────────────
// Any authenticated user fetches their own notifications (role + class aware)
router.get("/notifications", async (req: AuthRequest, res: Response) => {
  try {
  const user = await User.findById(req.userId!).select("school_id role class_id").lean()
  if (!user) { res.status(404).json({ error: "User not found" }); return }

  const schoolId = (user.school_id as { toString(): string })?.toString()
  if (!schoolId) { res.json({ notifications: [] }); return }

  const now = new Date()

  const classIdStr = (user.class_id as { toString(): string } | null)?.toString() ?? null

  const notifs = await Notification.find({
    school_id: new mongoose.Types.ObjectId(schoolId),
    $and: [
      { $or: [{ scheduled_at: null }, { scheduled_at: { $lte: now } }] },
      { $or: [{ expires_at: null }, { expires_at: { $gt: now } }] },
      { $or: [
        { target: "all" },
        { target: user.role === "teacher" ? "teachers" : "students" },
        ...(classIdStr ? [{ target: classIdStr }] : []),
      ] },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean() as unknown as Array<{
      _id: { toString(): string }; type: string; title: string; message: string
      target: string; target_label: string; created_by_name: string; created_by_role: string
      createdAt: Date; expires_at: Date | null
    }>

  // Fetch which ones this user has read
  const notifIds = notifs.map(n => n._id.toString())
  const reads = await NotifRead.find({
    notification_id: { $in: notifIds.map(id => new mongoose.Types.ObjectId(id)) },
    user_id: new mongoose.Types.ObjectId(req.userId!),
  }).lean() as unknown as Array<{ notification_id: { toString(): string } }>

  const readSet = new Set(reads.map(r => r.notification_id.toString()))

  res.json({
    notifications: notifs.map(n => ({
      id: n._id.toString(), type: n.type, title: n.title, message: n.message,
      target_label: n.target_label,
      created_by_name: n.created_by_name, created_by_role: n.created_by_role,
      created_at: n.createdAt, expires_at: n.expires_at ?? null,
      read: readSet.has(n._id.toString()),
    })),
  })
  } catch (err) {
    logger.error({ err: err }, "[teacher/notifications GET]")
    res.status(500).json({ error: "Failed to load notifications" })
  }
})

// ── PATCH /api/teacher/notifications/read ────────────────────────────────────
// Mark one or all notifications as read for this user
router.patch("/notifications/read", async (req: AuthRequest, res: Response) => {
  try {
    const { notification_id } = req.body as { notification_id?: string }
    if (!notification_id) { res.status(400).json({ error: "notification_id required" }); return }

    await NotifRead.updateOne(
      { notification_id: new mongoose.Types.ObjectId(notification_id), user_id: new mongoose.Types.ObjectId(req.userId!) },
      { $setOnInsert: { notification_id: new mongoose.Types.ObjectId(notification_id), user_id: new mongoose.Types.ObjectId(req.userId!), read_at: new Date() } },
      { upsert: true }
    )
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[teacher/notifications/read]")
    res.status(500).json({ error: "Failed to mark as read" })
  }
})

// ── PATCH /api/teacher/notifications/read-all ────────────────────────────────
// Mark ALL unread notifications as read for this user
router.patch("/notifications/read-all", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role class_id").lean()
    if (!user) { res.status(404).json({ error: "User not found" }); return }

    const schoolId = (user.school_id as { toString(): string })?.toString()
    if (!schoolId) { res.json({ success: true }); return }

    const classIdStr = (user.class_id as { toString(): string } | null)?.toString() ?? null
    const now = new Date()

    const notifs = await Notification.find({
      school_id: new mongoose.Types.ObjectId(schoolId),
      $and: [
        { $or: [{ scheduled_at: null }, { scheduled_at: { $lte: now } }] },
        { $or: [{ expires_at: null }, { expires_at: { $gt: now } }] },
        { $or: [
          { target: "all" },
          { target: user.role === "teacher" ? "teachers" : "students" },
          ...(classIdStr ? [{ target: classIdStr }] : []),
        ] },
      ],
    }).select("_id").lean() as Array<{ _id: { toString(): string } }>

    const userId = new mongoose.Types.ObjectId(req.userId!)
    const ops = notifs.map(n => ({
      updateOne: {
        filter: { notification_id: new mongoose.Types.ObjectId((n._id as { toString(): string }).toString()), user_id: userId },
        update: { $setOnInsert: { notification_id: new mongoose.Types.ObjectId((n._id as { toString(): string }).toString()), user_id: userId, read_at: new Date() } },
        upsert: true,
      }
    }))
    if (ops.length) await NotifRead.bulkWrite(ops as Parameters<typeof NotifRead.bulkWrite>[0])
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[teacher/notifications/read-all]")
    res.status(500).json({ error: "Failed to mark all as read" })
  }
})

// ── POST /api/teacher/notifications ──────────────────────────────────────────
// Teacher sends a notification to their own class students
router.post("/notifications", async (req: AuthRequest, res: Response) => {
  try {
  const ctx = await resolveTeacher(req.userId!)
  if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
  if (ctx.teacher.role === "student") { res.status(403).json({ error: "Students cannot send notifications" }); return }

  const { type, title, message, class_id } = req.body as {
    type?: string; title: string; message: string; class_id?: string
  }

  if (!title?.trim() || !message?.trim()) {
    res.status(400).json({ error: "title and message are required" }); return
  }
  if (title.trim().length > 150) {
    res.status(400).json({ error: "Title must be under 150 characters" }); return
  }
  if (message.trim().length > 2000) {
    res.status(400).json({ error: "Message must be under 2000 characters" }); return
  }

  // If no class_id provided, use teacher's primary class
  let targetClassId = class_id
  let targetLabel = "My class students"
  if (targetClassId) {
    const cls = await Class.findOne({ _id: targetClassId, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) })
      .select("grade section").lean()
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }
    targetLabel = `Class ${cls.grade}${cls.section} students`
  } else {
    const myClass = await Class.findOne({
      school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id),
      $or: [
        { teacher_id: new mongoose.Types.ObjectId(req.userId!) },
        { "teachers.teacher_id": new mongoose.Types.ObjectId(req.userId!) },
      ]
    }).select("_id grade section").lean()
    if (myClass) {
      targetClassId = myClass._id.toString()
      targetLabel = `Class ${myClass.grade}${myClass.section} students`
    }
  }
  const target = targetClassId ?? "students"

  const creator = await User.findById(req.userId!).select("name").lean()

  const NOTIF_TYPES = ["announcement", "reminder", "achievement", "alert", "event"] as const
  type NotifType = typeof NOTIF_TYPES[number]
  const validType: NotifType = NOTIF_TYPES.includes(type as NotifType) ? type as NotifType : "announcement"

  await Notification.create({
    school_id:       new mongoose.Types.ObjectId(ctx.teacher.school_id),
    created_by:      new mongoose.Types.ObjectId(req.userId!),
    created_by_name: (creator as { name: string } | null)?.name ?? "Teacher",
    created_by_role: ctx.teacher.role,
    type:            validType,
    title:           title.trim(),
    message:         message.trim(),
    target,
    target_label:    targetLabel,
    expires_at:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  })

  res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[teacher/notifications POST]")
    res.status(500).json({ error: "Failed to send notification" })
  }
})

// ── GET /api/teacher/notifications/sent ──────────────────────────────────────
// Returns the last 10 notifications this teacher created
router.get("/notifications/sent", async (req: AuthRequest, res: Response) => {
  try {
    const notifs = await Notification.find({ created_by: new mongoose.Types.ObjectId(req.userId!) })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()

    res.json({
      notifications: notifs.map(n => ({
        id:           (n._id as { toString(): string }).toString(),
        type:         n.type,
        title:        n.title,
        message:      n.message,
        target_label: n.target_label,
        scheduled_at: n.scheduled_at,
        created_at:   n.createdAt,
      }))
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher/notifications/sent]")
    res.status(500).json({ error: "Failed to load sent notifications" })
  }
})

// In-memory cache: key = class_id, value = { data, expiresAt }
// Avoids re-running 5 heavy aggregations on every teacher page load.
// TTL = 5 minutes — fresh enough for a dashboard, light enough for production.
// ── GET /api/teacher/student-progress?class_id= ──────────────────────────────
// Returns course progress % per student — items viewed ÷ total module items.
// Returns course progress % and attendance % per student. 3 parallel DB queries.
router.get("/student-progress", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveTeacher(req.userId!)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { class_id } = req.query as { class_id?: string }
    if (!class_id) { res.status(400).json({ error: "class_id is required" }); return }

    const cls = await Class.findOne({ _id: class_id, school_id: new mongoose.Types.ObjectId(ctx.teacher.school_id) }).select("_id").lean()
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    const studentDocs = await User.find({ class_id, role: "student" }).select("_id").lean()
    if (!studentDocs.length) { res.json({ progress: [] }); return }
    const studentIds = studentDocs.map(s => s._id as mongoose.Types.ObjectId)

    const [modules, progressDocs, attDocs] = await Promise.all([
      // 1. Total module items in this class
      Module.find({ class_id }).select("items").lean(),
      // 2. Items viewed per student
      ModuleProgress.aggregate([
        { $match: { student_id: { $in: studentIds } } },
        { $group: { _id: "$student_id", viewed: { $sum: 1 } } },
      ]),
      // 3. Attendance records — aggregated per student directly in MongoDB to avoid loading all records into memory
      Attendance.aggregate([
        { $match: { class_id: new mongoose.Types.ObjectId(class_id) } },
        { $unwind: "$records" },
        { $group: {
          _id:     "$records.student_id",
          total:   { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } },
          late:    { $sum: { $cond: [{ $eq: ["$records.status", "late"] },    1, 0] } },
        }},
      ]),
    ])

    const totalItems = modules.reduce((sum, m) => sum + ((m.items as unknown[])?.length ?? 0), 0)

    const viewedMap: Record<string, number> = {}
    progressDocs.forEach((d: { _id: mongoose.Types.ObjectId; viewed: number }) => {
      viewedMap[d._id.toString()] = d.viewed
    })

    const attMap: Record<string, { total: number; present: number; late: number }> = {}
    attDocs.forEach((d: { _id: mongoose.Types.ObjectId; total: number; present: number; late: number }) => {
      attMap[d._id.toString()] = { total: d.total, present: d.present, late: d.late }
    })

    const progress = studentIds.map(sid => {
      const id         = sid.toString()
      const course     = totalItems > 0 ? Math.round(((viewedMap[id] ?? 0) / totalItems) * 100) : 0
      const att        = attMap[id]
      const attendance = att && att.total > 0
        ? calculateAttendanceRate(att.present, att.late, att.total)
        : null
      return { student_id: id, course, attendance }
    })

    res.json({ progress })
  } catch (err) {
    logger.error({ err: err }, "[teacher/student-progress]")
    res.status(500).json({ error: "Failed to load student progress" })
  }
})

// ── GET /api/teacher/activity/week ───────────────────────────────────────────
// Returns Mon–Sun working hours. weekOffset=0 → current week, -1 → last week, etc. (capped at -8).
router.get("/activity/week", async (req: AuthRequest, res: Response) => {
  try {
    const ist      = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
    const todayStr = ist.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

    const rawOffset = parseInt((req.query.weekOffset as string) ?? "0")
    const offset    = isNaN(rawOffset) ? 0 : Math.max(-8, Math.min(0, rawOffset))

    // Build Mon–Sun for the requested week
    const dow = ist.getDay() // 0=Sun
    const monday = new Date(ist)
    monday.setDate(ist.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7)
    monday.setHours(0, 0, 0, 0)

    const weekDays: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      weekDays.push(d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }))
    }

    // Week label for the frontend
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    const weekLabel = offset === 0 ? "This week"
      : offset === -1 ? "Last week"
      : `${fmt(monday)} – ${fmt(sunday)}`

    const sessions = await TeacherSession.find({
      teacher_id: new mongoose.Types.ObjectId(req.userId!),
      date:       { $in: weekDays },
    }).lean()

    // Sum only completed sessions (clock-in AND clock-out present)
    const minutesByDate: Record<string, number> = {}
    for (const s of sessions) {
      if (!s.logout_at) continue
      const mins = s.duration_minutes > 0
        ? s.duration_minutes
        : Math.round((new Date(s.logout_at).getTime() - new Date(s.login_at).getTime()) / 60000)
      if (mins <= 0) continue
      minutesByDate[s.date] = Math.min(1440, (minutesByDate[s.date] ?? 0) + mins)
    }

    const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]
    const data = weekDays.map((date, i) => ({
      day:     DAY_LABELS[(monday.getDay() + i) % 7] ?? "?",
      date,
      minutes: minutesByDate[date] ?? 0,
      hours:   Math.round(((minutesByDate[date] ?? 0) / 60) * 10) / 10,
      isToday: offset === 0 && date === todayStr,
    }))

    const totalMinutes = data.reduce((s, d) => s + d.minutes, 0)
    res.json({
      week:         data,
      weekLabel,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher/activity/week]")
    res.status(500).json({ error: "Failed to load week activity" })
  }
})

// ── DELETE /api/teacher/notifications/:id ────────────────────────────────────
// Teacher can only delete notifications they created
router.delete("/notifications/:id", async (req: AuthRequest, res: Response) => {
  try {
    const notif = await Notification.findById(req.params.id)
    if (!notif) { res.status(404).json({ error: "Not found" }); return }
    if (notif.created_by?.toString() !== req.userId) {
      res.status(403).json({ error: "You can only delete your own notifications" }); return
    }
    await notif.deleteOne()
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[teacher/notifications DELETE]")
    res.status(500).json({ error: "Failed to delete notification" })
  }
})

export default router
