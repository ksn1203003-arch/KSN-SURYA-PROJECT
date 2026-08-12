import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/quizzes.ts — Quiz routes mounted at /api/quizzes.
// Teachers create and delete MCQ quizzes; students submit attempts and view
// results. Correct answers are hidden from the student-facing GET response.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { User } from "../models/User.js"
import { Quiz } from "../models/Quiz.js"
import { QuizAttempt } from "../models/QuizAttempt.js"
import { Class } from "../models/Class.js"

const router = Router()
router.use(requireAuth)

// ── GET /api/quizzes ──────────────────────────────────────────────────────────
// Student: active quizzes for their class (5-day grace after deadline)
// Teacher: quizzes they created, optionally filtered by ?class_id=
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("role school_id class_id").lean()
    if (!user) { res.status(401).json({ error: "User not found" }); return }

    let query: Record<string, unknown> = { school_id: user.school_id, is_active: true }

    if (user.role === "student") {
      if (!user.class_id) { res.json({ quizzes: [] }); return }
      query.class_id = user.class_id

      // 5-day grace: hide quizzes whose deadline passed more than 5 days ago
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      query.$or = [
        { deadline: null },
        { deadline: { $gt: fiveDaysAgo } },
      ]
    } else if (user.role === "teacher") {
      query.created_by = new mongoose.Types.ObjectId(req.userId!)
      if (req.query.class_id) {
        query.class_id = new mongoose.Types.ObjectId(req.query.class_id as string)
      }
    }

    const quizzes = await Quiz.find(query).sort({ created_at: -1 }).lean()

    if (user.role === "student") {
      // For each quiz, include attempt stats for this student
      const studentId = new mongoose.Types.ObjectId(req.userId!)
      const quizIds   = quizzes.map(q => q._id)

      const attempts = await QuizAttempt.find({
        student_id: studentId,
        quiz_id: { $in: quizIds },
      }).select("quiz_id percentage submitted_at attempts_reset_at_time").lean()

      // Group by quiz_id
      const attemptsMap: Record<string, typeof attempts> = {}
      for (const a of attempts) {
        const key = a.quiz_id.toString()
        if (!attemptsMap[key]) attemptsMap[key] = []
        attemptsMap[key].push(a)
      }

      res.json({
        quizzes: quizzes.map(q => {
          const qId   = q._id.toString()
          const all   = attemptsMap[qId] ?? []
          // Only count attempts after attempts_reset_at (point 6)
          const resetTs = q.attempts_reset_at ? new Date(q.attempts_reset_at).getTime() : 0
          const valid   = all.filter(a => new Date((a as unknown as { submitted_at: Date }).submitted_at).getTime() > resetTs)
          const bestPct = valid.length > 0 ? Math.max(...valid.map(a => a.percentage)) : null
          return {
            ...q,
            questions: q.questions.map(({ correct_index: _ci, ...rest }) => rest),
            attempt_count: valid.length,
            best_score:    bestPct,
          }
        })
      })
      return
    }

    res.json({ quizzes })
  } catch (err) {
    logger.error({ err: err }, "[quizzes GET]")
    res.status(500).json({ error: "Failed to load quizzes" })
  }
})

// ── POST /api/quizzes ─────────────────────────────────────────────────────────
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("role school_id").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const { title, questions, class_id, deadline, shuffle_on_retry } = req.body as {
      title:            string
      class_id:         string
      questions:        Array<{ text: string; options: string[]; correct_index: number; explanation?: string }>
      deadline?:        string | null
      shuffle_on_retry?: boolean
    }

    if (!title?.trim() || !class_id || !questions?.length) {
      res.status(400).json({ error: "title, class_id, and questions are required" }); return
    }
    if (title.trim().length > 200) { res.status(400).json({ error: "Quiz title must be under 200 characters" }); return }
    if (questions.length > 50) { res.status(400).json({ error: "A quiz can have at most 50 questions" }); return }
    if (!user.school_id) { res.status(400).json({ error: "No school assigned" }); return }

    const quizClass = await Class.findOne({ _id: new mongoose.Types.ObjectId(class_id), school_id: user.school_id }).lean()
    if (!quizClass) { res.status(403).json({ error: "Class not found in your school" }); return }

    const mappedQuestions = questions.map(q => ({
      text:          q.text,
      options:       q.options.slice(0, 4),
      correct_index: q.correct_index,
      explanation:   q.explanation ?? "",
    }))
    for (const q of mappedQuestions) {
      if (!q.text?.trim()) { res.status(400).json({ error: "Each question must have text" }); return }
      if (q.text.trim().length > 2000) { res.status(400).json({ error: "Question text must be under 2000 characters" }); return }
      if (!Array.isArray(q.options) || q.options.length < 2) { res.status(400).json({ error: "Each question needs at least 2 options" }); return }
      if (q.options.some((opt: string) => !opt?.trim())) { res.status(400).json({ error: "Option text cannot be empty" }); return }
      if (q.options.some((opt: string) => opt.trim().length > 500)) { res.status(400).json({ error: "Option text must be under 500 characters" }); return }
      if (typeof q.correct_index !== "number" || q.correct_index < 0 || q.correct_index >= q.options.length || !Number.isInteger(q.correct_index)) {
        res.status(400).json({ error: "correct_index must be a valid option index" }); return
      }
    }

    const quiz = await Quiz.create({
      school_id:        user.school_id,
      class_id:         new mongoose.Types.ObjectId(class_id),
      created_by:       new mongoose.Types.ObjectId(req.userId!),
      title:            title.trim(),
      questions:        mappedQuestions,
      deadline:         deadline ? new Date(deadline) : null,
      max_attempts:     10,
      shuffle_on_retry: shuffle_on_retry ?? false,
    })

    res.json({ quiz })
  } catch (err) {
    logger.error({ err: err }, "[quizzes POST]")
    res.status(500).json({ error: "Failed to create quiz" })
  }
})

