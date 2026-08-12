import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/challenges.ts — Live code challenge routes at /api/challenges.
// Teachers create challenges with deadline and language; students submit code
// (upserted — re-submission overwrites). Teachers view all student submissions.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { User } from "../models/User.js"
import { CodeChallenge } from "../models/CodeChallenge.js"
import { ChallengeSubmission } from "../models/ChallengeSubmission.js"
import { Class } from "../models/Class.js"

const router = Router()
router.use(requireAuth)

// ── GET /api/challenges ───────────────────────────────────────────────────────
// Student: active challenges for their class
// Teacher: challenges they created
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("role school_id class_id").lean()
    if (!user) { res.status(401).json({ error: "Not found" }); return }

    if (!user.school_id) { res.json({ challenges: [] }); return }
    const baseQuery: Record<string, unknown> = { school_id: user.school_id, is_active: true }

    if (user.role === "student") {
      if (!user.class_id) { res.json({ challenges: [] }); return }
      baseQuery.class_id = user.class_id
    } else if (user.role === "teacher") {
      baseQuery.created_by = new mongoose.Types.ObjectId(req.userId!)
    }

    const challenges = await CodeChallenge.find(baseQuery).sort({ created_at: -1 }).lean()

    // If student — also include which ones they submitted
    let submittedIds: string[] = []
    if (user.role === "student") {
      const subs = await ChallengeSubmission.find({
        student_id: new mongoose.Types.ObjectId(req.userId!),
        challenge_id: { $in: challenges.map(c => c._id) },
      }).lean()
      submittedIds = subs.map(s => s.challenge_id.toString())
    }

    res.json({
      challenges: challenges.map(c => ({
        ...c,
        submitted: submittedIds.includes(c._id.toString()),
      }))
    })
  } catch (err) {
    logger.error({ err: err }, "[challenges GET]")
    res.status(500).json({ error: "Failed to load challenges" })
  }
})

// ── POST /api/challenges ──────────────────────────────────────────────────────
// Teacher creates / pushes a challenge
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("role school_id").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const { title, difficulty, language, description, constraints, expected_output, deadline, class_id } =
      req.body as Record<string, string>

    if (!title?.trim() || !class_id || !language || !description?.trim()) {
      res.status(400).json({ error: "title, class_id, language, description required" }); return
    }
    if (title.trim().length > 200) { res.status(400).json({ error: "Title must be under 200 characters" }); return }
    if (description.trim().length > 5000) { res.status(400).json({ error: "Description must be under 5000 characters" }); return }
    if (constraints && constraints.length > 2000) { res.status(400).json({ error: "Constraints must be under 2000 characters" }); return }
    if (expected_output && expected_output.length > 2000) { res.status(400).json({ error: "Expected output must be under 2000 characters" }); return }
    const VALID_LANGS = ["javascript", "python", "html"] as const
    if (!VALID_LANGS.includes(language as typeof VALID_LANGS[number])) {
      res.status(400).json({ error: "language must be javascript, python, or html" }); return
    }
    const VALID_DIFFICULTIES = ["Easy", "Medium", "Hard"] as const
    if (difficulty && !VALID_DIFFICULTIES.includes(difficulty as typeof VALID_DIFFICULTIES[number])) {
      res.status(400).json({ error: "difficulty must be Easy, Medium, or Hard" }); return
    }

    if (!user.school_id) { res.status(400).json({ error: "No school assigned" }); return }

    // HIGH-8: verify class_id belongs to teacher's school
    const chClass = await Class.findOne({ _id: new mongoose.Types.ObjectId(class_id), school_id: user.school_id }).lean()
    if (!chClass) { res.status(403).json({ error: "Class not found in your school" }); return }

    const challenge = await CodeChallenge.create({
      school_id:       user.school_id,
      class_id:        new mongoose.Types.ObjectId(class_id),
      created_by:      new mongoose.Types.ObjectId(req.userId!),
      title,
      difficulty:      (difficulty ?? "Easy") as "Easy" | "Medium" | "Hard",
      language:        language as "javascript" | "python" | "html",
      description,
      constraints:     constraints ?? "",
      expected_output: expected_output ?? "",
      deadline:        deadline ? new Date(deadline) : null,
    })

    res.json({ challenge })
  } catch (err) {
    logger.error({ err: err }, "[challenges POST]")
    res.status(500).json({ error: "Failed to create challenge" })
  }
})

