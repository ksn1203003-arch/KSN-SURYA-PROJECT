// ─────────────────────────────────────────────────────────────────────────────
// services/reportCardPdf.ts — A report-card PDF is built once per version of its
// content and then reused. The stored PDF is found by school + student + a
// fingerprint (SHA-256) of the finished page. Any change to the marks, the
// attendance, the student's details — or the "date of issue" on a new day —
// changes the fingerprint, so a new PDF is built; until then every download
// reuses the stored one. Only the newest version per student is kept.
// The caller must already have checked that the requester may see this student.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "crypto"
import mongoose from "mongoose"
import { getGridFSBucket } from "../lib/gridfs.js"
import { renderHtmlToPdf } from "../lib/pdf.js"
import { getPdfQueue, getPdfQueueEvents, type PdfJobResult } from "../jobs/queue.js"
import { logger } from "../lib/logger.js"

const KIND = "report-card"
const QUEUE_WAIT_MS = 30_000

export interface ReportCardPdfRequest {
  schoolId:    string
  studentId:   string
  html:        string
  fileName:    string
  requestedBy: string
}

let indexReady: Promise<unknown> | null = null
function ensureLookupIndex(): Promise<unknown> {
  if (!indexReady) {
    const db = mongoose.connection.db
    if (!db) return Promise.resolve()
    indexReady = db.collection("pdf_reports.files")
      .createIndex({ "metadata.kind": 1, "metadata.school_id": 1, "metadata.student_id": 1, "metadata.html_hash": 1 })
      .catch(err => { indexReady = null; logger.warn({ err }, "[reportCardPdf] could not create lookup index") })
  }
  return indexReady
}

async function readAll(id: mongoose.Types.ObjectId): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of getGridFSBucket("pdf_reports").openDownloadStream(id)) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function store(pdf: Buffer, fileName: string, metadata: Record<string, unknown>): Promise<mongoose.Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const upload = getGridFSBucket("pdf_reports").openUploadStream(fileName, { metadata })
    upload.on("error", reject)
    upload.on("finish", () => resolve(upload.id as mongoose.Types.ObjectId))
    upload.end(pdf)
  })
}

async function build(r: ReportCardPdfRequest, metadata: Record<string, string>): Promise<Buffer> {
  const queue = getPdfQueue()
  if (queue) {
    const job = await queue.add("generate", {
      type: "report-card" as const, html: r.html, fileName: r.fileName, userId: r.requestedBy, metadata,
    })
    const events = getPdfQueueEvents()
    const result = events
      ? await job.waitUntilFinished(events, QUEUE_WAIT_MS).catch(() => null) as PdfJobResult | null
      : null
    if (result) return readAll(new mongoose.Types.ObjectId(result.gridfsId))
    // Queue slow or failed — withdraw the job (if not already running) and build it here instead
    await job.remove().catch(() => undefined)
  }
  const pdf = await renderHtmlToPdf(r.html, { format: "A4" })
  await store(pdf, r.fileName, { ...metadata, userId: r.requestedBy, createdAt: new Date() })
  return pdf
}

async function removeOlderVersions(owner: Record<string, string>, keepHash: string): Promise<void> {
  const bucket = getGridFSBucket("pdf_reports")
  const old = await bucket.find({ ...owner, "metadata.html_hash": { $ne: keepHash } }).project({ _id: 1 }).toArray()
  for (const f of old) await bucket.delete(f._id).catch(() => undefined)
}

/** Removes every stored report-card PDF of one student (used when a data-deletion request is approved). */
export async function deleteStoredReportCards(studentId: string): Promise<void> {
  const bucket = getGridFSBucket("pdf_reports")
  const files = await bucket.find({ "metadata.kind": KIND, "metadata.student_id": studentId }).project({ _id: 1 }).toArray()
  const results = await Promise.allSettled(files.map(f => bucket.delete(f._id)))
  const failed = results.filter(r => r.status === "rejected").length
  if (failed) throw new Error(`${failed} of ${files.length} stored report cards could not be removed`)
}

export async function getReportCardPdf(r: ReportCardPdfRequest): Promise<Buffer> {
  await ensureLookupIndex()
  const htmlHash = crypto.createHash("sha256").update(r.html).digest("hex")
  const owner = { "metadata.kind": KIND, "metadata.school_id": r.schoolId, "metadata.student_id": r.studentId }

  const [existing] = await getGridFSBucket("pdf_reports")
    .find({ ...owner, "metadata.html_hash": htmlHash })
    .sort({ uploadDate: -1 }).limit(1).toArray()
  if (existing) return readAll(existing._id)

  const pdf = await build(r, { kind: KIND, school_id: r.schoolId, student_id: r.studentId, html_hash: htmlHash })
  removeOlderVersions(owner, htmlHash).catch(err => logger.warn({ err }, "[reportCardPdf] could not remove older versions"))
  return pdf
}