// ── PATCH /api/quizzes/:id ────────────────────────────────────────────────────
// Teacher updates deadline → resets attempt counter for all students (point 4+6)
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const quiz = await Quiz.findById(req.params.id)
    if (!quiz) { res.status(404).json({ error: "Quiz not found" }); return }
    if (quiz.created_by.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return }
    const patchUser = await User.findById(req.userId!).select("school_id").lean()
    if (quiz.school_id.toString() !== patchUser?.school_id?.toString()) { res.status(403).json({ error: "Forbidden" }); return }

    const { deadline } = req.body as { deadline: string | null }
    quiz.deadline = deadline ? new Date(deadline) : null

    // Point 6: extending deadline resets attempt count for all students
    quiz.attempts_reset_at = new Date()

    await quiz.save()
    res.json({ quiz })
  } catch (err) {
    logger.error({ err: err }, "[quizzes PATCH]")
    res.status(500).json({ error: "Failed to update quiz" })
  }
})

// ── DELETE /api/quizzes/:id ───────────────────────────────────────────────────
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const quiz = await Quiz.findById(req.params.id)
    if (!quiz) { res.status(404).json({ error: "Quiz not found" }); return }
    if (quiz.created_by.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return }
    const delUser = await User.findById(req.userId!).select("school_id").lean()
    if (quiz.school_id.toString() !== delUser?.school_id?.toString()) { res.status(403).json({ error: "Forbidden" }); return }
    await QuizAttempt.deleteMany({ quiz_id: quiz._id })
    await quiz.deleteOne()
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[quizzes DELETE]")
    res.status(500).json({ error: "Failed to delete" })
  }
})

// ── POST /api/quizzes/:id/attempt ─────────────────────────────────────────────
router.post("/:id/attempt", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id class_id role").lean()
    if (!user || user.role !== "student") { res.status(403).json({ error: "Students only" }); return }

    const quiz = await Quiz.findById(req.params.id).lean()
    if (!quiz) { res.status(404).json({ error: "Quiz not found" }); return }
    if (quiz.school_id.toString() !== user.school_id?.toString()) { res.status(403).json({ error: "Forbidden" }); return }
    // Students can only submit quizzes for their own class
    if (quiz.class_id.toString() !== user.class_id?.toString()) { res.status(403).json({ error: "Forbidden" }); return }

    // Enforce deadline (point 5/6)
    if (quiz.deadline && new Date() > quiz.deadline) {
      res.status(400).json({ error: "This quiz is closed — the deadline has passed." }); return
    }

    // Count only attempts after attempts_reset_at (point 6)
    const resetTs = quiz.attempts_reset_at ?? new Date(0)
    const attemptsSinceReset = await QuizAttempt.countDocuments({
      quiz_id:    quiz._id,
      student_id: new mongoose.Types.ObjectId(req.userId!),
      submitted_at: { $gt: resetTs },
    })

    if (attemptsSinceReset >= quiz.max_attempts) {
      res.status(400).json({ error: `You've used all ${quiz.max_attempts} attempts for this quiz.` }); return
    }

    // Deduplication guard — reject if a submission was already recorded in the last 5 seconds.
    // Prevents double-click or network retry from creating two identical attempts.
    const recentAttempt = await QuizAttempt.findOne({
      quiz_id:      quiz._id,
      student_id:   new mongoose.Types.ObjectId(req.userId!),
      submitted_at: { $gt: new Date(Date.now() - 5000) },
    })
    if (recentAttempt) {
      res.status(429).json({ error: "Please wait a moment before submitting again." }); return
    }

    const { answers } = req.body as { answers: number[] }
    if (!Array.isArray(answers)) { res.status(400).json({ error: "answers array required" }); return }
    if (answers.length !== quiz.questions.length) {
      res.status(400).json({ error: `Expected ${quiz.questions.length} answers, got ${answers.length}` }); return
    }
    for (const ans of answers) {
      if (ans !== null && (typeof ans !== "number" || !Number.isInteger(ans) || ans < 0)) {
        res.status(400).json({ error: "Each answer must be a non-negative integer or null" }); return
      }
    }

    // shuffle_on_retry: if student has prior attempts, questions were shuffled client-side
    // We still validate against the ORIGINAL correct_index order
    const score      = quiz.questions.reduce((sum, q, i) => sum + (answers[i] === q.correct_index ? 1 : 0), 0)
    const total      = quiz.questions.length
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0

    if (!user.school_id) { res.status(400).json({ error: "No school" }); return }
    const attempt = await QuizAttempt.create({
      quiz_id:      quiz._id,
      student_id:   new mongoose.Types.ObjectId(req.userId!),
      school_id:    user.school_id,
      answers,
      score,
      total,
      percentage,
    })

    res.json({
      attempt: {
        _id:          (attempt as { _id: unknown })._id,
        score,
        total,
        percentage,
        submitted_at: (attempt as { submitted_at: Date }).submitted_at,
        attempt_number: attemptsSinceReset + 1,
      },
      per_question: quiz.questions.map((q, i) => ({ was_correct: answers[i] === q.correct_index })),
      explanations: quiz.questions.map(q => q.explanation),
    })
  } catch (err) {
    logger.error({ err: err }, "[quizzes attempt]")
    res.status(500).json({ error: "Failed to submit attempt" })
  }
})

