import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/auth.ts — Authentication routes mounted at /api/auth.
// Handles sign-in (email/phone/username), sign-out, current user fetch,
// forgot-password email, and password reset via token.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { randomBytes, createHash } from "crypto"
import { User } from "../models/User.js"
import { PasswordReset } from "../models/PasswordReset.js"
import { TeacherSession } from "../models/TeacherSession.js"
import { OTPSession } from "../models/OTPSession.js"
import { School } from "../models/School.js"
import { requireAuth, evictAuthCache, type AuthRequest } from "../middleware/auth.js"
import { withRetry } from "../lib/retry.js"
import { sendEmail } from "../lib/email.js"
import { sendSms } from "../lib/sms.js"
import zxcvbn from "zxcvbn"

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET ?? (() => { if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET env var is required in production"); return "dev-secret-change-in-production" })()
const FRONTEND_URL    = process.env.FRONTEND_URL    ?? "http://localhost:5173"
const IS_PROD         = process.env.NODE_ENV === "production"

function cookieOptions(role: string) {
  const maxAge = (role === "admin" || role === "super_admin" || role === "teacher")
    ? 8 * 60 * 60 * 1000   // 8 hours — matches JWT expiry for privileged roles
    : 24 * 60 * 60 * 1000  // 1 day — matches JWT expiry for student/parent
  return { httpOnly: true, sameSite: "lax" as const, secure: IS_PROD, maxAge, path: "/" }
}


function makeToken(userId: string, role: string, tokenVersion = 0): string {
  // Shorter expiry for privileged roles — limits the damage window if a token is stolen.
  const expiresIn = (role === "admin" || role === "super_admin" || role === "teacher") ? "8h" : "1d"
  // tv (token_version) is checked by middleware on every request — signing out increments
  // this value in the DB, making all previously issued tokens immediately invalid.
  return jwt.sign({ sub: userId, role, tv: tokenVersion }, JWT_SECRET, { expiresIn })
}

function serializeUser(user: InstanceType<typeof User>) {
  return {
    id:                   (user._id as { toString(): string }).toString(),
    name:                 user.name,
    email:                user.email,
    phone:                user.phone,
    username:             user.username,
    role:                 user.role,
    school_id:            user.school_id?.toString() ?? null,
    class_id:             user.class_id?.toString() ?? null,
    is_active:            user.is_active,
    preferred_language:   user.preferred_language,
    profile_photo_url:    user.profile_photo_url,
    must_change_password: user.must_change_password ?? false,
  }
}

// ── POST /api/auth/signin ─────────────────────────────────────────────────────
router.post("/signin", async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body as { identifier?: string; password?: string }
    if (!identifier || !password) {
      res.status(400).json({ error: "Identifier and password are required" }); return
    }
    if (identifier.length > 254 || password.length > 128) {
      res.status(400).json({ error: "Invalid credentials" }); return
    }

    // Find by email, phone, or username
    const isEmail = identifier.includes("@")
    const isPhone = /^\+?\d{10,15}$/.test(identifier.replace(/\s/g, ""))
    const query = isEmail
      ? { email: identifier.toLowerCase() }
      : isPhone
        ? { phone: identifier }
        : { username: identifier.toLowerCase() }

    const user = await User.findOne(query)
    if (!user || !user.is_active) {
      res.status(401).json({ error: "Invalid credentials." }); return
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials." }); return
    }

    // 2FA: teacher and admin accounts check if their school has 2FA enabled
    if (["teacher", "admin", "super_admin"].includes(user.role) && user.school_id) {
      const school = await School.findById(user.school_id).select("two_factor_enabled").lean()
      if (school?.two_factor_enabled) {
        const otp = (100000 + (randomBytes(3).readUIntBE(0, 3) % 900000)).toString()
        const [otpHash, rawSessionToken] = await Promise.all([
          bcrypt.hash(otp, 10),
          Promise.resolve(randomBytes(32).toString("hex")),
        ])
        const sessionTokenHash = createHash("sha256").update(rawSessionToken).digest("hex")
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

        await OTPSession.findOneAndUpdate(
          { user_id: user._id, channel: "email" },
          {
            session_token_hash: sessionTokenHash,
            otp_hash:           otpHash,
            email:              user.email,
            role:               user.role,
            school_id:          user.school_id,
            expires_at:         expiresAt,
            used:               false,
          },
          { upsert: true, new: true }
        )

        const maskedEmail = user.email
          ? user.email.replace(/^(.)(.*)(@.*)$/, (_m, first, _mid, domain) => `${first}***${domain}`)
          : ""

        if (process.env.NODE_ENV !== "production") {
          logger.info(`[auth/signin] 2FA OTP sent for user ${(user._id as { toString(): string }).toString()} via email`)
        }

        // Fire and forget — the OTP session is already in the database.
        // Email is best-effort with retry; if it still fails the user can click "Resend code".
        if (user.email) {
          withRetry(() => sendEmail({
            to:      user.email!,
            subject: "Your TeachScript login code",
            html:    `<p>Hi ${user.name},</p>
                     <p>Use the code below to complete your sign-in. It expires in <strong>10 minutes</strong>.</p>
                     <div style="font-size:36px;font-weight:900;letter-spacing:12px;margin:20px 0;color:#534AB7">${otp}</div>
                     <p style="color:#888;font-size:12px">If you didn't try to sign in, you can ignore this email.</p>`,
          })).catch((emailErr: unknown) => {
            logger.error({ err: emailErr }, "[auth/signin] OTP email failed after retries:")
          })
        }

        res.json({ otp_required: true, otp_session: rawSessionToken, masked_email: maskedEmail })
        return
      }
    }

    const token = makeToken(
      (user._id as { toString(): string }).toString(),
      user.role,
      user.token_version ?? 0,
    )

    // Sessions are created only via explicit Clock In — NOT on login.
    // Auto-creating here caused hours to accumulate whenever a teacher signed in.

    res.cookie("ts_token", token, cookieOptions(user.role))
    res.json({ user: serializeUser(user) })
  } catch (err) {
    logger.error({ err: err }, "[auth/signin]")
    res.status(500).json({ error: "Sign-in failed. Please try again." })
  }
})

