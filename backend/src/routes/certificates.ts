import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/certificates.ts — Certificate routes for teachers/admins at /api/certificates.
// Nothing here runs automatically: teachers see who completed a subject and issue
// certificates on demand, choosing the template. Revoked certificates are kept
// (status "revoked") and every issue/revoke is written to the AuditLog.
// PDFs are built once per certificate and served from GridFS afterwards.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Request, type Response } from "express"
import mongoose from "mongoose"
import multer from "multer"
import * as archiver from "archiver"
import { rateLimit } from "express-rate-limit"
import { SharedRateLimitStore } from "../lib/rateLimitStore.js"
import { getGridFSBucket } from "../lib/gridfs.js"
import { validateObjectId } from "../lib/validateId.js"
import { generateCertificatePDF } from "../lib/pdf.js"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { User }        from "../models/User.js"
import { Certificate } from "../models/Certificate.js"
import { CertTemplate } from "../models/CertTemplate.js"
import { Class }       from "../models/Class.js"
import { Module }      from "../models/Module.js"
import {
  isCertTemplateKey, isAdminRole, teacherCanIssue, subjectsUserCanIssue, computeSubjectCompletion,
  classLabel, getOrCreateTemplate, buildCertData, getCertificatePdf, deleteUploadsFile, logoToBase64,
  writeCertAudit, type CertForPdf, type CertTemplateKey,
} from "../services/certificates.js"

const router = Router()
router.use(requireAuth)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
const getBucket = () => getGridFSBucket("uploads")

// Per-user limit on the expensive actions (PDF building, bulk issue). Keyed on the
// signed-in user so one teacher cannot exhaust the budget of a whole school network.
const heavyPerUser = rateLimit({
  windowMs: 60_000, max: 10,
  keyGenerator: (req: Request) => (req as AuthRequest).userId ?? req.ip ?? "unknown",
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many certificate actions. Please wait a minute and try again." },
  store: new SharedRateLimitStore("cert-heavy"),
})

const MAX_CERTS_PER_ZIP = 100
const STAFF_ROLES = ["teacher", "admin", "super_admin"]
const isStaff = (role: string | undefined) => !!role && STAFF_ROLES.includes(role)
const subjectParam = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.trim().length <= 50 ? v.trim() : null

interface ClassLabelLean { _id: mongoose.Types.ObjectId; grade: number; section: string; name?: string | null }

// ── GET /api/certificates/template ────────────────────────────────────────────
router.get("/template", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.schoolId) { res.status(403).json({ error: "No school on this account" }); return }
    const tmpl = await getOrCreateTemplate(new mongoose.Types.ObjectId(req.schoolId))
    const logoData = tmpl.logo_gridfs_id ? await logoToBase64(tmpl.logo_gridfs_id) : null
    res.json({ template: { ...tmpl, logo_base64: logoData?.b64 ?? null, logo_mime: logoData?.mime ?? null } })
  } catch (err) {
    logger.error({ err }, "[cert template GET]")
    res.status(500).json({ error: "Failed to load the certificate template" })
  }
})

