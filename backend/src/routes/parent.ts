import { Router, type Response } from "express"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { User } from "../models/User.js"
import { Class } from "../models/Class.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { Module } from "../models/Module.js"
import { ExamDefinition } from "../models/ExamDefinition.js"
import { ExamResult } from "../models/ExamResult.js"
import { Certificate } from "../models/Certificate.js"
import { attendanceDateFilter, calculateAttendanceRate, countedFields, loadCountedClass } from "../lib/attendanceHelpers.js"
import { todayIST } from "../lib/dateHelpers.js"

const router = Router()
router.use(requireAuth)

function requireParent(req: AuthRequest, res: Response): boolean {
  if (req.userRole !== "parent") {
    res.status(403).json({ error: "Parents only" })
    return false
  }
  return true
}

// ── GET /api/parent/child ─────────────────────────────────────────────────────
router.get("/child", async (req: AuthRequest, res: Response) => {
  if (!requireParent(req, res)) return

  const parent = await User.findById(req.userId).select("school_id linked_student_id").lean()
  if (!parent) return void res.status(401).json({ error: "User not found" })
  if (!parent.linked_student_id) return void res.status(404).json({ error: "No linked student found" })

  // Explicit school-boundary assertion — guards against incorrect linked_student_id setup
  const child = await User.findOne({
    _id:       parent.linked_student_id,
    school_id: parent.school_id,   // must belong to the same school as the parent
    role:      "student",
    is_active: true,
  }).select("name email phone class_id school_id profile_photo_url preferred_language").lean()
  if (!child) return void res.status(404).json({ error: "Linked student not found" })

  // Double-check school boundary (defense in depth)
  if (child.school_id?.toString() !== parent.school_id?.toString()) {
    return void res.status(403).json({ error: "Forbidden" })
  }

  const cls = await Class.findById(child.class_id)
    .select("name grade section teachers subjects")
    .lean()

  const teacherIds = cls?.teachers?.map((t: { teacher_id: mongoose.Types.ObjectId }) => t.teacher_id) ?? []
  const teachers = teacherIds.length
    ? await User.find({ _id: { $in: teacherIds } }).select("name email").lean()
    : []

  res.json({ child, class: cls, teachers })
})

// ── GET /api/parent/child/attendance ─────────────────────────────────────────
router.get("/child/attendance", async (req: AuthRequest, res: Response) => {
  if (!requireParent(req, res)) return

  const parent = await User.findById(req.userId).select("school_id linked_student_id").lean()
  if (!parent?.linked_student_id) return void res.status(404).json({ error: "No linked student" })

  // Nothing is counted unless the child is an active student of the parent's own school and the
  // child's class can be found inside that same school (empty figures, never "all sheets").
  const emptyAnswer = {
    records: [], total: 0, present: 0, late: 0, absent: 0, rate: null, recorded: false,
    ...countedFields(null),
  }

  const db = mongoose.connection.db
  if (!db) return void res.json(emptyAnswer)

  const child = await User.findOne({
    _id:       parent.linked_student_id,
    school_id: parent.school_id,
    role:      "student",
    is_active: true,
  }).select("class_id school_id").lean()
  if (!child?.class_id) return void res.json(emptyAnswer)

  const counted = await loadCountedClass(child.class_id, parent.school_id)
  if (!counted) return void res.json(emptyAnswer)
  // A start date that is still ahead counts nothing yet
  if (counted.start && counted.start > todayIST()) {
    return void res.json({ ...emptyAnswer, ...countedFields(counted) })
  }

  const studentOid = new mongoose.Types.ObjectId(parent.linked_student_id.toString())

  // Aggregate at DB level — avoids loading the class's attendance into Node.js memory.
  // Matched by the child's current class (verified inside the school above) and the class's start
  // date, which the {class_id, date} index serves; only the child's own marks are read.
  const agg = await db.collection("attendances").aggregate([
    { $match: { class_id: child.class_id, "records.student_id": studentOid, ...attendanceDateFilter(counted.start) } },
    { $unwind: "$records" },
    { $match: { "records.student_id": studentOid } },
    { $project: { _id: 0, date: 1, period: 1, status: "$records.status" } },
  ]).toArray() as Array<{ date: string; period: number; status: string }>

  const records = agg
  const total   = records.length
  const present = records.filter(r => r.status === "present").length
  const late    = records.filter(r => r.status === "late").length
  const rate    = calculateAttendanceRate(present, late, total)

  res.json({
    records, total, present, late, absent: total - present - late, rate, recorded: total > 0,
    ...countedFields(counted),
  })
})