// ── POST /api/auth/clock-in ───────────────────────────────────────────────────
router.post("/clock-in", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select("school_id role")
    if (!user || !user.school_id) { res.status(400).json({ error: "No school associated" }); return }

    const now  = new Date()
    const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

    const openSessions = await TeacherSession.find({ teacher_id: req.userId, logout_at: null })

    // Close any open sessions from previous days at 23:59:59 of that day
    for (const open of openSessions) {
      if (open.date === date) continue
      const midnight = new Date(`${open.date}T23:59:59+05:30`)
      open.logout_at = midnight
      open.duration_minutes = Math.min(1440, Math.max(0, Math.round((midnight.getTime() - open.login_at.getTime()) / 60000)))
      await open.save()
    }

    // If already clocked in today, do not create a duplicate session
    const alreadyClockedIn = openSessions.some(s => s.date === date)
    if (alreadyClockedIn) {
      res.json({ success: true, clocked_in: true, time: now }); return
    }

    await TeacherSession.create({ teacher_id: req.userId, school_id: user.school_id, date, login_at: now })
    res.json({ success: true, clocked_in: true, time: now })
  } catch (err) {
    logger.error({ err: err }, "[auth/clock-in]")
    res.status(500).json({ error: "Clock-in failed" })
  }
})

// ── POST /api/auth/clock-out ──────────────────────────────────────────────────
router.post("/clock-out", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date()
    const session = await TeacherSession.findOne({ teacher_id: req.userId, logout_at: null }).sort({ login_at: -1 })
    if (!session) { res.json({ success: true, clocked_in: false, duration_minutes: 0 }); return }
    const duration = Math.round((now.getTime() - session.login_at.getTime()) / 60000)
    session.logout_at = now; session.duration_minutes = duration
    await session.save()
    res.json({ success: true, clocked_in: false, duration_minutes: duration, time: now })
  } catch (err) {
    logger.error({ err: err }, "[auth/clock-out]")
    res.status(500).json({ error: "Clock-out failed" })
  }
})

