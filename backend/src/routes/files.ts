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
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
      userId = payload.sub
    } catch {
      res.status(401).json({ error: "Invalid or expired token" }); return
    }

    const { gridfsId } = req.body as { gridfsId?: string }
    if (!gridfsId) { res.status(400).json({ error: "gridfsId required" }); return }

    const userForToken = await User.findById(userId).select("school_id is_active").lean()
    if (!userForToken || !userForToken.is_active) { res.status(401).json({ error: "Account not found" }); return }

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
    const fileToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2, "0")).join("")

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    await FileToken.create({ token: fileToken, userId, gridfsId, expiresAt })

    res.json({ fileToken, expiresIn: 300 })
  } catch (err) {
    logger.error({ err: err }, "[files/token POST]")
    res.status(500).json({ error: "Failed to issue file token" })
  }
})

// ── GET /api/files/:gridfsId ──────────────────────────────────────────────────
// Auth via cookie/Bearer (main JWT) OR ?ft= (short-lived file token)
router.get("/:gridfsId", async (req: Request, res: Response) => {
  try {
    const rawId = req.params.gridfsId
    const gridfsId = Array.isArray(rawId) ? rawId[0] : rawId
    const ft = req.query.ft as string | undefined
    let userId: string

    if (ft) {
      // Atomically consume the token — findOneAndDelete guarantees exactly one caller
      // succeeds even under concurrent requests with the same token value
      const entry = await FileToken.findOneAndDelete({
        token:     ft,
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
        const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
        userId = payload.sub
      } catch {
        res.status(401).json({ error: "Invalid or expired token" }); return
      }
    }

    // Verify user is active and get school
    const user = await User.findById(userId).select("school_id is_active").lean()
    if (!user || !user.is_active) { res.status(401).json({ error: "Account not found" }); return }

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
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-")
      const start = parseInt(startStr, 10)
      const end   = endStr ? parseInt(endStr, 10) : totalSize - 1
      const chunkSize = end - start + 1

      if (start < 0 || end >= totalSize || start > end) {
        res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end()
        return
      }

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