// ── POST /api/certificates/template ───────────────────────────────────────────
router.post("/template", async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole) || !req.schoolId) { res.status(403).json({ error: "Teachers only" }); return }
    const { school_name, description, footer_left, footer_right, accent_color } = req.body as Record<string, unknown>
    const str = (v: unknown) => (typeof v === "string" ? v : undefined)

    if (str(school_name) !== undefined && str(school_name)!.trim().length > 200) {
      res.status(400).json({ error: "School name must be under 200 characters" }); return
    }
    if (str(description) !== undefined && str(description)!.trim().length > 2000) {
      res.status(400).json({ error: "Certificate description must be under 2000 characters" }); return
    }
    if (str(footer_left) !== undefined && str(footer_left)!.trim().length > 100) {
      res.status(400).json({ error: "Footer left text must be under 100 characters" }); return
    }
    if (str(footer_right) !== undefined && str(footer_right)!.trim().length > 100) {
      res.status(400).json({ error: "Footer right text must be under 100 characters" }); return
    }
    if (str(accent_color) !== undefined && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str(accent_color)!)) {
      res.status(400).json({ error: "accent_color must be a valid hex color (e.g. #534AB7)" }); return
    }

    const tmpl = await CertTemplate.findOneAndUpdate(
      { school_id: new mongoose.Types.ObjectId(req.schoolId) },
      { $set: {
        school_name: str(school_name), description: str(description), footer_left: str(footer_left),
        footer_right: str(footer_right), accent_color: str(accent_color), updated_at: new Date(),
      } },
      { upsert: true, returnDocument: "after" },
    ).lean()
    // The template changes every certificate issued afterwards, so each change is audited
    await writeCertAudit(
      { schoolId: req.schoolId, actorId: req.userId!, actorRole: req.userRole, action: "certificate_template.updated", ip: req.ip, resourceType: "CertTemplate" },
      [{ resourceId: req.schoolId, before: null, after: { school_name: str(school_name), description: str(description), footer_left: str(footer_left), footer_right: str(footer_right), accent_color: str(accent_color) } }],
    )
    res.json({ template: tmpl })
  } catch (err) {
    logger.error({ err }, "[cert template POST]")
    res.status(500).json({ error: "Failed to save template" })
  }
})

// ── POST /api/certificates/template/logo ──────────────────────────────────────
router.post("/template/logo", upload.single("logo"), async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole) || !req.schoolId) { res.status(403).json({ error: "Teachers only" }); return }
    if (!req.file) { res.status(400).json({ error: "No file" }); return }
    const schoolOid = new mongoose.Types.ObjectId(req.schoolId)

    const bucket = getBucket()
    const uploadId = new mongoose.Types.ObjectId()
    await new Promise<void>((resolve, reject) => {
      const stream = bucket.openUploadStreamWithId(uploadId, req.file!.originalname, {
        metadata: { contentType: req.file!.mimetype, school_id: req.schoolId },
      })
      stream.on("finish", () => resolve())
      stream.on("error", reject)
      stream.end(req.file!.buffer)
    })

    const old = await CertTemplate.findOne({ school_id: schoolOid }).select("logo_gridfs_id").lean()
    if (old?.logo_gridfs_id) await deleteUploadsFile(old.logo_gridfs_id)

    await CertTemplate.findOneAndUpdate(
      { school_id: schoolOid },
      { $set: { logo_gridfs_id: uploadId, updated_at: new Date() } },
      { upsert: true },
    )
    await writeCertAudit(
      { schoolId: req.schoolId, actorId: req.userId!, actorRole: req.userRole, action: "certificate_template.logo_uploaded", ip: req.ip, resourceType: "CertTemplate" },
      [{ resourceId: req.schoolId, before: null, after: { logo_gridfs_id: uploadId.toString(), file_name: req.file.originalname } }],
    )
    res.json({ success: true })
  } catch (err) {
    logger.error({ err }, "[cert logo upload]")
    res.status(500).json({ error: "Logo upload failed" })
  }
})

// ── DELETE /api/certificates/template/logo ────────────────────────────────────
router.delete("/template/logo", async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole) || !req.schoolId) { res.status(403).json({ error: "Teachers only" }); return }
    const schoolOid = new mongoose.Types.ObjectId(req.schoolId)
    const tmpl = await CertTemplate.findOne({ school_id: schoolOid }).select("logo_gridfs_id").lean()
    if (tmpl?.logo_gridfs_id) await deleteUploadsFile(tmpl.logo_gridfs_id)
    await CertTemplate.findOneAndUpdate(
      { school_id: schoolOid },
      { $set: { logo_gridfs_id: null, updated_at: new Date() } },
      { upsert: true },
    )
    await writeCertAudit(
      { schoolId: req.schoolId, actorId: req.userId!, actorRole: req.userRole, action: "certificate_template.logo_removed", ip: req.ip, resourceType: "CertTemplate" },
      [{ resourceId: req.schoolId, before: null, after: { logo_gridfs_id: null } }],
    )
    res.json({ success: true })
  } catch (err) {
    logger.error({ err }, "[cert logo delete]")
    res.status(500).json({ error: "Failed to remove logo" })
  }
})