// ── GET /api/quizzes/my-attempts ──────────────────────────────────────────────
// NOTE: must be defined before /:id routes
router.get("/my-attempts", async (req: AuthRequest, res: Response) => {
  try {
    const attempts = await QuizAttempt
      .find({ student_id: new mongoose.Types.ObjectId(req.userId!) })
      .sort({ submitted_at: -1 })
      .populate<{ quiz_id: { title: string } }>("quiz_id", "title")
      .lean()

    const history = attempts.map(a => ({
      _id:          a._id,
      quiz_title:   (a.quiz_id as unknown as { title: string })?.title ?? "Quiz",
      score:        a.score,
      total:        a.total,
      percentage:   a.percentage,
      submitted_at: a.submitted_at,
    }))

    res.json({ history })
  } catch (err) {
    logger.error({ err: err }, "[quizzes my-attempts]")
    res.status(500).json({ error: "Failed to load quiz history" })
  }
})

// ── GET /api/quizzes/:id/results ─────────────────────────────────────────────
// Teacher: per-student attempt count + best score + latest score
router.get("/:id/results", async (req: AuthRequest, res: Response) => {
  try {
    const viewer = await User.findById(req.userId!).select("role school_id").lean()
    if (!viewer || !["teacher", "admin", "super_admin"].includes(viewer.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const resultsQuiz = await Quiz.findById(req.params.id as string).select("school_id attempts_reset_at").lean()
    if (!resultsQuiz) { res.status(404).json({ error: "Quiz not found" }); return }
    if (resultsQuiz.school_id.toString() !== viewer.school_id?.toString()) { res.status(403).json({ error: "Forbidden" }); return }

    const resetTs = resultsQuiz.attempts_reset_at ?? new Date(0)

    const attempts = await QuizAttempt
      .find({ quiz_id: new mongoose.Types.ObjectId(req.params.id as string) })
      .populate<{ student_id: { name: string } }>("student_id", "name")
      .sort({ submitted_at: -1 })
      .lean()

    // Aggregate per student — only count attempts after last reset
    const studentMap: Record<string, {
      student_name: string
      attempt_count: number
      best_score: number
      best_percentage: number
      latest_percentage: number
      latest_submitted_at: Date
    }> = {}

    for (const a of attempts) {
      const sid  = (a.student_id as unknown as { _id?: unknown })?.toString?.() ?? a.student_id?.toString()
      const name = (a.student_id as unknown as { name: string })?.name ?? "Student"
      const ts   = new Date(a.submitted_at)

      if (ts <= resetTs) continue // before last reset — don't count

      if (!studentMap[sid]) {
        studentMap[sid] = {
          student_name:       name,
          attempt_count:      0,
          best_score:         0,
          best_percentage:    0,
          latest_percentage:  a.percentage,
          latest_submitted_at: ts,
        }
      }
      const s = studentMap[sid]
      s.attempt_count++
      if (a.percentage > s.best_percentage) {
        s.best_score      = a.score
        s.best_percentage = a.percentage
      }
      // attempts are sorted desc by submitted_at; first one seen per student is latest
      if (ts > s.latest_submitted_at) {
        s.latest_percentage  = a.percentage
        s.latest_submitted_at = ts
      }
    }

    res.json({ results: Object.values(studentMap) })
  } catch (err) {
    logger.error({ err: err }, "[quizzes results]")
    res.status(500).json({ error: "Failed to load results" })
  }
})

export default router