// ── DELETE /api/challenges/:id ────────────────────────────────────────────────
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const delUser = await User.findById(req.userId!).select("school_id role").lean()
    if (!delUser) { res.status(401).json({ error: "User not found" }); return }
    if (!["teacher", "admin", "super_admin"].includes(delUser.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    // School boundary first — return 404 so callers cannot probe for IDs in other schools
    const ch = await CodeChallenge.findOne({
      _id:       req.params.id,
      school_id: delUser.school_id,
    })
    if (!ch) { res.status(404).json({ error: "Not found" }); return }

    // Ownership check after school boundary is confirmed
    if (ch.created_by.toString() !== req.userId) {
      res.status(403).json({ error: "You can only delete your own challenges" }); return
    }

    await ch.deleteOne()
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[challenges DELETE]")
    res.status(500).json({ error: "Failed to delete" })
  }
})

// ── POST /api/challenges/:id/submit ──────────────────────────────────────────
// Student submits code solution
router.post("/:id/submit", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id class_id role").lean()
    if (!user || user.role !== "student") { res.status(403).json({ error: "Students only" }); return }

    const { code } = req.body as { code: string }
    if (!code?.trim()) { res.status(400).json({ error: "code required" }); return }
    if (code.length > 50_000) { res.status(400).json({ error: "Code submission must be under 50,000 characters" }); return }
    if (!user.school_id) { res.status(400).json({ error: "No school assigned" }); return }

    // HIGH-9: verify challenge belongs to student's school and class
    const submitCh = await CodeChallenge.findById(req.params.id as string).lean()
    if (!submitCh) { res.status(404).json({ error: "Challenge not found" }); return }
    if (submitCh.school_id.toString() !== user.school_id.toString() ||
        submitCh.class_id.toString() !== user.class_id?.toString()) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    const sub = await ChallengeSubmission.findOneAndUpdate(
      {
        challenge_id: new mongoose.Types.ObjectId(req.params.id as string),
        student_id:   new mongoose.Types.ObjectId(req.userId!),
      },
      {
        school_id:    user.school_id,
        code,
        language:     submitCh.language,
        submitted_at: new Date(),
      },
      { upsert: true, new: true }
    )

    res.json({ submission: sub })
  } catch (err) {
    logger.error({ err: err }, "[challenges submit]")
    res.status(500).json({ error: "Failed to submit" })
  }
})

// ── GET /api/challenges/my-submissions ───────────────────────────────────────
router.get("/my-submissions", async (req: AuthRequest, res: Response) => {
  try {
    const subs = await ChallengeSubmission
      .find({ student_id: new mongoose.Types.ObjectId(req.userId!) })
      .populate<{ challenge_id: { title: string; difficulty: string } }>("challenge_id", "title difficulty")
      .sort({ submitted_at: -1 })
      .lean()

    res.json({ submissions: subs })
  } catch (err) {
    logger.error({ err: err }, "[challenges my-submissions]")
    res.status(500).json({ error: "Failed to load submissions" })
  }
})

// ── GET /api/challenges/:id/submissions ──────────────────────────────────────
// Teacher: view all student submissions for a challenge
router.get("/:id/submissions", async (req: AuthRequest, res: Response) => {
  try {
    // CRIT-03: Only teacher/admin/super_admin can view all submissions
    const viewer = await User.findById(req.userId!).select("role school_id").lean()
    if (!viewer || !["teacher", "admin", "super_admin"].includes(viewer.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    // CRIT-8: school boundary — teacher cannot read another school's submissions
    const subChallenge = await CodeChallenge.findById(req.params.id as string).select("school_id").lean()
    if (!subChallenge) { res.status(404).json({ error: "Challenge not found" }); return }
    if (subChallenge.school_id.toString() !== viewer.school_id?.toString()) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    const subs = await ChallengeSubmission
      .find({ challenge_id: new mongoose.Types.ObjectId(req.params.id as string) })
      .populate<{ student_id: { name: string } }>("student_id", "name")
      .sort({ submitted_at: -1 })
      .lean()

    res.json({ submissions: subs.map(s => ({
      student_name: (s.student_id as unknown as { name: string })?.name ?? "Student",
      code:         s.code,
      language:     s.language,
      submitted_at: s.submitted_at,
    })) })
  } catch (err) {
    logger.error({ err: err }, "[challenges submissions]")
    res.status(500).json({ error: "Failed to load" })
  }
})

export default router