// ── GET /api/certificates/download/:id ────────────────────────────────────────
// ?inline=1 opens in the browser instead of downloading.
// Students: own only. Parents: their linked child only. Teachers: classes they teach.
router.get("/download/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!validateObjectId(req.params.id, res, "certificate ID")) return
    const cert = await Certificate.findById(req.params.id).lean<CertForPdf & {
      student_id: mongoose.Types.ObjectId; class_id: mongoose.Types.ObjectId; status?: string
    }>()
    // Same answer for "missing" and "other school" so ids cannot be probed
    if (!cert || cert.school_id.toString() !== req.schoolId) { res.status(404).json({ error: "Certificate not found" }); return }

    const role = req.userRole
    if (role === "student") {
      if (cert.student_id.toString() !== req.userId) { res.status(403).json({ error: "Forbidden" }); return }
    } else if (role === "parent") {
      const parent = await User.findById(req.userId).select("linked_student_id").lean()
      if (!parent?.linked_student_id || parent.linked_student_id.toString() !== cert.student_id.toString()) {
        res.status(403).json({ error: "Forbidden" }); return
      }
    } else if (role === "teacher") {
      if (!(await teacherCanIssue(req.userId!, role, req.schoolId!, cert.class_id, null))) {
        res.status(403).json({ error: "Forbidden" }); return
      }
    } else if (!isAdminRole(role)) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    if (cert.status === "revoked") { res.status(410).json({ error: "This certificate was revoked and can no longer be downloaded." }); return }

    const pdf = await getCertificatePdf(cert)
    const safeName = cert.student_name.replace(/[^a-z0-9]/gi, "_").toLowerCase()
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("Content-Disposition", `${req.query.inline === "1" ? "inline" : "attachment"}; filename="Certificate_${safeName}.pdf"`)
    res.send(pdf)
  } catch (err) {
    logger.error({ err }, "[cert download]")
    res.status(500).json({ error: "Failed to prepare the certificate" })
  }
})

// ── GET /api/certificates/class/:classId ─────────────────────────────────────
// All certificates for a class, grouped by module; subject certificates (module_id
// null) grouped by subject; custom certificates separate. Teachers: own classes only.
router.get("/class/:classId", async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole)) { res.status(403).json({ error: "Teachers only" }); return }
    if (!validateObjectId(req.params.classId, res, "class ID")) return
    const classOid = new mongoose.Types.ObjectId(req.params.classId)
    if (!(await teacherCanIssue(req.userId!, req.userRole, req.schoolId!, classOid, null))) {
      res.status(403).json({ error: "You can only view certificates for classes you teach" }); return
    }

    interface CertRow {
      _id: mongoose.Types.ObjectId; student_id: mongoose.Types.ObjectId; student_name: string
      module_id: mongoose.Types.ObjectId | null; module_title: string; subject: string; type: string
      custom_title: string; custom_reason: string; issued_at: Date; module_deleted: boolean
      status?: string; revoked_at?: Date | null; revoke_reason?: string; cert_template?: string | null
    }
    const filter = { school_id: new mongoose.Types.ObjectId(req.schoolId), class_id: classOid }
    const [certs, modules] = await Promise.all([
      Certificate.find(filter)
        .select("student_id student_name module_id module_title subject type custom_title custom_reason issued_at module_deleted status revoked_at revoke_reason cert_template")
        .sort({ issued_at: -1 }).lean<CertRow[]>(),
      Module.find(filter).select("title subject items._id").lean<Array<{ _id: mongoose.Types.ObjectId; title: string; subject: string; items: unknown[] }>>(),
    ])

    const moduleCerts = certs.filter(c => c.type !== "custom")
    const custom_certificates = certs.filter(c => c.type === "custom")
    const byModule = new Map<string, CertRow[]>()
    for (const c of moduleCerts) {
      const key = c.module_id?.toString() ?? ""
      byModule.set(key, [...(byModule.get(key) ?? []), c])
    }
    const liveIds = new Set(modules.map(m => m._id.toString()))

    const data: Array<{ module_id: string | null; module_title: string; subject: string; total_items: number; certificates: CertRow[] }> =
      modules.map(m => ({
        module_id: m._id.toString(), module_title: m.title, subject: m.subject,
        total_items: m.items.length, certificates: byModule.get(m._id.toString()) ?? [],
      }))

    // Subject certificates (module_id null) — one group per subject
    const bySubject = new Map<string, CertRow[]>()
    for (const c of byModule.get("") ?? []) {
      const key = c.subject || c.module_title || "Course"
      bySubject.set(key, [...(bySubject.get(key) ?? []), c])
    }
    for (const [subject, group] of bySubject) {
      data.push({ module_id: null, module_title: subject, subject, total_items: 0, certificates: group })
    }

    const removedGroups = new Map<string, CertRow[]>()
    for (const c of moduleCerts) {
      if (c.module_id && c.module_deleted && !liveIds.has(c.module_id.toString())) {
        const key = c.module_id.toString()
        removedGroups.set(key, [...(removedGroups.get(key) ?? []), c])
      }
    }
    const removed_modules = [...removedGroups.values()].map(group => ({
      module_title: group[0].module_title || "Deleted module", subject: group[0].subject, certificates: group,
    }))

    res.json({ modules: data, custom_certificates, removed_modules })
  } catch (err) {
    logger.error({ err }, "[cert class]")
    res.status(500).json({ error: "Failed to load certificates" })
  }
})

