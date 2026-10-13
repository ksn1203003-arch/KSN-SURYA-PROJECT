import { Router, type Response } from "express"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { ExamDefinition, type IGradeScale, type IExamDefinition } from "../models/ExamDefinition.js"
import { ExamResult } from "../models/ExamResult.js"
import { User } from "../models/User.js"
import { Class } from "../models/Class.js"
import { getReportCardPdf } from "../services/reportCardPdf.js"
import { fetchReportCardData } from "../services/reportCard.js"
import { buildReportCardHTML } from "../lib/reportCardTemplate.js"
import { AuditLog } from "../models/AuditLog.js"
import { logger } from "../lib/logger.js"
import { rateLimit } from "express-rate-limit"
import { SharedRateLimitStore } from "../lib/rateLimitStore.js"
import { validateObjectId } from "../lib/validateId.js"

const router = Router()
router.use(requireAuth)

// Every :id in this router is an exam id — a malformed one is a clean 400, never a crash
router.param("id", (_req, res, next, id: string) => {
  if (!mongoose.isValidObjectId(id)) { res.status(400).json({ error: "Invalid exam ID" }); return }
  next()
})

// Report cards: 10 a minute per signed-in person. A school shares one network address,
// so a per-address budget would let one student block the whole school.
const reportCardLimit = rateLimit({
  windowMs: 60_000, max: 10,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? "unknown",
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many report card downloads. Please wait a minute and try again." },
  store: new SharedRateLimitStore("report-card"),
})

function calcGrade(pct: number, scale: IGradeScale[]): string {
  const sorted = [...scale].sort((a, b) => b.min - a.min)
  return sorted.find(s => pct >= s.min)?.grade ?? "F"
}

function validateGradeScale(gs: unknown): string | null {
  if (!Array.isArray(gs) || gs.length === 0) return "grade_scale must be a non-empty array"
  const valid = gs.every((s) => {
    if (s === null || typeof s !== "object") return false
    const entry = s as Record<string, unknown>
    return (
      typeof entry.min === "number" &&
      typeof entry.grade === "string" &&
      (entry.min as number) >= 0 &&
      (entry.min as number) <= 100
    )
  })
  if (!valid) return "Each grade_scale entry must have min (0–100) and grade (string)"
  return null
}

// ── GET /api/marks/exams — list exams for a class ─────────────────────────────
router.get("/exams", async (req: AuthRequest, res: Response) => {
  const { class_id } = req.query as { class_id?: unknown }
  if (!class_id) return void res.status(400).json({ error: "class_id is required" })
  if (typeof class_id !== "string" || !mongoose.isValidObjectId(class_id)) {
    return void res.status(400).json({ error: "Invalid class_id" })
  }

  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const page  = Math.max(1, parseInt(req.query.page  as string) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50))
  const skip  = (page - 1) * limit

  const filter = {
    school_id: user.school_id,
    class_id:  new mongoose.Types.ObjectId(class_id),
  }

  const [exams, total] = await Promise.all([
    ExamDefinition.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .select("title exam_type date subjects grade_scale created_by created_at")
      .lean(),
    ExamDefinition.countDocuments(filter),
  ])

  res.json({ exams, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
})

// ── POST /api/marks/exams — create exam ───────────────────────────────────────
router.post("/exams", async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "teacher" && req.userRole !== "admin") {
    return void res.status(403).json({ error: "Teachers and admins only" })
  }
  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const { class_id, title, exam_type, date, subjects, grade_scale } = req.body as {
    class_id: string
    title: string
    exam_type?: string
    date: string
    subjects: Array<{ name: string; max_marks: number }>
    grade_scale?: Array<{ min: number; grade: string; label: string }>
  }
  if (!class_id || !title?.trim() || !date || !subjects?.length) {
    return void res.status(400).json({ error: "class_id, title, date, and subjects are required" })
  }
  if (typeof class_id !== "string" || !mongoose.isValidObjectId(class_id)) {
    return void res.status(400).json({ error: "Invalid class_id" })
  }
  if (subjects.some(s => !s.name?.trim() || s.max_marks < 1)) {
    return void res.status(400).json({ error: "Each subject needs a name and max_marks ≥ 1" })
  }

  if (grade_scale !== undefined) {
    const gsErr = validateGradeScale(grade_scale)
    if (gsErr) return void res.status(400).json({ error: gsErr })
  }

  const cls = await Class.findOne({ _id: class_id, school_id: user.school_id! }).lean()
  if (!cls) return void res.status(404).json({ error: "Class not found" })

  const exam = await ExamDefinition.create({
    school_id:   user.school_id!,
    class_id:    new mongoose.Types.ObjectId(class_id),
    title:       title.trim(),
    exam_type:   (exam_type ?? "unit_test") as IExamDefinition["exam_type"],
    date:        new Date(date),
    subjects:    subjects.map(s => ({ name: s.name.trim(), max_marks: s.max_marks })),
    grade_scale: grade_scale ?? undefined,
    created_by:  req.userId,
  })

  res.status(201).json({ exam })
})

