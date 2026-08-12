import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/users.ts — User management routes mounted at /api/users.
// Admin and teacher operations: invite teachers by email, add/bulk-add students,
// update or soft-delete any user within the school boundary.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from "express"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import zxcvbn from "zxcvbn"
import { User } from "../models/User.js"
import { Class } from "../models/Class.js"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { withRetry } from "../lib/retry.js"
import { sendEmail } from "../lib/email.js"

const router = Router()

// All management routes require authentication
router.use(requireAuth)

function tempPassword() {
  // crypto.randomBytes is cryptographically secure — never Math.random() for credentials.
  return "TS@" + randomBytes(6).toString("base64url").slice(0, 8)
}

function slugEmail(schoolId: string, roll: string) {
  return `s${roll.toLowerCase().replace(/\s/g, "")}@${schoolId.slice(0, 8)}.internal.teachscript`
}

// ── Helper: verify caller is admin/super_admin and return their school_id ──────
async function requireAdminCaller(req: Request): Promise<{ callerSchoolId: string } | { error: string; status: number }> {
  const authReq = req as AuthRequest
  if (!authReq.userId) return { error: "Authentication required", status: 401 }
  const caller = await User.findById(authReq.userId).select("school_id role").lean()
  if (!caller || !["admin", "super_admin"].includes(caller.role as string)) {
    return { error: "Admin access required", status: 403 }
  }
  if (!caller.school_id) return { error: "No school associated with this account", status: 400 }
  return { callerSchoolId: caller.school_id.toString() }
}

// ── POST /api/users/invite-teacher ───────────────────────────────────────────
router.post("/invite-teacher", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { name, email, class_id, subject } = req.body as {
      name: string; email: string; phone?: string; school_id?: string; class_id?: string; subject?: string
    }
    const phone = (req.body as { phone?: string }).phone
    if (!name?.trim() || !email?.trim()) {
      res.status(400).json({ error: "name and email are required" }); return
    }
    if (name.trim().length > 100) { res.status(400).json({ error: "Name must be under 100 characters" }); return }
    if (email.length > 254) { res.status(400).json({ error: "Email address is too long" }); return }
    if (!email.includes("@")) { res.status(400).json({ error: "Invalid email address" }); return }
    if (phone && phone.replace(/\D/g, "").length > 15) { res.status(400).json({ error: "Phone number is too long" }); return }

    const existing = await User.findOne({ email: email.toLowerCase() }).select("_id").lean()
    if (existing) { res.status(400).json({ error: "An account with this email already exists." }); return }

    const password = tempPassword()
    const hash = await bcrypt.hash(password, 12)

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone: phone ?? null,
      password_hash: hash,
      role: "teacher",
      school_id: new mongoose.Types.ObjectId(callerSchoolId),
      is_active: true,
      must_change_password: true,
    })

    if (class_id) {
      // Verify class belongs to caller's school
      const cls = await Class.findOne({ _id: class_id, school_id: callerSchoolId })
      if (cls) {
        if (subject) {
          await Class.updateOne({ _id: class_id }, { $pull: { teachers: { subject } } })
          await Class.updateOne({ _id: class_id }, { $push: { teachers: { teacher_id: user._id, subject } } })
        } else {
          await Class.findByIdAndUpdate(class_id, { teacher_id: user._id })
        }
      }
    }

    let emailSent = false
    let emailWarning: string | undefined
    try {
      await withRetry(() => sendEmail({
        to:      email,
        subject: "Your TeachScript teacher account is ready",
        html:    `<p>Hi ${name},</p><p>Your TeachScript account has been created.</p><p><b>Email:</b> ${email}<br><b>Password:</b> ${password}</p><p>Login at <a href="${process.env.FRONTEND_URL ?? "http://localhost:5173"}/login">TeachScript Login</a></p>`,
      }))
      emailSent = true
    } catch (emailErr) {
      logger.error({ err: emailErr }, "[users/invite-teacher] Email delivery failed after retries:")
      emailWarning = "Teacher account created but welcome email could not be delivered. Please share credentials manually."
    }

    // Never return the password in the response — it is sent via email only.
    // Returning plaintext credentials in JSON exposes them to proxies and logs.
    res.json({ success: true, user_id: (user._id as { toString(): string }).toString(), email_sent: emailSent, ...(emailWarning ? { warning: emailWarning } : {}) })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── POST /api/users/add-student ───────────────────────────────────────────────