// ── GET /api/certificates/completion/subjects?class_id= ──────────────────────
// Subjects (with lessons) in this class that the caller may issue certificates for.
router.get("/completion/subjects", async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole)) { res.status(403).json({ error: "Teachers only" }); return }
    if (!validateObjectId(req.query.class_id as string | undefined, res, "class ID")) return
    const subjects = await subjectsUserCanIssue(req.userId!, req.userRole, req.schoolId!, new mongoose.Types.ObjectId(String(req.query.class_id)))
    res.json({ subjects })
  } catch (err) {
    logger.error({ err }, "[cert completion subjects]")
    res.status(500).json({ error: "Failed to load subjects" })
  }
})

// ── GET /api/certificates/completion?class_id=&subject= ──────────────────────
// Who has completed this subject (every item in every module viewed), who is still
// in progress, and who already has a certificate. Read-only.
router.get("/completion", async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole)) { res.status(403).json({ error: "Teachers only" }); return }
    if (!validateObjectId(req.query.class_id as string | undefined, res, "class ID")) return
    const subject = subjectParam(req.query.subject)
    if (!subject) { res.status(400).json({ error: "subject is required" }); return }
    const classOid = new mongoose.Types.ObjectId(String(req.query.class_id))
    if (!(await teacherCanIssue(req.userId!, req.userRole, req.schoolId!, classOid, subject))) {
      res.status(403).json({ error: "You can only see completion for subjects you teach in this class" }); return
    }
    res.json(await computeSubjectCompletion(req.schoolId!, classOid, subject))
  } catch (err) {
    logger.error({ err }, "[cert completion]")
    res.status(500).json({ error: "Failed to load completion" })
  }
})

