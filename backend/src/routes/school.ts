import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/school.ts — School and class management routes at /api/school.
// Admin operations: school info, class CRUD, timetable saves (with versioning),
// notifications, and announcement management.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { User } from "../models/User.js"
import { School } from "../models/School.js"
import { Class } from "../models/Class.js"
import { TeacherSession } from "../models/TeacherSession.js"
import { Module } from "../models/Module.js"
import { Quiz } from "../models/Quiz.js"
import { CodeChallenge } from "../models/CodeChallenge.js"
import { Certificate } from "../models/Certificate.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { QuizAttempt } from "../models/QuizAttempt.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { ChallengeSubmission } from "../models/ChallengeSubmission.js"
import { ExamDefinition } from "../models/ExamDefinition.js"
import { ExamResult } from "../models/ExamResult.js"
import { Homework } from "../models/Homework.js"
import { HomeworkSubmission } from "../models/HomeworkSubmission.js"
import mongoose from "mongoose"
import { getGridFSBucket } from "../lib/gridfs.js"
import { validateObjectId } from "../lib/validateId.js"
import { Notification } from "../models/Notification.js"
import { NotifRead } from "../models/NotifRead.js"
import { Attendance } from "../models/Attendance.js"
import { AuditLog } from "../models/AuditLog.js"

const router = Router()
router.use(requireAuth)

// Resolve caller's school_id and verify admin role.
// requireAuth middleware (already applied above) sets req.userRole and req.schoolId,
// so no extra DB query is needed here.
function adminSchool(req: AuthRequest): { schoolId: string } | { error: string; status: number } {
  if (!["admin", "super_admin"].includes(req.userRole ?? "")) return { error: "Admin access required", status: 403 }
  if (!req.schoolId) return { error: "No school associated with this account", status: 400 }
  return { schoolId: req.schoolId }
}

// ── GET /api/school ───────────────────────────────────────────────────────────
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const [school, teacherCount, studentCount, classCount] = await Promise.all([
      School.findById(ctx.schoolId).lean(),
      User.countDocuments({ school_id: ctx.schoolId, role: "teacher" }),
      User.countDocuments({ school_id: ctx.schoolId, role: "student" }),
      Class.countDocuments({ school_id: ctx.schoolId }),
    ])

    if (!school) { res.status(404).json({ error: "School not found" }); return }

    res.json({
      school: {
        id: (school._id as { toString(): string }).toString(),
        name: school.name,
        board: school.board,
        city: school.city,
        state: school.state,
        udise_code: school.udise_code,
        subscription_plan: school.subscription_plan,
        two_factor_enabled: school.two_factor_enabled ?? false,
      },
      stats: { teachers: teacherCount, students: studentCount, classes: classCount },
    })
  } catch (err) {
    logger.error({ err: err }, "[school GET /]")
    res.status(500).json({ error: "Failed to load school information" })
  }
})

// ── GET /api/school/classes ───────────────────────────────────────────────────
router.get("/classes", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const classes = await Class.find({ school_id: ctx.schoolId }).sort({ grade: 1, section: 1 }).lean()
    if (!classes.length) { res.json({ classes: [] }); return }

  // Collect all referenced teacher IDs (legacy + multi-teacher)
  const allTeacherIds = [...new Set([
    ...classes.map(c => c.teacher_id?.toString()).filter(Boolean),
    ...classes.flatMap(c => c.teachers.map(t => t.teacher_id?.toString())).filter(Boolean),
  ])] as string[]
  const teacherUsers = allTeacherIds.length
    ? await User.find({ _id: { $in: allTeacherIds } }).select("name").lean()
    : []
  const teacherMap = Object.fromEntries(teacherUsers.map(t => [(t._id as { toString(): string }).toString(), t.name]))

  const classIds = classes.map(c => (c._id as { toString(): string }).toString())
  const students = await User.find({ school_id: ctx.schoolId, role: "student", class_id: { $in: classIds } }).select("class_id").lean()
  const countMap: Record<string, number> = {}
  for (const s of students) {
    const cid = s.class_id?.toString()
    if (cid) countMap[cid] = (countMap[cid] ?? 0) + 1
  }

  res.json({
    classes: classes.map(c => {
      const cid = (c._id as { toString(): string }).toString()
      const tid = c.teacher_id?.toString() ?? null
      return {
        id: cid,
        grade: c.grade,
        section: c.section,
        name: c.name ?? null,
        subjects: c.subjects ?? [],
        timetable: (c.timetable ?? []).map(slot => ({
          day: slot.day, period: slot.period, subject: slot.subject,
          teacher_id: slot.teacher_id?.toString() ?? null,
          start_time: slot.start_time, end_time: slot.end_time,
        })),
        timetable_updated_by_name: c.timetable_updated_by_name ?? null,
        timetable_updated_at: c.timetable_updated_at ?? null,
        timetable_versions: (c.timetable_versions ?? []).map(v => ({
          updated_by_name: v.updated_by_name,
          updated_at: v.updated_at,
          slots: v.slots.map(slot => ({
            day: slot.day, period: slot.period, subject: slot.subject,
            teacher_id: slot.teacher_id?.toString() ?? null,
            start_time: slot.start_time, end_time: slot.end_time,
          })),
        })),
        teacher_id: tid,
        teacher_name: tid ? (teacherMap[tid] ?? null) : null,
        student_count: countMap[cid] ?? 0,
        teachers: c.teachers.map(t => ({
          teacher_id: t.teacher_id.toString(),
          teacher_name: teacherMap[t.teacher_id.toString()] ?? null,
          subject: t.subject,
        })),
      }
    }),
  })
  } catch (err) {
    logger.error({ err: err }, "[school/classes GET]")
    res.status(500).json({ error: "Failed to load classes" })
  }
})