router.post("/add-student", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { name, email, phone, gender, class_id, roll_no } = req.body as {
      name: string; email?: string; phone?: string; gender?: string
      school_id?: string; class_id: string; roll_no: string
    }
    if (!name?.trim() || !class_id || !roll_no?.trim()) {
      res.status(400).json({ error: "name, class_id, roll_no are required" }); return
    }
    if (name.trim().length > 100) { res.status(400).json({ error: "Name must be under 100 characters" }); return }
    if (roll_no.trim().length > 20) { res.status(400).json({ error: "Roll number must be under 20 characters" }); return }
    if (phone && phone.replace(/\D/g, "").length > 15) { res.status(400).json({ error: "Phone number is too long" }); return }

    // Verify class belongs to caller's school
    const cls = await Class.findOne({ _id: class_id, school_id: callerSchoolId })
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    const resolvedEmail = email?.trim() || slugEmail(callerSchoolId, roll_no)
    const username = roll_no.toLowerCase().replace(/\s/g, "")
    const password = tempPassword()
    const hash = await bcrypt.hash(password, 12)

    const existing = await User.findOne({ $or: [{ email: resolvedEmail }, { username }] }).select("_id").lean()
    if (existing) { res.status(400).json({ error: `Account with email or username "${username}" already exists.` }); return }

    await User.create({
      name,
      email: resolvedEmail,
      phone: phone ?? null,
      gender: gender ?? null,
      username,
      password_hash: hash,
      role: "student",
      school_id: new mongoose.Types.ObjectId(callerSchoolId),
      class_id: new mongoose.Types.ObjectId(class_id),
      is_active: true,
      must_change_password: true,
    })

    // temp_password is returned here intentionally — admin distributes it to students on paper.
    // Students have no email accounts so email delivery is not possible.
    res.json({ success: true, username, temp_password: password })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── POST /api/users/bulk-students ────────────────────────────────────────────
router.post("/bulk-students", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { students, class_id } = req.body as {
      students: Array<{ name: string; roll_no: string; email?: string; phone?: string }>
      class_id: string; school_id?: string
    }
    if (!students?.length || !class_id) {
      res.status(400).json({ error: "students[] and class_id are required" }); return
    }
    if (students.length > 200) {
      res.status(400).json({ error: "Maximum 200 students per bulk import. Split into smaller batches." }); return
    }

    // Verify class belongs to caller's school
    const cls = await Class.findOne({ _id: class_id, school_id: callerSchoolId })
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    const results: Array<{ name: string; username: string; temp_password: string; error?: string }> = []

    // FIX LOW-07: Hash all passwords in parallel (max 5 at a time to avoid CPU overload)
    const CONCURRENCY = 5
    const passwords: string[] = students.map(() => tempPassword())
    const hashed: string[] = []
    for (let i = 0; i < students.length; i += CONCURRENCY) {
      const batch = passwords.slice(i, i + CONCURRENCY)
      const batchHashes = await Promise.all(batch.map(pw => bcrypt.hash(pw, 12)))
      hashed.push(...batchHashes)
    }

    for (let idx = 0; idx < students.length; idx++) {
      const s = students[idx]
      if (!s.name?.trim() || !s.roll_no?.trim()) {
        results.push({ name: s.name ?? "", username: "", temp_password: "", error: "name and roll_no are required" })
        continue
      }
      if (s.name.trim().length > 100) {
        results.push({ name: s.name, username: "", temp_password: "", error: "Name must be under 100 characters" })
        continue
      }
      if (s.roll_no.trim().length > 20) {
        results.push({ name: s.name, username: "", temp_password: "", error: "Roll number must be under 20 characters" })
        continue
      }
      const resolvedEmail = s.email?.trim() || slugEmail(callerSchoolId, s.roll_no)
      const username = s.roll_no.toLowerCase().replace(/\s/g, "")
      const password = passwords[idx]
      try {
        await User.create({
          name: s.name,
          email: resolvedEmail,
          phone: s.phone ?? null,
          username,
          password_hash: hashed[idx],
          role: "student",
          school_id: new mongoose.Types.ObjectId(callerSchoolId),
          class_id: new mongoose.Types.ObjectId(class_id),
          is_active: true,
          must_change_password: true,
        })
        results.push({ name: s.name, username, temp_password: password })
      } catch {
        results.push({ name: s.name, username, temp_password: "", error: "Username or email already exists" })
      }
    }

    res.json({ results })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── POST /api/users/bulk-teachers ────────────────────────────────────────────
router.post("/bulk-teachers", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { teachers } = req.body as {
      teachers: Array<{ name: string; email: string; phone?: string }>
      school_id?: string
    }
    if (!teachers?.length) {
      res.status(400).json({ error: "teachers[] is required" }); return
    }

    const results: Array<{ name: string; email: string; temp_password: string; error?: string }> = []

    // Validate all entries first before any hashing
    const valid: Array<{ t: typeof teachers[0]; password: string }> = []
    for (const t of teachers) {
      if (!t.name?.trim() || !t.email?.trim()) {
        results.push({ name: t.name ?? "", email: t.email ?? "", temp_password: "", error: "name and email required" })
        continue
      }
      if (t.name.trim().length > 100) {
        results.push({ name: t.name, email: t.email, temp_password: "", error: "Name must be under 100 characters" })
        continue
      }
      if (t.email.length > 254 || !t.email.includes("@")) {
        results.push({ name: t.name, email: t.email, temp_password: "", error: "Invalid email address" })
        continue
      }
      valid.push({ t, password: tempPassword() })
    }

    // Hash all passwords in parallel (max 5 at once to avoid CPU overload)
    const CONCURRENCY = 5
    const hashes: string[] = []
    for (let i = 0; i < valid.length; i += CONCURRENCY) {
      const batch = valid.slice(i, i + CONCURRENCY)
      const batchHashes = await Promise.all(batch.map(({ password }) => bcrypt.hash(password, 12)))
      hashes.push(...batchHashes)
    }

    for (let idx = 0; idx < valid.length; idx++) {
      const { t, password } = valid[idx]
      try {
        const existing = await User.findOne({ email: t.email.toLowerCase() }).select("_id").lean()
        if (existing) {
          results.push({ name: t.name, email: t.email, temp_password: "", error: "Email already exists" })
          continue
        }
        await User.create({
          name: t.name.trim(),
          email: t.email.toLowerCase().trim(),
          phone: t.phone?.trim() || null,
          password_hash: hashes[idx],
          role: "teacher",
          school_id: new mongoose.Types.ObjectId(callerSchoolId),
          is_active: true,
          must_change_password: true,
        })
        results.push({ name: t.name, email: t.email, temp_password: password })
      } catch {
        results.push({ name: t.name, email: t.email, temp_password: "", error: "Account creation failed" })
      }
    }

    res.json({ results })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── PATCH /api/users/profile — update own profile ────────────────────────────
router.patch("/profile", async (req: Request, res: Response) => {
  try {
  const authReq = req as AuthRequest
  if (!authReq.userId) { res.status(401).json({ error: "Authentication required" }); return }

  const { name, email, phone, preferred_language, profile_photo_url, current_password, new_password } = req.body as {
    name?: string; email?: string; phone?: string; preferred_language?: string; profile_photo_url?: string
    current_password?: string; new_password?: string
  }
  if (name !== undefined && name.trim().length > 100) {
    res.status(400).json({ error: "Name must be under 100 characters" }); return
  }
  if (email !== undefined && email.length > 254) {
    res.status(400).json({ error: "Email address is too long" }); return
  }
  if (phone !== undefined && phone && phone.replace(/\D/g, "").length > 15) {
    res.status(400).json({ error: "Phone number is too long" }); return
  }
  const updates: Record<string, unknown> = {}
  if (name?.trim()) updates.name = name.trim()
  if (email?.trim()) {
    const existing = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: authReq.userId } }).select("_id").lean()
    if (existing) { res.status(400).json({ error: "This email is already used by another account." }); return }
    updates.email = email.toLowerCase().trim()
  }
  if (phone !== undefined) updates.phone = phone || null
  if (preferred_language && ["english", "hindi"].includes(preferred_language)) updates.preferred_language = preferred_language
  if (profile_photo_url !== undefined) {
    // LOW-28: cap photo size to prevent large base64 strings bloating the DB
    if (profile_photo_url && typeof profile_photo_url === "string" && profile_photo_url.length > 150_000) {
      res.status(400).json({ error: "Profile photo is too large. Please use a smaller image." }); return
    }
    updates.profile_photo_url = profile_photo_url || null
  }
  if (current_password && new_password) {
    if (new_password.length < 8) { res.status(400).json({ error: "New password must be at least 8 characters." }); return }
    if (new_password.length > 128 || current_password.length > 128) {
      res.status(400).json({ error: "Password must be under 128 characters." }); return
    }
    if (zxcvbn(new_password).score < 2) {
      res.status(400).json({ error: "Password is too weak. Use a mix of letters, numbers, and symbols." }); return
    }
    const userForPwd = await User.findById(authReq.userId).select("password_hash").lean()
    if (!userForPwd) { res.status(404).json({ error: "User not found" }); return }
    const match = await bcrypt.compare(current_password, userForPwd.password_hash)
    if (!match) { res.status(400).json({ error: "Current password is incorrect." }); return }
    updates.password_hash = await bcrypt.hash(new_password, 12)
  }

  const user = await User.findByIdAndUpdate(authReq.userId, { $set: updates }, { returnDocument: "after" })
    .select("name email phone username role school_id class_id profile_photo_url preferred_language is_active")

  if (!user) { res.status(404).json({ error: "User not found" }); return }
  res.json({
    user: {
      id: (user._id as { toString(): string }).toString(),
      name: user.name, email: user.email, phone: user.phone,
      username: user.username, role: user.role,
      school_id: user.school_id?.toString() ?? null,
      class_id: user.class_id?.toString() ?? null,
      profile_photo_url: user.profile_photo_url ?? null,
      preferred_language: user.preferred_language ?? "english",
      is_active: user.is_active,
    },
  })
  } catch (err) {
    logger.error({ err: err }, "[users/profile PATCH]")
    res.status(500).json({ error: "Failed to update profile. Please try again." })
  }
})