// ── POST /api/certificates/issue-completion ──────────────────────────────────
// Body: { class_id, subject, student_ids[], cert_template }
// Issues subject certificates to students who have completed the subject. Students
// who have not completed it, or already hold an active certificate, are skipped and
// reported back. A previously revoked certificate is re-activated (same record).
router.post("/issue-completion", heavyPerUser, async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole)) { res.status(403).json({ error: "Teachers only" }); return }
    const { class_id, student_ids, cert_template } = req.body as { class_id?: unknown; student_ids?: unknown; cert_template?: unknown }
    const subject = subjectParam((req.body as { subject?: unknown }).subject)
    if (typeof class_id !== "string" || !mongoose.isValidObjectId(class_id)) { res.status(400).json({ error: "Invalid class ID" }); return }
    if (!subject) { res.status(400).json({ error: "subject is required" }); return }
    if (!isCertTemplateKey(cert_template)) { res.status(400).json({ error: "Please choose a certificate template" }); return }
    if (!Array.isArray(student_ids) || student_ids.length === 0) { res.status(400).json({ error: "Select at least one student" }); return }
    if (student_ids.length > 200) { res.status(400).json({ error: "Cannot issue to more than 200 students at once" }); return }
    if (!student_ids.every(id => typeof id === "string" && mongoose.isValidObjectId(id))) { res.status(400).json({ error: "Invalid student list" }); return }

    const classOid = new mongoose.Types.ObjectId(class_id)
    if (!(await teacherCanIssue(req.userId!, req.userRole, req.schoolId!, classOid, subject))) {
      res.status(403).json({ error: "You can only issue certificates for subjects you teach in this class" }); return
    }
    const cls = await Class.findById(classOid).select("grade section name").lean<ClassLabelLean>()
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    const requested = [...new Set(student_ids as string[])].map(id => new mongoose.Types.ObjectId(id))
    const completion = await computeSubjectCompletion(req.schoolId!, classOid, subject, requested)
    const foundIds = new Set(completion.students.map(s => s.student_id))

    const skipped: Array<{ student_id: string; name: string; reason: string }> = requested
      .filter(id => !foundIds.has(id.toString()))
      .map(id => ({ student_id: id.toString(), name: "", reason: "Not a student in this class" }))
    const toIssue = completion.students.filter(s => {
      if (!s.completed) { skipped.push({ student_id: s.student_id, name: s.name, reason: "Has not completed the subject yet" }); return false }
      if (s.certificate?.status === "active") { skipped.push({ student_id: s.student_id, name: s.name, reason: "Already has this certificate" }); return false }
      return true
    })

    const label = classLabel(cls)
    const now = new Date()
    const results = await Promise.allSettled(toIssue.map(async s => {
      // A revoked certificate is re-activated; its old PDF is removed so the new template is used
      if (s.certificate) {
        const prev = await Certificate.findById(s.certificate.id).select("pdf_gridfs_id").lean()
        await deleteUploadsFile(prev?.pdf_gridfs_id)
      }
      // Never overwrite an active certificate: if another teacher issued it a moment ago the
      // filter does not match, the insert hits the unique index, and the student is reported as skipped.
      const cert = await Certificate.findOneAndUpdate(
        // Matches only a revoked certificate (older certificates have no status and count as active)
        { student_id: new mongoose.Types.ObjectId(s.student_id), class_id: classOid, subject, type: "module", status: "revoked" },
        { $set: {
          school_id: new mongoose.Types.ObjectId(req.schoolId), module_id: null, module_title: subject,
          class_label: label, student_name: s.name, issued_at: now, issued_by: new mongoose.Types.ObjectId(req.userId),
          cert_template: cert_template as CertTemplateKey, status: "active", revoked_at: null, revoked_by: null,
          revoke_reason: "", pdf_gridfs_id: null,
        } },
        { upsert: true, returnDocument: "after" },
      ).select("_id student_id").lean()
      if (!cert) throw new Error("certificate not saved")
      return { cert, reactivated: !!s.certificate }
    }))

    const issued: Array<{ cert: { _id: mongoose.Types.ObjectId; student_id: mongoose.Types.ObjectId }; reactivated: boolean }> = []
    results.forEach((r, i) => {
      if (r.status === "fulfilled") { issued.push(r.value); return }
      const duplicate = (r.reason as { code?: number } | undefined)?.code === 11000
      if (!duplicate) logger.error({ err: r.reason, studentId: toIssue[i].student_id }, "[cert issue-completion] could not issue")
      skipped.push({
        student_id: toIssue[i].student_id, name: toIssue[i].name,
        reason: duplicate ? "Already has this certificate" : "Could not be issued — please try again",
      })
    })

    // Every certificate that was actually issued is audited, even if others in the batch failed
    await writeCertAudit(
      { schoolId: req.schoolId!, actorId: req.userId!, actorRole: req.userRole, action: "certificate.issued", ip: req.ip },
      issued.map(i => ({
        resourceId: i.cert._id.toString(),
        before: i.reactivated ? { status: "revoked" } : null,
        after: { status: "active", student_id: i.cert.student_id.toString(), subject, cert_template },
      })),
    )

    res.json({ issued: issued.length, skipped })
  } catch (err) {
    logger.error({ err }, "[cert issue-completion]")
    res.status(500).json({ error: "Failed to issue certificates" })
  }
})