// ── GET /api/auth/clock-status ───────────────────────────────────────────────
// Returns actual clock-in state. Auto-closes any open session left over from a previous day.
router.get("/clock-status", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

    const openSession = await TeacherSession.findOne({
      teacher_id: req.userId,
      logout_at:  null,
    }).sort({ login_at: -1 })

    if (!openSession) {
      res.json({ clocked_in: false, since: null }); return
    }

    // Session is from a previous day — close it at 23:59:59 of that day and report not clocked in
    if (openSession.date !== todayDate) {
      const midnight = new Date(`${openSession.date}T23:59:59+05:30`)
      openSession.logout_at = midnight
      openSession.duration_minutes = Math.max(0, Math.round(
        (midnight.getTime() - openSession.login_at.getTime()) / 60000
      ))
      await openSession.save()
      res.json({ clocked_in: false, since: null }); return
    }

    res.json({ clocked_in: true, since: openSession.login_at })
  } catch (err) {
    logger.error({ err: err }, "[auth/clock-status]")
    res.status(500).json({ error: "Failed to check clock status" })
  }
})

// ── POST /api/auth/change-password ───────────────────────────────────────────
// Authenticated user changes their own password (used for must_change_password flow).
router.post("/change-password", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { newPassword } = req.body as { newPassword?: string }
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" }); return
    }
    if (newPassword.length > 128) {
      res.status(400).json({ error: "Password must be under 128 characters" }); return
    }
    if (zxcvbn(newPassword).score < 2) {
      res.status(400).json({ error: "Password is too simple. Try mixing letters, numbers, and symbols." }); return
    }
    const hash = await bcrypt.hash(newPassword, 12)
    await User.findByIdAndUpdate(req.userId, { password_hash: hash, must_change_password: false })
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[auth/change-password]")
    res.status(500).json({ error: "Failed to change password. Please try again." })
  }
})

// ── POST /api/auth/signout ────────────────────────────────────────────────────
// Increments token_version in DB so ALL previously issued JWTs for this user
// are immediately rejected by middleware on next request (within 30s cache TTL).
// Teacher sessions are left open — they close at midnight or via Clock Out.
router.post("/signout", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Increment token_version — atomically invalidates all existing sessions
    if (req.userId) {
      await User.findByIdAndUpdate(req.userId, { $inc: { token_version: 1 } })
      evictAuthCache(req.userId)
    }
    res.clearCookie("ts_token", { httpOnly: true, sameSite: "lax", secure: IS_PROD, path: "/" })
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[auth/signout]")
    res.clearCookie("ts_token", { httpOnly: true, sameSite: "lax", secure: IS_PROD, path: "/" })
    res.json({ success: true })
  }
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select("-password_hash")
    if (!user || !user.is_active) {
      res.status(401).json({ error: "Account not found or deactivated" }); return
    }
    res.json({ profile: serializeUser(user) })
  } catch (err) {
    logger.error({ err: err }, "[auth/me]")
    res.status(500).json({ error: "Failed to load profile" })
  }
})

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string }
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Valid email required" }); return
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select("_id name email is_active")
    // Always return success to prevent email enumeration
    if (!user) { res.json({ success: true }); return }

    // Generate token, store hashed, email raw
    const rawToken = randomBytes(32).toString("hex")
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Atomic upsert — prevents race where two concurrent requests both create a token
    await PasswordReset.findOneAndUpdate(
      { user_id: user._id },
      { $set: { token_hash: tokenHash, expires_at: expiresAt, used: false } },
      { upsert: true }
    )

    const resetLink = `${FRONTEND_URL}/set-password?token=${rawToken}&email=${encodeURIComponent(email.toLowerCase())}`
    if (process.env.NODE_ENV !== "production") { logger.info(`[auth/forgot-password] Reset link generated for ${email.replace(/^(.)(.*)(@.*)$/, (_m, f, _mid, d) => `${f}***${d}`)}`) }

    try {
      await withRetry(() => sendEmail({
        to:      email,
        subject: "Reset your TeachScript password",
        html:    `<p>Hi ${user.name},</p><p>Click below to reset your password (expires in 24 hours):</p>
                 <p><a href="${resetLink}" style="background:#378ADD;color:white;padding:12px 24px;border-radius:8px;text-decoration:none">Reset my password →</a></p>
                 <p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p>`,
      }))
    } catch (err) { logger.error({ err: err }, "[auth/forgot-password] Email send failed after retries:") }

    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[auth/forgot-password]")
    res.status(500).json({ error: "Failed to process request" })
  }
})

