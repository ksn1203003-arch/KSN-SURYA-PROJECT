// ─────────────────────────────────────────────────────────────────────────────
// index.ts — Express application entry point.
// Configures security headers, CORS, rate limiting, body parsing, and mounts
// all API routers. Connects to MongoDB then starts listening on PORT (default 4000).
// ─────────────────────────────────────────────────────────────────────────────
import express from "express"
import cors from "cors"
import helmet from "helmet"
import compression from "compression"
import { rateLimit } from "express-rate-limit"
import { SharedRateLimitStore } from "./lib/rateLimitStore.js"
import { serializeRequestForLog } from "./lib/redactUrl.js"
import pinoHttp from "pino-http"
import * as Sentry from "@sentry/node"
import { logger } from "./lib/logger.js"
import { connectDB } from "./lib/mongodb.js"
import authRouter from "./routes/auth.js"
import aiRouter from "./routes/ai.js"
import usersRouter from "./routes/users.js"
import schoolRouter from "./routes/school.js"
import certificatesRouter from "./routes/certificates.js"
import reportsRouter from "./routes/reports.js"
import paymentsRouter from "./routes/payments.js"
import whatsappRouter from "./routes/whatsapp.js"
import signupRouter from "./routes/signup.js"
import teacherRouter from "./routes/teacher.js"
import modulesRouter from "./routes/modules.js"
import filesRouter from "./routes/files.js"
import studentRouter from "./routes/student.js"
import quizzesRouter from "./routes/quizzes.js"
import challengesRouter from "./routes/challenges.js"
import studentCertificatesRouter from "./routes/studentCertificates.js"
import runRouter from "./routes/run.js"
import marksRouter from "./routes/marks.js"
import dpdpRouter from "./routes/dpdp.js"
import homeworkRouter from "./routes/homework.js"
import parentRouter from "./routes/parent.js"
import photosRouter from "./routes/photos.js"
import { requireAuth } from "./middleware/auth.js"
import { backpressure } from "./middleware/backpressure.js"
import { errorHandler } from "./middleware/errorHandler.js"
import { startMidnightClockOut } from "./jobs/midnightClockOut.js"
import { startPptxWorker, stopPptxWorker } from "./jobs/pptxWorker.js"
import { startPdfWorker, stopPdfWorker } from "./jobs/pdfWorker.js"
import { warmOutstandingTemplate } from "./lib/pdf.js"
import { validateEnv } from "./lib/validateEnv.js"
import { registry, httpRequestDuration, httpRequestCounter } from "./lib/metrics.js"
import mongoose from "mongoose"

// Validate env vars immediately — throws in production if critical vars missing
validateEnv()

// Sentry must be initialised before any other imports that create instrumentation.
// Safe no-op when SENTRY_DSN is not set.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  })
}

const app = express()
const PORT = process.env.PORT ?? 4000

const FRONTEND_ORIGIN = process.env.FRONTEND_URL ?? "http://localhost:5173"
// ALLOWED_ORIGINS: comma-separated list of permitted CORS origins.
// Falls back to FRONTEND_URL for single-origin deployments.
// Example: ALLOWED_ORIGINS=https://app.teachscript.in,https://staging.teachscript.in
const ALLOWED_ORIGINS: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()).filter(Boolean)
  : [FRONTEND_ORIGIN]

// Trust the first hop reverse proxy (nginx/load balancer) so that express-rate-limit
// sees the real client IP from X-Forwarded-For rather than the proxy's address.
// Without this, all clients behind the same proxy share one rate-limit bucket.
app.set("trust proxy", 1)

// Security headers via Helmet
// frameguard is re-enabled (SAMEORIGIN) to block clickjacking on all endpoints.
// The /api/files/* route adds a per-response Content-Security-Policy override
// (in files.ts) to allow the frontend origin to embed files in iframes.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],      // disallow embedding this API in iframes by default
      upgradeInsecureRequests: [],
    },
  },
  frameguard:  { action: "sameorigin" },
  hsts:        { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}))

