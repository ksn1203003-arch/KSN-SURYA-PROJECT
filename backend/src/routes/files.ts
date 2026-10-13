import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/files.ts — GridFS file streaming route at /api/files.
// Issues short-lived FileToken records and streams stored files without
// exposing the JWT in the URL (which would leak into server logs).
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from "express"
import mongoose from "mongoose"
import { GridFSBucket } from "mongodb"
import jwt from "jsonwebtoken"
import { User } from "../models/User.js"
import { Module } from "../models/Module.js"
import { FileToken } from "../models/FileToken.js"
import { rateLimit } from "express-rate-limit"
import { SharedRateLimitStore } from "../lib/rateLimitStore.js"
import { webcrypto } from "node:crypto"
const crypto = webcrypto as unknown as Crypto

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? (() => { if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET env var is required in production"); return "dev-secret-change-in-production" })()

// MIME types by extension
const MIME_MAP: Record<string, string> = {
  pdf:  "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt:  "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc:  "application/msword",
  mp4:  "video/mp4",
  webm: "video/webm",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  gif:  "image/gif",
}

// Videos are played in parts through a reusable stream link; everything else
// (PDFs, slides, images, documents) keeps the single-use whole download.
const VIDEO_TYPES = new Set(["mp4", "webm"])
const STREAM_IDLE_MS = 5 * 60 * 1000        // a stream link lapses 5 minutes after its last use
const STREAM_MAX_MS  = 3 * 60 * 60 * 1000   // and never lives longer than 3 hours
const STREAM_EXTEND_WHEN_MS = 150 * 1000    // only refresh the expiry when under 2.5 minutes remain
const STREAM_STAFF_ROLES = new Set(["teacher", "admin", "super_admin"])
const STREAM_TOKEN_FORMAT = /^[0-9a-f]{48}$/          // exactly what randomToken() issues
const STREAM_PART_MAX_BYTES = 8 * 1024 * 1024         // one video part is at most 8 MB
const STREAM_LINKS_PER_PERSON = 5                     // older links beyond this are removed
const VIDEO_PARTS_PER_MINUTE = 1200                   // per network address (a whole school lab)

/**
 * Limits video-part requests per network address. Video parts skip the general API limit
 * (a lab of students watching would use it up), so they need their own address-based limit
 * that does not depend on the link value the caller sends.
 */
export function streamPartLimiter(max = VIDEO_PARTS_PER_MINUTE) {
  return rateLimit({
    windowMs: 60_000, max,
    skip: (req) => typeof req.query.st !== "string",
    standardHeaders: true, legacyHeaders: false,
    message: { error: "Too many video requests. Please wait a moment." },
    store: new SharedRateLimitStore(`video-parts-${max}`),
  })
}

/** The signed-in session (cookie or Bearer) — null when missing or invalid. */
function verifyMainSession(req: Request): { userId: string; tv: number } | null {
  const token = extractMainToken(req)
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; tv?: number }
    return { userId: payload.sub, tv: payload.tv ?? 0 }
  } catch {
    return null
  }
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0")).join("")
}

// Parses a single "bytes=a-b" / "bytes=a-" / "bytes=-n" range. Returns null when unusable.
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === "" && m[2] === "")) return null
  let start: number
  let end: number
  if (m[1] === "") {
    const suffix = Number(m[2])
    if (suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null
  return { start, end }
}

function extractMainToken(req: Request): string | undefined {
  // Cookie (preferred)
  const cookie = req.headers.cookie ?? ""
  const cookieMatch = cookie.match(/(?:^|;\s*)ts_token=([^;]*)/)
  if (cookieMatch) return decodeURIComponent(cookieMatch[1])

  // Bearer header (API clients)
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7)

  return undefined
}

