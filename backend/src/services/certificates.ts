// ─────────────────────────────────────────────────────────────────────────────
// services/certificates.ts — Shared certificate logic used by both the teacher
// routes (routes/certificates.ts) and the student routes (studentCertificates.ts).
//
// Certificates are never created automatically. A teacher (or admin) sees who has
// completed a subject and issues certificates on demand, choosing the template.
//   - teacherCanIssue()        — who may issue/revoke for a class (+ subject)
//   - subjectsUserCanIssue()   — subjects with lessons that this user may certify
//   - computeSubjectCompletion() — per-student progress for one class + subject
//   - getCertificatePdf()      — cached PDF (built once, stored in GridFS)
//   - writeCertAudit()         — AuditLog entry; failure is logged, never thrown
// ─────────────────────────────────────────────────────────────────────────────
import mongoose from "mongoose"
import { getGridFSBucket } from "../lib/gridfs.js"
import { generateCertificatePDF, fillDescription, type CertificateData } from "../lib/pdf.js"
import { logger } from "../lib/logger.js"
import { Certificate } from "../models/Certificate.js"
import { CertTemplate } from "../models/CertTemplate.js"
import { School } from "../models/School.js"
import { Class } from "../models/Class.js"
import { Module } from "../models/Module.js"
import { ModuleProgress } from "../models/ModuleProgress.js"
import { User } from "../models/User.js"
import { AuditLog } from "../models/AuditLog.js"

export const CERT_TEMPLATES = ["course_completion", "academic_excellence", "outstanding_achievement"] as const
export type CertTemplateKey = typeof CERT_TEMPLATES[number]

export function isCertTemplateKey(value: unknown): value is CertTemplateKey {
  return typeof value === "string" && (CERT_TEMPLATES as readonly string[]).includes(value)
}

const ADMIN_ROLES = ["admin", "super_admin"]
export function isAdminRole(role: string | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role)
}

// ── Who may issue ────────────────────────────────────────────────────────────

/**
 * Admins may issue for any class in their school. A teacher may issue only for a
 * class they are assigned to by the admin (the class's `teachers` list, or the legacy
 * primary `teacher_id`) — and, for a subject certificate, only for a subject they are
 * assigned to teach there. Timetable slots never grant access: a teacher can edit a
 * timetable, so trusting it would let anyone give themselves certificate powers.
 */
export async function teacherCanIssue(
  userId: string, role: string | undefined, schoolId: string,
  classId: mongoose.Types.ObjectId, subject: string | null,
): Promise<boolean> {
  const schoolOid = new mongoose.Types.ObjectId(schoolId)
  if (isAdminRole(role)) {
    return !!(await Class.exists({ _id: classId, school_id: schoolOid }))
  }
  if (role !== "teacher") return false
  const tid = new mongoose.Types.ObjectId(userId)
  const match = subject
    ? { teachers: { $elemMatch: { teacher_id: tid, subject } } }
    : { $or: [{ teacher_id: tid }, { "teachers.teacher_id": tid }] }
  return !!(await Class.exists({ _id: classId, school_id: schoolOid, ...match }))
}

interface ClassAssignmentLean {
  teachers: Array<{ teacher_id: mongoose.Types.ObjectId; subject: string }>
}

/** Subjects in this class that have lessons and that this user may issue certificates for. */
export async function subjectsUserCanIssue(
  userId: string, role: string | undefined, schoolId: string, classId: mongoose.Types.ObjectId,
): Promise<string[]> {
  const schoolOid = new mongoose.Types.ObjectId(schoolId)
  const cls = await Class.findOne({ _id: classId, school_id: schoolOid })
    .select("teachers").lean<ClassAssignmentLean>()
  if (!cls) return []
  const lessonSubjects: string[] = await Module.distinct("subject", { school_id: schoolOid, class_id: classId })
  if (isAdminRole(role)) return lessonSubjects.sort()
  if (role !== "teacher") return []
  const taught = new Set<string>(
    (cls.teachers ?? []).filter(t => t.teacher_id?.toString() === userId).map(t => t.subject),
  )
  return lessonSubjects.filter(s => taught.has(s)).sort()
}

// ── Completion ───────────────────────────────────────────────────────────────

export interface StudentCompletion {
  student_id:  string
  name:        string
  viewed:      number
  total:       number
  completed:   boolean
  certificate: { id: string; status: "active" | "revoked"; issued_at: Date; revoked_at: Date | null } | null
}

export interface SubjectCompletion {
  subject:       string
  modules_count: number
  total_items:   number
  empty_modules: string[]   // modules with no items — nobody can complete the subject until they have content
  students:      StudentCompletion[]
}

