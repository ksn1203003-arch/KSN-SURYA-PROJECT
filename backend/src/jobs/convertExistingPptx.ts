import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// jobs/convertExistingPptx.ts — One-time migration script.
// Converts any PPTX files already stored in GridFS to PDF using LibreOffice
// and saves the resulting PDF back to GridFS on the same module item.
// ─────────────────────────────────────────────────────────────────────────────
import mongoose from "mongoose"
import { GridFSBucket } from "mongodb"
import { createRequire } from "module"
import { promisify } from "util"
import { Module } from "../models/Module.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const libre = require("libreoffice-convert")
const libreConvertWithOptions = promisify(libre.convertWithOptions) as (
  input: Buffer, format: string, filter: string | undefined, options: Record<string, unknown>
) => Promise<Buffer>

function getBuffer(bucket: GridFSBucket, id: mongoose.Types.ObjectId): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = bucket.openDownloadStream(id)
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}

export async function convertExistingPptx(): Promise<void> {
  const db = mongoose.connection.db
  if (!db) return

  const bucket = new GridFSBucket(db, { bucketName: "lesson_files" })

  // Find all modules that have at least one PPTX/PPT item without a converted PDF
  const modules = await Module.find({
    items: {
      $elemMatch: {
        file_type: { $in: ["pptx", "ppt"] },
        gridfs_id: { $ne: null },
        pdf_gridfs_id: null,
      },
    },
  })

  if (modules.length === 0) {
    logger.info("[pptx-convert] No unconverted PPTX files found.")
    return
  }

  const totalItems = modules.reduce(
    (sum, mod) => sum + mod.items.filter(
      i => (i.file_type === "pptx" || i.file_type === "ppt") && i.gridfs_id && !i.pdf_gridfs_id
    ).length,
    0
  )
  logger.info(`[pptx-convert] Found ${totalItems} PPTX file(s) to convert across ${modules.length} module(s).`)

  let converted = 0
  let failed = 0

  for (const mod of modules) {
    let modChanged = false

    for (const item of mod.items) {
      if (
        (item.file_type !== "pptx" && item.file_type !== "ppt") ||
        !item.gridfs_id ||
        item.pdf_gridfs_id
      ) continue

      try {
        logger.info(`[pptx-convert] Converting "${item.label}" (${item.file_type})...`)

        // Download original file from GridFS into a Buffer
        const originalBuffer = await getBuffer(bucket, item.gridfs_id)

        // Convert to PDF via LibreOffice
        const pdfBuffer = await libreConvertWithOptions(originalBuffer, ".pdf", undefined, {
          fileName: `source.${item.file_type}`,
        })

        // Store PDF back into GridFS
        const pdfGridfsId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
          const pdfStream = bucket.openUploadStream(`converted_${item.gridfs_id}.pdf`, {
            metadata: {
              school_id:      mod.school_id.toString(),
              class_id:       mod.class_id.toString(),
              module_id:      mod._id.toString(),
              converted_from: item.gridfs_id!.toString(),
              mime_type:      "application/pdf",
            },
          })
          pdfStream.on("error", reject)
          pdfStream.on("finish", () => resolve(pdfStream.id as mongoose.Types.ObjectId))
          pdfStream.end(pdfBuffer)
        })

        item.pdf_gridfs_id = pdfGridfsId
        modChanged = true
        converted++
        logger.info(`[pptx-convert] ✓ Converted "${item.label}"`)
      } catch (err) {
        failed++
        logger.error({ err }, `[pptx-convert] ✗ Failed to convert "${item.label}":`)
      }
    }

    if (modChanged) {
      mod.updated_at = new Date()
      await mod.save()
    }
  }

  logger.info(`[pptx-convert] Done. ${converted} converted, ${failed} failed.`)
}
