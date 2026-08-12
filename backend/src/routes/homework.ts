import { logger } from "../lib/logger.js"
import { Router, type Response } from "express"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { Homework } from "../models/Homework.js"
import { HomeworkSubmission } from "../models/HomeworkSubmission.js"
import { User } from "../models/User.js"
import { Class } from "../models/Class.js"
import { validateObjectId } from "../lib/validateId.js"

const router = Router()
router.use(requireAuth)

// ── GET /api/homework — list homework for a class ─────────────────────────────
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select("school_id class_id role").lean()
    if (!user) return void res.status(401).json({ error: "User not found" })

    let filter: Record<string, unknown>

    if (req.userRole === "student") {
      if (!user.class_id) return void res.json({ homework: [] })
      filter = { school_id: user.school_id, class_id: user.class_id, is_active: true }
    } else {
      const { class_id } = req.query as { class_id?: string }
      if (!class_id) return void res.status(400).json({ error: "class_id is required" })
      if (!mongoose.isValidObjectId(class_id))
        return void res.status(400).json({ error: "Invalid class_id" })
      filter = {
        school_id: user.school_id,
        class_id:  new mongoose.Types.ObjectId(class_id),
      }
    }

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50))
    const skip  = (page - 1) * limit

    const [homework, total] = await Promise.all([
      Homework.find(filter).sort({ due_date: -1 }).skip(skip).limit(limit).lean(),
      Homework.countDocuments(filter),
    ])

    if (req.userRole !== "student") {
      return void res.json({ homework, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
    }

    // For students, include their own submission status
    const ids = homework.map(h => h._id)
    const submissions = await HomeworkSubmission.find({
      homework_id: { $in: ids },
      student_id:  new mongoose.Types.ObjectId(req.userId!),
    }).select("homework_id submitted_at feedback marks").lean()

    const subMap = new Map(submissions.map(s => [s.homework_id.toString(), s]))

    const enriched = homework.map(h => ({
      ...h,
      submission: subMap.get(h._id.toString()) ?? null,
    }))

    res.json({ homework: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
  } catch (err) {
    logger.error({ err }, "GET /homework failed")
    res.status(500).json({ error: "Failed to fetch homework" })
  }
})

// ── POST /api/homework — teacher creates homework ─────────────────────────────
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== "teacher" && req.userRole !== "admin" && req.userRole !== "super_admin") {
      return void res.status(403).json({ error: "Teachers only" })
    }
    const { class_id, subject, title, description, due_date } =
      req.body as { class_id?: string; subject?: string; title?: string; description?: string; due_date?: string }

    if (!class_id || !subject?.trim() || !title?.trim() || !due_date) {
      return void res.status(400).json({ error: "class_id, subject, title, and due_date are required" })
    }
    if (!mongoose.isValidObjectId(class_id))
      return void res.status(400).json({ error: "Invalid class_id" })

    // Validate due_date is a real date
    const parsedDueDate = new Date(due_date)
    if (isNaN(parsedDueDate.getTime()))
      return void res.status(400).json({ error: "due_date is not a valid date" })

    const user = await User.findById(req.userId).select("school_id").lean()
    if (!user) return void res.status(401).json({ error: "User not found" })
    if (!user.school_id) return void res.status(400).json({ error: "User has no school" })

    // Verify class_id belongs to the teacher's school
    const cls = await Class.findOne({
      _id:       new mongoose.Types.ObjectId(class_id),
      school_id: user.school_id,
    }).lean()
    if (!cls) return void res.status(403).json({ error: "Class not found in your school" })

    // For teachers (not admins), verify they are assigned to this class
    if (req.userRole === "teacher") {
      const isAssigned =
        cls.teachers?.some((t: { teacher_id: mongoose.Types.ObjectId }) =>
          t.teacher_id.toString() === req.userId
        ) ||
        cls.teacher_id?.toString() === req.userId
      if (!isAssigned)
        return void res.status(403).json({ error: "You are not assigned to this class" })
    }

    const hw = await Homework.create({
      school_id:   user.school_id,
      class_id:    new mongoose.Types.ObjectId(class_id),
      created_by:  new mongoose.Types.ObjectId(req.userId!),
      subject:     subject.trim(),
      title:       title.trim().slice(0, 200),
      description: (description ?? "").trim().slice(0, 2000),
      due_date:    parsedDueDate,
    })

    res.status(201).json({ homework: hw })
  } catch (err) {
    logger.error({ err }, "POST /homework failed")
    res.status(500).json({ error: "Failed to create homework" })
  }
})

