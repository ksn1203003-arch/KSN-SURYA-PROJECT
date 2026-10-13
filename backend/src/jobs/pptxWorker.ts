import { logger } from "../lib/logger.js"
import { Worker } from "bullmq"
import { promisify } from "util"
import { createRequire } from "module"
import fs from "fs"
import fsPromises from "fs/promises"
import path from "path"
import os from "os"
import { type ChildProcess } from "child_process"
import mongoose from "mongoose"
import { getBullMQConnection } from "../lib/redis.js"
import { getGridFSBucket } from "../lib/gridfs.js"
import { Module } from "../models/Module.js"
import type { PptxJobData } from "./queue.js"
import { moveToDLQ } from "./queue.js"

const _require = createRequire(import.meta.url)
const libre = _require("libreoffice-convert")
const libreConvertWithOptions = promisify(libre.convertWithOptions) as (
  buf: Buffer, ext: string, opts: unknown, extra: unknown
) => Promise<Buffer>

// Track active LibreOffice child processes so we can kill them on SIGTERM
// before the process exits. Without this, LibreOffice processes become orphans
// and accumulate until the next OS restart.
const _activeChildProcs = new Set<ChildProcess>()

let _worker: Worker | null = null
let _sigtermRegistered = false

function registerSigtermHandler(): void {
  if (_sigtermRegistered) return
  _sigtermRegistered = true
  // BullMQ worker.close() waits for the current job to complete (up to 5 s).
  // We also kill any tracked child processes to avoid orphaned soffice daemons.
  const shutdown = () => {
    logger.info("[pptxWorker] SIGTERM received — draining worker and killing child processes")
    for (const child of _activeChildProcs) {
      try { child.kill("SIGTERM") } catch { /* already gone */ }
    }
    _worker?.close().catch(() => {})
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT",  shutdown)
}

async function checkLibreOffice(): Promise<void> {
  const { exec } = await import("child_process")
  await new Promise<void>((resolve) => {
    exec("libreoffice --version", (err) => {
      if (err) {
        logger.warn("[pptxWorker] LibreOffice not found — PPTX-to-PDF conversion will fail. Install libreoffice in the container.")
      } else {
        logger.info("[pptxWorker] LibreOffice detected — PPTX conversion available")
      }
      resolve() // non-fatal: worker still starts, jobs will fail individually if LO is absent
    })
  })
}

export function startPptxWorker(): void {
  const conn = getBullMQConnection()
  if (!conn) return  // Redis not configured — PPTX conversion stays synchronous

  // Verify LibreOffice is present at startup so failures are visible immediately
  // rather than silently when the first job runs
  checkLibreOffice().catch(() => {})

  registerSigtermHandler()

  _worker = new Worker<PptxJobData>(
    "pptx-conversion",
    async (job) => {
      const { moduleId, itemId, gridfsId, schoolId, classId } = job.data

      // Stream PPTX out of GridFS to a temp file (avoids loading into RAM all at once)
      const bucket = getGridFSBucket("lesson_files")
      const tmpPath = path.join(os.tmpdir(), `pptx_${job.id}_${Date.now()}.pptx`)

      await new Promise<void>((resolve, reject) => {
        const dl = bucket.openDownloadStream(new mongoose.Types.ObjectId(gridfsId))
        const ws = fs.createWriteStream(tmpPath)
        dl.on("error", reject)
        ws.on("error", reject)
        ws.on("finish", resolve)
        dl.pipe(ws)
      })

      let pdfGridfsId: mongoose.Types.ObjectId | null = null
      try {
        const fileBuffer = await fsPromises.readFile(tmpPath)
        const pdfBuffer  = await libreConvertWithOptions(fileBuffer, ".pdf", undefined, {
          fileName: "source.pptx",
        })

        pdfGridfsId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
          const pdfStream = bucket.openUploadStream(`converted_${job.id}.pdf`, {
            metadata: {
              school_id:      schoolId,
              class_id:       classId,
              module_id:      moduleId,
              converted_from: gridfsId,
              mime_type:      "application/pdf",
            },
          })
          pdfStream.on("error", async (err) => {
            try { await bucket.delete(pdfStream.id as mongoose.Types.ObjectId) } catch { /* gone */ }
            reject(err)
          })
          pdfStream.on("finish", () => resolve(pdfStream.id as mongoose.Types.ObjectId))
          pdfStream.end(pdfBuffer)
        })
      } finally {
        await fsPromises.unlink(tmpPath).catch(() => {})
      }

      if (!pdfGridfsId) throw new Error("PDF conversion produced no output")

      // Link the PDF to the item. If the item or module was deleted meanwhile, nothing
      // matches — remove the orphan PDF instead of leaving it in storage.
      const linked = await Module.updateOne(
        { _id: moduleId, "items._id": itemId },
        { $set: { "items.$.pdf_gridfs_id": pdfGridfsId, "items.$.conversion_status": "ready" } }
      )
      if (linked.matchedCount === 0) {
        await bucket.delete(pdfGridfsId).catch(() => {})
      }
    },
    {
      connection: conn,
      concurrency: 2,
    }
  )

  _worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "[pptxWorker] job failed")
    // Move to DLQ once all retries are exhausted so the job data is preserved for debugging
    if (job && (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 2)) {
      moveToDLQ("pptx-conversion", job.id, job.data, (err as Error).message).catch(() => {})
      // Tell the teacher it failed so they can re-upload — it is never retried automatically
      Module.updateOne(
        { _id: job.data.moduleId, "items._id": job.data.itemId },
        { $set: { "items.$.conversion_status": "failed" } }
      ).catch(updateErr => logger.error({ err: updateErr }, "[pptxWorker] could not mark conversion failed"))
    }
  })
}

export function stopPptxWorker(): Promise<void> {
  return _worker?.close() ?? Promise.resolve()
}