// ── PATCH /api/marks/exams/:id — update exam ──────────────────────────────────
router.patch("/exams/:id", async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "teacher" && req.userRole !== "admin") {
    return void res.status(403).json({ error: "Teachers and admins only" })
  }
  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const exam = await ExamDefinition.findOne({ _id: req.params.id, school_id: user.school_id })
  if (!exam) return void res.status(404).json({ error: "Exam not found" })

  const { title, exam_type, date, subjects, grade_scale } = req.body as {
    title?: string
    exam_type?: string
    date?: string
    subjects?: Array<{ name: string; max_marks: number }>
    grade_scale?: Array<{ min: number; grade: string; label: string }>
  }
  if (title !== undefined) exam.title = title.trim()
  if (exam_type !== undefined) exam.exam_type = exam_type as typeof exam.exam_type
  if (date !== undefined) exam.date = new Date(date)
  if (subjects !== undefined) {
    if (subjects.some(s => !s.name?.trim() || s.max_marks < 1)) {
      return void res.status(400).json({ error: "Each subject needs a name and max_marks ≥ 1" })
    }
    exam.subjects = subjects.map(s => ({ name: s.name.trim(), max_marks: s.max_marks }))
  }
  if (grade_scale !== undefined) {
    const gsErr = validateGradeScale(grade_scale)
    if (gsErr) return void res.status(400).json({ error: gsErr })
    exam.grade_scale = grade_scale
  }

  await exam.save()
  res.json({ exam })
})

// ── DELETE /api/marks/exams/:id — delete exam ─────────────────────────────────
router.delete("/exams/:id", async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "teacher" && req.userRole !== "admin") {
    return void res.status(403).json({ error: "Teachers and admins only" })
  }
  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const exam = await ExamDefinition.findOne({ _id: req.params.id, school_id: user.school_id }).lean()
  if (!exam) return void res.status(404).json({ error: "Exam not found" })

  await ExamDefinition.deleteOne({ _id: exam._id })
  await ExamResult.deleteMany({ exam_id: exam._id })
  res.json({ success: true })
})

