import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/student.ts — Student-specific routes mounted at /api/student.
// Aggregated dashboard stats, activity tracking (ping / clockout), classmate
// leaderboard, and quest checklist for the student experience.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { User } from "../models/User.js"
import { Module } from "../models/Module.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { QuizAttempt } from "../models/QuizAttempt.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { ChallengeSubmission } from "../models/ChallengeSubmission.js"
import { Class } from "../models/Class.js"
import { todayIST as todayStr, weekStartIST as weekStartStr, academicYearStartIST as academicYearStartStr } from "../lib/dateHelpers.js"
import {
  calculateAttendanceRate,
  attendanceDateFilter,
  classLabelOf,
  countedFields,
  floorFrom,
  isYmd,
  loadCountedClass,
  type CountedClass,
} from "../lib/attendanceHelpers.js"
import { PHOTO_VERSION_PROJECTION, photoPath } from "../lib/userPhoto.js"

const router = Router()
router.use(requireAuth)

// The "counted from" date and label of a class that was already read (a class not found = null).
function countedOf(
  c: { year_start?: string | null; grade: number; section: string; name?: string | null } | null | undefined,
): CountedClass | null {
  if (!c) return null
  return { start: isYmd(c.year_start) ? c.year_start : null, label: classLabelOf(c) }
}

// Convert "HH:MM" or "H:MM" to minutes since midnight
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Consecutive days with a login, ending today. Reads the activity history newest
// first and stops at the first gap, so a long history is never read in full.
async function loginStreak(studentId: mongoose.Types.ObjectId, todayIST: string): Promise<number> {
  let streak = 0
  let checkDateStr = todayIST
  const cursor = StudentActivity.find({ student_id: studentId })
    .sort({ date: -1 }).select("date logins").lean().batchSize(32).cursor()
  try {
    for await (const act of cursor) {
      if (act.date === checkDateStr && act.logins > 0) {
        streak++
        const prev = new Date(checkDateStr + "T00:00:00+05:30")
        prev.setDate(prev.getDate() - 1)
        checkDateStr = prev.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
      } else break
    }
  } finally {
    await cursor.close()
  }
  return streak
}