// ── POST /api/school/classes ──────────────────────────────────────────────────
router.post("/classes", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { name, subjects } = req.body as { name: string; subjects?: string[] }
    if (!name?.trim()) { res.status(400).json({ error: "Class name is required" }); return }
    const label = name.trim()
    if (label.length > 100) { res.status(400).json({ error: "Class name must be under 100 characters" }); return }
    if (subjects !== undefined) {
      if (!Array.isArray(subjects)) { res.status(400).json({ error: "subjects must be an array" }); return }
      if (subjects.length > 20) { res.status(400).json({ error: "A class can have at most 20 subjects" }); return }
      if (subjects.some(s => typeof s !== "string" || s.trim().length > 50)) {
        res.status(400).json({ error: "Each subject must be a string under 50 characters" }); return
      }
    }

    try {
      const cls = await Class.create({
        school_id: new mongoose.Types.ObjectId(ctx.schoolId),
        grade: 0,
        section: label.toUpperCase(),
        name: label,
        subjects: subjects?.filter((s: string) => s.trim()) ?? [],
      })
      res.json({ class: { id: (cls._id as { toString(): string }).toString(), grade: cls.grade, section: cls.section, name: cls.name, subjects: cls.subjects } })
    } catch (err) {
      if (err instanceof Error && err.message.includes("duplicate key")) {
        res.status(400).json({ error: `A class named "${label}" already exists in this school.` }); return
      }
      res.status(400).json({ error: "Could not create class. Please try again." })
    }
  } catch (err) {
    logger.error({ err: err }, "[school/classes POST]")
    res.status(500).json({ error: "Failed to create class" })
  }
})

// ── PATCH /api/school/classes/:id ────────────────────────────────────────────
router.patch("/classes/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { name, subjects } = req.body as { name?: string; subjects?: string[] }
    if (name !== undefined && name.trim().length > 100) {
      res.status(400).json({ error: "Class name must be under 100 characters" }); return
    }
    if (subjects !== undefined) {
      if (!Array.isArray(subjects)) { res.status(400).json({ error: "subjects must be an array" }); return }
      if (subjects.length > 20) { res.status(400).json({ error: "A class can have at most 20 subjects" }); return }
      if (subjects.some(s => typeof s !== "string" || s.trim().length > 50)) {
        res.status(400).json({ error: "Each subject must be a string under 50 characters" }); return
      }
    }
    const cls = await Class.findOne({ _id: req.params.id, school_id: ctx.schoolId })
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    if (name !== undefined) cls.name = name?.trim() || null
    if (subjects !== undefined) cls.subjects = subjects.filter(s => s.trim())
    await cls.save()
    res.json({ success: true, name: cls.name, subjects: cls.subjects })
  } catch (err) {
    logger.error({ err: err }, "[school/classes PATCH]")
    res.status(500).json({ error: "Failed to update class" })
  }
})

// ── PUT /api/school/classes/:id/timetable ────────────────────────────────────
router.put("/classes/:id/timetable", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
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
      Class.findOne({ _id: req.params.id, school_id: ctx.schoolId }),
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
      // Validate all assigned teacher_ids belong to this school
      const assignedTeacherIds = [...new Set(assignedSlots.map(s => s.teacher_id!))]
      for (const tid of assignedTeacherIds) {
        if (!mongoose.isValidObjectId(tid)) {
          res.status(400).json({ error: `Invalid teacher_id: ${tid}` }); return
        }
      }
      const validTeachers = await User.find({
        _id:       { $in: assignedTeacherIds.map(id => new mongoose.Types.ObjectId(id)) },
        school_id: ctx.schoolId,
        role:      { $in: ["teacher", "admin", "super_admin"] },
        is_active: true,
      }).select("_id").lean()
      const validTeacherSet = new Set(validTeachers.map(t => t._id.toString()))
      for (const tid of assignedTeacherIds) {
        if (!validTeacherSet.has(new mongoose.Types.ObjectId(tid).toString())) {
          res.status(400).json({ error: "One or more assigned teachers do not belong to your school" }); return
        }
      }

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
        _id: { $ne: new mongoose.Types.ObjectId(req.params.id as string) },
        school_id: ctx.schoolId,
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
    logger.error({ err: err }, "[school/classes/timetable PUT]")
    res.status(500).json({ error: "Failed to save timetable" })
  }
})

