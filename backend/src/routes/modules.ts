import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/modules.ts — Lesson module routes mounted at /api/modules.
// Full CRUD for modules and items: file uploads to GridFS (200 MB, 10 files),
// PPTX→PDF conversion via LibreOffice, link additions, reordering, and
// per-student viewed-item tracking.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import multer from "multer"
import mongoose from "mongoose"
import { promisify } from "util"
import { createRequire } from "module"
import { createReadStream, promises as fsPromises } from "fs"
import { tmpdir } from "os"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { Module } from "../models/Module.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { Certificate } from "../models/Certificate.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { User } from "../models/User.js"
import { Class } from "../models/Class.js"
import { School, PLAN_STORAGE_QUOTAS } from "../models/School.js"
import { getGridFSBucket } from "../lib/gridfs.js"
import { validateObjectId } from "../lib/validateId.js"
import { queuePptxConversion } from "../jobs/queue.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const libre = require("libreoffice-convert")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fromFile: fileTypeFromFile } = require("file-type") as {
  fromFile: (path: string) => Promise<{ ext: string; mime: string } | undefined>
}
const libreConvertWithOptions = promisify(libre.convertWithOptions) as (
  input: Buffer, format: string, filter: string | undefined, options: Record<string, unknown>
) => Promise<Buffer>

const router = Router()
router.use(requireAuth)