// ── GET /api/student/dashboard ────────────────────────────────────────────────
// Returns all stats needed to populate the student dashboard in one call.
// Every query reads only the fields the numbers need (item ids, not file details;
// this student's attendance marks, not the whole class's).
router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const studentId = new mongoose.Types.ObjectId(req.userId!)

    // Fetch student to get school + class
    const student = await User.findById(studentId)
      .select("school_id class_id name")
      .lean()
    if (!student?.school_id || !student?.class_id) {
      res.json({ error: "Student not assigned to a class" }); return
    }
    const schoolId  = student.school_id
    const classId   = student.class_id

    const mondayStr  = weekStartStr()
    const monday     = new Date(mondayStr + "T00:00:00+05:30")
    const wkStart    = weekStartStr()
    const wkStartDate = new Date(wkStart)
    const todayIST   = todayStr()

    // The student's class inside their school: the timetable for the chart and the date the
    // attendance is counted from. Started once here and awaited by both users below.
    const classRead = Class.findOne({ _id: classId, school_id: schoolId })
      .select("timetable year_start grade section name")
      .lean()
      .exec()

    // Fan out all independent DB queries in parallel — avoids sequential round-trips
    const [
      modules,
      viewedRecords,
      attempts,
      activityRecordsWeek,
      streak_days,
      cls,
      todayAct,
      goodQuiz,
      codeSub,
      rawAttDocs,
      rawEvents,
    ] = await Promise.all([
      Module.find({ school_id: schoolId, class_id: classId }).select("subject title items._id").lean(),
      ModuleProgress.find({ student_id: studentId }).select("item_id").lean(),
      QuizAttempt.find({ student_id: studentId }).select("percentage").lean(),
      StudentActivity.find({ student_id: studentId, date: { $gte: mondayStr } }).select("date minutes_active").lean(),
      loginStreak(studentId, todayIST),
      classRead,
      StudentActivity.findOne({ student_id: studentId, date: todayIST }).select("logins items_viewed").lean(),
      QuizAttempt.exists({ student_id: studentId, percentage: { $gte: 80 }, submitted_at: { $gte: wkStartDate } }),
      ChallengeSubmission.exists({ student_id: studentId, submitted_at: { $gte: wkStartDate } }),
      (async () => {
        const db = mongoose.connection.db
        if (!db) return []
        // A class that cannot be found in the school, or whose start date is still ahead, counts nothing.
        // The date window sits in the first $match so the {class_id, date} index serves it.
        const counted = countedOf(await classRead)
        if (!counted || (counted.start && counted.start > todayIST)) return []
        // Only this student's marks leave the database, not every classmate's
        return db.collection("attendances").aggregate([
          { $match: { class_id: classId, "records.student_id": studentId, ...attendanceDateFilter(counted.start) } },
          { $project: {
            date: 1,
            records: { $filter: {
              input: "$records",
              cond:  { $eq: [{ $toString: "$$this.student_id" }, studentId.toString()] },
            } },
          } },
        ]).toArray().catch(() => [])
      })(),
      (async () => {
        const db = mongoose.connection.db
        if (!db) return []
        const now = new Date()
        return db.collection("notifications")
          .find({
            $and: [
              { $or: [{ school_id: schoolId }, { school_id: schoolId.toString() }] },
              { expires_at: { $gte: now } },
              { $or: [{ scheduled_at: null }, { scheduled_at: { $lte: now } }] },
              // Only messages meant for everyone, for students, or for this student's class —
              // never staff-only messages or another class's
              { $or: [
                { target: { $in: ["all", "students", classId.toString()] } },
                { target: { $exists: false } },
              ] },
            ],
          })
          .sort({ scheduled_at: 1, createdAt: -1 })
          .limit(20)
          .project({ title: 1, message: 1, type: 1, scheduled_at: 1, createdAt: 1 })
          .toArray()
          .catch(() => [])
      })(),
    ])

    // Derive computed values from parallel results
    const allItemIds = modules.flatMap(m => m.items.map(i => i._id.toString()))
    const modules_total = allItemIds.length
    const viewedSet = new Set(viewedRecords.map(r => r.item_id.toString()))
    const modules_completed = allItemIds.filter(id => viewedSet.has(id)).length

    const module_progress = modules.reduce<Record<string, { completed: number; total: number }>>((acc, mod) => {
      const subj = mod.subject
      if (!acc[subj]) acc[subj] = { completed: 0, total: 0 }
      acc[subj].total += mod.items.length
      acc[subj].completed += mod.items.filter(i => viewedSet.has(i._id.toString())).length
      return acc
    }, {})

    const quizzes_taken = attempts.length
    const avg_quiz_score = quizzes_taken > 0
      ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / quizzes_taken)
      : 0

    // Attendance
    const myRecords = rawAttDocs.flatMap((doc: Record<string, unknown>) => {
      const records = doc.records as Array<{ student_id: unknown; status: string }> | undefined
      return (records ?? [])
        .filter(r => r.student_id?.toString() === studentId.toString())
        .map(r => ({ ...r, date: doc.date as string }))
    })
    const days_total    = myRecords.length
    const days_present  = myRecords.filter(r => r.status === "present").length
    const days_late     = myRecords.filter(r => r.status === "late").length
    const attendance_rate = calculateAttendanceRate(days_present, days_late, days_total) ?? 0
    // Distinct calendar days attendance has actually been recorded on — days_total
    // above counts individual PERIOD-level records, not days (a day with 8 periods
    // marked contributes 8 to days_total, not 1), so this is tracked separately.
    const days_recorded = new Set(myRecords.map(r => r.date)).size
    const countedClass = countedOf(cls)

    // Weekly activity chart
    const activityMap: Record<string, number> = {}
    activityRecordsWeek.forEach(r => { activityMap[r.date] = r.minutes_active })

    const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    const schoolDayMinutesMap: Record<string, number> = {}
    if (cls?.timetable?.length) {
      for (const dayName of DAY_NAMES) {
        const slots = cls.timetable.filter(s => s.day === dayName && s.start_time && s.end_time)
        if (slots.length === 0) { schoolDayMinutesMap[dayName] = 0; continue }
        const starts = slots.map(s => timeToMinutes(s.start_time))
        const ends   = slots.map(s => timeToMinutes(s.end_time))
        schoolDayMinutesMap[dayName] = Math.max(...ends) - Math.min(...starts)
      }
    }

    const weekly_activity = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getTime() + i * 86_400_000)
      const dateStr  = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
      const dayName  = DAY_NAMES[i]
      const school_day_minutes = schoolDayMinutesMap[dayName] ?? (cls?.timetable?.length ? 0 : 360)
      return {
        date: dateStr,
        day:  dayName.slice(0, 3),
        minutes: activityMap[dateStr] ?? 0,
        school_day_minutes,
      }
    })

    // Points
    const loggedToday = (todayAct?.logins ?? 0) > 0
    const itemsToday  = todayAct?.items_viewed ?? 0
    const modComplete = modules.some(m => m.items.length > 0 && m.items.every(i => viewedSet.has(i._id.toString())))
    const points_total =
      (loggedToday      ?  5 : 0) +
      (itemsToday >= 3  ? 10 : 0) +
      (goodQuiz         ? 20 : 0) +
      (streak_days >= 5 ? 25 : 0) +
      (modComplete      ? 30 : 0) +
      (codeSub          ? 10 : 0)

    // Continue learning: modules partially viewed (some items viewed, not all)
    const continue_learning = modules
      .map(mod => {
        const total     = mod.items.length
        const completed = mod.items.filter(i => viewedSet.has(i._id.toString())).length
        return { module_id: mod._id, module_title: mod.title, subject: mod.subject, completed, total }
      })
      .filter(m => m.total > 0 && m.completed > 0 && m.completed < m.total)
      .slice(0, 3)

    const upcoming_events = (rawEvents as Array<{ _id: unknown; title: string; message: string; type: string; createdAt?: Date; scheduled_at?: Date | null }>).map(evt => ({
      _id:          String(evt._id),
      title:        evt.title,
      message:      evt.message,
      type:         evt.type,
      created_at:   (evt.scheduled_at ?? evt.createdAt ?? new Date()).toString(),
    }))

    // Update points using $max so the stored value never decreases.
    // Using a plain $set here would overwrite historically-earned points with a lower
    // current-week score if the student earned more in a previous week.
    // The filter skips the write entirely when the stored value is already as high.
    // ($not/$gte also matches a record that has no points stored yet.)
    await User.updateOne({ _id: studentId, points: { $not: { $gte: points_total } } }, { $max: { points: points_total } })

    res.json({
      modules_completed,
      modules_total,
      points_total,
      avg_quiz_score,
      quizzes_taken,
      days_present,
      days_total,
      days_recorded,
      attendance_rate,
      ...countedFields(countedClass),
      streak_days,
      module_progress: Object.entries(module_progress).map(([subject, v]) => ({ subject, ...v })),
      weekly_activity,
      continue_learning,
      upcoming_events,
    })
  } catch (err) {
    logger.error({ err: err }, "[student/dashboard]")
    res.status(500).json({ error: "Failed to load dashboard" })
  }
})