// Gzip compression for all JSON/text responses
app.use(compression())

// Structured request logging — attaches req.log (child logger with requestId) to every request.
// Each log line automatically includes method, url, statusCode, responseTime, and requestId.
// X-Request-ID: if the frontend sends one, use it; otherwise generate a new UUID.
// The ID is echoed back in the response header so frontend error states can show it to users.
app.use(pinoHttp({
  logger,
  genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
  customLogLevel: (_req, res) => res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
  serializers: {
    // Stream, file and reset tokens in the query string are hidden before logging
    req: serializeRequestForLog,
    res: (res) => ({ statusCode: res.statusCode }),
  },
}))

// Echo X-Request-ID back in every response so the frontend can surface it in error messages.
app.use((req, res, next) => {
  res.setHeader("X-Request-ID", req.id as string)
  next()
})

// Prometheus HTTP instrumentation — observe duration and count on response finish.
// Normalises route to the first two path segments to avoid high-cardinality labels.
app.use((req, res, next) => {
  const start = process.hrtime.bigint()
  res.on("finish", () => {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9
    const parts = req.path.replace(/\/+$/, "").split("/").slice(0, 4)
    const route = parts.join("/") || "/"
    const labels = { method: req.method, route, status: String(res.statusCode) }
    httpRequestDuration.observe(labels, durationSec)
    httpRequestCounter.inc(labels)
  })
  next()
})

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    callback(new Error(`CORS: origin '${origin}' not allowed`))
  },
  credentials: true,
}))

// Shed excess requests when connection pool is near saturation
app.use(backpressure)

// Rate limiting — per IP, per minute. Counters are shared through Redis when it is
// configured (all server copies count together) and kept in memory otherwise.
// Profile photos and the parts of a playing video have their own limits (below), so a
// class list full of avatars or a lab of students watching a lesson never uses up the
// school's general budget and blocks an attendance save.
const isPhotoOrVideoPart = (req: express.Request) =>
  req.method === "GET" && (req.path.startsWith("/photos/") || (req.path.startsWith("/files/") && typeof req.query.st === "string"))
const generalLimit   = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false, store: new SharedRateLimitStore("api"), skip: isPhotoOrVideoPart }) // general API
// Per signed-in user (mounted after requireAuth): plenty for several class lists a minute
const photoLimit     = rateLimit({
  windowMs: 60_000, max: 240,
  keyGenerator: (req) => (req as unknown as { userId?: string }).userId ?? req.ip ?? "unknown",
  standardHeaders: true, legacyHeaders: false, store: new SharedRateLimitStore("photos"),
})

