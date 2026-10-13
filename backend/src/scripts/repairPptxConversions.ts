// ─────────────────────────────────────────────────────────────────────────────
// scripts/repairPptxConversions.ts — One-time repair for PPT/PPTX lesson items
// uploaded before conversion was linked correctly at upload time.
//
// For every PPT/PPTX item without a linked PDF:
//   1. If a converted PDF already exists in GridFS (metadata.converted_from = the
//      item's file), link it — no re-conversion — and stamp the school metadata.
//   2. Otherwise convert it once with LibreOffice and link the result.
// Every item ends with conversion_status "ready" or "failed". Failed items are
// left for the teacher to re-upload; they are never retried automatically.
//
// Replaces the old startup job that re-ran conversion on every server start.
// Safe to run multiple times (idempotent): linked items are skipped.
//
// Usage:
//   cd backend
//   npx tsx --env-file=.env src/scripts/repairPptxConversions.ts
// ─────────────────────────────────────────────────────────────────────────────
import mongoose from "mongoose"
import { createRequire } from "module"
import { promisify } from "util"
import { connectDB } from "../lib/mongodb.js"
import { getGridFSBucket } from "../lib/gridfs.js"
import { Module } from "../models/Module.js"
import { logger } from "../lib/logger.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const libre = require("libreoffice-convert")
const libreConvertWithOptions = promisify(libre.convertWithOptions) as (
  input: Buffer, format: string, filter: string | undefined, options: Record<string, unknown>
) => Promise<Buffer>

interface GridFSFileDoc {
  _id: mongoose.Types.ObjectId
}

async function readFile(id: mongoose.Types.ObjectId): Promise<Buffer> {
  const bucket = getGridFSBucket("lesson_files")
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = bucket.openDownloadStream(id)
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}

async function repair(): Promise<void> {
  await connectDB()
  const db = mongoose.connection.db
  if (!db) throw new Error("DB not connected")

  const bucket = getGridFSBucket("lesson_files")
  const filesCollection = db.collection<GridFSFileDoc>("lesson_files.files")

  const modules = await Module.find({
    items: { $elemMatch: { file_type: { $in: ["pptx", "ppt"] }, gridfs_id: { $ne: null }, pdf_gridfs_id: null } },
  })

  let linked = 0
  let converted = 0
  let failed = 0

  for (const mod of modules) {
    const metadata = {
      school_id: mod.school_id.toString(),
      class_id:  mod.class_id.toString(),
      module_id: mod._id.toString(),
    }

    for (const item of mod.items) {
      if ((item.file_type !== "pptx" && item.file_type !== "ppt") || !item.gridfs_id || item.pdf_gridfs_id) continue

      // 1. Reuse a PDF that an earlier conversion produced but never linked. Only a PDF with no
      //    school recorded, or already recorded for this module's school, is eligible — a file
      //    tagged for another school is never re-tagged.
      const existing = await filesCollection.findOne(
        {
          "metadata.converted_from": item.gridfs_id.toString(),
          $or: [{ "metadata.school_id": { $exists: false } }, { "metadata.school_id": null }, { "metadata.school_id": metadata.school_id }],
        },
        { sort: { uploadDate: -1 } },
      )
      if (existing) {
        await filesCollection.updateOne({ _id: existing._id }, { $set: {
          "metadata.school_id": metadata.school_id,
          "metadata.class_id":  metadata.class_id,
          "metadata.module_id": metadata.module_id,
        } })
        item.pdf_gridfs_id = existing._id
        item.conversion_status = "ready"
        linked++
        continue
      }

      // 2. Convert once
      try {
        const pdfBuffer = await libreConvertWithOptions(await readFile(item.gridfs_id), ".pdf", undefined, {
          fileName: `source.${item.file_type}`,
        })
        const pdfId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
          const stream = bucket.openUploadStream(`converted_${item.gridfs_id!.toString()}.pdf`, {
            metadata: { ...metadata, converted_from: item.gridfs_id!.toString(), mime_type: "application/pdf" },
          })
          stream.on("error", reject)
          stream.on("finish", () => resolve(stream.id as mongoose.Types.ObjectId))
          stream.end(pdfBuffer)
        })
        item.pdf_gridfs_id = pdfId
        item.conversion_status = "ready"
        converted++
      } catch (err) {
        item.conversion_status = "failed"
        failed++
        logger.error({ err, itemId: item._id.toString() }, "[repair-pptx] conversion failed")
      }
    }

    mod.updated_at = new Date()
    await mod.save()
  }

  logger.info({ linked, converted, failed }, "[repair-pptx] Done")
  await mongoose.disconnect()
}

repair().catch(err => {
  logger.error({ err }, "[repair-pptx] Fatal error")
  process.exit(1)
})
