import { Queue, QueueEvents } from "bullmq"
import { getBullMQConnection } from "../lib/redis.js"
import { logger } from "../lib/logger.js"

let _pdfQueueEvents: QueueEvents | null = null
let _pptxQueueEvents: QueueEvents | null = null

export function getPdfQueueEvents(): QueueEvents | null {
  const conn = getBullMQConnection()
  if (!conn) return null
  if (!_pdfQueueEvents) {
    _pdfQueueEvents = new QueueEvents("pdf-generation", { connection: conn })
  }
  return _pdfQueueEvents
}

export function getPptxQueueEvents(): QueueEvents | null {
  const conn = getBullMQConnection()
  if (!conn) return null
  if (!_pptxQueueEvents) {
    _pptxQueueEvents = new QueueEvents("pptx-conversion", { connection: conn })
  }
  return _pptxQueueEvents
}

// BullMQ queues — only created when Redis is available.
// If Redis is not configured, queue functions return null and
// callers fall back to synchronous execution.

let _pptxQueue: Queue | null = null
let _pdfQueue:  Queue | null = null
let _dlqQueue:  Queue | null = null

// Dead-letter queue — jobs that exhaust all retries land here for inspection.
export function getDLQQueue(): Queue | null {
  const conn = getBullMQConnection()
  if (!conn) return null
  if (!_dlqQueue) {
    _dlqQueue = new Queue("dead-letter", {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: { count: 500 }, // keep last 500 failed jobs for debugging
      },
    })
  }
  return _dlqQueue
}

export async function moveToDLQ(queueName: string, jobId: string | undefined, data: unknown, reason: string): Promise<void> {
  const dlq = getDLQQueue()
  if (!dlq) return
  try {
    await dlq.add("failed-job", { queueName, jobId, data, reason, failedAt: new Date().toISOString() })
  } catch (err) {
    logger.error({ err }, "[dlq] Failed to move job to dead-letter queue")
  }
}

export interface PptxJobData {
  moduleId:    string
  itemId:      string   // must equal the _id saved on the module item
  gridfsId:    string   // ObjectId string of the original PPTX file in GridFS
  fileName:    string
  schoolId:    string   // stamped on the converted PDF so files.ts serves it (fail-closed boundary)
  classId:     string
}

export function getPptxQueue(): Queue | null {
  const conn = getBullMQConnection()
  if (!conn) return null

  if (!_pptxQueue) {
    _pptxQueue = new Queue("pptx-conversion", {
      connection: conn,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    })
  }
  return _pptxQueue
}

export async function queuePptxConversion(data: PptxJobData): Promise<string | null> {
  const queue = getPptxQueue()
  if (!queue) return null
  const job = await queue.add("convert", data)
  return job.id ?? null
}

// ── PDF generation queue ─────────────────────────────────────────────────────

export type PdfJobType = "report-card" | "compliance-report"

export interface PdfJobData {
  type:      PdfJobType
  /** Serialised HTML string ready for Puppeteer to render */
  html:      string
  /** Filename to set in the Content-Disposition header */
  fileName:  string
  /** userId who requested this PDF — stored with the PDF as the requester */
  userId:    string
  /** Extra fields stored with the PDF so it can be found and reused later (e.g. report-card cache keys) */
  metadata?: Record<string, string>
}

export interface PdfJobResult {
  /** ObjectId string of the GridFS file containing the rendered PDF */
  gridfsId: string
}

export function getPdfQueue(): Queue | null {
  const conn = getBullMQConnection()
  if (!conn) return null

  if (!_pdfQueue) {
    _pdfQueue = new Queue("pdf-generation", {
      connection: conn,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 3000 },
        // Job data holds a child's report card (name, marks, attendance): never keep it after the job
        removeOnComplete: true,
        removeOnFail:     true,
      },
    })
  }
  return _pdfQueue
}

export async function queuePdfGeneration(data: PdfJobData): Promise<string | null> {
  const queue = getPdfQueue()
  if (!queue) return null
  const job = await queue.add("generate", data)
  return job.id ?? null
}