// AI rate limit keys on userId after requireAuth so each teacher gets their own 30/min budget
// rather than sharing one budget per school IP (all teachers behind the same NAT)
const aiLimit        = rateLimit({
  windowMs: 60_000, max: 30,
  keyGenerator: (req) => (req as unknown as { userId?: string }).userId ?? req.ip ?? "unknown",
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait a moment before trying again." },
  store: new SharedRateLimitStore("ai"),
})
const userLimit      = rateLimit({ windowMs: 60_000, max: 60,  standardHeaders: true, legacyHeaders: false, store: new SharedRateLimitStore("users") }) // user create/invite
const heavyLimit     = rateLimit({ windowMs: 60_000, max: 20,  standardHeaders: true, legacyHeaders: false, store: new SharedRateLimitStore("heavy") }) // PDF generation
const rl = (name: string, max: number) => rateLimit({ windowMs: 15 * 60_000, max, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Please try again in 15 minutes." }, store: new SharedRateLimitStore(name) })
const signinLimit      = rl("signin", 5)          // brute-force protection on password login
const forgotPwdLimit   = rl("forgot-password", 5) // prevent password reset email spam
const otpVerifyLimit   = rl("verify-otp", 10)     // email 2FA code verification (slightly more for legit use)
const smsOtpSendLimit  = rl("send-sms-otp", 5)    // prevent SMS flooding
const smsOtpVerifyLimit = rl("verify-sms-otp", 10) // SMS OTP code verification

app.use("/api", generalLimit)
app.use("/api/users", userLimit)
app.use("/api/certificates", heavyLimit)
app.use("/api/reports", heavyLimit)
app.use("/api/auth/signin",          signinLimit)
app.use("/api/auth/forgot-password", forgotPwdLimit)
app.use("/api/auth/reset-password",  forgotPwdLimit)
app.use("/api/auth/verify-otp",      otpVerifyLimit)
app.use("/api/auth/send-sms-otp",    smsOtpSendLimit)
app.use("/api/auth/verify-sms-otp",  smsOtpVerifyLimit)

// Razorpay webhook needs raw body for HMAC verification — must be registered BEFORE express.json()
// so the body stream isn't consumed first by the JSON parser.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }))

// Body parsing — all other routes get parsed JSON
app.use(express.json({ limit: "2mb" }))

// Public routes — no auth needed
app.use("/api/auth", authRouter)
app.use("/api/signup/request", forgotPwdLimit) // MED-14: rate limit signup to prevent admin email flood
app.use("/api/signup", signupRouter)

// Protected routes — valid JWT required on all of these
// aiLimit is mounted after requireAuth so keyGenerator has req.userId for per-user limits
app.use("/api/ai", requireAuth, aiLimit, aiRouter)
app.use("/api/users", requireAuth, usersRouter)
app.use("/api/school", requireAuth, schoolRouter)
app.use("/api/certificates", requireAuth, certificatesRouter)
app.use("/api/reports", requireAuth, reportsRouter)
app.use("/api/payments", paymentsRouter)       // webhook has its own signature check
app.use("/api/whatsapp", requireAuth, whatsappRouter)
app.use("/api/teacher", requireAuth, teacherRouter)
app.use("/api/modules",               requireAuth, modulesRouter)
app.use("/api/files",                 filesRouter)  // token-based auth — no JWT required; video parts limited inside
app.use("/api/student",               requireAuth, studentRouter)
app.use("/api/quizzes",               requireAuth, quizzesRouter)
app.use("/api/challenges",            requireAuth, challengesRouter)
app.use("/api/student-certificates",  requireAuth, studentCertificatesRouter)
app.use("/api/run", rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, store: new SharedRateLimitStore("run") }))
app.use("/api/run", requireAuth, runRouter)
app.use("/api/marks",   requireAuth, marksRouter)
app.use("/api/dpdp",    requireAuth, dpdpRouter)
app.use("/api/homework", requireAuth, homeworkRouter)
app.use("/api/parent",   requireAuth, parentRouter)
app.use("/api/photos",   requireAuth, photoLimit, photosRouter)

// Express 4 does not catch errors thrown by async route handlers. Log them instead of
// letting one bad request stop the whole server.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "[process] unhandled promise rejection")
})

// Basic health check — used by Docker healthcheck and load balancers
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }))