// ── DELETE /api/school/classes/:id ───────────────────────────────────────────
router.delete("/classes/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const cls = await Class.findOne({ _id: req.params.id, school_id: ctx.schoolId })
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    const studentCount = await User.countDocuments({ class_id: cls._id, role: "student", is_active: true })
    if (studentCount > 0) {
      res.status(400).json({ error: `Cannot delete class with ${studentCount} active student(s). Transfer or remove students first.` }); return
    }

    const classId = cls._id

    // ── Collect child IDs (outside transaction — reads only) ─────────────────
    const modules    = await Module.find({ class_id: classId }).lean()
    const moduleIds  = modules.map(m => m._id)
    const quizzes    = await Quiz.find({ class_id: classId }).select("_id").lean()
    const quizIds    = quizzes.map(q => q._id)
    const challenges = await CodeChallenge.find({ class_id: classId }).select("_id").lean()
    const challengeIds = challenges.map(c => c._id)
    const exams      = await ExamDefinition.find({ class_id: classId }).select("_id").lean()
    const examIds    = exams.map(e => e._id)
    const homeworks  = await Homework.find({ class_id: classId }).select("_id").lean()
    const hwIds      = homeworks.map(h => h._id)

    // ── GridFS file cleanup (GridFS does not support transactions) ────────────
    const bucket = getGridFSBucket()
    for (const mod of modules) {
      for (const item of (mod.items ?? []) as Array<{ type: string; gridfs_id?: mongoose.Types.ObjectId; pdf_gridfs_id?: mongoose.Types.ObjectId }>) {
        if (item.type === "file") {
          if (item.gridfs_id)     try { await bucket.delete(item.gridfs_id) }     catch { /* already gone */ }
          if (item.pdf_gridfs_id) try { await bucket.delete(item.pdf_gridfs_id) } catch { /* already gone */ }
        }
      }
    }

    // ── Atomic cascade delete — all-or-nothing ───────────────────────────────
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        await ModuleProgress.deleteMany({ module_id: { $in: moduleIds } }, { session })
        await Module.deleteMany({ class_id: classId }, { session })

        await QuizAttempt.deleteMany({ quiz_id: { $in: quizIds } }, { session })
        await Quiz.deleteMany({ class_id: classId }, { session })

        await ChallengeSubmission.deleteMany({ challenge_id: { $in: challengeIds } }, { session })
        await CodeChallenge.deleteMany({ class_id: classId }, { session })

        await ExamResult.deleteMany({ exam_id: { $in: examIds } }, { session })
        await ExamDefinition.deleteMany({ class_id: classId }, { session })

        await HomeworkSubmission.deleteMany({ homework_id: { $in: hwIds } }, { session })
        await Homework.deleteMany({ class_id: classId }, { session })

        await Certificate.deleteMany({ class_id: classId }, { session })
        await Class.findByIdAndDelete(classId, { session })
      })
    } catch (txErr: unknown) {
      const msg = txErr instanceof Error ? txErr.message : ""
      if (msg.includes("Transaction numbers are only allowed on a replica set")) {
        // Standalone MongoDB (local dev without replica set) — run without transaction
        logger.warn("[school/classes DELETE] MongoDB is standalone — running non-transactional cascade. Use a replica set in production.")
        await ModuleProgress.deleteMany({ module_id: { $in: moduleIds } })
        await Module.deleteMany({ class_id: classId })
        await QuizAttempt.deleteMany({ quiz_id: { $in: quizIds } })
        await Quiz.deleteMany({ class_id: classId })
        await ChallengeSubmission.deleteMany({ challenge_id: { $in: challengeIds } })
        await CodeChallenge.deleteMany({ class_id: classId })
        await ExamResult.deleteMany({ exam_id: { $in: examIds } })
        await ExamDefinition.deleteMany({ class_id: classId })
        await HomeworkSubmission.deleteMany({ homework_id: { $in: hwIds } })
        await Homework.deleteMany({ class_id: classId })
        await Certificate.deleteMany({ class_id: classId })
        await Class.findByIdAndDelete(classId)
      } else {
        logger.error({ err: txErr }, "[school/classes DELETE] transaction failed")
        res.status(500).json({ error: "Failed to delete class. Please try again." }); return
      }
    } finally {
      await session.endSession()
    }

    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[school/classes DELETE]")
    res.status(500).json({ error: "Failed to delete class. Please try again." })
  }
})

// ── GET /api/school/teachers ──────────────────────────────────────────────────
router.get("/teachers", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50))
    const skip  = (page - 1) * limit

    const [teachers, classes, total] = await Promise.all([
      User.find({ school_id: ctx.schoolId, role: "teacher" }).select("name email phone is_active profile_photo_url created_at").sort("name").skip(skip).limit(limit).lean(),
      Class.find({ school_id: ctx.schoolId }).select("grade section name teacher_id teachers").lean(),
      User.countDocuments({ school_id: ctx.schoolId, role: "teacher" }),
    ])

  // Primary class label from legacy teacher_id
  const primaryClassMap: Record<string, string> = {}
  for (const c of classes) {
    if (c.teacher_id) primaryClassMap[c.teacher_id.toString()] = (c as unknown as { name?: string | null }).name ?? (c.grade > 0 ? `Class ${c.grade}${c.section}` : c.section)
  }

  // Subject assignments: teacher → [{class_label, subject}]
  const subjectMap: Record<string, Array<{ class_id: string; class_label: string; subject: string }>> = {}
  for (const c of classes) {
    const label = (c as unknown as { name?: string | null }).name ?? (c.grade > 0 ? `Class ${c.grade}${c.section}` : c.section)
    for (const t of c.teachers) {
      const tid = t.teacher_id.toString()
      if (!subjectMap[tid]) subjectMap[tid] = []
      subjectMap[tid].push({ class_id: (c._id as { toString(): string }).toString(), class_label: label, subject: t.subject })
    }
  }

  res.json({
    teachers: teachers.map(t => {
      const tid = (t._id as { toString(): string }).toString()
      return {
        id: tid,
        name: t.name,
        email: t.email,
        phone: t.phone,
        is_active: t.is_active,
        profile_photo_url: (t as unknown as { profile_photo_url?: string }).profile_photo_url ?? null,
        created_at: (t as unknown as { created_at?: Date }).created_at ?? null,
        class_label: primaryClassMap[tid] ?? null,
        subject_assignments: subjectMap[tid] ?? [],
      }
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
  } catch (err) {
    logger.error({ err: err }, "[school/teachers]")
    res.status(500).json({ error: "Failed to load teachers" })
  }
})

// ── GET /api/school/students ──────────────────────────────────────────────────
router.get("/students", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const filter: Record<string, unknown> = { school_id: ctx.schoolId, role: "student" }
    if (req.query.class_id) filter.class_id = req.query.class_id as string

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50))
    const skip  = (page - 1) * limit

    const [students, classes, total] = await Promise.all([
      User.find(filter).select("name email phone username gender class_id is_active profile_photo_url points created_at").sort("name").skip(skip).limit(limit).lean(),
      Class.find({ school_id: ctx.schoolId }).select("grade section name").lean(),
      User.countDocuments(filter),
    ])

  const classMap = Object.fromEntries(classes.map(c => [(c._id as { toString(): string }).toString(), (c as unknown as { name?: string | null }).name ?? (c.grade > 0 ? `Class ${c.grade}${c.section}` : c.section)]))

  res.json({
    students: students.map(s => {
      const cid = s.class_id?.toString() ?? null
      return {
        id: (s._id as { toString(): string }).toString(),
        name: s.name,
        email: s.email,
        phone: s.phone ?? null,
        username: s.username,
        gender: s.gender ?? null,
        class_id: cid,
        class_label: cid ? (classMap[cid] ?? null) : null,
        is_active: s.is_active,
        profile_photo_url: s.profile_photo_url ?? null,
        points: (s as unknown as { points?: number }).points ?? 0,
        created_at: (s as unknown as { created_at?: Date }).created_at ?? null,
      }
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
  } catch (err) {
    logger.error({ err: err }, "[school/students]")
    res.status(500).json({ error: "Failed to load students" })
  }
})

// ── GET /api/school/teacher-detail/:id ───────────────────────────────────────
router.get("/teacher-detail/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const teacherId = new mongoose.Types.ObjectId(String(req.params.id))
    const teacher = await User.findOne({ _id: teacherId, school_id: ctx.schoolId, role: "teacher" }).select("name").lean()
    if (!teacher) { res.status(404).json({ error: "Teacher not found" }); return }

    const schoolObjId = new mongoose.Types.ObjectId(ctx.schoolId)

    const [lastSession, sessionsThisMonth, modulesCount, quizzesCount, challengesCount, assignedClasses] = await Promise.all([
      TeacherSession.findOne({ teacher_id: teacherId }).sort({ login_at: -1 }).select("login_at").lean(),
      TeacherSession.countDocuments({
        teacher_id: teacherId,
        login_at: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      }),
      Module.countDocuments({ school_id: schoolObjId, created_by: teacherId }),
      Quiz.countDocuments({ school_id: schoolObjId, created_by: teacherId }),
      CodeChallenge.countDocuments({ school_id: schoolObjId, created_by: teacherId }),
      Class.find({ school_id: schoolObjId, "teachers.teacher_id": teacherId })
        .select("grade section name teachers")
        .lean(),
    ])

    // Count students per assigned class
    const classDetails = await Promise.all(
      assignedClasses.map(async c => {
        const studentCount = await User.countDocuments({ class_id: c._id, school_id: schoolObjId, role: "student" })
        const label = (c as unknown as { name?: string | null }).name ?? (c.grade > 0 ? `Class ${c.grade}${c.section}` : c.section)
        const subjects = (c.teachers as Array<{ teacher_id: mongoose.Types.ObjectId; subject: string }>)
          .filter(t => t.teacher_id.toString() === teacherId.toString())
          .map(t => t.subject)
        return { label, student_count: studentCount, subjects }
      })
    )

    const totalStudents = classDetails.reduce((sum, c) => sum + c.student_count, 0)

    res.json({
      last_login: lastSession ? (lastSession as unknown as { login_at: Date }).login_at : null,
      sessions_this_month: sessionsThisMonth,
      modules_count: modulesCount,
      quizzes_count: quizzesCount,
      challenges_count: challengesCount,
      total_students: totalStudents,
      class_details: classDetails,
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher-detail]")
    res.status(500).json({ error: "Failed to load teacher details" })
  }
})