// ── PATCH /api/homework/:id — teacher edits homework ─────────────────────────
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!validateObjectId(req.params.id, res, "homework ID")) return
    if (req.userRole !== "teacher" && req.userRole !== "admin" && req.userRole !== "super_admin") {
      return void res.status(403).json({ error: "Teachers only" })
    }
    const user = await User.findById(req.userId).select("school_id").lean()
    if (!user) return void res.status(401).json({ error: "User not found" })

    const hw = await Homework.findOne({
      _id:       new mongoose.Types.ObjectId(req.params.id),
      school_id: user.school_id,
      created_by: new mongoose.Types.ObjectId(req.userId!),
    })
    if (!hw) return void res.status(404).json({ error: "Homework not found" })

    const { title, description, due_date, is_active } =
      req.body as { title?: string; description?: string; due_date?: string; is_active?: boolean }

    if (title !== undefined) hw.title = title.trim().slice(0, 200)
    if (description !== undefined) hw.description = description.trim().slice(0, 2000)
    if (due_date !== undefined) {
      const parsedDate = new Date(due_date)
      if (isNaN(parsedDate.getTime()))
        return void res.status(400).json({ error: "due_date is not a valid date" })
      hw.due_date = parsedDate
    }
    if (is_active !== undefined) hw.is_active = is_active

    await hw.save()
    res.json({ homework: hw })
  } catch (err) {
    logger.error({ err }, "PATCH /homework/:id failed")
    res.status(500).json({ error: "Failed to update homework" })
  }
})

// ── DELETE /api/homework/:id — teacher deletes homework ──────────────────────
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  if (!validateObjectId(req.params.id, res, "homework ID")) return
  if (req.userRole !== "teacher" && req.userRole !== "admin" && req.userRole !== "super_admin") {
    return void res.status(403).json({ error: "Teachers only" })
  }
  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const hw = await Homework.findOne({
    _id:        new mongoose.Types.ObjectId(req.params.id),
    school_id:  user.school_id,
    created_by: new mongoose.Types.ObjectId(req.userId!),
  })
  if (!hw) return void res.status(404).json({ error: "Homework not found" })

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await HomeworkSubmission.deleteMany({ homework_id: hw._id }, { session })
      await hw.deleteOne({ session })
    })
  } catch (txErr: unknown) {
    const msg = txErr instanceof Error ? txErr.message : ""
    if (msg.includes("Transaction numbers are only allowed on a replica set")) {
      logger.warn("[homework DELETE] MongoDB is standalone — running non-transactional delete. Use a replica set in production.")
      await HomeworkSubmission.deleteMany({ homework_id: hw._id })
      await hw.deleteOne()
    } else {
      logger.error({ err: txErr }, "DELETE /homework/:id transaction failed")
      res.status(500).json({ error: "Failed to delete homework" })
      return
    }
  } finally {
    await session.endSession()
  }

  res.json({ success: true })
})

// ── POST /api/homework/:id/submit — student submits homework ─────────────────
router.post("/:id/submit", async (req: AuthRequest, res: Response) => {
  try {
    if (!validateObjectId(req.params.id, res, "homework ID")) return
    if (req.userRole !== "student") return void res.status(403).json({ error: "Students only" })

    const { answer_text } = req.body as { answer_text?: string }
    if (!answer_text?.trim()) return void res.status(400).json({ error: "answer_text is required" })

    const user = await User.findById(req.userId).select("school_id class_id").lean()
    if (!user) return void res.status(401).json({ error: "User not found" })

    const hw = await Homework.findOne({
      _id:       new mongoose.Types.ObjectId(req.params.id),
      school_id: user.school_id,
      class_id:  user.class_id,
      is_active: true,
    }).lean()
    if (!hw) return void res.status(404).json({ error: "Homework not found" })

    if (hw.due_date && new Date() > new Date(hw.due_date)) {
      return void res.status(400).json({ error: "The deadline for this homework has passed" })
    }

    const submission = await HomeworkSubmission.findOneAndUpdate(
      { homework_id: hw._id, student_id: new mongoose.Types.ObjectId(req.userId!) },
      {
        $set: {
          school_id:    user.school_id,
          answer_text:  answer_text.trim().slice(0, 5000),
          updated_at:   new Date(),
        },
        $setOnInsert: { submitted_at: new Date() },
      },
      { upsert: true, new: true }
    )

    res.json({ submission })
  } catch (err) {
    logger.error({ err }, "POST /homework/:id/submit failed")
    res.status(500).json({ error: "Failed to submit homework" })
  }
})