// Detailed health check — subsystem status for monitoring dashboards.
// Each subsystem is checked independently; one failure degrades the response
// but never crashes the handler.
app.get("/health/detailed", async (_req, res) => {
  const mongoState = mongoose.connection.readyState
  const mongoStates: Record<number, string> = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" }
  const mongoStatus = mongoStates[mongoState] ?? "unknown"

  const memUsage = process.memoryUsage()
  const memMb = Math.round(memUsage.rss / 1024 / 1024)

  // Redis ping — times out after 2 seconds to avoid hanging the health endpoint
  let redisStatus = "not_configured"
  try {
    const { getRedis } = await import("./lib/redis.js")
    const redis = getRedis()
    if (redis) {
      const pong = await Promise.race([
        redis.ping(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ])
      redisStatus = pong === "PONG" ? "connected" : "degraded"
    }
  } catch { redisStatus = "error" }

  // Puppeteer — check if singleton browser is running without launching one
  let puppeteerStatus: string | boolean = "not_started"
  try {
    const { getPuppeteerStatus } = await import("./lib/pdf.js")
    const pStatus = getPuppeteerStatus()
    puppeteerStatus = pStatus.running ? "running" : "not_started"
  } catch { puppeteerStatus = "error" }

  // BullMQ queue depths — useful during heavy report-card or PPTX conversion periods
  let pdfQueueDepth: number | null = null
  let pptxQueueDepth: number | null = null
  try {
    const { getPdfQueue, getPptxQueue } = await import("./jobs/queue.js")
    const pdfQ  = getPdfQueue()
    const pptxQ = getPptxQueue()
    if (pdfQ)  pdfQueueDepth  = await pdfQ.getWaitingCount()
    if (pptxQ) pptxQueueDepth = await pptxQ.getWaitingCount()
  } catch { /* queues not available — Redis not configured */ }

  const isHealthy = mongoState === 1

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "degraded",
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: memMb,
    mongodb: mongoStatus,
    redis: redisStatus,
    puppeteer_pages: puppeteerStatus,
    queue_depth: {
      pdf:  pdfQueueDepth,
      pptx: pptxQueueDepth,
    },
    timestamp: new Date().toISOString(),
  })
})

// Prometheus metrics — restricted to localhost / internal Docker network only.
// Reachable by Prometheus scraper but not exposed through nginx to the internet.
// Scrape with: curl http://localhost:4000/metrics  (from within the host or Docker network)
// isPrivateIp: returns true for localhost and RFC-1918 private ranges only.
// Previous version used ip.startsWith("172.2") which incorrectly matched 172.200.x.x (public).
// Correct 172.16.0.0/12 range covers 172.16.x.x through 172.31.x.x only.
function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return true
  if (ip.startsWith("10.")) return true
  if (ip.startsWith("192.168.")) return true
  // 172.16.0.0/12 = 172.16.x.x to 172.31.x.x
  const m = ip.match(/^172\.(\d+)\./)
  if (m) { const octet = parseInt(m[1], 10); return octet >= 16 && octet <= 31 }
  return false
}

app.get("/metrics", (req, res, next) => {
  if (!isPrivateIp(req.ip ?? "")) { res.status(403).json({ error: "Forbidden" }); return }
  next()
}, async (_req, res) => {
  res.set("Content-Type", registry.contentType)
  res.end(await registry.metrics())
})

// 404 handler — always return JSON (not Express default HTML)
app.use((_req, res) => res.status(404).json({ error: "Not found" }))

// Sentry error handler must be registered after all routes and before the generic error handler
if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app)

// Global error handler — catches next(err) from any route; handles AppError subclasses and unknown errors
app.use(errorHandler)

// Connect to MongoDB then start server
connectDB().then(() => {
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "TeachScript Backend listening")
    startMidnightClockOut()
    startPptxWorker()
    startPdfWorker()
    warmOutstandingTemplate()
  })

  // Graceful shutdown — finish in-flight requests before exiting on deploy/restart.
  // Without this, active file uploads are killed mid-stream, leaving orphaned GridFS chunks.
  function gracefulShutdown(signal: string) {
    logger.info({ signal }, "Shutdown signal received — closing HTTP server")
    server.close(() => {
      logger.info("HTTP server closed — draining BullMQ workers")
      Promise.all([stopPptxWorker(), stopPdfWorker()])
        .then(() => { logger.info("Workers drained — exiting"); process.exit(0) })
        .catch(err => { logger.error({ err }, "Worker drain error — forcing exit"); process.exit(1) })
    })
    setTimeout(() => { logger.error("Force exit after 30s timeout"); process.exit(1) }, 30_000)
  }
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
  process.on("SIGINT",  () => gracefulShutdown("SIGINT"))
}).catch(err => {
  logger.error({ err }, "MongoDB connection failed — exiting")
  process.exit(1)
})