// ── GET /api/school/student-detail/:id ───────────────────────────────────────
router.get("/student-detail/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const studentId = new mongoose.Types.ObjectId(String(req.params.id))
    const student = await User.findOne({ _id: studentId, school_id: ctx.schoolId, role: "student" }).select("name class_id").lean()
    if (!student) { res.status(404).json({ error: "Student not found" }); return }

    const schoolObjId = new mongoose.Types.ObjectId(ctx.schoolId)

    const [certificatesCount, lastActivity, quizAttempts, moduleProgressRecords] = await Promise.all([
      Certificate.countDocuments({ student_id: studentId }),
      StudentActivity.findOne({ student_id: studentId }).sort({ date: -1 }).select("date minutes_active").lean(),
      QuizAttempt.find({ student_id: studentId }).select("percentage").lean(),
      ModuleProgress.find({ student_id: studentId }).select("module_id").lean(),
    ])

    // Attendance: pull all attendance records for this student's class
    let present = 0, late = 0, absent = 0
    if (student.class_id) {
      const records = await Attendance.find({ class_id: student.class_id }).select("records").lean()
      for (const rec of records) {
        const studentRec = rec.records?.find(r => r.student_id?.toString() === studentId.toString())
        if (studentRec) {
          if (studentRec.status === "present") present++
          else if (studentRec.status === "late") late++
          else if (studentRec.status === "absent") absent++
        }
      }
    }
    const total = present + late + absent
    const attendance_rate = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : null

    const modules_completed = new Set(moduleProgressRecords.map(r => (r as unknown as { module_id: { toString(): string } }).module_id?.toString())).size
    const quiz_avg = quizAttempts.length > 0
      ? Math.round(quizAttempts.reduce((sum, a) => sum + ((a as unknown as { percentage: number }).percentage ?? 0), 0) / quizAttempts.length)
      : null

    res.json({
      attendance_rate,
      attendance_breakdown: { present, late, absent, total },
      last_active: lastActivity ? (lastActivity as unknown as { date: string }).date : null,
      minutes_active_last_day: lastActivity ? (lastActivity as unknown as { minutes_active: number }).minutes_active : 0,
      certificates_count: certificatesCount,
      modules_completed,
      quizzes_attempted: quizAttempts.length,
      quiz_avg_score: quiz_avg,
    })
  } catch (err) {
    logger.error({ err: err }, "[student-detail]")
    res.status(500).json({ error: "Failed to load student details" })
  }
})