// ── GET /api/homework/:id/submissions — teacher views all submissions ─────────
router.get("/:id/submissions", async (req: AuthRequest, res: Response) => {
  try {
    if (!validateObjectId(req.params.id, res, "homework ID")) return
    if (req.userRole === "student") return void res.status(403).json({ error: "Teachers only" })

    const user = await User.findById(req.userId).select("school_id").lean()
    if (!user) return void res.status(401).json({ error: "User not found" })

    const hw = await Homework.findOne({
      _id:       new mongoose.Types.ObjectId(req.params.id),
      school_id: user.school_id,
    }).lean()
    if (!hw) return void res.status(404).json({ error: "Homework not found" })

    const submissions = await HomeworkSubmission.find({ homework_id: hw._id }).lean()

    const studentIds = submissions.map(s => s.student_id)
    const students   = await User.find({ _id: { $in: studentIds }, is_active: true })
      .select("_id name")
      .lean()
    const nameMap = new Map(students.map(s => [s._id.toString(), s.name]))

    const enriched = submissions.map(s => ({
      ...s,
      student_name: nameMap.get(s.student_id.toString()) ?? "Unknown",
    }))

    res.json({ homework: hw, submissions: enriched })
  } catch (err) {
    logger.error({ err }, "GET /homework/:id/submissions failed")
    res.status(500).json({ error: "Failed to fetch submissions" })
  }
})

// ── PATCH /api/homework/submissions/:subId — teacher gives feedback/marks ─────
router.patch("/submissions/:subId", async (req: AuthRequest, res: Response) => {
  try {
    if (!validateObjectId(req.params.subId, res, "submission ID")) return
    if (req.userRole === "student") return void res.status(403).json({ error: "Teachers only" })

    const { feedback, marks } = req.body as { feedback?: string; marks?: number | null }

    // Validate marks if provided
    if (marks !== undefined && marks !== null) {
      const marksNum = Number(marks)
      if (isNaN(marksNum) || marksNum < 0)
        return void res.status(400).json({ error: "marks must be a non-negative number" })
    }

    const user = await User.findById(req.userId).select("school_id").lean()
    if (!user) return void res.status(401).json({ error: "User not found" })

    const sub = await HomeworkSubmission.findOne({
      _id:       new mongoose.Types.ObjectId(req.params.subId),
      school_id: user.school_id,
    })
    if (!sub) return void res.status(404).json({ error: "Submission not found" })

    // Verify the teacher owns the parent homework — any teacher in the school should
    // not be able to grade another teacher's assignment
    const parentHw = await Homework.findOne({
      _id:        sub.homework_id,
      school_id:  user.school_id,
      created_by: new mongoose.Types.ObjectId(req.userId!),
    }).lean()
    if (!parentHw) return void res.status(403).json({ error: "You can only give feedback on your own homework assignments" })

    if (feedback !== undefined) sub.feedback = feedback.trim().slice(0, 1000)
    if (marks !== undefined) sub.marks = marks === null ? null : Number(marks)
    sub.updated_at = new Date()
    await sub.save()

    res.json({ submission: sub })
  } catch (err) {
    logger.error({ err }, "PATCH /homework/submissions/:subId failed")
    res.status(500).json({ error: "Failed to save feedback" })
  }
})

// ── GET /api/homework/my-submissions — student views their own submissions ────
router.get("/my-submissions", async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== "student") return void res.status(403).json({ error: "Students only" })

    const user = await User.findById(req.userId).select("school_id class_id").lean()
    if (!user) return void res.status(401).json({ error: "User not found" })

    const submissions = await HomeworkSubmission.find({
      student_id: new mongoose.Types.ObjectId(req.userId!),
      school_id:  user.school_id,
    }).lean()

    const hwIds = submissions.map(s => s.homework_id)
    const homeworkList = await Homework.find({ _id: { $in: hwIds } })
      .select("title subject due_date")
      .lean()
    const hwMap = new Map(homeworkList.map(h => [h._id.toString(), h]))

    const enriched = submissions.map(s => ({
      ...s,
      homework: hwMap.get(s.homework_id.toString()) ?? null,
    }))

    res.json({ submissions: enriched })
  } catch (err) {
    logger.error({ err }, "GET /homework/my-submissions failed")
    res.status(500).json({ error: "Failed to fetch submissions" })
  }
})

export default router