// ── POST /api/student/activity/clockout ──────────────────────────────────────
// Called when student clicks Clock Out — adds the session minutes to today's record
router.post("/activity/clockout", async (req: AuthRequest, res: Response) => {
  try {
    const studentId = new mongoose.Types.ObjectId(req.userId!)
    const student   = await User.findById(studentId).select("school_id").lean()
    if (!student?.school_id) { res.json({ ok: true }); return }

    const { minutes } = req.body as { minutes?: number }
    // CRIT-06: Cap minutes at 600 to prevent inflated activity records
    const mins = Math.min(600, Math.max(0, Math.round(minutes ?? 0)))
    if (mins > 0) {
      await StudentActivity.findOneAndUpdate(
        { student_id: studentId, date: todayStr() },
        { $inc: { minutes_active: mins }, $setOnInsert: { school_id: student.school_id } },
        { upsert: true, new: true }
      )
    }
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err: err }, "[student/activity/clockout]")
    res.json({ ok: true })
  }
})

// ── POST /api/student/activity/ping ──────────────────────────────────────────
// Call on login and on each item viewed — upserts today's activity record
router.post("/activity/ping", async (req: AuthRequest, res: Response) => {
  try {
    const studentId = new mongoose.Types.ObjectId(req.userId!)
    const student   = await User.findById(studentId).select("school_id").lean()
    if (!student?.school_id) { res.json({ ok: true }); return }

    const today  = todayStr()
    const action = (req.body as { action?: string }).action ?? "login"
    const inc: Record<string, number> = { minutes_active: 5 }
    // item_viewed is intentionally NOT handled here — items_viewed counter is
    // incremented exclusively by POST /api/modules/:id/items/:itemId/viewed
    if (action === "login") inc.logins = 1

    await StudentActivity.findOneAndUpdate(
      { student_id: studentId, date: today },
      { $inc: inc, $setOnInsert: { school_id: student.school_id } },
      { upsert: true, new: true }
    )
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err: err }, "[student/activity/ping]")
    res.json({ ok: true }) // non-fatal
  }
})