// Helper: resolve date range from a period name (IST-aware)
function periodDateRange(period: string, from?: string, to?: string): { from: string; to: string } {
  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  if (period === "today") return { from: todayIST, to: todayIST }
  if (period === "week") {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
    const dow = d.getDay()
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    const weekStart = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    return { from: weekStart, to: todayIST }
  }
  if (period === "month") {
    return { from: todayIST.slice(0, 8) + "01", to: todayIST }
  }
  if (period === "year") {
    const y = parseInt(todayIST.slice(0, 4))
    const m = parseInt(todayIST.slice(5, 7))
    const acadYear = m >= 6 ? y : y - 1
    return { from: `${acadYear}-06-01`, to: todayIST }
  }
  // custom — sanitise and normalise
  const f = (from ?? todayIST).slice(0, 10)
  const t = (to   ?? todayIST).slice(0, 10)
  return { from: f <= t ? f : t, to: f <= t ? t : f }
}

// ── GET /api/school/teacher-attendance-detail/:id ────────────────────────────
// Query: ?period=today|week|month|year|custom  &from=YYYY-MM-DD  &to=YYYY-MM-DD
router.get("/teacher-attendance-detail/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const teacherId = new mongoose.Types.ObjectId(String(req.params.id))
    const teacher = await User.findOne({ _id: teacherId, school_id: ctx.schoolId, role: "teacher" }).select("name").lean()
    if (!teacher) { res.status(404).json({ error: "Teacher not found" }); return }

    const period = (req.query.period as string) || "month"
    const { from, to } = periodDateRange(period, req.query.from as string, req.query.to as string)

    const sessions = await TeacherSession.find({
      teacher_id: teacherId,
      date: { $gte: from, $lte: to },
    }).sort({ date: 1, login_at: 1 }).select("date login_at logout_at duration_minutes").lean()

    type SessionDoc = { date: string; login_at: Date | null; logout_at: Date | null; duration_minutes: number }

    const login_days = new Set(sessions.map(s => (s as unknown as SessionDoc).date)).size
    const total_mins = sessions.reduce((sum, s) => sum + ((s as unknown as SessionDoc).duration_minutes ?? 0), 0)
    const total_hours = Math.round(total_mins / 6) / 10

    const msInDay = 86400000
    const total_days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / msInDay) + 1)
    const attendance_pct = Math.round((login_days / total_days) * 100)

    res.json({
      period, from, to,
      login_days,
      total_days,
      total_hours,
      attendance_pct,
      sessions: sessions.map(s => {
        const ss = s as unknown as SessionDoc
        return { date: ss.date, login_at: ss.login_at, logout_at: ss.logout_at ?? null, duration_minutes: ss.duration_minutes ?? 0 }
      }),
    })
  } catch (err) {
    logger.error({ err: err }, "[teacher-attendance-detail]")
    res.status(500).json({ error: "Failed to load attendance details" })
  }
})

// ── GET /api/school/student-attendance-detail/:id ────────────────────────────
// Query: ?period=today|week|month|year|custom  &from=YYYY-MM-DD  &to=YYYY-MM-DD
router.get("/student-attendance-detail/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const studentId = new mongoose.Types.ObjectId(String(req.params.id))
    const student = await User.findOne({ _id: studentId, school_id: ctx.schoolId, role: "student" }).select("class_id").lean()
    if (!student) { res.status(404).json({ error: "Student not found" }); return }

    const period = (req.query.period as string) || "month"
    const { from, to } = periodDateRange(period, req.query.from as string, req.query.to as string)

    if (!student.class_id) {
      res.json({ period, from, to, summary: { total: 0, present: 0, late: 0, absent: 0, rate: null }, records: [] }); return
    }

    const docs = await Attendance.find({
      class_id: student.class_id,
      date: { $gte: from, $lte: to },
    }).sort({ date: 1, period: 1 }).select("date period subject records").lean()

    type AttDoc = { date: string; period: number; subject: string; records: Array<{ student_id: { toString(): string }; status: string }> }

    let present = 0, late = 0, absent = 0
    const records: Array<{ date: string; period: number; subject: string; status: string }> = []

    for (const doc of docs) {
      const dd = doc as unknown as AttDoc
      const rec = dd.records?.find(r => r.student_id?.toString() === studentId.toString())
      if (!rec) continue
      if (rec.status === "present") present++
      else if (rec.status === "late") late++
      else if (rec.status === "absent") absent++
      records.push({ date: dd.date, period: dd.period, subject: dd.subject, status: rec.status })
    }

    const total = present + late + absent
    const rate = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : null

    res.json({ period, from, to, summary: { total, present, late, absent, rate }, records })
  } catch (err) {
    logger.error({ err: err }, "[student-attendance-detail]")
    res.status(500).json({ error: "Failed to load attendance details" })
  }
})

// ── PATCH /api/school ─────────────────────────────────────────────────────────
router.patch("/", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { name, board, city, state, udise_code } = req.body as Record<string, string>
    if (name !== undefined && (!name.trim() || name.trim().length > 200)) {
      res.status(400).json({ error: "School name must be 1–200 characters" }); return
    }
    if (board !== undefined && (!board.trim() || board.trim().length > 100)) {
      res.status(400).json({ error: "Board must be 1–100 characters" }); return
    }
    if (city !== undefined && city && city.trim().length > 100) {
      res.status(400).json({ error: "City must be under 100 characters" }); return
    }
    if (state !== undefined && state && state.trim().length > 100) {
      res.status(400).json({ error: "State must be under 100 characters" }); return
    }
    if (udise_code !== undefined && udise_code && !/^\d{0,11}$/.test(udise_code.trim())) {
      res.status(400).json({ error: "UDISE code must be up to 11 digits" }); return
    }
    const updates: Record<string, string> = {}
    if (name) updates.name = name.trim()
    if (board) updates.board = board.trim()
    if (city !== undefined) updates.city = city.trim()
    if (state !== undefined) updates.state = state.trim()
    if (udise_code !== undefined) updates.udise_code = udise_code.trim()

    const school = await School.findByIdAndUpdate(ctx.schoolId, updates, { returnDocument: "after" })
    if (!school) { res.status(404).json({ error: "School not found" }); return }
    res.json({ school: { id: school._id.toString(), name: school.name, board: school.board, city: school.city, state: school.state, udise_code: school.udise_code, subscription_plan: school.subscription_plan, two_factor_enabled: school.two_factor_enabled ?? false } })
  } catch (err) {
    logger.error({ err: err }, "[school PATCH]")
    res.status(500).json({ error: "Failed to update school information" })
  }
})