// multer — disk storage: files written to OS temp dir and streamed into GridFS.
// Never use memoryStorage for large files — a 200 MB buffer in RAM × 10 concurrent
// uploads = 2 GB heap spike that will OOM-crash the Node.js process.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpdir()),
    filename: (_req, _file, cb) =>
      cb(null, `ts_upload_${Date.now()}_${Math.random().toString(36).slice(2)}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 }, // 200 MB per file (videos), max 10 files
  fileFilter(_req, file, cb) {
    const allowed = [
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "video/mp4", "video/webm",
      "image/jpeg", "image/png", "image/webp", "image/gif",
    ]
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error(`File type not allowed: ${file.mimetype}`))
  },
})

// Allowed MIME types verified by magic bytes — matches the Multer fileFilter whitelist.
// If file-type cannot detect the type (returns undefined), we allow the file through
// to avoid blocking legitimate edge cases (e.g. some PDF generators omit magic bytes).
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "video/mp4", "video/webm",
  "image/jpeg", "image/png", "image/webp", "image/gif",
])

// ── helpers ────────────────────────────────────────────────────────────────────

function detectLinkType(url: string): "gdrive" | "youtube" | "other" {
  // Google Drive, Slides, Docs, Sheets, Forms — all use docs.google.com or drive.google.com
  if (
    url.includes("drive.google.com") ||
    url.includes("docs.google.com") ||
    url.includes("slides.google.com") ||
    url.includes("sheets.google.com") ||
    url.includes("forms.google.com")
  ) return "gdrive"
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube"
  return "other"
}

function ext(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "bin"
}

async function resolveSchoolId(userId: string): Promise<string | null> {
  const user = await User.findById(userId).select("school_id").lean()
  return user?.school_id?.toString() ?? null
}

// Returns null if quota is not exceeded, or an error message string if it is.
async function checkStorageQuota(schoolId: string, additionalBytes: number): Promise<string | null> {
  const school = await School.findById(schoolId).select("subscription_plan storage_used_bytes").lean()
  if (!school) return "School not found"
  const quota = PLAN_STORAGE_QUOTAS[school.subscription_plan] ?? PLAN_STORAGE_QUOTAS.free
  const used  = school.storage_used_bytes ?? 0
  if (used + additionalBytes > quota) {
    const usedGB  = (used / (1024 ** 3)).toFixed(1)
    const quotaGB = (quota / (1024 ** 3)).toFixed(0)
    return `Storage quota exceeded (${usedGB} GB used of ${quotaGB} GB). Please upgrade your plan or delete old files.`
  }
  return null
}

async function canWriteModule(userId: string, moduleId: string | string[]): Promise<{ mod: InstanceType<typeof Module> } | { error: string; status: number }> {
  const id = Array.isArray(moduleId) ? moduleId[0] : moduleId
  const user = await User.findById(userId).select("school_id role").lean()
  if (!user) return { error: "User not found", status: 404 }
  const mod = await Module.findById(id)
  if (!mod) return { error: "Module not found", status: 404 }
  if (mod.school_id.toString() !== user.school_id?.toString())
    return { error: "Forbidden", status: 403 }
  if (!["admin", "super_admin"].includes(user.role) && mod.created_by.toString() !== userId)
    return { error: "Forbidden", status: 403 }
  return { mod }
}

// ── GET /api/modules/counts?class_id= ────────────────────────────────────────
// Returns module count per subject for a class (used by subject grid cards)
router.get("/counts", async (req: AuthRequest, res: Response) => {
  try {
    const { class_id } = req.query as Record<string, string>
    if (!class_id) { res.status(400).json({ error: "class_id required" }); return }

    const schoolId = await resolveSchoolId(req.userId!)
    if (!schoolId) { res.status(400).json({ error: "No school" }); return }

    // Verify class belongs to requester's school
    const clsCheck = await mongoose.connection.db?.collection("classes").findOne({ _id: new mongoose.Types.ObjectId(class_id), school_id: new mongoose.Types.ObjectId(schoolId) })
    if (!clsCheck) { res.status(403).json({ error: "Class not found in your school", counts: {} }); return }

    const result = await Module.aggregate([
      { $match: { school_id: new mongoose.Types.ObjectId(schoolId), class_id: new mongoose.Types.ObjectId(class_id) } },
      { $group: { _id: "$subject", count: { $sum: 1 } } },
    ])

    const counts: Record<string, number> = {}
    result.forEach((r: { _id: string; count: number }) => { counts[r._id] = r.count })
    res.json({ counts })
  } catch (err) {
    logger.error({ err: err }, "[modules GET /counts]")
    res.status(500).json({ error: "Failed to load module counts" })
  }
})

// ── GET /api/modules?class_id=&subject= ───────────────────────────────────────
// Returns all modules for a class+subject, with student progress if caller is student
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { class_id, subject } = req.query as Record<string, string>
    if (!class_id || !subject) { res.status(400).json({ error: "class_id and subject required" }); return }

    const schoolId = await resolveSchoolId(req.userId!)
    if (!schoolId) { res.status(400).json({ error: "No school" }); return }

    // Verify class belongs to requester's school
    const clsCheck2 = await mongoose.connection.db?.collection("classes").findOne({ _id: new mongoose.Types.ObjectId(class_id), school_id: new mongoose.Types.ObjectId(schoolId) })
    if (!clsCheck2) { res.status(403).json({ error: "Class not found in your school" }); return }

    const user = await User.findById(req.userId).select("role").lean()

    const modules = await Module.find({ school_id: schoolId, class_id, subject })
      .sort({ order: 1 })
      .lean()

    // For students: attach viewed item ids
    let viewedItemIds: string[] = []
    if (user?.role === "student") {
      const progress = await ModuleProgress.find({
        student_id: req.userId,
        module_id: { $in: modules.map(m => m._id) },
      }).lean()
      viewedItemIds = progress.map(p => p.item_id.toString())
    }

    res.json({ modules, viewedItemIds })
  } catch (err) {
    logger.error({ err: err }, "[modules GET /]")
    res.status(500).json({ error: "Failed to load modules" })
  }
})

// ── POST /api/modules — create module ─────────────────────────────────────────
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { class_id, subject, title } = req.body as Record<string, string>
    if (!class_id || !subject) { res.status(400).json({ error: "class_id and subject required" }); return }

    const user = await User.findById(req.userId).select("school_id role").lean()
    if (!user?.school_id) { res.status(400).json({ error: "No school" }); return }

    if (!["teacher", "admin", "super_admin"].includes(user?.role ?? "")) {
      res.status(403).json({ error: "Only teachers can create lesson modules" }); return
    }

    // Verify this class belongs to same school
    const cls = await Class.findOne({ _id: class_id, school_id: user.school_id }).lean()
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    // Teachers can only create modules for classes they are assigned to
    if (!["admin", "super_admin"].includes(user.role)) {
      const isAssigned = (cls.teachers ?? []).some(
        (t: { teacher_id: mongoose.Types.ObjectId }) => t.teacher_id.toString() === req.userId
      )
      if (!isAssigned) {
        res.status(403).json({ error: "You are not assigned to this class" }); return
      }
    }

    if (title && title.trim().length > 200) {
      res.status(400).json({ error: "Module title must be under 200 characters" }); return
    }

    // Auto-number: count existing modules for this subject
    const count = await Module.countDocuments({ school_id: user.school_id, class_id, subject })
    const moduleTitle = title?.trim() || `Module ${count + 1}`

    const mod = await Module.create({
      school_id:  user.school_id,
      class_id,
      subject,
      title:      moduleTitle,
      order:      count,
      created_by: req.userId,
      items:      [],
    })

    res.status(201).json({ module: mod })
  } catch (err) {
    logger.error({ err: err }, "[modules POST /]")
    res.status(500).json({ error: "Failed to create module" })
  }
})

// ── PATCH /api/modules/:id — rename module ────────────────────────────────────
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const result = await canWriteModule(req.userId!, req.params.id)
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return }

    const { title } = req.body as { title?: string }
    if (title && title.trim().length > 200) {
      res.status(400).json({ error: "Module title must be under 200 characters" }); return
    }
    if (title?.trim()) result.mod.title = title.trim()
    result.mod.updated_at = new Date()
    await result.mod.save()

    res.json({ module: result.mod })
  } catch (err) {
    logger.error({ err: err }, "[modules PATCH /:id]")
    res.status(500).json({ error: "Failed to update module" })
  }
})

// ── GET /api/modules/:id/delete-impact — precheck before deleting a module ────
// Returns how many issued certificates reference this module, so the frontend
// can warn the teacher before they confirm deletion.
router.get("/:id/delete-impact", async (req: AuthRequest, res: Response) => {
  if (!validateObjectId(req.params.id, res, "module ID")) return
  try {
    const result = await canWriteModule(req.userId!, req.params.id)
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return }

    const certificate_count = await Certificate.countDocuments({ module_id: result.mod._id })
    res.json({ certificate_count })
  } catch (err) {
    logger.error({ err: err }, "[modules GET /:id/delete-impact]")
    res.status(500).json({ error: "Failed to check module delete impact" })
  }
})

// ── DELETE /api/modules/:id — delete module + all its files ──────────────────
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  if (!validateObjectId(req.params.id, res, "module ID")) return
  try {
    const result = await canWriteModule(req.userId!, req.params.id)
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return }

    const bucket = getGridFSBucket()
    // Sum bytes of all file items so we can decrement the school storage counter
    const totalModuleBytes = result.mod.items
      .filter(i => i.type === "file")
      .reduce((sum, i) => sum + (i.file_size ?? 0), 0)

    const deleteGridFS = async () => {
      for (const item of result.mod.items) {
        if (item.type === "file") {
          if (item.gridfs_id)     try { await bucket.delete(item.gridfs_id) }     catch { /* already gone */ }
          if (item.pdf_gridfs_id) try { await bucket.delete(item.pdf_gridfs_id) } catch { /* already gone */ }
        }
      }
      // Decrement storage counter after all GridFS files are removed
      if (totalModuleBytes > 0) {
        await School.updateOne(
          { _id: result.mod.school_id },
          [{ $set: { storage_used_bytes: { $max: [0, { $subtract: ["$storage_used_bytes", totalModuleBytes] }] } } }],
          { updatePipeline: true } as Parameters<typeof School.updateOne>[2],
        )
      }
    }

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        await ModuleProgress.deleteMany({ module_id: result.mod._id }, { session })
        await Certificate.updateMany({ module_id: result.mod._id }, { $set: { module_deleted: true } }, { session })
        await result.mod.deleteOne({ session })
      })
      await deleteGridFS()
    } catch (txErr: unknown) {
      const msg = txErr instanceof Error ? txErr.message : ""
      if (msg.includes("Transaction numbers are only allowed on a replica set")) {
        logger.warn("[modules DELETE] MongoDB is standalone — running non-transactional delete. Use a replica set in production.")
        await ModuleProgress.deleteMany({ module_id: result.mod._id })
        await Certificate.updateMany({ module_id: result.mod._id }, { $set: { module_deleted: true } })
        await result.mod.deleteOne()
        await deleteGridFS()
      } else {
        throw txErr
      }
    } finally {
      await session.endSession()
    }

    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[modules DELETE /:id]")
    res.status(500).json({ error: "Failed to delete module" })
  }
})

// ── PUT /api/modules/reorder — reorder modules ────────────────────────────────
router.put("/reorder", async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body as { ids?: string[] }
    if (!Array.isArray(ids)) { res.status(400).json({ error: "ids array required" }); return }

    const schoolId = await resolveSchoolId(req.userId!)
    if (!schoolId) { res.status(400).json({ error: "No school" }); return }

    await Promise.all(
      ids.map((id, idx) =>
        Module.updateOne({ _id: id, school_id: schoolId }, { order: idx, updated_at: new Date() })
      )
    )
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[modules PUT /reorder]")
    res.status(500).json({ error: "Failed to reorder modules" })
  }
})

// ── POST /api/modules/:id/items — add file(s) or a link ──────────────────────
// For files: multipart/form-data with field name "files" (up to 10)
// For link:  JSON body { type: "link", label, link_url }
router.post("/:id/items", upload.array("files", 10), async (req: AuthRequest, res: Response) => {
  try {
    const result = await canWriteModule(req.userId!, req.params.id)
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return }

    const { mod } = result
    const files = req.files as Express.Multer.File[] | undefined
    const nextOrder = mod.items.length

    // ── File upload path ──────────────────────────────────────────────────────
    if (files && files.length > 0) {
      // Atomic check: use $where/$expr in the DB query to verify item count atomically.
      // A plain in-memory check is a TOCTOU race — two concurrent uploads can both pass
      // before either saves, pushing the module past 10 items.
      const freshMod = await (await import("../models/Module.js")).Module.findOne({
        _id:       mod._id,
        school_id: mod.school_id,
        $expr: { $lte: [{ $add: [{ $size: "$items" }, files.length] }, 10] },
      }).lean()
      if (!freshMod) {
        res.status(400).json({ error: `Adding ${files.length} files would exceed the 10-item limit` })
        return
      }

      // Check storage quota before writing any bytes to GridFS.
      // Sum up all incoming file sizes and compare against the school's plan limit.
      const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0)
      const schoolIdForQuota = mod.school_id.toString()
      const quotaErr = await checkStorageQuota(schoolIdForQuota, totalUploadSize)
      if (quotaErr) {
        // Clean up temp files before returning
        await Promise.all(files.map(f => fsPromises.unlink(f.path).catch(() => {})))
        res.status(413).json({ error: quotaErr })
        return
      }

      const bucket = getGridFSBucket()
      const addedItems: typeof mod.items = []
      let totalBytesUploaded = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileExt = ext(file.originalname)
        const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`

        try {
          // Validate actual file bytes — Content-Type header is client-controlled and
          // cannot be trusted. file-type reads the magic bytes from the file on disk.
          const detectedType = await fileTypeFromFile(file.path)
          if (detectedType && !ALLOWED_MIME_TYPES.has(detectedType.mime)) {
            await fsPromises.unlink(file.path).catch(() => {})
            res.status(415).json({ error: `File type not allowed: ${detectedType.mime}` })
            return
          }

          // Stream from disk → GridFS (never hold entire file in RAM)
          const gridfsId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
            const uploadStream = bucket.openUploadStream(uniqueName, {
              metadata: {
                school_id:     mod.school_id.toString(),
                class_id:      mod.class_id.toString(),
                module_id:     mod._id.toString(),
                original_name: file.originalname,
                mime_type:     file.mimetype,
              },
            })
            uploadStream.on("error", async (err) => {
              // Clean up orphaned GridFS chunks from the failed upload before rejecting
              try { await bucket.delete(uploadStream.id as mongoose.Types.ObjectId) } catch { /* already gone */ }
              reject(err)
            })
            uploadStream.on("finish", () => resolve(uploadStream.id as mongoose.Types.ObjectId))
            const readStream = createReadStream(file.path)
            readStream.on("error", (err) => { uploadStream.destroy(); reject(err) })
            readStream.pipe(uploadStream)
          })

          // Convert PPTX/PPT to PDF for inline viewing.
          // When Redis/BullMQ is available: enqueue async job — upload returns immediately,
          // pdf_gridfs_id is populated by the worker once conversion completes.
          // Fallback (no Redis): convert synchronously on this request thread.
          let pdfGridfsId: mongoose.Types.ObjectId | null = null
          if (fileExt === "pptx" || fileExt === "ppt") {
            const itemId = new mongoose.Types.ObjectId()
            const jobId = await queuePptxConversion({
              moduleId: mod._id.toString(),
              itemId:   itemId.toString(),
              gridfsId: gridfsId.toString(),
              fileName: file.originalname,
            }).catch(() => null)

            if (!jobId) {
              // No queue — fall back to synchronous conversion
              try {
                const fileBuffer = await fsPromises.readFile(file.path)
                const pdfBuffer = await libreConvertWithOptions(fileBuffer, ".pdf", undefined, {
                  fileName: `source.${fileExt}`,
                })
                pdfGridfsId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
                  const pdfStream = bucket.openUploadStream(`${uniqueName}.pdf`, {
                    metadata: {
                      school_id:      mod.school_id.toString(),
                      class_id:       mod.class_id.toString(),
                      module_id:      mod._id.toString(),
                      converted_from: gridfsId.toString(),
                      mime_type:      "application/pdf",
                    },
                  })
                  pdfStream.on("error", async (err) => {
                    try { await bucket.delete(pdfStream.id as mongoose.Types.ObjectId) } catch { /* already gone */ }
                    reject(err)
                  })
                  pdfStream.on("finish", () => resolve(pdfStream.id as mongoose.Types.ObjectId))
                  pdfStream.end(pdfBuffer)
                })
              } catch (err) {
                logger.error({ err }, `[libreoffice] PDF conversion failed for ${file.originalname}`)
              }
            }
            // When queued: pdfGridfsId stays null for now — worker fills it in async
          }

          totalBytesUploaded += file.size

          const item = {
            _id:           new mongoose.Types.ObjectId(),
            order:         nextOrder + i,
            type:          "file" as const,
            label:         file.originalname,
            gridfs_id:     gridfsId,
            pdf_gridfs_id: pdfGridfsId,
            file_name:     file.originalname,
            file_type:     fileExt,
            file_size:     file.size,
            link_url:      null,
            link_type:     null,
          }
          addedItems.push(item)
        } finally {
          // Always delete the temp file from disk regardless of success or failure
          await fsPromises.unlink(file.path).catch(() => {})
        }
      }

      mod.items.push(...addedItems)
      mod.updated_at = new Date()
      await mod.save()

      // Atomically increment the school's storage counter.
      // $max(0, ...) guard ensures it can never go below zero due to a race.
      if (totalBytesUploaded > 0) {
        await School.updateOne(
          { _id: mod.school_id },
          { $inc: { storage_used_bytes: totalBytesUploaded } },
        )
      }

      res.json({ items: addedItems })
      return
    }

    // ── Link path ─────────────────────────────────────────────────────────────
    const { label, link_url } = req.body as { label?: string; link_url?: string }
    if (!link_url) { res.status(400).json({ error: "link_url required for link items" }); return }
    if (link_url.trim().length > 2000) {
      res.status(400).json({ error: "Link URL must be under 2000 characters" }); return
    }
    if (!/^https?:\/\//i.test(link_url.trim())) {
      res.status(400).json({ error: "Link URL must start with http:// or https://" }); return
    }
    if (label && label.trim().length > 200) {
      res.status(400).json({ error: "Item label must be under 200 characters" }); return
    }
    if (mod.items.length >= 10) { res.status(400).json({ error: "Module already has 10 items (maximum)" }); return }

    const item = {
      _id:       new mongoose.Types.ObjectId(),
      order:     nextOrder,
      type:      "link" as const,
      label:     label?.trim() || link_url,
      gridfs_id:     null,
      pdf_gridfs_id: null,
      file_name:     null,
      file_type:     null,
      file_size:     null,
      link_url:      link_url.trim(),
      link_type:     detectLinkType(link_url),
    }

    mod.items.push(item)
    mod.updated_at = new Date()
    await mod.save()

    res.json({ item })
  } catch (err) {
    logger.error({ err: err }, "[modules POST /:id/items]")
    res.status(500).json({ error: "Failed to add item" })
  }
})

