import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/signup.ts — School self-signup flow mounted at /api/signup.
// New schools submit an application; super-admin approves/rejects via
// HMAC-protected email links, which auto-create the school and admin account.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express"
import bcrypt from "bcryptjs"
import mongoose from "mongoose"
import { createHmac, timingSafeEqual, randomBytes } from "crypto"
import { User } from "../models/User.js"
import { School } from "../models/School.js"
import { PendingSignup } from "../models/PendingSignup.js"
import { cleanClassName } from "../lib/className.js"
import { sendEmail as sendEmailViaLib } from "../lib/email.js"

const router = Router()

const OWNER_EMAIL   = process.env.OWNER_EMAIL   ?? "ksn1203003@gmail.com"
const BACKEND_URL   = process.env.BACKEND_URL   ?? "http://localhost:4000"
const FRONTEND_URL  = process.env.FRONTEND_URL  ?? "http://localhost:5173"
const HMAC_SECRET   = process.env.APPROVAL_SECRET ?? (() => {
  if (process.env.NODE_ENV === "production") throw new Error("APPROVAL_SECRET env var is required in production")
  return "dev-secret-change-in-production"
})()

const TOKEN_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** Escape HTML special characters to prevent injection in emails */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
}

/** Token format: {hmac_hex}.{base36_expiry} — expires in 7 days */
function makeToken(id: string): string {
  const expires = (Date.now() + TOKEN_VALIDITY_MS).toString(36)
  const hmac = createHmac("sha256", HMAC_SECRET).update(`${id}:${expires}`).digest("hex")
  return `${hmac}.${expires}`
}

function verifyToken(id: string, token: string): boolean {
  const dotIdx = token.lastIndexOf(".")
  if (dotIdx === -1) return false
  const hmac    = token.slice(0, dotIdx)
  const expires = token.slice(dotIdx + 1)
  if (parseInt(expires, 36) < Date.now()) return false // expired
  const expected = Buffer.from(createHmac("sha256", HMAC_SECRET).update(`${id}:${expires}`).digest("hex"))
  const provided  = Buffer.from(hmac)
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await sendEmailViaLib({ to, subject, html })
  } catch (error) { logger.error({ err: error }, "[signup] Email send error:") }
}

// ── GET /api/signup/check-email ───────────────────────────────────────────────
router.get("/check-email", async (req, res) => {
  try {
    const { email } = req.query as { email?: string }
    if (!email) return res.status(400).json({ error: "Email required" })

    const user = await User.findOne({ email: email.toLowerCase() }).select("_id").lean()
    if (user) return res.json({ available: false, reason: "This email already has an account. Please use the login page." })

    const pending = await PendingSignup.findOne({ admin_email: email.toLowerCase(), status: "pending" })
    if (pending) return res.json({ available: false, reason: "An application with this email is already under review." })

    return res.json({ available: true })
  } catch (err) {
    logger.error({ err: err }, "[signup/check-email]")
    return res.status(500).json({ error: "Failed to check email availability" })
  }
})