interface ModuleItemsLean { _id: mongoose.Types.ObjectId; title: string; items: Array<{ _id: mongoose.Types.ObjectId }> }
interface ProgressCount   { _id: mongoose.Types.ObjectId; viewed: number }
interface CertStatusLean  { _id: mongoose.Types.ObjectId; student_id: mongoose.Types.ObjectId; status?: "active" | "revoked"; issued_at: Date; revoked_at?: Date | null }

/**
 * "Completed" = every item in every module of the subject has been viewed
 * (the same rule self-claim used). Counting happens in the database.
 */
export async function computeSubjectCompletion(
  schoolId: string, classId: mongoose.Types.ObjectId, subject: string, onlyStudentIds?: mongoose.Types.ObjectId[],
): Promise<SubjectCompletion> {
  const schoolOid = new mongoose.Types.ObjectId(schoolId)
  const modules = await Module.find({ school_id: schoolOid, class_id: classId, subject })
    .select("title items._id").lean<ModuleItemsLean[]>()
  const itemIds = modules.flatMap(m => m.items.map(i => i._id))
  const emptyModules = modules.filter(m => m.items.length === 0).map(m => m.title)
  const total = itemIds.length

  const studentFilter: Record<string, unknown> = { school_id: schoolOid, class_id: classId, role: "student", is_active: true }
  if (onlyStudentIds) studentFilter._id = { $in: onlyStudentIds }
  const students = await User.find(studentFilter).select("name").sort({ name: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>()
  const studentIds = students.map(s => s._id)

  const [counts, certs] = await Promise.all([
    total === 0 || studentIds.length === 0
      ? Promise.resolve([] as ProgressCount[])
      : ModuleProgress.aggregate<ProgressCount>([
          { $match: { student_id: { $in: studentIds }, module_id: { $in: modules.map(m => m._id) }, item_id: { $in: itemIds } } },
          { $group: { _id: "$student_id", viewed: { $sum: 1 } } },
        ]),
    Certificate.find({ school_id: schoolOid, class_id: classId, subject, type: "module", student_id: { $in: studentIds } })
      .select("student_id status issued_at revoked_at").lean<CertStatusLean[]>(),
  ])

  const viewedBy = new Map(counts.map(c => [c._id.toString(), c.viewed]))
  const certBy   = new Map(certs.map(c => [c.student_id.toString(), c]))
  const completable = total > 0 && emptyModules.length === 0

  return {
    subject,
    modules_count: modules.length,
    total_items:   total,
    empty_modules: emptyModules,
    students: students.map(s => {
      const id = s._id.toString()
      const viewed = Math.min(viewedBy.get(id) ?? 0, total)
      const cert = certBy.get(id)
      return {
        student_id: id,
        name:       s.name,
        viewed,
        total,
        completed:  completable && viewed === total,
        certificate: cert
          ? { id: cert._id.toString(), status: cert.status ?? "active", issued_at: cert.issued_at, revoked_at: cert.revoked_at ?? null }
          : null,
      }
    }),
  }
}

export function classLabel(cls: { name?: string | null; grade: number; section: string }): string {
  return cls.name ?? (cls.grade > 0 ? `Class ${cls.grade}${cls.section}` : cls.section)
}

// ── PDF (built once, cached) ─────────────────────────────────────────────────

export interface CertForPdf {
  _id:            mongoose.Types.ObjectId
  school_id:      mongoose.Types.ObjectId
  student_name:   string
  module_title:   string
  subject:        string
  class_label:    string
  issued_at:      Date
  type?:          string
  custom_title?:  string
  custom_reason?: string
  cert_template?: string | null
  pdf_gridfs_id?: mongoose.Types.ObjectId | null
}

interface TemplateLean {
  school_name: string; logo_gridfs_id: mongoose.Types.ObjectId | null; description: string
  footer_left: string; footer_right: string; accent_color: string; updated_at?: Date
}

const certBucket = () => getGridFSBucket("uploads")

async function readGridFs(id: mongoose.Types.ObjectId): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = certBucket().openDownloadStream(id)
    stream.on("data", (c: Buffer) => chunks.push(c))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}

export async function logoToBase64(logoId: mongoose.Types.ObjectId): Promise<{ b64: string; mime: string } | null> {
  try {
    const files = await certBucket().find({ _id: logoId }).toArray()
    if (!files.length) return null
    const mime = (files[0] as { contentType?: string; metadata?: { contentType?: string } }).metadata?.contentType
      ?? (files[0] as { contentType?: string }).contentType ?? "image/png"
    return { b64: (await readGridFs(logoId)).toString("base64"), mime }
  } catch (err) {
    logger.warn({ err }, "[certificates] logo could not be read — rendering without it")
    return null
  }
}

export async function getOrCreateTemplate(schoolId: mongoose.Types.ObjectId): Promise<TemplateLean> {
  const existing = await CertTemplate.findOne({ school_id: schoolId }).lean<TemplateLean>()
  if (existing) return existing
  const school = await School.findById(schoolId).select("name").lean<{ name?: string }>()
  const created = await CertTemplate.create({ school_id: schoolId, school_name: school?.name ?? "School" })
  return created.toObject() as TemplateLean
}

type PdfTemplate = NonNullable<CertificateData["template"]>

function pdfTemplateFor(cert: Pick<CertForPdf, "type" | "cert_template">): PdfTemplate {
  if (cert.cert_template === "outstanding_achievement") return "outstanding_achievement"
  if (cert.cert_template === "academic_excellence")     return "academic_excellence"
  if (cert.cert_template === "course_completion")       return "completion"
  // Older certificates without a chosen template keep their original look
  return cert.type === "custom" ? "default" : "completion"
}

export async function buildCertData(cert: Omit<CertForPdf, "_id" | "school_id">, tmpl: TemplateLean): Promise<CertificateData> {
  const isCustom = cert.type === "custom"
  const logo = tmpl.logo_gridfs_id ? await logoToBase64(tmpl.logo_gridfs_id) : null
  const description = isCustom
    ? (cert.custom_reason ?? "")
    : fillDescription(tmpl.description, {
        module_title: cert.module_title, subject: cert.subject, class_label: cert.class_label,
        student_name: cert.student_name, school_name: tmpl.school_name,
      })
  return {
    student_name:  cert.student_name,
    module_title:  isCustom ? (cert.custom_title ?? "") : cert.module_title,
    subject:       isCustom ? (cert.custom_reason ?? "") : cert.subject,
    class_label:   cert.class_label,
    school_name:   tmpl.school_name,
    logo_base64:   logo?.b64,
    logo_mime:     logo?.mime,
    description,
    footer_left:   tmpl.footer_left,
    footer_right:  tmpl.footer_right,
    accent_color:  tmpl.accent_color,
    date:          new Date(cert.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    cert_title:    isCustom ? cert.custom_title : undefined,
    cert_subtitle: isCustom ? "Special Award" : undefined,
    template:      pdfTemplateFor(cert),
  }
}

/** Returns the stored PDF, building and storing it only the first time it is asked for. */
export async function getCertificatePdf(cert: CertForPdf): Promise<Buffer> {
  if (cert.pdf_gridfs_id) {
    try {
      const files = await certBucket().find({ _id: cert.pdf_gridfs_id }).toArray()
      if (files.length > 0) return await readGridFs(cert.pdf_gridfs_id)
    } catch (err) {
      logger.warn({ err, certId: cert._id.toString() }, "[certificates] cached PDF unreadable — rebuilding")
    }
  }
  const tmpl = await getOrCreateTemplate(cert.school_id)
  const pdf = await generateCertificatePDF(await buildCertData(cert, tmpl))
  const newId = new mongoose.Types.ObjectId()
  await new Promise<void>((resolve, reject) => {
    const stream = certBucket().openUploadStreamWithId(newId, `cert_${cert._id.toString()}.pdf`, {
      metadata: { contentType: "application/pdf", school_id: cert.school_id.toString() },
    })
    stream.on("finish", () => resolve())
    stream.on("error", reject)
    stream.end(pdf)
  })
  // Link only if no other request linked a PDF first and the certificate was not revoked
  // meanwhile — otherwise this copy is surplus and is removed so nothing is orphaned.
  const linked = await Certificate.updateOne(
    { _id: cert._id, pdf_gridfs_id: null, status: { $ne: "revoked" } },
    { $set: { pdf_gridfs_id: newId } },
  )
  if (linked.matchedCount === 0) await deleteUploadsFile(newId)
  return pdf
}

export async function deleteUploadsFile(id: mongoose.Types.ObjectId | null | undefined): Promise<void> {
  if (!id) return
  try { await certBucket().delete(id) } catch (err) {
    logger.warn({ err, fileId: id.toString() }, "[certificates] cached PDF already removed")
  }
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface CertAuditEntry {
  resourceId: string; before: unknown; after: unknown
}

/** One AuditLog row per certificate, written in a single insert. */
export async function writeCertAudit(ctx: {
  schoolId: string; actorId: string; actorRole: string | undefined; action: string; ip: string | undefined
  resourceType?: "Certificate" | "CertTemplate"
}, entries: CertAuditEntry[]): Promise<void> {
  if (entries.length === 0) return
  try {
    await AuditLog.insertMany(entries.map(e => ({
      school_id:     new mongoose.Types.ObjectId(ctx.schoolId),
      actor_id:      new mongoose.Types.ObjectId(ctx.actorId),
      actor_role:    ctx.actorRole ?? "unknown",
      action:        ctx.action,
      resource_type: ctx.resourceType ?? "Certificate",
      resource_id:   e.resourceId,
      before:        e.before,
      after:         e.after,
      ip:            ctx.ip ?? null,
    })))
  } catch (err) {
    logger.error({ err, action: ctx.action }, "[certificates] AuditLog write failed — action still succeeded")
  }
}