// ── GET /api/student/classmates ──────────────────────────────────────────────
// Top 5 classmates by points (excludes self)
router.get("/classmates", async (req: AuthRequest, res: Response) => {
  try {
    const student = await User.findById(req.userId!).select("class_id").lean()
    if (!student?.class_id) { res.json({ classmates: [] }); return }

    const classmates = await User
      .find({ class_id: student.class_id, _id: { $ne: req.userId! }, role: "student" })
      .select("name points")
      .sort({ points: -1 })
      .limit(5)
      .lean()

    res.json({
      classmates: classmates.map(c => ({
        _id:      c._id,
        name:     c.name,
        points:   c.points ?? 0,
        initials: c.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      }))
    })
  } catch (err) {
    logger.error({ err: err }, "[student/classmates]")
    res.status(500).json({ error: "Failed to load classmates" })
  }
})

// ── GET /api/student/quests ───────────────────────────────────────────────────
// Computes real quest progress from existing data — no extra DB table needed.
// Daily quests reset every day, weekly quests reset every Monday.
router.get("/quests", async (req: AuthRequest, res: Response) => {
  try {
    const studentId = new mongoose.Types.ObjectId(req.userId!)
    const student   = await User.findById(studentId).select("school_id class_id").lean()
    if (!student) { res.status(401).json({ error: "Not found" }); return }

    const today     = todayStr()
    const weekStart = weekStartStr()

    // ── 1. Log in today (daily) ───────────────────────────────────────────────
    const todayAct      = await StudentActivity.findOne({ student_id: studentId, date: today }).lean()
    const loggedInToday = (todayAct?.logins ?? 0) > 0

    // ── 2. View 3 lesson items today (daily) ─────────────────────────────────
    const itemsToday = todayAct?.items_viewed ?? 0

    // ── 3. Score 80%+ on a quiz this week (weekly) ────────────────────────────
    const goodAttempt = await QuizAttempt.findOne({
      student_id:   studentId,
      percentage:   { $gte: 80 },
      submitted_at: { $gte: new Date(weekStart) },
    }).lean()

    // ── 4. 5-day login streak (ongoing) ───────────────────────────────────────
    const allAct = await StudentActivity.find({ student_id: studentId }).sort({ date: -1 }).lean()
    let streak = 0
    let checkD = new Date(); checkD.setHours(0, 0, 0, 0)
    for (const a of allAct) {
      const diff = Math.round((checkD.getTime() - new Date(a.date).getTime()) / 86400000)
      if (diff <= 1 && a.logins > 0) { streak++; checkD = new Date(a.date) }
      else break
    }

    // ── 5. Complete a full module (ongoing) ───────────────────────────────────
    let completedModule = false
    if (student.class_id && student.school_id) {
      const modules  = await Module.find({ school_id: student.school_id, class_id: student.class_id }).lean()
      const viewed   = await ModuleProgress.find({ student_id: studentId }).lean()
      const viewedSet = new Set(viewed.map(r => r.item_id.toString()))
      completedModule = modules.some(m =>
        m.items.length > 0 && m.items.every(i => viewedSet.has(i._id.toString()))
      )
    }

    // ── 6. Submit a code challenge this week (weekly) ─────────────────────────
    const codeSub = await ChallengeSubmission.findOne({
      student_id:   studentId,
      submitted_at: { $gte: new Date(weekStart) },
    }).lean()

    res.json({
      quests: [
        {
          id: "login_today",
          icon: "🔥",
          label: "Log in today",
          description: "Click Clock In to start your learning session today",
          points: 5,
          done: loggedInToday,
          progress: loggedInToday ? 1 : 0,
          total: 1,
          resets: "daily",
        },
        {
          id: "view_3_items",
          icon: "📖",
          label: "View 3 lesson items",
          description: "Open and view 3 files or links in your lessons today",
          points: 10,
          done: itemsToday >= 3,
          progress: Math.min(itemsToday, 3),
          total: 3,
          resets: "daily",
        },
        {
          id: "score_80",
          icon: "🎯",
          label: "Score 80%+ on a quiz",
          description: "Score 80% or higher on any quiz this week",
          points: 20,
          done: !!goodAttempt,
          progress: goodAttempt ? 1 : 0,
          total: 1,
          resets: "weekly",
        },
        {
          id: "streak_5",
          icon: "💎",
          label: "5-day login streak",
          description: "Clock in on 5 consecutive days — accumulates across weeks, never resets",
          points: 25,
          done: streak >= 5,
          progress: Math.min(streak, 5),
          total: 5,
          resets: "ongoing",
        },
        {
          id: "complete_module",
          icon: "✅",
          label: "Complete a full module",
          description: "View every item in any lesson module",
          points: 30,
          done: completedModule,
          progress: completedModule ? 1 : 0,
          total: 1,
          resets: "ongoing",
        },
        {
          id: "submit_challenge",
          icon: "⌨️",
          label: "Submit a code challenge",
          description: "Submit a solution to any coding challenge this week",
          points: 10,
          done: !!codeSub,
          progress: codeSub ? 1 : 0,
          total: 1,
          resets: "weekly",
        },
      ],
    })
  } catch (err) {
    logger.error({ err: err }, "[student/quests]")
    res.status(500).json({ error: "Failed to load quests" })
  }
})