// ── POST /api/signup/request ──────────────────────────────────────────────────
router.post("/request", async (req, res) => {
  try {
    const { school, admin, firstClass, firstTeacher } = req.body

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!school?.name?.trim() || school.name.trim().length > 200) {
      return res.status(400).json({ error: "School name is required and must be under 200 characters" })
    }
    if (school.board && school.board.length > 100) {
      return res.status(400).json({ error: "Board name must be under 100 characters" })
    }
    if (!admin?.name?.trim() || admin.name.trim().length > 100) {
      return res.status(400).json({ error: "Admin name is required and must be under 100 characters" })
    }
    if (!admin?.email?.trim() || admin.email.trim().length > 254 || !EMAIL_RE.test(admin.email.trim())) {
      return res.status(400).json({ error: "A valid admin email address is required" })
    }
    if (admin.phone && (!/^\d+$/.test(String(admin.phone)) || String(admin.phone).length > 15)) {
      return res.status(400).json({ error: "Phone number must be digits only, under 15 characters" })
    }

    // ── First class (optional): validate and clean before anything is stored ───
    let firstClassGrade: number | null = null
    let firstClassSection: string | null = null
    let firstClassName: string | null = null
    let firstClassStudents = 0
    if (firstClass !== undefined && firstClass !== null) {
      if (typeof firstClass !== "object") return res.status(400).json({ error: "First class details are not valid" })
      if (firstClass.grade !== undefined && firstClass.grade !== null && firstClass.grade !== "") {
        const g = Number(firstClass.grade)
        if (!Number.isInteger(g) || g < 0 || g > 20) return res.status(400).json({ error: "Class grade must be a whole number from 0 to 20" })
        firstClassGrade = g
      }
      if (firstClass.section !== undefined && firstClass.section !== null && firstClass.section !== "") {
        const cleaned = cleanClassName(firstClass.section)
        if (!cleaned.ok) return res.status(400).json({ error: cleaned.error })
        firstClassSection = cleaned.value
      }
      if (firstClass.name !== undefined && firstClass.name !== null && firstClass.name !== "") {
        const cleaned = cleanClassName(firstClass.name)
        if (!cleaned.ok) return res.status(400).json({ error: cleaned.error })
        firstClassName = cleaned.value
      }
      if (firstClass.numStudents !== undefined && firstClass.numStudents !== null && firstClass.numStudents !== "") {
        const n = Number(firstClass.numStudents)
        if (!Number.isInteger(n) || n < 0 || n > 100000) return res.status(400).json({ error: "Number of students must be a whole number from 0 to 100000" })
        firstClassStudents = n
      }
    }

    const activeUser = await User.findOne({ email: admin.email.toLowerCase() }).select("_id").lean()
    if (activeUser) return res.status(409).json({ error: "This email already has an account." })

    const pendingApp = await PendingSignup.findOne({ admin_email: admin.email.toLowerCase(), status: "pending" })
    if (pendingApp) return res.status(409).json({ error: "An application with this email is already under review." })

    const signup = await PendingSignup.create({
      school_name:           school.name,
      board:                 school.board,
      city:                  school.city,
      state:                 school.state,
      total_students:        Number(school.totalStudents) || 0,
      admin_name:            admin.name,
      admin_email:           admin.email.toLowerCase(),
      admin_phone:           admin.phone,
      first_class_grade:     firstClassGrade,
      first_class_section:   firstClassSection,
      first_class_name:      firstClassName,
      first_class_students:  firstClassStudents,
      first_teacher_name:    firstTeacher?.name    ?? null,
      first_teacher_email:   firstTeacher?.email   ?? null,
      first_teacher_phone:   firstTeacher?.phone   ?? null,
    })

    const id = (signup._id as { toString(): string }).toString()
    const token = makeToken(id)
    const approveUrl = `${BACKEND_URL}/api/signup/approve/${id}?token=${encodeURIComponent(token)}`
    const rejectUrl  = `${BACKEND_URL}/api/signup/reject/${id}?token=${encodeURIComponent(token)}`

    await sendEmail(OWNER_EMAIL, `New signup: ${esc(school.name)} (${esc(school.city)}) — Action required`, `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
  <h2 style="color:#378ADD">📚 New TeachScript Signup</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">School</td><td style="padding:8px">${esc(school.name)}</td></tr>
    <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Board</td><td style="padding:8px">${esc(school.board ?? "")}</td></tr>
    <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Location</td><td style="padding:8px">${esc(school.city ?? "")}, ${esc(school.state ?? "")}</td></tr>
    <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Admin</td><td style="padding:8px">${esc(admin.name)} · ${esc(admin.email)} · ${esc(admin.phone ?? "")}</td></tr>
  </table>
  <div style="margin-top:32px">
    <a href="${approveUrl}" style="background:#22c55e;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:16px">✅ Approve</a>
    <a href="${rejectUrl}" style="background:#ef4444;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">❌ Reject</a>
  </div>
  <p style="color:#888;font-size:12px;margin-top:24px">These links expire in 7 days.</p>
</body></html>`)

    return res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[signup/request]")
    return res.status(500).json({ error: "Failed to submit application. Please try again." })
  }
})