// ── POST /api/auth/verify-otp ────────────────────────────────────────────────
// Second step of 2FA: the client sends the otp_session token received at sign-in
// plus the 6-digit code emailed to the user. On success, issues the JWT cookie.
router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { otp_session, code } = req.body as { otp_session?: string; code?: string }
    if (!otp_session || !code) {
      res.status(400).json({ error: "Session token and code are required" }); return
    }
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "Invalid code format" }); return
    }

    const sessionTokenHash = createHash("sha256").update(otp_session).digest("hex")
    const session = await OTPSession.findOne({
      session_token_hash: sessionTokenHash,
      channel: "email",
      used: false,
      expires_at: { $gt: new Date() },
    })

    if (!session) {
      res.status(400).json({ error: "Code has expired or is invalid. Please sign in again." }); return
    }

    const MAX_OTP_ATTEMPTS = 3

    const codeValid = await bcrypt.compare(code, session.otp_hash)

    if (!codeValid) {
      // Atomically increment the counter and mark the session used if exhausted.
      // A single findOneAndUpdate prevents a concurrent burst of requests from
      // each reading failed_attempts=0 and all slipping past the 3-attempt cap.
      const updated = await OTPSession.findOneAndUpdate(
        { _id: session._id, used: false },
        [{ $set: {
            failed_attempts: { $add: ["$failed_attempts", 1] },
            used: { $gte: [{ $add: ["$failed_attempts", 1] }, MAX_OTP_ATTEMPTS] },
        }}],
        { new: true },
      )
      const newCount = updated?.failed_attempts ?? MAX_OTP_ATTEMPTS
      const remaining = MAX_OTP_ATTEMPTS - newCount
      if (remaining <= 0) {
        res.status(400).json({ error: "Too many incorrect attempts. Please sign in again to get a new code." }); return
      }
      res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` }); return
    }

    await OTPSession.findByIdAndUpdate(session._id, { used: true })

    const user = await User.findById(session.user_id).select("-password_hash")
    if (!user || !user.is_active) {
      res.status(401).json({ error: "Account not found or deactivated" }); return
    }

    const token = makeToken(user._id.toString(), user.role, user.token_version ?? 0)
    res.cookie("ts_token", token, cookieOptions(user.role))
    res.json({ user: serializeUser(user) })
  } catch (err) {
    logger.error({ err: err }, "[auth/verify-otp]")
    res.status(500).json({ error: "Verification failed. Please try again." })
  }
})

// ── POST /api/auth/send-sms-otp ──────────────────────────────────────────────
// Passwordless login step 1: find user by phone, send OTP via SMS.
// Rate-limited by authStrictLimit (5 req / 15min per IP) on the router.
router.post("/send-sms-otp", async (req: Request, res: Response) => {
  try {
    const { phone } = req.body as { phone?: string }
    if (!phone?.trim()) {
      res.status(400).json({ error: "Phone number is required" }); return
    }

    const digits = phone.trim().replace(/[^\d+]/g, "")
    if (digits.replace(/\D/g, "").length < 10) {
      res.status(400).json({ error: "Please enter a valid phone number" }); return
    }

    // Find user by phone — must be active
    const user = await User.findOne({ phone: { $in: [digits, phone.trim()] }, is_active: true })
      .select("_id name phone role school_id")
      .lean()

    // Always return a success-looking response to prevent phone enumeration
    if (!user || !user.school_id) {
      res.json({ success: true, masked_phone: `****${digits.slice(-4)}` }); return
    }

    const otp = (100000 + (randomBytes(3).readUIntBE(0, 3) % 900000)).toString()
    const [otpHash, rawSessionToken] = await Promise.all([
      bcrypt.hash(otp, 10),
      Promise.resolve(randomBytes(32).toString("hex")),
    ])
    const sessionTokenHash = createHash("sha256").update(rawSessionToken).digest("hex")
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await OTPSession.findOneAndUpdate(
      { user_id: user._id, channel: "sms" },
      {
        session_token_hash: sessionTokenHash,
        otp_hash:           otpHash,
        email:              null,
        phone:              digits,
        role:               user.role,
        school_id:          user.school_id,
        expires_at:         expiresAt,
        used:               false,
      },
      { upsert: true, new: true }
    )

    // Deliver asynchronously — the OTP session is already persisted in the DB, so the
    // user can verify even if the first SMS attempt fails. withRetry retries transient
    // network/5xx failures up to 3 times with exponential backoff.
    withRetry(() => sendSms(digits, otp, user.name), 3, 500).catch((err: unknown) => {
      logger.error({ err }, "[auth/send-sms-otp] SMS delivery failed after retries")
    })

    const maskedPhone = `****${digits.slice(-4)}`
    res.json({ success: true, otp_session: rawSessionToken, masked_phone: maskedPhone })
  } catch (err) {
    logger.error({ err: err }, "[auth/send-sms-otp]")
    res.status(500).json({ error: "Failed to send OTP. Please try again." })
  }
})

// ── POST /api/auth/verify-sms-otp ────────────────────────────────────────────
// Passwordless login step 2: verify SMS OTP code, issue JWT.
// Rate-limited by authStrictLimit (5 req / 15min per IP) on the router.
router.post("/verify-sms-otp", async (req: Request, res: Response) => {
  try {
    const { otp_session, code } = req.body as { otp_session?: string; code?: string }
    if (!otp_session || !code) {
      res.status(400).json({ error: "Session token and code are required" }); return
    }
    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "Invalid code format" }); return
    }

    const sessionTokenHash = createHash("sha256").update(otp_session).digest("hex")
    const session = await OTPSession.findOne({
      session_token_hash: sessionTokenHash,
      channel: "sms",
      used: false,
      expires_at: { $gt: new Date() },
    })

    if (!session) {
      res.status(400).json({ error: "Code has expired or is invalid. Please request a new one." }); return
    }

    const MAX_OTP_ATTEMPTS = 3

    const codeValid = await bcrypt.compare(code, session.otp_hash)

    if (!codeValid) {
      // Atomically increment the counter and mark the session used if exhausted.
      // A single findOneAndUpdate prevents a concurrent burst of requests from
      // each reading failed_attempts=0 and all slipping past the 3-attempt cap.
      const updated = await OTPSession.findOneAndUpdate(
        { _id: session._id, used: false },
        [{ $set: {
            failed_attempts: { $add: ["$failed_attempts", 1] },
            used: { $gte: [{ $add: ["$failed_attempts", 1] }, MAX_OTP_ATTEMPTS] },
        }}],
        { new: true },
      )
      const newCount = updated?.failed_attempts ?? MAX_OTP_ATTEMPTS
      const remaining = MAX_OTP_ATTEMPTS - newCount
      if (remaining <= 0) {
        res.status(400).json({ error: "Too many incorrect attempts. Please request a new code." }); return
      }
      res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` }); return
    }

    await OTPSession.findByIdAndUpdate(session._id, { used: true })

    const user = await User.findById(session.user_id).select("-password_hash")
    if (!user || !user.is_active) {
      res.status(401).json({ error: "Account not found or deactivated." }); return
    }

    const token = makeToken(user._id.toString(), user.role, user.token_version ?? 0)
    res.cookie("ts_token", token, cookieOptions(user.role))
    res.json({ user: serializeUser(user) })
  } catch (err) {
    logger.error({ err: err }, "[auth/verify-sms-otp]")
    res.status(500).json({ error: "Verification failed. Please try again." })
  }
})

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, email, password } = req.body as { token?: string; email?: string; password?: string }
    if (!token || !email || !password) {
      res.status(400).json({ error: "token, email, and password are required" }); return
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" }); return
    }
    if (password.length > 128) {
      res.status(400).json({ error: "Password must be under 128 characters" }); return
    }
    if (zxcvbn(password).score < 2) {
      res.status(400).json({ error: "Password is too simple. Try mixing letters, numbers, and symbols." }); return
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select("_id email")
    if (!user) { res.status(400).json({ error: "Invalid reset link." }); return }

    const tokenHash = createHash("sha256").update(token).digest("hex")
    const resetDoc = await PasswordReset.findOne({
      user_id: user._id,
      token_hash: tokenHash,
      used: false,
      expires_at: { $gt: new Date() },
    })

    if (!resetDoc) {
      res.status(400).json({ error: "Reset link is invalid or has expired. Please request a new one." }); return
    }

    const hash = await bcrypt.hash(password, 12)
    await User.findByIdAndUpdate(user._id, { password_hash: hash, must_change_password: false })
    await PasswordReset.findByIdAndUpdate(resetDoc._id, { used: true })

    // Do NOT auto-sign-in after reset — the user must log in manually.
    // Auto-sign-in after reset allows a reset link interceptor to gain an active session
    // without ever knowing the new password.
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[auth/reset-password]")
    res.status(500).json({ error: "Failed to reset password" })
  }
})

export default router