// ── GET /api/student/teachers ────────────────────────────────────────────────
// Returns the teachers assigned to the student's class.
// Exposes only name, subject, phone and profile photo — never email or password.
router.get("/teachers", async (req: AuthRequest, res: Response) => {
  try {
    const studentId = new mongoose.Types.ObjectId(req.userId!)
    const student   = await User.findById(studentId).select("school_id class_id").lean()
    if (!student?.class_id) { res.json({ teachers: [] }); return }

    const cls = await Class.findOne({
      _id:       student.class_id,
      school_id: student.school_id,
    }).select("teachers").lean()

    if (!cls || !cls.teachers?.length) { res.json({ teachers: [] }); return }

    const teacherIds = cls.teachers
      .map((t: { teacher_id?: mongoose.Types.ObjectId | null }) => t.teacher_id)
      .filter(Boolean) as mongoose.Types.ObjectId[]

    if (!teacherIds.length) { res.json({ teachers: [] }); return }

    const teacherDocs = await User.find({
      _id:       { $in: teacherIds },
      school_id: student.school_id,
      role:      "teacher",
      is_active: true,
    }).select({ name: 1, ...PHOTO_VERSION_PROJECTION }).lean<Array<{ _id: mongoose.Types.ObjectId; name: string; photo_v: number | null }>>()

    const subjectMap: Record<string, string[]> = {}
    cls.teachers.forEach((t: { teacher_id?: mongoose.Types.ObjectId | null; subject?: string }) => {
      if (!t.teacher_id) return
      const key = t.teacher_id.toString()
      if (!subjectMap[key]) subjectMap[key] = []
      if (t.subject) subjectMap[key].push(t.subject)
    })

    const teachers = teacherDocs.map(t => ({
      id:                t._id.toString(),
      name:              t.name,
      photo_url:         photoPath(t._id.toString(), t.photo_v),
      subjects:          subjectMap[t._id.toString()] ?? [],
    }))

    res.json({ teachers })
  } catch (err) {
    logger.error({ err: err }, "[student/teachers]")
    res.status(500).json({ error: "Failed to load teachers" })
  }
})