// ── GET /api/marks/exams/:id/results — all results for an exam ────────────────
router.get("/exams/:id/results", async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const exam = await ExamDefinition.findOne({ _id: req.params.id, school_id: user.school_id }).lean()
  if (!exam) return void res.status(404).json({ error: "Exam not found" })

  const students = await User.find({
    class_id:  exam.class_id,
    school_id: user.school_id,
    role:      "student",
    is_active: true,
  }).select("_id name").sort({ name: 1 }).lean()

  const results = await ExamResult.find({ exam_id: exam._id }).lean()

  const resultMap: Record<string, Record<string, { marks_obtained: number | null; is_absent: boolean }>> = {}
  for (const r of results) {
    const sid = r.student_id.toString()
    if (!resultMap[sid]) resultMap[sid] = {}
    resultMap[sid][r.subject] = { marks_obtained: r.marks_obtained, is_absent: r.is_absent }
  }

  const rows = students.map(s => {
    const sid = s._id.toString()
    const subjectResults = exam.subjects.map(sub => {
      const r = resultMap[sid]?.[sub.name]
      const obtained = r?.marks_obtained ?? null
      const absent   = r?.is_absent ?? false
      const pct = obtained !== null && !absent ? Math.round((obtained / sub.max_marks) * 100) : null
      return {
        subject:        sub.name,
        max_marks:      sub.max_marks,
        marks_obtained: obtained,
        is_absent:      absent,
        percentage:     pct,
        grade:          pct !== null ? calcGrade(pct, exam.grade_scale) : null,
      }
    })

    const valid        = subjectResults.filter(r => !r.is_absent && r.marks_obtained !== null)
    const totalObtained = valid.reduce((s, r) => s + (r.marks_obtained ?? 0), 0)
    const totalMax      = valid.reduce((s, r) => s + r.max_marks, 0)
    const overallPct    = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : null

    return {
      student_id:     sid,
      student_name:   s.name,
      subjects:       subjectResults,
      total_obtained: totalObtained,
      total_max:      totalMax,
      overall_pct:    overallPct,
      overall_grade:  overallPct !== null ? calcGrade(overallPct, exam.grade_scale) : null,
    }
  })

  res.json({ exam, rows })
})

// ── PUT /api/marks/exams/:id/results — bulk upsert marks ──────────────────────
router.put("/exams/:id/results", async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "teacher" && req.userRole !== "admin") {
    return void res.status(403).json({ error: "Teachers and admins only" })
  }
  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const exam = await ExamDefinition.findOne({ _id: req.params.id, school_id: user.school_id }).lean()
  if (!exam) return void res.status(404).json({ error: "Exam not found" })

  const { entries } = req.body as {
    entries: Array<{
      student_id:     string
      subject:        string
      marks_obtained: number | null
      is_absent:      boolean
    }>
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return void res.status(400).json({ error: "entries array is required" })
  }

  const subjectMax: Record<string, number> = {}
  for (const s of exam.subjects) subjectMax[s.name] = s.max_marks
  const subjectNames = Object.keys(subjectMax)

  for (const e of entries) {
    if (!mongoose.isValidObjectId(e.student_id)) {
      return void res.status(400).json({ error: `Invalid student_id: ${e.student_id}` })
    }
    if (!subjectNames.includes(e.subject)) {
      return void res.status(400).json({ error: `Unknown subject: ${e.subject}` })
    }
    if (!e.is_absent && e.marks_obtained !== null) {
      const m = Number(e.marks_obtained)
      if (!isFinite(m) || m < 0 || m > subjectMax[e.subject]) {
        return void res.status(400).json({
          error: `Marks for ${e.subject} must be a number between 0 and ${subjectMax[e.subject]}`,
        })
      }
    }
  }

  // Verify every student_id belongs to this school and is an active student.
  // Without this check a teacher could write marks for students from another school.
  const uniqueStudentIds = [...new Set(entries.map(e => e.student_id))]
  const validStudents = await User.find({
    _id:       { $in: uniqueStudentIds.map(id => new mongoose.Types.ObjectId(id)) },
    school_id: user.school_id,
    role:      "student",
    is_active: true,
  }).select("_id").lean()

  if (validStudents.length !== uniqueStudentIds.length) {
    return void res.status(403).json({
      error: "One or more student IDs do not belong to your school.",
    })
  }

  const ops = entries.map(e => ({
    updateOne: {
      filter: {
        exam_id:    exam._id,
        student_id: new mongoose.Types.ObjectId(e.student_id),
        subject:    e.subject,
      },
      update: {
        $set: {
          school_id:      exam.school_id,
          class_id:       exam.class_id,
          marks_obtained: e.is_absent ? null : (e.marks_obtained ?? null),
          is_absent:      e.is_absent,
        },
      },
      upsert: true,
    },
  }))

  await ExamResult.bulkWrite(ops)

  // Audit trail: record who entered marks for which exam
  try {
    await AuditLog.create({
      school_id:     user.school_id,
      actor_id:      new mongoose.Types.ObjectId(req.userId!),
      actor_role:    req.userRole ?? "teacher",
      action:        "marks.bulk_upsert",
      resource_type: "ExamDefinition",
      resource_id:   exam._id.toString(),
      before:        null,
      after:         {
        exam_title:    exam.title,
        class_id:      exam.class_id.toString(),
        entries_count: entries.length,
        student_ids:   uniqueStudentIds,
      },
      ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? null,
    })
  } catch (auditErr) {
    logger.error({ err: auditErr }, "[marks] Failed to write AuditLog entry — marks were still saved")
  }

  res.json({ success: true, count: entries.length })
})