// ── GET /api/parent/child/progress ───────────────────────────────────────────
router.get("/child/progress", async (req: AuthRequest, res: Response) => {
  if (!requireParent(req, res)) return

  const parent = await User.findById(req.userId).select("school_id linked_student_id").lean()
  if (!parent?.linked_student_id) return void res.status(404).json({ error: "No linked student" })

  const child = await User.findOne({
    _id: parent.linked_student_id, school_id: parent.school_id, role: "student",
  }).select("class_id school_id").lean()
  if (!child?.class_id) return void res.json({ modules: [] })
  if (child.school_id?.toString() !== parent.school_id?.toString()) {
    return void res.status(403).json({ error: "Forbidden" })
  }

  const modules = await Module.find({
    school_id: parent.school_id,
    class_id:  child.class_id,
  }).select("title subject items").lean()

  const progress = await ModuleProgress.find({
    student_id: parent.linked_student_id,
  }).select("module_id item_id").lean()

  const viewedMap = new Map<string, Set<string>>()
  for (const p of progress) {
    const mid = p.module_id.toString()
    if (!viewedMap.has(mid)) viewedMap.set(mid, new Set())
    viewedMap.get(mid)!.add(p.item_id.toString())
  }

  const result = modules.map(m => {
    const viewed = viewedMap.get(m._id.toString())?.size ?? 0
    const total  = m.items?.length ?? 0
    return {
      module_id:    m._id,
      title:        m.title,
      subject:      m.subject,
      total_items:  total,
      viewed_items: viewed,
      percentage:   total > 0 ? Math.round((viewed / total) * 100) : 0,
    }
  })

  res.json({ modules: result })
})

// ── GET /api/parent/child/marks ───────────────────────────────────────────────
router.get("/child/marks", async (req: AuthRequest, res: Response) => {
  if (!requireParent(req, res)) return

  const parent = await User.findById(req.userId).select("school_id linked_student_id").lean()
  if (!parent?.linked_student_id) return void res.status(404).json({ error: "No linked student" })

  const child = await User.findOne({
    _id: parent.linked_student_id, school_id: parent.school_id, role: "student",
  }).select("class_id school_id").lean()
  if (!child) return void res.json({ exams: [] })
  if (child.school_id?.toString() !== parent.school_id?.toString()) {
    return void res.status(403).json({ error: "Forbidden" })
  }

  const exams = await ExamDefinition.find({
    school_id: parent.school_id,
    ...(child.class_id ? { class_id: child.class_id } : {}),
  }).sort({ date: -1 }).lean()

  if (!exams.length) return void res.json({ exams: [] })

  const examIds = exams.map(e => e._id)
  const results = await ExamResult.find({
    exam_id:    { $in: examIds },
    student_id: parent.linked_student_id,
  }).lean()

  const resultMap: Record<string, Record<string, { marks_obtained: number | null; is_absent: boolean }>> = {}
  for (const r of results) {
    const eid = r.exam_id.toString()
    if (!resultMap[eid]) resultMap[eid] = {}
    resultMap[eid][r.subject] = { marks_obtained: r.marks_obtained, is_absent: r.is_absent }
  }

  const enriched = exams.map(exam => {
    const eid = exam._id.toString()
    const subjects = exam.subjects.map(sub => {
      const r = resultMap[eid]?.[sub.name]
      const obtained = r?.marks_obtained ?? null
      const absent   = r?.is_absent ?? false
      const pct = obtained !== null && !absent ? Math.round((obtained / sub.max_marks) * 100) : null
      return { subject: sub.name, max_marks: sub.max_marks, marks_obtained: obtained, is_absent: absent, percentage: pct }
    })
    const valid = subjects.filter(s => !s.is_absent && s.marks_obtained !== null)
    const totalObt = valid.reduce((a, s) => a + (s.marks_obtained ?? 0), 0)
    const totalMax = valid.reduce((a, s) => a + s.max_marks, 0)
    const overallPct = totalMax > 0 ? Math.round((totalObt / totalMax) * 100) : null
    return { exam_id: eid, title: exam.title, exam_type: exam.exam_type, date: exam.date, subjects, total_obtained: totalObt, total_max: totalMax, overall_pct: overallPct }
  })

  res.json({ exams: enriched })
})

// ── GET /api/parent/child/certificates ───────────────────────────────────────
router.get("/child/certificates", async (req: AuthRequest, res: Response) => {
  if (!requireParent(req, res)) return

  const parent = await User.findById(req.userId).select("school_id linked_student_id").lean()
  if (!parent?.linked_student_id) return void res.status(404).json({ error: "No linked student" })

  const certs = await Certificate.find({
    student_id: parent.linked_student_id,
    school_id:  parent.school_id,
  }).sort({ issued_at: -1 }).lean()

  res.json({ certificates: certs })
})

export default router