// ── GET /api/student/attendance/range?from=YYYY-MM-DD&to=YYYY-MM-DD ─────────
// Returns attendance stats for a student-selected date range.
// Called only when the student clicks "Check" — not on page load.
router.get("/attendance/range", async (req: AuthRequest, res: Response) => {
  const EMPTY = { total: 0, present: 0, absent: 0, late: 0, rate: 0, recorded: false }
  const NO_CLASS = countedFields(null)

  try {
    const studentId = new mongoose.Types.ObjectId(req.userId!)
    const student   = await User.findById(studentId).select("class_id school_id").lean()
    if (!student?.class_id) { res.json({ result: EMPTY, ...NO_CLASS }); return }

    const db = mongoose.connection.db
    if (!db) { res.json({ result: EMPTY, ...NO_CLASS }); return }

    const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    const dateRe   = /^\d{4}-\d{2}-\d{2}$/

    let from = (req.query.from as string) ?? ""
    let to   = (req.query.to   as string) ?? ""

    if (!dateRe.test(from) || !dateRe.test(to)) {
      res.status(400).json({ error: "from and to must be YYYY-MM-DD" }); return
    }

    // Swap silently if user entered dates in wrong order
    if (from > to) { const tmp = from; from = to; to = tmp }

    // Cap to at today — no future attendance exists
    if (to > todayIST) to = todayIST

    const classId = student.class_id as mongoose.Types.ObjectId

    // The class inside the student's school; one that cannot be found counts nothing (fail closed)
    const counted = await loadCountedClass(classId, student.school_id)
    if (!counted) { res.json({ result: EMPTY, ...NO_CLASS }); return }
    const countedOut = countedFields(counted)

    // Sheets before the class's start date are never counted: a range that begins earlier is clamped to it.
    // A start that is still ahead (or a range wholly before it) leaves lower > to, which matches nothing.
    const lower = floorFrom(counted.start, from) ?? from

    const [result] = await db.collection("attendances").aggregate([
      { $match: { class_id: classId, date: { $gte: lower, $lte: to } } },
      { $unwind: "$records" },
      { $match: { "records.student_id": studentId } },
      { $group: {
        _id:     null,
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ["$records.status", "absent"]  }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ["$records.status", "late"]    }, 1, 0] } },
      }},
    ]).toArray()

    if (!result?.total) { res.json({ result: EMPTY, ...countedOut }); return }

    const { total, present, absent, late } = result as { total: number; present: number; absent: number; late: number }
    const rate = calculateAttendanceRate(present, late, total) ?? 0
    res.json({ result: { total, present, absent, late, rate, recorded: true }, ...countedOut })
  } catch (err) {
    logger.error({ err: err }, "[student/attendance/range]")
    res.json({ result: EMPTY, ...NO_CLASS })
  }
})

// ── GET /api/student/attendance ─────────────────────────────────────────────
// Single MongoDB $facet aggregation → today / this_week / this_month / overall
// in one DB round-trip. Always returns a safe response — never crashes on error.