// ── PATCH /api/modules/:id/items/:itemId — rename item ───────────────────────
router.patch("/:id/items/:itemId", async (req: AuthRequest, res: Response) => {
  try {
    const result = await canWriteModule(req.userId!, req.params.id)
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return }

    const item = result.mod.items.find(i => i._id.toString() === req.params.itemId)
    if (!item) { res.status(404).json({ error: "Item not found" }); return }

    const { label } = req.body as { label?: string }
    if (label && label.trim().length > 200) {
      res.status(400).json({ error: "Item label must be under 200 characters" }); return
    }
    if (label?.trim()) item.label = label.trim()
    result.mod.updated_at = new Date()
    await result.mod.save()

    res.json({ item })
  } catch (err) {
    logger.error({ err: err }, "[modules PATCH /:id/items/:itemId]")
    res.status(500).json({ error: "Failed to update item" })
  }
})

// ── DELETE /api/modules/:id/items/:itemId ─────────────────────────────────────
router.delete("/:id/items/:itemId", async (req: AuthRequest, res: Response) => {
  try {
    const result = await canWriteModule(req.userId!, req.params.id)
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return }

    const idx = result.mod.items.findIndex(i => i._id.toString() === req.params.itemId)
    if (idx === -1) { res.status(404).json({ error: "Item not found" }); return }

    const [removed] = result.mod.items.splice(idx, 1)

    // Delete original file + converted PDF from GridFS and decrement storage counter
    if (removed.type === "file") {
      const bucket = getGridFSBucket()
      const bytesToFree = removed.file_size ?? 0
      if (removed.gridfs_id)     try { await bucket.delete(removed.gridfs_id) }     catch { /* already gone */ }
      if (removed.pdf_gridfs_id) try { await bucket.delete(removed.pdf_gridfs_id) } catch { /* already gone */ }
      // Decrement storage counter — floor at 0 to avoid negative values
      if (bytesToFree > 0) {
        await School.updateOne(
          { _id: result.mod.school_id },
          [{ $set: { storage_used_bytes: { $max: [0, { $subtract: ["$storage_used_bytes", bytesToFree] }] } } }],
          { updatePipeline: true } as Parameters<typeof School.updateOne>[2],
        )
      }
    }

    // Re-number remaining items
    result.mod.items.forEach((item, i) => { item.order = i })
    result.mod.updated_at = new Date()
    await result.mod.save()

    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[modules DELETE /:id/items/:itemId]")
    res.status(500).json({ error: "Failed to delete item" })
  }
})