// ── POST /api/certificates/bulk-generate ──────────────────────────────────────
// ZIP of active certificates for a class + module, or class + subject (subject certificates).
router.post("/bulk-generate", heavyPerUser, async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole)) { res.status(403).json({ error: "Teachers only" }); return }
    const { class_id, module_id } = req.body as { class_id?: unknown; module_id?: unknown }
    const subject = subjectParam((req.body as { subject?: unknown }).subject)
    if (typeof class_id !== "string" || !mongoose.isValidObjectId(class_id)) { res.status(400).json({ error: "Invalid class ID" }); return }
    const hasModule = typeof module_id === "string" && mongoose.isValidObjectId(module_id)
    if (!hasModule && !subject) { res.status(400).json({ error: "module_id or subject is required" }); return }

    const classOid = new mongoose.Types.ObjectId(class_id)
    if (!(await teacherCanIssue(req.userId!, req.userRole, req.schoolId!, classOid, hasModule ? null : subject))) {
      res.status(403).json({ error: "You can only download certificates for classes you teach" }); return
    }

    const filter: Record<string, unknown> = {
      school_id: new mongoose.Types.ObjectId(req.schoolId), class_id: classOid, status: { $ne: "revoked" },
    }
    if (hasModule) filter.module_id = new mongoose.Types.ObjectId(module_id as string)
    else { filter.module_id = null; filter.subject = subject; filter.type = "module" }
    // One ZIP builds at most this many PDFs, so a single request cannot keep Chrome busy for everyone
    const certs = await Certificate.find(filter).limit(MAX_CERTS_PER_ZIP + 1).lean<CertForPdf[]>()
    if (certs.length === 0) { res.status(404).json({ error: "No certificates found" }); return }
    if (certs.length > MAX_CERTS_PER_ZIP) {
      res.status(413).json({ error: `A ZIP can hold up to ${MAX_CERTS_PER_ZIP} certificates. Download them by module instead.` }); return
    }

    res.setHeader("Content-Type", "application/zip")
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("Content-Disposition", `attachment; filename="Certificates_${(hasModule ? String(module_id) : subject!).replace(/[^\w-]/g, "_")}.zip"`)
    const archive = (archiver as unknown as (fmt: string, opts: object) => archiver.Archiver)("zip", { zlib: { level: 6 } })
    archive.pipe(res)
    for (const cert of certs) {
      archive.append(await getCertificatePdf(cert), { name: `Certificate_${cert.student_name.replace(/[^a-z0-9]/gi, "_")}.pdf` })
    }
    await archive.finalize()
  } catch (err) {
    logger.error({ err }, "[cert bulk-generate]")
    if (!res.headersSent) res.status(500).json({ error: "Bulk download failed" })
  }
})

// ── POST /api/certificates/preview ────────────────────────────────────────────
// Sample certificate from the school's saved template. Built once per saved template
// version (keyed on updated_at) and reused, instead of a new Chrome render per click.
const previewCache = new Map<string, Buffer>()
const PREVIEW_CACHE_MAX = 50