// ── POST /api/files/token — issue a short-lived file access token ─────────────
// The frontend calls this first, gets a 5-min token, then uses it to open the file.
router.post("/token", async (req: Request, res: Response) => {
  try {
    const token = extractMainToken(req)
    if (!token) { res.status(401).json({ error: "Authentication required" }); return }

    let userId: string
    let tokenTv: number
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string; tv?: number }
      userId = payload.sub
      tokenTv = payload.tv ?? 0
    } catch {
      res.status(401).json({ error: "Invalid or expired token" }); return
    }

    const { gridfsId } = req.body as { gridfsId?: string }
    if (!gridfsId) { res.status(400).json({ error: "gridfsId required" }); return }

    const userForToken = await User.findById(userId).select("school_id is_active token_version").lean()
    if (!userForToken || !userForToken.is_active) { res.status(401).json({ error: "Account not found" }); return }
    // A session that was signed out (token_version bumped) must not mint file tokens
    if (tokenTv < (userForToken.token_version ?? 0)) { res.status(401).json({ error: "Session expired. Please log in again." }); return }

    // Verify the file belongs to this user's school
    const db = mongoose.connection.db
    if (db) {
      let fileObjId: mongoose.Types.ObjectId
      try { fileObjId = new mongoose.Types.ObjectId(gridfsId) } catch { res.status(400).json({ error: "Invalid file ID" }); return }
      const fileMeta = await db.collection("lesson_files.files").findOne({ _id: fileObjId })
      if (!fileMeta) { res.status(404).json({ error: "File not found" }); return }
      const fileMeta2 = fileMeta as unknown as { metadata?: { school_id?: string } }
      // Enforce school boundary. After the migrateFileMetadata.ts migration all files
      // have metadata.school_id populated. Files that are still missing it (e.g. newly
      // orphaned uploads) are blocked rather than served — fail-closed is the safe default.
      const fileSchoolId = fileMeta2.metadata?.school_id
      if (!fileSchoolId || fileSchoolId !== userForToken.school_id?.toString()) {
        res.status(403).json({ error: "Forbidden" }); return
      }
    }

    // Generate a random one-time file token
    const fileToken = randomToken()

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    await FileToken.create({ token: fileToken, userId, gridfsId, expiresAt })

    res.json({ fileToken, expiresIn: 300 })
  } catch (err) {
    logger.error({ err: err }, "[files/token POST]")
    res.status(500).json({ error: "Failed to issue file token" })
  }
})

// ── POST /api/files/stream-token — a reusable link for playing one video ──────
// Only for lesson videos (mp4/webm) in the caller's own school. The browser's
// <video> player asks for the video in parts (HTTP Range) with ?st=<token>,
// so a whole video is never downloaded up front and seeking works.
router.post("/stream-token", async (req: Request, res: Response) => {
  try {
    const token = extractMainToken(req)
    if (!token) { res.status(401).json({ error: "Authentication required" }); return }

    let userId: string
    let tokenTv: number
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string; tv?: number }
      userId = payload.sub
      tokenTv = payload.tv ?? 0
    } catch {
      res.status(401).json({ error: "Invalid or expired token" }); return
    }

    const { gridfsId } = req.body as { gridfsId?: unknown }
    if (typeof gridfsId !== "string" || !mongoose.isValidObjectId(gridfsId)) {
      res.status(400).json({ error: "Invalid file ID" }); return
    }

    const user = await User.findById(userId).select("school_id class_id role is_active token_version").lean()
    if (!user || !user.is_active) { res.status(401).json({ error: "Account not found" }); return }
    if (tokenTv < (user.token_version ?? 0)) { res.status(401).json({ error: "Session expired. Please log in again." }); return }
    // Students watch their own class's lessons; staff any lesson in their school; nobody else streams
    const isStaff = STREAM_STAFF_ROLES.has(user.role)
    if (!isStaff && user.role !== "student") { res.status(403).json({ error: "Forbidden" }); return }
    if (!isStaff && !user.class_id) { res.status(403).json({ error: "Forbidden" }); return }

    const fileId = new mongoose.Types.ObjectId(gridfsId)
    const db = mongoose.connection.db
    if (!db) { res.status(503).json({ error: "Please try again in a moment." }); return }
    const fileMeta = await db.collection("lesson_files.files").findOne(
      { _id: fileId }, { projection: { "metadata.school_id": 1 } },
    ) as { metadata?: { school_id?: string } } | null
    if (!fileMeta) { res.status(404).json({ error: "File not found" }); return }
    const fileSchoolId = fileMeta.metadata?.school_id
    if (!fileSchoolId || fileSchoolId !== user.school_id?.toString()) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    // The file must be the original upload of a lesson video in this school
    const mod = await Module.findOne({
      school_id: user.school_id,
      ...(isStaff ? {} : { class_id: user.class_id }),
      "items.gridfs_id": fileId,
    }).select("items.gridfs_id items.file_type").lean()
    if (!mod) { res.status(403).json({ error: "Forbidden" }); return }
    const item = mod?.items.find(i => i.gridfs_id?.toString() === gridfsId)
    if (!item || !VIDEO_TYPES.has((item.file_type ?? "").toLowerCase())) {
      res.status(400).json({ error: "Only lesson videos can be streamed" }); return
    }

    const now = Date.now()
    const streamToken = randomToken()
    await FileToken.create({
      token: streamToken, userId, gridfsId, kind: "stream", tokenVersion: tokenTv,
      expiresAt: new Date(now + STREAM_IDLE_MS), maxExpiresAt: new Date(now + STREAM_MAX_MS),
    })
    // Keep only the newest few links per person, so nobody can stockpile links
    const extra = await FileToken.find({ userId, kind: "stream" })
      .sort({ expiresAt: -1 }).skip(STREAM_LINKS_PER_PERSON).select("_id").lean()
    if (extra.length) await FileToken.deleteMany({ _id: { $in: extra.map(t => t._id) } })
    res.json({ streamToken, expiresIn: STREAM_IDLE_MS / 1000 })
  } catch (err) {
    logger.error({ err }, "[files/stream-token POST]")
    res.status(500).json({ error: "Could not prepare the video. Please try again." })
  }
})