// ── PATCH /api/school/two-factor ──────────────────────────────────────────────
// Admin enables or disables 2FA for all teacher/admin sign-ins in this school.
router.patch("/two-factor", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { enabled } = req.body as { enabled?: boolean }
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled (boolean) is required" }); return
    }

    await School.findByIdAndUpdate(ctx.schoolId, { two_factor_enabled: enabled })
    res.json({ success: true, two_factor_enabled: enabled })
  } catch (err) {
    logger.error({ err: err }, "[school PATCH /two-factor]")
    res.status(500).json({ error: "Failed to update two-factor setting" })
  }
})

// ── PATCH /api/school/classes/:id/teacher ─────────────────────────────────────
router.patch("/classes/:id/teacher", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { teacher_id } = req.body as { teacher_id: string | null }
    const cls = await Class.findOne({ _id: req.params.id, school_id: ctx.schoolId })
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    if (teacher_id) {
      if (!mongoose.isValidObjectId(teacher_id))
        return void res.status(400).json({ error: "Invalid teacher_id" })

      // super_admin can assign teachers across schools; admin must verify ownership
      if (req.userRole !== "super_admin") {
        const teacher = await User.findOne({
          _id:       new mongoose.Types.ObjectId(teacher_id),
          school_id: ctx.schoolId,
          role:      "teacher",
          is_active: true,
        }).lean()
        if (!teacher) {
          res.status(400).json({ error: "Teacher not found in your school" }); return
        }
      }
      cls.teacher_id = new mongoose.Types.ObjectId(teacher_id)
    } else {
      cls.teacher_id = null
    }

    await cls.save()
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[school/classes/teacher PATCH]")
    res.status(500).json({ error: "Failed to assign teacher" })
  }
})

// ── GET /api/school/my-student-info ──────────────────────────────────────────
router.get("/my-student-info", async (req: AuthRequest, res: Response) => {
  try {
    const student = await User.findById(req.userId!).select("role class_id").lean()
    if (!student) { res.status(404).json({ error: "User not found" }); return }
    if (student.role !== "student") { res.status(403).json({ error: "Student access required" }); return }
    if (!student.class_id) { res.json({ class: null }); return }

    const cls = await Class.findById(student.class_id).select("grade section name").lean()
    res.json({
      class: cls ? { id: (cls._id as { toString(): string }).toString(), grade: cls.grade, section: cls.section, label: (cls as unknown as { name?: string | null }).name ?? (cls.grade > 0 ? `Class ${cls.grade}${cls.section}` : cls.section) } : null,
    })
  } catch (err) {
    logger.error({ err: err }, "[school/my-student-info]")
    res.status(500).json({ error: "Failed to load student information" })
  }
})

// ── GET /api/school/my-class ─────────────────────────────────────────────────
// Teachers/admins: returns class where teacher_id = me + student roster
// Students: returns the class they are enrolled in (no student roster)
router.get("/my-class", async (req: AuthRequest, res: Response) => {
  try {
  const currentUser = await User.findById(req.userId!).select("role school_id class_id").lean()
  if (!currentUser) { res.status(404).json({ error: "User not found" }); return }

  // Student path
  if (currentUser.role === "student") {
    if (!currentUser.class_id) { res.json({ class: null, students: [] }); return }
    const cls = await Class.findById(currentUser.class_id).select("grade section name teacher_id teachers").lean()
    if (!cls) { res.json({ class: null, students: [] }); return }

    // Collect all teacher IDs (primary + subject teachers)
    const teacherIds = [
      (cls.teacher_id as { toString(): string } | null)?.toString(),
      ...(cls.teachers ?? []).map((t: { teacher_id: { toString(): string }; subject: string }) => t.teacher_id?.toString()),
    ].filter(Boolean) as string[]
    const uniqueTeacherIds = [...new Set(teacherIds)]
    const teacherDocs = uniqueTeacherIds.length > 0
      ? await User.find({ _id: { $in: uniqueTeacherIds } }).select("name").lean()
      : []
    const teacherMap: Record<string, string> = {}
    teacherDocs.forEach((t: { _id: { toString(): string }; name: string }) => { teacherMap[t._id.toString()] = t.name })

    const primaryTeacherId = (cls.teacher_id as { toString(): string } | null)?.toString() ?? null
    const primaryTeacherName = primaryTeacherId ? (teacherMap[primaryTeacherId] ?? null) : null

    const subjectTeachers = (cls.teachers ?? []).map((t: { teacher_id: { toString(): string }; subject: string }) => ({
      teacher_id: t.teacher_id?.toString() ?? null,
      teacher_name: t.teacher_id ? (teacherMap[t.teacher_id.toString()] ?? null) : null,
      subject: t.subject,
    }))

    const clsName = (cls as unknown as { name?: string | null }).name
    res.json({
      class: {
        id: (cls._id as { toString(): string }).toString(),
        grade: cls.grade,
        section: cls.section,
        label: clsName ?? (cls.grade > 0 ? `Class ${cls.grade}${cls.section}` : cls.section),
        teacher_name: primaryTeacherName,
        subject_teachers: subjectTeachers,
      },
      students: [],
    })
    return
  }

  // Teacher/admin path
  if (!["teacher", "admin", "super_admin"].includes(currentUser.role)) {
    res.status(403).json({ error: "Access required" }); return
  }

  const cls = await Class.findOne({
    school_id: currentUser.school_id,
    $or: [
      { teacher_id: req.userId! },
      { "teachers.teacher_id": req.userId! },
    ],
  }).select("grade section name").lean()
  if (!cls) { res.json({ class: null, students: [] }); return }

  const students = await User.find({ class_id: cls._id, role: "student" }).select("name username is_active profile_photo_url").sort("name").lean()

  const clsNameTA = (cls as unknown as { name?: string | null }).name
  res.json({
    class: { id: (cls._id as { toString(): string }).toString(), grade: cls.grade, section: cls.section, label: clsNameTA ?? (cls.grade > 0 ? `Class ${cls.grade}${cls.section}` : cls.section) },
    students: students.map(s => ({
      id: (s._id as { toString(): string }).toString(),
      name: s.name,
      username: s.username,
      is_active: s.is_active,
      profile_photo_url: s.profile_photo_url ?? null,
    })),
  })
  } catch (err) {
    logger.error({ err: err }, "[school/my-class]")
    res.status(500).json({ error: "Failed to load class information" })
  }
})