router.get("/attendance", async (req: AuthRequest, res: Response) => {
  const EMPTY = { total: 0, present: 0, absent: 0, late: 0, rate: 0, recorded: false }
  const safeSummary = { today: EMPTY, this_week: EMPTY, this_month: EMPTY, overall: EMPTY }
  const NO_CLASS = countedFields(null)

  try {
    const studentId = new mongoose.Types.ObjectId(req.userId!)
    const student   = await User.findById(studentId).select("class_id school_id").lean()

    if (!student?.class_id) { res.json({ summary: safeSummary, records: [], ...NO_CLASS }); return }

    const db = mongoose.connection.db
    if (!db) { res.json({ summary: safeSummary, records: [], ...NO_CLASS }); return }

    const classId   = student.class_id as mongoose.Types.ObjectId
    const todayIST  = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) // YYYY-MM-DD
    const weekIST   = weekStartStr()                                                         // YYYY-MM-DD (Monday IST)
    const monthIST  = `${todayIST.slice(0, 7)}-01`                                          // YYYY-MM-01
    const yearDefault = academicYearStartStr()                                               // YYYY-06-01 (academic year)

    // The class inside the student's school; one that cannot be found counts nothing (fail closed)
    const counted = await loadCountedClass(classId, student.school_id)
    if (!counted) {
      res.json({
        summary: { today: EMPTY, this_week: EMPTY, this_month: EMPTY, this_year: EMPTY },
        records: [],
        ...NO_CLASS,
      })
      return
    }
    const countedOut = countedFields(counted)

    // A start date that is still ahead counts nothing at all
    if (counted.start && counted.start > todayIST) {
      res.json({
        summary: { today: EMPTY, this_week: EMPTY, this_month: EMPTY, this_year: EMPTY },
        records: [],
        ...countedOut,
      })
      return
    }

    // Every window and the calendar list start no earlier than the class's start date.
    // The school year window is the later of the usual school-year start and the stored start.
    const yearIST = floorFrom(counted.start, yearDefault) ?? yearDefault

    // Shared $group accumulator for all four time-range facets
    const groupAccum = {
      _id:     null,
      total:   { $sum: 1 },
      present: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } },
      absent:  { $sum: { $cond: [{ $eq: ["$records.status", "absent"]  }, 1, 0] } },
      late:    { $sum: { $cond: [{ $eq: ["$records.status", "late"]    }, 1, 0] } },
    }

    const [result] = await db.collection("attendances").aggregate([
      { $match: { class_id: classId, ...attendanceDateFilter(counted.start) } },
      { $unwind: "$records" },
      { $match: { "records.student_id": studentId } },
      { $facet: {
        this_year: [
          { $match: { date: { $gte: yearIST, $lte: todayIST } } },
          { $group: groupAccum },
        ],
        this_month: [
          { $match: { date: { $gte: monthIST, $lte: todayIST } } },
          { $group: groupAccum },
        ],
        this_week: [
          { $match: { date: { $gte: weekIST, $lte: todayIST } } },
          { $group: groupAccum },
        ],
        today: [
          { $match: { date: todayIST } },
          { $group: groupAccum },
        ],
        records: [
          { $project: { _id: 0, date: 1, period: 1, subject: 1, status: "$records.status" } },
          { $sort: { date: -1, period: 1 } },
        ],
      }},
    ]).toArray()

    function toSlot(arr: Array<{ total: number; present: number; absent: number; late: number }>) {
      if (!arr?.length || !arr[0]?.total) return EMPTY
      const { total, present, absent, late } = arr[0]
      const rate = calculateAttendanceRate(present, late, total) ?? 0
      return { total, present, absent, late, rate, recorded: true }
    }

    const r = result as {
      this_year:  Array<{ total: number; present: number; absent: number; late: number }>
      this_month: Array<{ total: number; present: number; absent: number; late: number }>
      this_week:  Array<{ total: number; present: number; absent: number; late: number }>
      today:      Array<{ total: number; present: number; absent: number; late: number }>
      records:    Array<{ date: string; period: number; subject: string; status: string }>
    } | undefined

    res.json({
      summary: {
        today:      toSlot(r?.today      ?? []),
        this_week:  toSlot(r?.this_week  ?? []),
        this_month: toSlot(r?.this_month ?? []),
        this_year:  toSlot(r?.this_year  ?? []),
      },
      records: r?.records ?? [],
      ...countedOut,
    })
  } catch (err) {
    logger.error({ err: err }, "[student/attendance]")
    res.json({ summary: safeSummary, records: [], ...NO_CLASS }) // safe fallback — page never breaks
  }
})

export default router