// ── GET /api/files/:gridfsId ──────────────────────────────────────────────────
// Auth via cookie/Bearer (main JWT) OR ?ft= (short-lived file token)
router.get("/:gridfsId", streamPartLimiter(), async (req: Request, res: Response) => {
  try {
    const rawId = req.params.gridfsId
    const gridfsId = Array.isArray(rawId) ? rawId[0] : rawId
    const ft = typeof req.query.ft === "string" ? req.query.ft : undefined
    const st = typeof req.query.st === "string" ? req.query.st : undefined
    let userId: string
    // Set for the main-JWT and stream-link paths; a one-time file token was minted by an already-checked session
    let tokenTv: number | null = null
    let viaStreamLink = false

    if (st) {
      // Reusable video link — not consumed, so the player can ask for further parts
      if (!STREAM_TOKEN_FORMAT.test(st)) { res.status(400).json({ error: "Invalid video link" }); return }
      // A video player always asks for a part; a whole-file download is never served by a stream link
      if (!req.headers.range) { res.status(400).json({ error: "Video links are played in parts" }); return }
      const now = new Date()
      const entry = await FileToken.findOne({ token: st, kind: "stream", expiresAt: { $gt: now } })
        .select("userId gridfsId tokenVersion expiresAt maxExpiresAt").lean()
      if (!entry) { res.status(401).json({ error: "Video link expired. Please open the video again." }); return }
      if (entry.gridfsId !== gridfsId) { res.status(403).json({ error: "Token not valid for this file" }); return }
      // The link only works together with the signed-in session that asked for it, so a
      // link copied from a log, a screen or a chat message plays nothing on its own
      const session = verifyMainSession(req)
      if (!session) { res.status(401).json({ error: "Please sign in to watch this video." }); return }
      if (session.userId !== entry.userId) { res.status(403).json({ error: "This video link belongs to another account." }); return }
      userId = entry.userId
      tokenTv = Math.min(session.tv, entry.tokenVersion ?? 0)
      viaStreamLink = true
      // Keep the link alive while the video is being watched (at most every 2.5 minutes, never past the cap)
      if (entry.expiresAt.getTime() - now.getTime() < STREAM_EXTEND_WHEN_MS && entry.maxExpiresAt) {
        const next = new Date(Math.min(now.getTime() + STREAM_IDLE_MS, entry.maxExpiresAt.getTime()))
        await FileToken.updateOne({ token: st, kind: "stream", expiresAt: { $lt: next } }, { $set: { expiresAt: next } })
      }
    } else if (ft) {
      // Atomically consume the token — findOneAndDelete guarantees exactly one caller
      // succeeds even under concurrent requests with the same token value.
      // A stream link can never be spent as a one-time token.
      const entry = await FileToken.findOneAndDelete({
        token:     ft,
        kind:      { $ne: "stream" },
        expiresAt: { $gt: new Date() },
      })
      if (!entry) {
        res.status(401).json({ error: "File token expired or invalid" }); return
      }
      if (entry.gridfsId !== gridfsId) {
        res.status(403).json({ error: "Token not valid for this file" }); return
      }
      userId = entry.userId
    } else {
      // Main JWT via cookie or Bearer header
      const token = extractMainToken(req)
      if (!token) { res.status(401).json({ error: "Authentication required" }); return }

      try {
        const payload = jwt.verify(token, JWT_SECRET) as { sub: string; tv?: number }
        userId = payload.sub
        tokenTv = payload.tv ?? 0
      } catch {
        res.status(401).json({ error: "Invalid or expired token" }); return
      }
    }

    // Verify user is active and get school
    const user = await User.findById(userId).select("school_id is_active token_version").lean()
    if (!user || !user.is_active) { res.status(401).json({ error: "Account not found" }); return }
    if (tokenTv !== null && tokenTv < (user.token_version ?? 0)) {
      res.status(401).json({ error: "Session expired. Please log in again." }); return
    }

    // Verify the file belongs to this user's school
    let objectId: mongoose.Types.ObjectId
    try {
      objectId = new mongoose.Types.ObjectId(gridfsId)
    } catch {
      res.status(400).json({ error: "Invalid file ID" }); return
    }

    const db = mongoose.connection.db
    if (!db) { res.status(500).json({ error: "DB not ready" }); return }

    const bucket = new GridFSBucket(db, { bucketName: "lesson_files" })

    // Fetch file metadata to verify school ownership
    const files = await db.collection("lesson_files.files")
      .find({ _id: objectId })
      .limit(1)
      .toArray()

    if (!files.length) { res.status(404).json({ error: "File not found" }); return }

    const fileMeta = files[0] as unknown as { metadata?: { school_id?: string }; filename: string; length: number }
    // Enforce school boundary — mandatory after migrateFileMetadata.ts migration.
    // Files without metadata.school_id are blocked (fail-closed).
    const streamFileSchoolId = fileMeta.metadata?.school_id
    if (!streamFileSchoolId || streamFileSchoolId !== user.school_id?.toString()) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    // Find the module item — check both gridfs_id (original) and pdf_gridfs_id (converted PDF)
    const mod = await Module.findOne({
      $or: [
        { "items.gridfs_id": objectId },
        { "items.pdf_gridfs_id": objectId },
      ],
    }).lean()
    const item = mod?.items.find(
      i => i.gridfs_id?.toString() === gridfsId || i.pdf_gridfs_id?.toString() === gridfsId
    )
    const isPdf = item?.pdf_gridfs_id?.toString() === gridfsId
    const fileExt = isPdf ? "pdf" : (item?.file_type ?? fileMeta.filename.split(".").pop()?.toLowerCase() ?? "bin")
    const originalName = isPdf
      ? `${(item?.file_name ?? fileMeta.filename).replace(/\.[^.]+$/, "")}.pdf`
      : (item?.file_name ?? fileMeta.filename)
    const mime = MIME_MAP[fileExt] ?? "application/octet-stream"

    // Stream file — inline for viewable types, attachment for others
    const viewable = ["pdf", "jpg", "jpeg", "png", "webp", "gif", "mp4", "webm"].includes(fileExt)
    const safeFilename = originalName.replace(/[^\w.\-]/g, "_")
    const encodedFilename = encodeURIComponent(originalName)
    // Prevent browser/CDN caching — file tokens are one-time-use, cached responses bypass auth
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private")
    res.setHeader("Pragma", "no-cache")
    // Restrict frame-ancestors to own origin only
    const allowedOrigin = process.env.FRONTEND_URL ?? "http://localhost:5173"
    res.setHeader("X-Frame-Options", "SAMEORIGIN")
    res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${allowedOrigin}`)
    // The <video> element loads the stream link directly (not through fetch), so the
    // response must be loadable by the app's own site (app. and api. sub-domains)
    if (viaStreamLink) res.setHeader("Cross-Origin-Resource-Policy", "same-site")
    res.setHeader("Content-Type", mime)
    res.setHeader(
      "Content-Disposition",
      viewable
        ? `inline; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
        : `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`
    )

    const totalSize = fileMeta.length
    const rangeHeader = req.headers.range

    if (rangeHeader && totalSize > 0) {
      // HTTP Range support — enables video seek/resume in the browser's <video> element.
      // Browsers issue Range requests automatically for video; without this they must
      // re-download from byte 0 on every seek, which is unusable for large files.
      const range = parseRange(rangeHeader, totalSize)
      if (!range) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end()
        return
      }
      const { start } = range
      // Stream links hand out at most one 8 MB part per request; the player asks for the next
      const end = viaStreamLink ? Math.min(range.end, start + STREAM_PART_MAX_BYTES - 1) : range.end
      const chunkSize = end - start + 1

      res.status(206)
      res.setHeader("Content-Range",  `bytes ${start}-${end}/${totalSize}`)
      res.setHeader("Accept-Ranges",  "bytes")
      res.setHeader("Content-Length", chunkSize)

      const rangeStream = bucket.openDownloadStream(objectId, { start, end: end + 1 })
      rangeStream.on("error", () => { if (!res.headersSent) res.status(404).json({ error: "File not found" }) })
      rangeStream.pipe(res)
    } else {
      if (totalSize > 0) {
        res.setHeader("Accept-Ranges",  "bytes")
        res.setHeader("Content-Length", totalSize)
      }
      const downloadStream = bucket.openDownloadStream(objectId)
      downloadStream.on("error", () => {
        if (!res.headersSent) res.status(404).json({ error: "File not found" })
      })
      downloadStream.pipe(res)
    }
  } catch (err) {
    logger.error({ err: err }, "[files GET /:gridfsId]")
    if (!res.headersSent) res.status(500).json({ error: "Failed to retrieve file" })
  }
})

export default router