// ── GET /api/school/teacher-sessions ─────────────────────────────────────────
// Returns per-teacher attendance (login days) + total active hours for a date range
// Query: ?days=30 (default 30)
router.get("/teacher-sessions", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

  const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  const startParam = req.query.start_date as string | undefined
  const endParam   = req.query.end_date   as string | undefined

  let sinceDate: string
  let endDate: string
  let days: number

  if (startParam && endParam) {
    sinceDate = startParam
    endDate   = endParam <= todayDate ? endParam : todayDate
    days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(sinceDate).getTime()) / 86400000) + 1)
  } else {
    days = Math.min(parseInt((req.query.days as string) ?? "30"), 365)
    const since = new Date()
    since.setDate(since.getDate() - days)
    sinceDate = since.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    endDate = todayDate
  }

  const schoolObjectId = new mongoose.Types.ObjectId(ctx.schoolId)

  // MongoDB aggregation: group sessions per teacher over the date window
  const pipeline = [
    { $match: { school_id: schoolObjectId, date: { $gte: sinceDate, $lte: endDate } } },
    { $group: {
      _id: "$teacher_id",
      login_days:     { $addToSet: "$date" },
      total_mins:     { $sum: "$duration_minutes" },
      last_login_at:  { $max: "$login_at" },
      // Collect today's sessions to compute online status
      today_sessions: {
        $push: {
          $cond: [
            { $eq: ["$date", todayDate] },
            { login_at: "$login_at", logout_at: "$logout_at", duration_minutes: "$duration_minutes" },
            "$$REMOVE",
          ],
        },
      },
    }},
  ]

  type SessionAgg = {
    _id: mongoose.Types.ObjectId
    login_days: string[]
    total_mins: number
    last_login_at: Date | null
    today_sessions: Array<{ login_at: Date; logout_at: Date | null; duration_minutes: number }>
  }

  const sessionAgg = await TeacherSession.aggregate<SessionAgg>(pipeline)
  const aggMap = new Map(sessionAgg.map(s => [s._id.toString(), s]))

  // All teachers in this school
  const teachers = await User.find({
    school_id: schoolObjectId,
    role: { $in: ["teacher", "admin"] },
    is_active: true,
  }).select("name email").lean()

  const summary = teachers.map(t => {
    const tid = (t._id as { toString(): string }).toString()
    const agg = aggMap.get(tid)

    const loginDayCount = agg?.login_days.length ?? 0
    const totalMins     = agg?.total_mins ?? 0
    const lastLogin     = agg?.last_login_at ?? null

    // Today's status: pick the most recent session for today
    const todaySessions = (agg?.today_sessions ?? []).filter(s => s.login_at != null)
    const todaySession  = todaySessions.length > 0
      ? todaySessions.sort((a, b) => new Date(b.login_at).getTime() - new Date(a.login_at).getTime())[0]
      : null
    const isOnline = todaySession ? todaySession.logout_at === null : false

    return {
      id:             tid,
      name:           t.name,
      email:          t.email,
      login_days:     loginDayCount,
      total_hours:    Math.round(totalMins / 60 * 10) / 10,
      attendance_pct: days > 0 ? Math.round((loginDayCount / days) * 100) : 0,
      is_online:      isOnline,
      last_login:     lastLogin,
      today: todaySession ? {
        clock_in:         todaySession.login_at,
        clock_out:        todaySession.logout_at ?? null,
        duration_minutes: isOnline
          ? Math.round((Date.now() - new Date(todaySession.login_at).getTime()) / 60000)
          : (todaySession.duration_minutes ?? 0),
      } : null,
    }
  })

  res.json({ summary, days })
  } catch (err) {
    logger.error({ err: err }, "[school/teacher-sessions]")
    res.status(500).json({ error: "Failed to load teacher sessions" })
  }
})