// ── GET /api/marks/my-results — student: all exams with own marks ──────────────
router.get("/my-results", async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "student") {
    return void res.status(403).json({ error: "Students only" })
  }
  const user = await User.findById(req.userId).select("school_id class_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const exams = await ExamDefinition.find({
    school_id: user.school_id,
    ...(user.class_id ? { class_id: user.class_id } : {}),
  })
    .sort({ date: -1 })
    .lean()

  if (!exams.length) return void res.json({ exams: [] })

  const examIds = exams.map(e => e._id)
  const results = await ExamResult.find({
    exam_id:    { $in: examIds },
    student_id: new mongoose.Types.ObjectId(req.userId!),
  }).lean()

  const resultMap: Record<string, Record<string, { marks_obtained: number | null; is_absent: boolean }>> = {}
  for (const r of results) {
    const eid = r.exam_id.toString()
    if (!resultMap[eid]) resultMap[eid] = {}
    resultMap[eid][r.subject] = { marks_obtained: r.marks_obtained, is_absent: r.is_absent }
  }

  const enriched = exams.map(exam => {
    const eid = exam._id.toString()
    const subjectResults = exam.subjects.map(sub => {
      const r = resultMap[eid]?.[sub.name]
      const obtained = r?.marks_obtained ?? null
      const absent   = r?.is_absent ?? false
      const pct = obtained !== null && !absent ? Math.round((obtained / sub.max_marks) * 100) : null
      return {
        subject:        sub.name,
        max_marks:      sub.max_marks,
        marks_obtained: obtained,
        is_absent:      absent,
        percentage:     pct,
        grade:          pct !== null ? calcGrade(pct, exam.grade_scale) : null,
      }
    })

    const valid         = subjectResults.filter(r => !r.is_absent && r.marks_obtained !== null)
    const totalObtained = valid.reduce((s, r) => s + (r.marks_obtained ?? 0), 0)
    const totalMax      = valid.reduce((s, r) => s + r.max_marks, 0)
    const overallPct    = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : null

    return {
      exam_id:        eid,
      title:          exam.title,
      exam_type:      exam.exam_type,
      date:           exam.date,
      subjects:       subjectResults,
      total_obtained: totalObtained,
      total_max:      totalMax,
      overall_pct:    overallPct,
      overall_grade:  overallPct !== null ? calcGrade(overallPct, exam.grade_scale) : null,
    }
  })

  res.json({ exams: enriched })
})

// ── GET /api/marks/class-summary — teacher/admin: exam list + student list ────
router.get("/class-summary", async (req: AuthRequest, res: Response) => {
  if (!["teacher", "admin", "super_admin"].includes(req.userRole ?? "")) {
    return void res.status(403).json({ error: "Only school staff can see this" })
  }
  const { class_id } = req.query as { class_id?: unknown }
  if (!class_id) return void res.status(400).json({ error: "class_id is required" })
  if (typeof class_id !== "string" || !mongoose.isValidObjectId(class_id)) {
    return void res.status(400).json({ error: "Invalid class_id" })
  }

  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const exams = await ExamDefinition.find({
    school_id: user.school_id,
    class_id:  new mongoose.Types.ObjectId(class_id),
  }).sort({ date: -1 }).select("title exam_type date subjects grade_scale").lean()

  const students = await User.find({
    class_id:  new mongoose.Types.ObjectId(class_id),
    school_id: user.school_id,
    role:      "student",
    is_active: true,
  }).select("_id name").sort({ name: 1 }).lean()

  res.json({
    exams,
    students: students.map(s => ({ id: s._id.toString(), name: s.name })),
  })
})