router.post("/preview", heavyPerUser, async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole) || !req.schoolId) { res.status(403).json({ error: "Teachers only" }); return }
    const tmpl = await getOrCreateTemplate(new mongoose.Types.ObjectId(req.schoolId))
    const key = `${req.schoolId}:${tmpl.updated_at ? new Date(tmpl.updated_at).getTime() : 0}`
    let pdf = previewCache.get(key)
    if (!pdf) {
      pdf = await generateCertificatePDF(await buildCertData({
        student_name: "Arjun Kumar", module_title: "Fractions", subject: "Mathematics",
        class_label: "Class 7A", issued_at: new Date(), type: "module", cert_template: "course_completion",
      }, tmpl))
      if (previewCache.size >= PREVIEW_CACHE_MAX) previewCache.delete(previewCache.keys().next().value!)
      previewCache.set(key, pdf)
    }
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf")
    res.send(pdf)
  } catch (err) {
    logger.error({ err }, "[cert preview]")
    res.status(500).json({ error: "Preview failed" })
  }
})

// ── POST /api/certificates/custom-issue ───────────────────────────────────────
// Special award to one or more students. The template must be chosen explicitly.
router.post("/custom-issue", heavyPerUser, async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole)) { res.status(403).json({ error: "Teachers only" }); return }
    const { class_id, student_ids, custom_title, custom_reason, cert_template } =
      req.body as { class_id?: unknown; student_ids?: unknown; custom_title?: unknown; custom_reason?: unknown; cert_template?: unknown }

    if (typeof class_id !== "string" || !mongoose.isValidObjectId(class_id)) { res.status(400).json({ error: "Invalid class ID" }); return }
    if (typeof custom_title !== "string" || !custom_title.trim()) { res.status(400).json({ error: "Certificate title is required" }); return }
    if (custom_title.trim().length > 200) { res.status(400).json({ error: "Certificate title must be under 200 characters" }); return }
    if (custom_reason !== undefined && (typeof custom_reason !== "string" || custom_reason.trim().length > 500)) {
      res.status(400).json({ error: "Certificate reason must be under 500 characters" }); return
    }
    if (!isCertTemplateKey(cert_template)) { res.status(400).json({ error: "Please choose a certificate template" }); return }
    if (!Array.isArray(student_ids) || student_ids.length === 0) { res.status(400).json({ error: "Select at least one student" }); return }
    if (student_ids.length > 200) { res.status(400).json({ error: "Cannot issue certificates to more than 200 students at once" }); return }
    if (!student_ids.every(id => typeof id === "string" && mongoose.isValidObjectId(id))) { res.status(400).json({ error: "Invalid student list" }); return }

    const classOid = new mongoose.Types.ObjectId(class_id)
    if (!(await teacherCanIssue(req.userId!, req.userRole, req.schoolId!, classOid, null))) {
      res.status(403).json({ error: "You can only issue certificates for classes you teach" }); return
    }
    const cls = await Class.findById(classOid).select("grade section name").lean<ClassLabelLean>()
    if (!cls) { res.status(404).json({ error: "Class not found" }); return }

    const students = await User.find({
      _id: { $in: (student_ids as string[]).map(id => new mongoose.Types.ObjectId(id)) },
      school_id: new mongoose.Types.ObjectId(req.schoolId), class_id: classOid, role: "student", is_active: true,
    }).select("name").lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>()
    if (students.length === 0) { res.status(400).json({ error: "No valid students found in this class" }); return }

    const label = classLabel(cls)
    const created = await Certificate.insertMany(students.map(student => ({
      student_id:    student._id,
      school_id:     new mongoose.Types.ObjectId(req.schoolId),
      class_id:      classOid,
      // Custom certificates get their own module_id so they never collide with subject certificates
      module_id:     new mongoose.Types.ObjectId(),
      module_title:  "",
      subject:       "",
      class_label:   label,
      student_name:  student.name,
      issued_at:     new Date(),
      issued_by:     new mongoose.Types.ObjectId(req.userId),
      type:          "custom",
      custom_title:  custom_title.trim(),
      custom_reason: typeof custom_reason === "string" ? custom_reason.trim() : "",
      cert_template,
    })))

    await writeCertAudit(
      { schoolId: req.schoolId!, actorId: req.userId!, actorRole: req.userRole, action: "certificate.custom_issued", ip: req.ip },
      created.map(c => ({ resourceId: c._id.toString(), before: null, after: { status: "active", student_id: c.student_id.toString(), custom_title: c.custom_title, cert_template } })),
    )

    res.json({ created: created.length, certificates: created.map(c => c.toObject()) })
  } catch (err) {
    logger.error({ err }, "[cert custom-issue]")
    res.status(500).json({ error: "Failed to issue certificates" })
  }
})