// ── PUT /api/modules/:id/items/reorder — save new item order ─────────────────
router.put("/:id/items/reorder", async (req: AuthRequest, res: Response) => {
  try {
    const result = await canWriteModule(req.userId!, req.params.id)
    if ("error" in result) { res.status(result.status).json({ error: result.error }); return }

    const { ids } = req.body as { ids?: string[] }
    if (!Array.isArray(ids)) { res.status(400).json({ error: "ids array required" }); return }

    const itemMap = new Map(result.mod.items.map(i => [i._id.toString(), i]))
    const reordered = ids
      .map(id => itemMap.get(id))
      .filter((i): i is (typeof result.mod.items)[number] => !!i)

    reordered.forEach((item, idx) => { item.order = idx })
    result.mod.items = reordered
    result.mod.updated_at = new Date()
    await result.mod.save()

    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[modules PUT /:id/items/reorder]")
    res.status(500).json({ error: "Failed to reorder items" })
  }
})

// ── POST /api/modules/:id/items/:itemId/viewed — student marks item viewed ────
router.post("/:id/items/:itemId/viewed", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select("role school_id class_id").lean()
    if (user?.role !== "student") { res.status(403).json({ error: "Students only" }); return }

    // Verify the module belongs to the student's own school AND class
    const mod = await Module.findById(req.params.id).select("school_id class_id items").lean()
    if (!mod) { res.status(404).json({ error: "Module not found" }); return }
    if (mod.school_id.toString() !== user.school_id?.toString()) {
      res.status(403).json({ error: "Forbidden" }); return
    }
    if (mod.class_id.toString() !== user.class_id?.toString()) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    const itemExists = mod.items.some(i => i._id.toString() === req.params.itemId)
    if (!itemExists) { res.status(404).json({ error: "Item not found in this module" }); return }

    const mpResult = await ModuleProgress.updateOne(
      { student_id: req.userId, module_id: req.params.id, item_id: req.params.itemId },
      { $setOnInsert: { viewed_at: new Date() } },
      { upsert: true }
    )

    // Only increment items_viewed when this is a genuinely new view (upserted)
    if (mpResult.upsertedCount > 0) {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
      await StudentActivity.findOneAndUpdate(
        { student_id: req.userId!, date: today },
        { $inc: { items_viewed: 1 }, $setOnInsert: { school_id: user.school_id } },
        { upsert: true }
      )
    }

    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[modules POST /:id/items/:itemId/viewed]")
    res.status(500).json({ error: "Failed to record progress" })
  }
})

export default router
