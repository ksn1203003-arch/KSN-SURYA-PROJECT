// ─────────────────────────────────────────────────────────────────────────────
// jobs/pdfWorker.ts — BullMQ worker for async PDF generation.
// Processes report-card and compliance-report jobs from the pdf-generation queue.
// Renders HTML via the shared renderHtmlToPdf() (Puppeteer singleton) and stores
// the result in GridFS as a short-lived FileToken the client can download.
// Falls back to synchronous generation if Redis is not configured.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "crypto"
import mongoose from "mongoose"
import { Worker } from "bullmq"
import { getBullMQConnection } from "../lib/redis.js"
import { renderHtmlToPdf } from "../lib/pdf.js"
import { getGridFSBucket } from "../lib/gridfs.js"
import { FileToken } from "../models/FileToken.js"
import { logger } from "../lib/logger.js"
import type { PdfJobData, PdfJobResult } from "./queue.js"
import { moveToDLQ } from "./queue.js"

// PDF token lifetime: 10 minutes is enough for any client to initiate download.
const TOKEN_TTL_MS = 10 * 60 * 1000

async function processPdfJob(job: { data: PdfJobData; id?: string }): Promise<PdfJobResult> {
  const { html, fileName, userId } = job.data

  const pdfBuffer = await renderHtmlToPdf(html, { format: "A4" })

  // Store PDF in GridFS under the pdf_reports bucket (separate from lesson files)
  const bucket = getGridFSBucket("pdf_reports")
  const gridfsId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
    const upload = bucket.openUploadStream(fileName, {
      metadata: { userId, createdAt: new Date() },
    })
    upload.on("error", reject)
    upload.on("finish", () => resolve(upload.id as mongoose.Types.ObjectId))
    upload.end(pdfBuffer)
  })

  // Issue a short-lived FileToken so the client can download via /api/files/:token
  const token = crypto.randomBytes(32).toString("hex")
  await FileToken.create({
    token,
    userId,
    gridfsId: gridfsId.toString(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  })

  return { gridfsId: gridfsId.toString(), token }
}

let _worker: Worker | null = null

export function startPdfWorker(): void {
  const conn = getBullMQConnection()
  if (!conn) return  // Redis not configured — PDF generation stays synchronous

  _worker = new Worker<PdfJobData, PdfJobResult>(
    "pdf-generation",
    async (job) => processPdfJob(job),
    {
      connection: conn,
      concurrency: 2,  // at most 2 Puppeteer pages at once
    }
  )

  _worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id, type: job?.data?.type }, "[pdfWorker] job failed")
    // Move to DLQ once all retries are exhausted so the job data is preserved for debugging
    if (job && (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 2)) {
      moveToDLQ("pdf-generation", job.id, { type: job.data.type, fileName: job.data.fileName, userId: job.data.userId }, (err as Error).message).catch(() => {})
    }
  })
}

export function stopPdfWorker(): Promise<void> {
  return _worker?.close() ?? Promise.resolve()
}

/**
 * Generate a PDF synchronously (used when Redis/BullMQ is unavailable).
 * Returns the PDF buffer directly — caller sends it as an HTTP response.
 */
export async function generatePdfSync(html: string): Promise<Buffer> {
  return renderHtmlToPdf(html, { format: "A4" })
}