// ── POST /api/certificates/:id/revoke ─────────────────────────────────────────
// Body: { reason? }. The certificate is kept and marked revoked — never deleted.
router.post("/:id/revoke", async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req.userRole)) { res.status(403).json({ error: "Teachers only" }); return }
    if (!validateObjectId(req.params.id, res, "certificate ID")) return
    const rawReason = (req.body as { reason?: unknown }).reason
    if (rawReason !== undefined && (typeof rawReason !== "string" || rawReason.trim().length > 300)) {
      res.status(400).json({ error: "Reason must be under 300 characters" }); return
    }
    const reason = typeof rawReason === "string" ? rawReason.trim() : ""

    const cert = await Certificate.findById(req.params.id)
      .select("school_id class_id student_id subject type status pdf_gridfs_id").lean<{
        _id: mongoose.Types.ObjectId; school_id: mongoose.Types.ObjectId; class_id: mongoose.Types.ObjectId
        student_id: mongoose.Types.ObjectId; subject: string; type: string; status?: string
        pdf_gridfs_id?: mongoose.Types.ObjectId | null
      }>()
    if (!cert || cert.school_id.toString() !== req.schoolId) { res.status(404).json({ error: "Certificate not found" }); return }
    const subject = cert.type === "custom" || !cert.subject ? null : cert.subject
    if (!(await teacherCanIssue(req.userId!, req.userRole, req.schoolId!, cert.class_id, subject))) {
      res.status(403).json({ error: "You can only revoke certificates for subjects you teach in this class" }); return
    }
    if (cert.status === "revoked") { res.status(409).json({ error: "This certificate is already revoked" }); return }

    const revokedAt = new Date()
    // Conditional update — two teachers revoking at the same moment produce one revocation
    const updated = await Certificate.findOneAndUpdate(
      { _id: cert._id, status: { $ne: "revoked" } },
      { $set: { status: "revoked", revoked_at: revokedAt, revoked_by: new mongoose.Types.ObjectId(req.userId), revoke_reason: reason, pdf_gridfs_id: null } },
      { returnDocument: "after" },
    ).select("_id").lean()
    if (!updated) { res.status(409).json({ error: "This certificate is already revoked" }); return }
    await deleteUploadsFile(cert.pdf_gridfs_id)

    await writeCertAudit(
      { schoolId: req.schoolId!, actorId: req.userId!, actorRole: req.userRole, action: "certificate.revoked", ip: req.ip },
      [{ resourceId: cert._id.toString(), before: { status: "active" }, after: { status: "revoked", student_id: cert.student_id.toString(), reason } }],
    )
    res.json({ success: true, status: "revoked", revoked_at: revokedAt })
  } catch (err) {
    logger.error({ err }, "[cert revoke]")
    res.status(500).json({ error: "Failed to revoke certificate" })
  }
})

// ── GET /api/certificates ──────────────────────────────────────────────────────
// Admin: all certificates for the school (revoked ones included, with their status)
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.userRole)) { res.status(403).json({ error: "Admin only" }); return }
    const certs = await Certificate.find({ school_id: new mongoose.Types.ObjectId(req.schoolId) })
      .select("-pdf_gridfs_id").sort({ issued_at: -1 }).lean()
    res.json({ certificates: certs.map(c => ({ ...c, id: c._id.toString() })) })
  } catch (err) {
    logger.error({ err }, "[certs GET all]")
    res.status(500).json({ error: "Failed to load certificates" })
  }
})

export default router