// ── PATCH /api/users/teacher/:id ─────────────────────────────────────────────
router.patch("/teacher/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { id } = req.params
    // Verify target teacher belongs to caller's school
    const target = await User.findById(id).select("school_id").lean()
    if (!target || target.school_id?.toString() !== callerSchoolId) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    const { name, email, phone, class_id, subject } = req.body as {
      name?: string; email?: string; phone?: string; class_id?: string; subject?: string
    }
    if (name !== undefined && name.trim().length > 100) {
      res.status(400).json({ error: "Name must be under 100 characters" }); return
    }
    if (email !== undefined && email && (!email.includes("@") || email.length > 254)) {
      res.status(400).json({ error: "Invalid email address" }); return
    }
    if (phone !== undefined && phone && phone.replace(/\D/g, "").length > 15) {
      res.status(400).json({ error: "Phone number is too long" }); return
    }
    const updates: Record<string, unknown> = {}
    if (name?.trim()) updates.name = name.trim()
    if (email !== undefined) {
      if (email) {
        const emailTaken = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: id } }).select("_id").lean()
        if (emailTaken) { res.status(400).json({ error: "This email is already used by another account." }); return }
        updates.email = email.toLowerCase().trim()
      } else {
        updates.email = null
      }
    }
    if (phone !== undefined) updates.phone = phone || null

    const user = await User.findByIdAndUpdate(id, { $set: updates }, { returnDocument: "after" })
      .select("name email phone username class_id is_active")
    if (!user) { res.status(404).json({ error: "Teacher not found" }); return }

    if (class_id !== undefined) {
      if (class_id === "__none__") {
        // Remove this teacher from all class assignments (legacy + multi-teacher)
        await Class.updateMany({ teacher_id: user._id }, { $set: { teacher_id: null } })
        await Class.updateMany(
          { "teachers.teacher_id": user._id },
          { $pull: { teachers: { teacher_id: user._id } } }
        )
      } else if (class_id && subject) {
        // Verify class belongs to caller's school
        const cls = await Class.findOne({ _id: class_id, school_id: callerSchoolId })
        if (cls) {
          await Class.updateOne({ _id: class_id }, { $pull: { teachers: { subject } } })
          await Class.updateOne({ _id: class_id }, { $push: { teachers: { teacher_id: user._id, subject } } })
        }
      } else if (class_id) {
        // Verify class belongs to caller's school
        const cls = await Class.findOne({ _id: class_id, school_id: callerSchoolId })
        if (cls) {
          await Class.updateMany({ teacher_id: user._id }, { $set: { teacher_id: null } })
          await Class.findByIdAndUpdate(class_id, { teacher_id: user._id })
        }
      }
    }

    // Collect class label and subject assignments for response
    const allClasses = await Class.find({
      $or: [{ teacher_id: user._id }, { "teachers.teacher_id": user._id }]
    }).select("grade section teacher_id teachers").lean()

    let class_label: string | null = null
    const subject_assignments: Array<{ class_label: string; subject: string }> = []
    for (const cls of allClasses) {
      if (cls.teacher_id?.toString() === (user._id as { toString(): string }).toString()) {
        class_label = `Class ${cls.grade}${cls.section}`
      }
      for (const t of cls.teachers) {
        if (t.teacher_id.toString() === (user._id as { toString(): string }).toString()) {
          subject_assignments.push({ class_label: `Class ${cls.grade}${cls.section}`, subject: t.subject })
        }
      }
    }

    res.json({
      id: (user._id as { toString(): string }).toString(),
      name: user.name, email: user.email, phone: user.phone,
      username: user.username, class_label, subject_assignments, is_active: user.is_active,
    })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── PUT /api/users/teacher/:id/assignments ────────────────────────────────────