// ── GET /api/signup/approve/:id ───────────────────────────────────────────────
router.get("/approve/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { token } = req.query as { token?: string }

    if (!token || !verifyToken(id, token)) {
      return res.status(401).send(resultPage("❌ Invalid or expired link.", "red"))
    }

    const signup = await PendingSignup.findById(id)
    if (!signup) return res.status(404).send(resultPage("❌ Application not found.", "red"))
    if (signup.status !== "pending") {
      return res.status(409).send(resultPage(`⚠️ Already ${signup.status}. No action taken.`, "orange"))
    }

    // Generate temp password before the transaction (bcrypt is CPU-intensive; keep tx short)
    const tempPass = randomBytes(8).toString("hex") // 16-char hex — crypto-secure
    const hash = await bcrypt.hash(tempPass, 12)

    // Wrap School + User creation in a single MongoDB transaction.
    // If the process crashes between writes, the whole operation rolls back —
    // no orphaned School with a missing admin, no unrecoverable state.
    let schoolId: mongoose.Types.ObjectId
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        const [school] = await School.create([{
          name: signup!.school_name,
          board: signup!.board,
          city: signup!.city,
          state: signup!.state,
          subscription_plan: "free",
        }], { session })
        schoolId = school._id as mongoose.Types.ObjectId

        await User.create([{
          name:                 signup!.admin_name,
          email:                signup!.admin_email,
          phone:                signup!.admin_phone,
          password_hash:        hash,
          role:                 "admin",
          school_id:            schoolId,
          is_active:            true,
          must_change_password: true,
        }], { session })

        await PendingSignup.findByIdAndUpdate(id, { status: "approved", reviewed_at: new Date() }, { session })
      })
    } finally {
      await session.endSession()
    }

    const loginUrl = `${FRONTEND_URL}/login?role=admin`

    await sendEmail(signup.admin_email, `Your TeachScript account is ready — ${signup.school_name}`, `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
  <h2 style="color:#378ADD">🎉 Welcome to TeachScript, ${esc(signup.admin_name)}!</h2>
  <p>Your school <strong>${esc(signup.school_name)}</strong> has been approved.</p>
  <p>Login with:</p>
  <table style="background:#f5f4f0;padding:16px;border-radius:8px;width:100%">
    <tr><td><b>Email:</b></td><td>${esc(signup.admin_email)}</td></tr>
    <tr><td><b>Password:</b></td><td>${esc(tempPass)}</td></tr>
  </table>
  <div style="margin:24px 0">
    <a href="${loginUrl}" style="background:#378ADD;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Login to TeachScript →</a>
  </div>
  <p style="color:#888;font-size:12px">Please change your password after first login.</p>
</body></html>`)

    return res.send(resultPage(`✅ ${esc(signup.school_name)} approved! Credentials emailed to ${esc(signup.admin_email)}`, "green"))
  } catch (err) {
    logger.error({ err: err }, "[signup/approve]")
    return res.status(500).send(resultPage("❌ Server error while approving. Please try again.", "red"))
  }
})

// ── GET /api/signup/reject/:id ────────────────────────────────────────────────
router.get("/reject/:id", async (req, res) => {
  try {
    const { id } = req.params
    const { token } = req.query as { token?: string }

    if (!token || !verifyToken(id, token)) {
      return res.status(401).send(resultPage("❌ Invalid or expired link.", "red"))
    }

    const signup = await PendingSignup.findById(id)
    if (!signup) return res.status(404).send(resultPage("❌ Application not found.", "red"))
    if (signup.status !== "pending") {
      return res.status(409).send(resultPage(`⚠️ Already ${signup.status}. No action taken.`, "orange"))
    }

    await PendingSignup.findByIdAndUpdate(id, { status: "rejected", reviewed_at: new Date() })

    await sendEmail(signup.admin_email, "Your TeachScript application — update", `
<p>Dear ${esc(signup.admin_name)},</p>
<p>Thank you for applying. We are unable to onboard your school at this time. We'll reach out when a spot opens.</p>
<p>— The TeachScript Team</p>`)

    return res.send(resultPage(`❌ ${esc(signup.school_name)} rejected.`, "red"))
  } catch (err) {
    logger.error({ err: err }, "[signup/reject]")
    return res.status(500).send(resultPage("❌ Server error while rejecting. Please try again.", "red"))
  }
})

function resultPage(message: string, color: "green" | "red" | "orange") {
  const bg = { green: "#f0fdf4", red: "#fef2f2", orange: "#fff7ed" }[color]
  const border = { green: "#22c55e", red: "#ef4444", orange: "#f97316" }[color]
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:${bg}">
  <div style="text-align:center;padding:40px;border:2px solid ${border};border-radius:12px;background:white;max-width:480px">
    <p style="font-size:20px;margin:0">${message}</p>
    <p style="margin-top:16px"><a href="${FRONTEND_URL}" style="color:#378ADD">← Go to TeachScript</a></p>
  </div></body></html>`
}

export default router