/**
 * Send a student's report card PDF. The PDF is built once per version of its
 * content (services/reportCardPdf.ts) and reused for every later download, so a
 * repeated click costs a database read, not a new Puppeteer render.
 * Callers must already have checked that the requester may see this student.
 */
async function sendReportCardPdf(
  res: Response,
  html: string,
  safeName: string,
  ids: { schoolId: string; studentId: string; requestedBy: string },
): Promise<void> {
  const pdf = await getReportCardPdf({
    schoolId:    ids.schoolId,
    studentId:   ids.studentId,
    html,
    fileName:    `report-card-${safeName}.pdf`,
    requestedBy: ids.requestedBy,
  })
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename*=UTF-8''report-card-${encodeURIComponent(safeName)}.pdf`,
    "Cache-Control": "private, no-store",
  })
  res.send(pdf)
}

// ── GET /api/marks/report-card/:studentId — generate student report card PDF ──
// Staff only: an admin of the school, or a teacher who teaches the student's class.
// Parents and students never use this route (students have /my-report-card).
const REPORT_CARD_STAFF = new Set(["teacher", "admin", "super_admin"])

router.get("/report-card/:studentId", reportCardLimit, async (req: AuthRequest, res: Response) => {
  if (!REPORT_CARD_STAFF.has(req.userRole ?? "")) {
    return void res.status(403).json({ error: "Only school staff can download report cards here" })
  }
  if (!validateObjectId(req.params.studentId, res, "student ID")) return
  try {
    const user = await User.findById(req.userId).select("school_id").lean()
    if (!user?.school_id) return void res.status(401).json({ error: "User not found" })

    const student = await User.findOne({
      _id: req.params.studentId,
      school_id: user.school_id,
      role: "student",
      is_active: true,
    }).select("name class_id school_id").lean()
    if (!student) return void res.status(404).json({ error: "Student not found" })

    if (req.userRole === "teacher") {
      const teachesClass = student.class_id && await Class.exists({
        _id: student.class_id,
        school_id: user.school_id,
        $or: [{ teacher_id: req.userId }, { "teachers.teacher_id": req.userId }],
      })
      if (!teachesClass) return void res.status(403).json({ error: "You can only download report cards for classes you teach" })
    }

    // Always the stored id (never the request text), so the cache key is one per student
    const studentIdStr = student._id.toString()
    const data = await fetchReportCardData(
      { name: student.name, class_id: student.class_id, school_id: user.school_id },
      studentIdStr,
    )
    const html = buildReportCardHTML(data)
    const safeName = student.name.replace(/[^a-z0-9]/gi, "-").replace(/-+/g, "-")
    await sendReportCardPdf(res, html, safeName, {
      schoolId: user.school_id.toString(), studentId: studentIdStr, requestedBy: req.userId!,
    })
  } catch (err) {
    logger.error({ err }, "[marks/report-card]")
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate report card. Please try again." })
  }
})

// ── GET /api/marks/my-report-card — student downloads own report card ─────────
router.get("/my-report-card", reportCardLimit, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "student") return void res.status(403).json({ error: "Students only" })
  try {
    const student = await User.findOne({
      _id:       req.userId,
      role:      "student",
      is_active: true,
    }).select("name class_id school_id").lean()
    if (!student?.school_id) return void res.status(404).json({ error: "Student not found" })

    const studentIdStr = student._id.toString()
    const data = await fetchReportCardData(
      { name: student.name, class_id: student.class_id, school_id: student.school_id },
      studentIdStr,
    )
    const html = buildReportCardHTML(data)
    const safeName = student.name.replace(/[^a-z0-9]/gi, "-").replace(/-+/g, "-")
    await sendReportCardPdf(res, html, safeName, {
      schoolId: student.school_id.toString(), studentId: studentIdStr, requestedBy: req.userId!,
    })
  } catch (err) {
    logger.error({ err }, "[marks/my-report-card]")
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate report card. Please try again." })
  }
})

export default router