router.put("/teacher/:id/assignments", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { id } = req.params
    // Verify target teacher belongs to caller's school
    const targetCheck = await User.findById(id).select("school_id").lean()
    if (!targetCheck || targetCheck.school_id?.toString() !== callerSchoolId) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    const { assignments } = req.body as { assignments: Array<{ class_id: string; subject: string }> }
    if (!Array.isArray(assignments)) { res.status(400).json({ error: "assignments[] required" }); return }

    const user = await User.findById(id).select("_id name email phone username is_active")
    if (!user) { res.status(404).json({ error: "Teacher not found" }); return }
    const uidStr = (user._id as { toString(): string }).toString()
    const uidObj = new mongoose.Types.ObjectId(uidStr)

    // 1. Remove this teacher from ALL classes (both legacy and multi-teacher)
    await Class.updateMany({ teacher_id: uidObj }, { $set: { teacher_id: null } })
    await Class.updateMany({ "teachers.teacher_id": uidObj }, { $pull: { teachers: { teacher_id: uidObj } } })

    // 2. Add fresh assignments — only classes that belong to caller's school
    for (const a of assignments) {
      if (!a.class_id || !a.subject?.trim()) continue
      const classObjId = new mongoose.Types.ObjectId(a.class_id)
      // Verify class belongs to caller's school
      const clsCheck = await Class.findOne({ _id: classObjId, school_id: callerSchoolId }).select("_id")
      if (!clsCheck) continue
      await Class.updateOne(
        { _id: classObjId },
        { $push: { teachers: { teacher_id: uidObj, subject: a.subject.trim() } } }
      )
    }

    // 3. Build response
    const allClasses = await Class.find({ "teachers.teacher_id": uidObj }).select("grade section teachers").lean()
    const subject_assignments: Array<{ class_label: string; subject: string; class_id: string }> = []
    for (const cls of allClasses) {
      for (const t of cls.teachers) {
        if (t.teacher_id.toString() === uidStr) {
          subject_assignments.push({
            class_id: (cls._id as { toString(): string }).toString(),
            class_label: `Class ${cls.grade}${cls.section}`,
            subject: t.subject,
          })
        }
      }
    }

    res.json({
      id: uidStr,
      name: user.name, email: user.email, phone: user.phone,
      username: user.username, class_label: null, subject_assignments, is_active: user.is_active,
    })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── PATCH /api/users/student/:id ─────────────────────────────────────────────
router.patch("/student/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { id } = req.params
    // Verify target student belongs to caller's school
    const target = await User.findById(id).select("school_id").lean()
    if (!target || target.school_id?.toString() !== callerSchoolId) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    const { name, email, phone, gender, class_id } = req.body as {
      name?: string; email?: string; phone?: string; gender?: string; class_id?: string
    }
    if (name && name.trim().length > 100) {
      res.status(400).json({ error: "Name must be under 100 characters" }); return
    }
    if (email && (email.length > 254 || !email.includes("@"))) {
      res.status(400).json({ error: "Invalid email address" }); return
    }
    if (phone && phone.replace(/\D/g, "").length > 15) {
      res.status(400).json({ error: "Phone number is too long" }); return
    }
    if (gender && !["male", "female", "other"].includes(gender)) {
      res.status(400).json({ error: "gender must be male, female, or other" }); return
    }
    const updates: Record<string, unknown> = {}
    if (name?.trim()) updates.name = name.trim()
    if (email !== undefined) updates.email = email || null
    if (phone !== undefined) updates.phone = phone || null
    if (gender !== undefined) updates.gender = gender || null
    if (class_id) {
      // Verify new class belongs to caller's school
      const cls = await Class.findOne({ _id: class_id, school_id: callerSchoolId })
      if (!cls) { res.status(403).json({ error: "Target class not found in your school" }); return }
      updates.class_id = new mongoose.Types.ObjectId(class_id)
    }

    const user = await User.findByIdAndUpdate(id, { $set: updates }, { returnDocument: "after" })
      .select("name email phone username gender class_id is_active")
    if (!user) { res.status(404).json({ error: "Student not found" }); return }

    let class_label: string | null = null
    if (user.class_id) {
      const cls = await Class.findById(user.class_id).select("grade section")
      if (cls) class_label = `Class ${cls.grade}${cls.section}`
    }

    res.json({
      id: (user._id as { toString(): string }).toString(),
      name: user.name, email: user.email, phone: user.phone,
      username: user.username, gender: user.gender ?? null,
      class_id: user.class_id?.toString() ?? null,
      class_label,
      is_active: user.is_active,
    })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── PATCH /api/users/bulk-gender ─────────────────────────────────────────────
router.patch("/bulk-gender", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { student_ids, gender } = req.body as { student_ids: string[]; gender: string }
    if (!student_ids?.length || !gender) {
      res.status(400).json({ error: "student_ids[] and gender are required" }); return
    }
    if (!["male", "female", "other"].includes(gender)) {
      res.status(400).json({ error: "gender must be male, female, or other" }); return
    }
    // Filter: only student_ids belonging to the caller's school
    const objectIds = student_ids.map(id => new mongoose.Types.ObjectId(id))
    await User.updateMany(
      { _id: { $in: objectIds }, role: "student", school_id: new mongoose.Types.ObjectId(callerSchoolId) },
      { $set: { gender } }
    )
    res.json({ success: true, gender })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── PATCH /api/users/bulk-assign-class ───────────────────────────────────────
router.patch("/bulk-assign-class", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { teacher_ids, class_id } = req.body as { teacher_ids: string[]; class_id: string }
    if (!teacher_ids?.length || !class_id) {
      res.status(400).json({ error: "teacher_ids[] and class_id are required" }); return
    }

    // Verify class belongs to caller's school
    const cls = await Class.findOne({ _id: class_id, school_id: callerSchoolId })
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    // Only process teacher IDs that belong to the caller's school
    const schoolObjectId = new mongoose.Types.ObjectId(callerSchoolId)
    const objectIds = teacher_ids.map(id => new mongoose.Types.ObjectId(id))
    const validTeachers = await User.find({
      _id: { $in: objectIds },
      role: "teacher",
      school_id: schoolObjectId,
    }).select("_id").lean()
    const validIds = validTeachers.map(t => t._id as mongoose.Types.ObjectId)
    if (!validIds.length) {
      res.status(403).json({ error: "No valid teachers found in your school" }); return
    }

    await Class.updateMany({ teacher_id: { $in: validIds } }, { $set: { teacher_id: null } })
    await User.updateMany(
      { _id: { $in: validIds }, role: "teacher" },
      { $set: { class_id: new mongoose.Types.ObjectId(class_id) } }
    )
    const updatedCls = await Class.findByIdAndUpdate(
      class_id,
      { teacher_id: validIds[0] },
      { returnDocument: "after" }
    ).select("grade section")
    const class_label = updatedCls ? `Class ${updatedCls.grade}${updatedCls.section}` : null
    res.json({ success: true, class_id, class_label })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── PATCH /api/users/bulk-transfer ───────────────────────────────────────────
router.patch("/bulk-transfer", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { student_ids, class_id } = req.body as { student_ids: string[]; class_id: string }
    if (!student_ids?.length || !class_id) {
      res.status(400).json({ error: "student_ids[] and class_id are required" }); return
    }

    // Verify target class belongs to caller's school
    const cls = await Class.findOne({ _id: class_id, school_id: callerSchoolId })
    if (!cls) { res.status(403).json({ error: "Target class not found in your school" }); return }

    const schoolObjectId = new mongoose.Types.ObjectId(callerSchoolId)
    // Only transfer students that belong to the caller's school
    const objectIds = student_ids.map(id => new mongoose.Types.ObjectId(id))
    await User.updateMany(
      { _id: { $in: objectIds }, role: "student", school_id: schoolObjectId },
      { $set: { class_id: new mongoose.Types.ObjectId(class_id) } }
    )
    const class_label = `Class ${cls.grade}${cls.section}`
    res.json({ success: true, class_id, class_label })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── POST /api/users/add-parent ───────────────────────────────────────────────
router.post("/add-parent", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { name, email, student_id } = req.body as { name: string; email: string; student_id: string }
    if (!name?.trim() || !email?.trim() || !student_id) {
      res.status(400).json({ error: "name, email, and student_id are required" }); return
    }
    if (name.trim().length > 100) { res.status(400).json({ error: "Name must be under 100 characters" }); return }
    if (email.length > 254 || !email.includes("@")) { res.status(400).json({ error: "Invalid email address" }); return }

    // Verify student belongs to caller's school
    const student = await User.findOne({
      _id: new mongoose.Types.ObjectId(student_id),
      school_id: new mongoose.Types.ObjectId(callerSchoolId),
      role: "student",
      is_active: true,
    }).select("name class_id").lean()
    if (!student) { res.status(404).json({ error: "Student not found in your school" }); return }

    // Cap at 2 parents per student
    const parentCount = await User.countDocuments({
      linked_student_id: new mongoose.Types.ObjectId(student_id),
      role: "parent",
      school_id: new mongoose.Types.ObjectId(callerSchoolId),
      is_active: true,
    })
    if (parentCount >= 2) {
      res.status(400).json({ error: "This student already has 2 parents linked. Remove one before adding another." }); return
    }

    // Check email not already taken
    const existing = await User.findOne({ email: email.toLowerCase() }).select("_id").lean()
    if (existing) { res.status(400).json({ error: "An account with this email already exists." }); return }

    const password = tempPassword()
    const hash = await bcrypt.hash(password, 12)

    await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password_hash: hash,
      role: "parent",
      school_id: new mongoose.Types.ObjectId(callerSchoolId),
      linked_student_id: new mongoose.Types.ObjectId(student_id),
      is_active: true,
      must_change_password: true,
    })

    const loginUrl = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/login?role=parent`
    let emailSent = false
    let emailWarning: string | undefined
    try {
      await withRetry(() => sendEmail({
        to: email,
        subject: "Your TeachScript parent account is ready",
        html: `<p>Hi ${name.trim()},</p><p>A parent account has been created for you on TeachScript to track <b>${(student as { name: string }).name}</b>'s progress.</p><p><b>Email:</b> ${email}<br><b>Temporary password:</b> ${password}</p><p>Sign in at <a href="${loginUrl}">${loginUrl}</a> and select the <b>Parent</b> tab.</p><p>You will be asked to set a new password on first login.</p>`,
      }))
      emailSent = true
    } catch (emailErr) {
      logger.error({ err: emailErr }, "[users/add-parent] Email delivery failed")
      emailWarning = "Parent account created but welcome email could not be delivered. Please share the login details manually."
    }

    res.json({ success: true, email_sent: emailSent, ...(emailWarning ? { warning: emailWarning } : {}) })
  } catch (err) {
    logger.error({ err }, "[users/add-parent]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── GET /api/users/parents?student_id= ───────────────────────────────────────
router.get("/parents", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { student_id } = req.query as { student_id?: string }
    if (!student_id) { res.status(400).json({ error: "student_id query param required" }); return }

    const parents = await User.find({
      linked_student_id: new mongoose.Types.ObjectId(student_id),
      school_id: new mongoose.Types.ObjectId(callerSchoolId),
      role: "parent",
    }).select("name email is_active created_at").lean()

    res.json({
      parents: parents.map(p => ({
        id: (p._id as { toString(): string }).toString(),
        name: p.name,
        email: p.email,
        is_active: p.is_active,
        created_at: (p as { created_at?: Date }).created_at ?? null,
      })),
    })
  } catch (err) {
    logger.error({ err }, "[users/parents GET]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── DELETE /api/users/bulk-delete ────────────────────────────────────────────
router.delete("/bulk-delete", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { ids } = req.body as { ids: string[] }
    if (!ids?.length) { res.status(400).json({ error: "ids[] required" }); return }
    if (ids.length > 500) { res.status(400).json({ error: "Cannot bulk delete more than 500 users at once" }); return }

    // Soft-delete: set is_active=false instead of hard-deleting.
    // Hard-deleting orphans QuizAttempts, Certificates, ModuleProgress, and StudentActivity
    // records permanently — destroying all historical academic data.
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id))
    const result = await User.updateMany(
      { _id: { $in: objectIds }, school_id: new mongoose.Types.ObjectId(callerSchoolId) },
      { $set: { is_active: false } }
    )
    res.json({ success: true, deactivated: result.modifiedCount })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await requireAdminCaller(req)
    if ("error" in ctx) { res.status(ctx.status).json({ error: ctx.error }); return }
    const { callerSchoolId } = ctx

    const { id } = req.params
    // Verify target belongs to caller's school before deleting
    const target = await User.findById(id).select("school_id").lean()
    if (!target || target.school_id?.toString() !== callerSchoolId) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    // Soft-delete: preserve all related academic records (attendance, quiz attempts, certs)
    const updated = await User.findByIdAndUpdate(id, { is_active: false }).select("_id").lean()
    if (!updated) { res.status(404).json({ error: "User not found" }); return }
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[users]")
    res.status(500).json({ error: "An unexpected error occurred. Please try again." })
  }
})

export default router