// ── GET /api/school/attendance/today ─────────────────────────────────────────
// Returns today's attendance status for every student in the school.
// status: "present" | "absent" | "late" | "not_recorded"
router.get("/attendance/today", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const db = mongoose.connection.db
    if (!db) { res.json({ attendance: [], date: "" }); return }

    // Today in IST (YYYY-MM-DD)
    const istOffset = 5.5 * 60 * 60 * 1000
    const today = new Date(Date.now() + istOffset).toISOString().slice(0, 10)

    // All classes with timetable (to check expected periods per class today)
    const classes = await Class.find({ school_id: ctx.schoolId }, "_id timetable").lean()
    const classIds = classes.map(c => c._id)

    // All students in this school
    const students = await User.find({ school_id: ctx.schoolId, role: "student" }, "_id name").lean()

    // Today's attendance docs across all classes
    const attDocs = await db.collection("attendances").find({
      class_id: { $in: classIds },
      date: today,
    }).toArray()

    // Today's day name in IST (0=Sunday maps to "Sunday", 1=Monday → "Monday", etc.)
    const IST_DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    const todayDayName = IST_DAY_NAMES[new Date(Date.now() + istOffset).getUTCDay()]

    // For each class: compute expected periods (timetable slots with a subject today)
    const classExpected = new Map<string, number>()
    for (const cls of classes) {
      const timetable = (cls as unknown as { timetable?: Array<{ day: string; period: number; subject: string }> }).timetable ?? []
      const todaySlots = timetable.filter(s => s.day === todayDayName && s.subject?.trim())
      const uniquePeriods = new Set(todaySlots.map(s => s.period))
      classExpected.set(cls._id.toString(), uniquePeriods.size)
    }

    // For each class: count how many distinct periods have attendance docs today
    const classMarked = new Map<string, Set<number>>()
    for (const doc of attDocs) {
      const cid = doc.class_id.toString()
      const set = classMarked.get(cid) ?? new Set<number>()
      set.add(doc.period as number)
      classMarked.set(cid, set)
    }

    // A class is "fully marked" only if marked periods >= expected periods AND expected > 0
    const fullyMarkedClasses = new Set<string>()
    for (const [cid, expected] of classExpected) {
      const marked = classMarked.get(cid)?.size ?? 0
      if (expected > 0 && marked >= expected) fullyMarkedClasses.add(cid)
    }

    // Aggregate counts ONLY from fully-marked classes
    const countsMap = new Map<string, { present: number; total: number }>()
    for (const doc of attDocs) {
      const cid = doc.class_id.toString()
      if (!fullyMarkedClasses.has(cid)) continue
      for (const record of (doc.records ?? []) as Array<{ student_id: unknown; status: string }>) {
        const sid = record.student_id!.toString()
        const cur = countsMap.get(sid) ?? { present: 0, total: 0 }
        if (record.status === "present" || record.status === "late") cur.present++
        cur.total++
        countsMap.set(sid, cur)
      }
    }

    const attendance = students.map(s => {
      const sid = (s._id as mongoose.Types.ObjectId).toString()
      const counts = countsMap.get(sid)
      const present_count = counts?.present ?? 0
      const total_count = counts?.total ?? 0
      const status = total_count === 0 ? "not_recorded" : present_count > 0 ? "present" : "absent"
      return { student_id: sid, status, present_count, total_count }
    })

    res.json({ attendance, date: today })
  } catch (err) {
    logger.error({ err: err }, "[school/attendance/today]")
    res.status(500).json({ error: "Failed to load attendance" })
  }
})

// Notification and NotifRead are imported from models/ at the top of this file

// ── POST /api/school/notifications ───────────────────────────────────────────
// Admin creates a notification
router.post("/notifications", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const { type, title, message, target, target_label, scheduled_at, expires_at } = req.body as {
      type?: string; title: string; message: string
      target?: string; target_label?: string
      scheduled_at?: string; expires_at?: string
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

    const creator = await User.findById(req.userId!).select("name role").lean()

    const NOTIF_TYPES = ["announcement", "reminder", "achievement", "alert", "event"] as const
    type NotifType = typeof NOTIF_TYPES[number]
    const validType: NotifType = NOTIF_TYPES.includes(type as NotifType) ? type as NotifType : "announcement"

    const notif = await Notification.create({
      school_id:       new mongoose.Types.ObjectId(ctx.schoolId),
      created_by:      new mongoose.Types.ObjectId(req.userId!),
      created_by_name: (creator as { name: string } | null)?.name ?? "Admin",
      created_by_role: (creator as { role: string } | null)?.role ?? "admin",
      type:            validType,
      title:           title.trim(),
      message:         message.trim(),
      target:          target ?? "all",
      target_label:    target_label ?? "Everyone",
      scheduled_at:    scheduled_at ? new Date(scheduled_at) : null,
      expires_at:      expires_at   ? new Date(expires_at)   : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })

    res.json({ success: true, notification: { id: (notif._id as { toString(): string }).toString() } })
  } catch (err) {
    logger.error({ err: err }, "[school/notifications POST]")
    res.status(500).json({ error: "Failed to send notification" })
  }
})

// ── GET /api/school/notifications ────────────────────────────────────────────
router.get("/notifications", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const notifs = await Notification.find({ school_id: new mongoose.Types.ObjectId(ctx.schoolId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean() as Array<{
        _id: { toString(): string }; type: string; title: string; message: string
        target: string; target_label: string; created_by_name: string; created_by_role: string
        scheduled_at: Date | null; expires_at: Date | null; createdAt: Date
      }>

    res.json({
      notifications: notifs.map(n => ({
        id: n._id.toString(), type: n.type, title: n.title, message: n.message,
        target: n.target, target_label: n.target_label,
        created_by_name: n.created_by_name, created_by_role: n.created_by_role,
        scheduled_at: n.scheduled_at ?? null, expires_at: n.expires_at ?? null,
        created_at: n.createdAt,
      })),
    })
  } catch (err) {
    logger.error({ err: err }, "[school/notifications GET]")
    res.status(500).json({ error: "Failed to load notifications" })
  }
})

// ── DELETE /api/school/notifications/:id ─────────────────────────────────────
router.delete("/notifications/:id", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    await Notification.deleteOne({ _id: req.params.id, school_id: new mongoose.Types.ObjectId(ctx.schoolId) })
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[school/notifications DELETE]")
    res.status(500).json({ error: "Failed to delete notification" })
  }
})

// ── GET /api/school/audit-log — admin: paginated audit log for school ─────────
router.get("/audit-log", async (req: AuthRequest, res: Response) => {
  try {
    const ctx = adminSchool(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50))
    const skip  = (page - 1) * limit

    const filter: Record<string, unknown> = { school_id: new mongoose.Types.ObjectId(ctx.schoolId) }
    if (req.query.actor_id) filter.actor_id = new mongoose.Types.ObjectId(req.query.actor_id as string)
    if (req.query.action)   filter.action   = req.query.action

    const [entries, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ])

    res.json({ entries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
  } catch (err) {
    logger.error({ err: err }, "[school/audit-log GET]")
    res.status(500).json({ error: "Failed to load audit log" })
  }
})

export default router
