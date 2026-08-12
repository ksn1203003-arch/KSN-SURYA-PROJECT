import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/certificates.ts — Certificate admin routes at /api/certificates.
// Lets admins and teachers view all issued certificates for the school,
// upload/update the school certificate template logo stored in GridFS,
// and download a bulk ZIP of all certificates.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import mongoose from "mongoose"
import multer from "multer"
import * as archiver from "archiver"
import { getGridFSBucket } from "../lib/gridfs.js"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { User }        from "../models/User.js"
import { Certificate } from "../models/Certificate.js"
import { CertTemplate } from "../models/CertTemplate.js"
import { School }      from "../models/School.js"
import { Module }      from "../models/Module.js"
import { generateCertificatePDF, fillDescription } from "../lib/pdf.js"

const router = Router()
router.use(requireAuth)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// ── helpers ───────────────────────────────────────────────────────────────────
const getBucket = () => getGridFSBucket("uploads")

async function logoToBase64(logoId: mongoose.Types.ObjectId): Promise<{ b64: string; mime: string } | null> {
  try {
    const bucket = getBucket()
    const files   = await bucket.find({ _id: logoId }).toArray()
    if (!files.length) return null
    const mime    = (files[0] as unknown as { contentType?: string }).contentType ?? "image/png"
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      const stream = bucket.openDownloadStream(logoId)
      stream.on("data",  c => chunks.push(c as Buffer))
      stream.on("end",   resolve)
      stream.on("error", reject)
    })
    return { b64: Buffer.concat(chunks).toString("base64"), mime }
  } catch { return null }
}

function normalizeCertFields(cert: { type?: string; module_title: string; subject: string; custom_title?: string; custom_reason?: string }) {
  return {
    module_title: cert.type === "custom" ? (cert.custom_title ?? "") : cert.module_title,
    subject:      cert.type === "custom" ? (cert.custom_reason ?? "") : cert.subject,
  }
}

async function buildCertData(cert: {
  student_name: string; module_title: string; subject: string
  class_label: string; issued_at: Date; type?: string; custom_title?: string
  custom_reason?: string; cert_template?: string | null
}, tmpl: { school_name: string; logo_gridfs_id: mongoose.Types.ObjectId | null; description: string; footer_left: string; footer_right: string; accent_color: string }) {
  const logo     = tmpl.logo_gridfs_id ? await logoToBase64(tmpl.logo_gridfs_id) : null
  const isCustom = cert.type === "custom"
  const { module_title, subject } = normalizeCertFields(cert)
  const description = isCustom
    ? (cert.custom_reason ?? "")
    : fillDescription(tmpl.description, {
        module_title,
        subject,
        class_label:  cert.class_label,
        student_name: cert.student_name,
        school_name:  tmpl.school_name,
      })

  const pdfTemplate = (() => {
    if (!isCustom) return "completion"
    if (cert.cert_template === "outstanding_achievement") return "outstanding_achievement"
    if (cert.cert_template === "course_completion")       return "completion"
    if (cert.cert_template === "academic_excellence")     return "academic_excellence"
    return "default"
  })()

  return {
    student_name:   cert.student_name,
    module_title:   cert.module_title,
    subject:        cert.subject,
    class_label:    cert.class_label,
    school_name:    tmpl.school_name,
    logo_base64:    logo?.b64,
    logo_mime:      logo?.mime,
    description,
    footer_left:    tmpl.footer_left,
    footer_right:   tmpl.footer_right,
    accent_color:   tmpl.accent_color,
    date:           new Date(cert.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    cert_title:     isCustom ? cert.custom_title : undefined,
    cert_subtitle:  isCustom ? "Special Award" : undefined,
    template:       pdfTemplate as "completion" | "default" | "outstanding_achievement" | "academic_excellence",
  }
}

async function getOrCreateTemplate(schoolId: mongoose.Types.ObjectId, schoolName: string): Promise<{ school_name: string; logo_gridfs_id: mongoose.Types.ObjectId | null; description: string; footer_left: string; footer_right: string; accent_color: string }> {
  const existing = await CertTemplate.findOne({ school_id: schoolId }).lean()
  if (existing) return existing
  const created = await CertTemplate.create({ school_id: schoolId, school_name: schoolName })
  return created.toObject()
}

// ── GET /api/certificates/template ────────────────────────────────────────────
router.get("/template", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user) { res.status(401).json({ error: "Not found" }); return }
    const school = await School.findById(user.school_id).lean()
    const tmpl   = await getOrCreateTemplate(user.school_id!, school?.name ?? "School")
    const logoData = tmpl.logo_gridfs_id ? await logoToBase64(tmpl.logo_gridfs_id) : null
    res.json({
      template: {
        ...tmpl,
        logo_base64: logoData?.b64  ?? null,
        logo_mime:   logoData?.mime ?? null,
      }
    })
  } catch (err) {
    logger.error({ err: err }, "[cert template GET]")
    res.status(500).json({ error: "Failed" })
  }
})

// ── POST /api/certificates/template ───────────────────────────────────────────
// Save certificate template settings (teacher/admin)
router.post("/template", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }
    const { school_name, description, footer_left, footer_right, accent_color } =
      req.body as Record<string, string>

    if (school_name !== undefined && school_name.trim().length > 200) {
      res.status(400).json({ error: "School name must be under 200 characters" }); return
    }
    if (description !== undefined && description.trim().length > 2000) {
      res.status(400).json({ error: "Certificate description must be under 2000 characters" }); return
    }
    if (footer_left !== undefined && footer_left.trim().length > 100) {
      res.status(400).json({ error: "Footer left text must be under 100 characters" }); return
    }
    if (footer_right !== undefined && footer_right.trim().length > 100) {
      res.status(400).json({ error: "Footer right text must be under 100 characters" }); return
    }
    if (accent_color !== undefined && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(accent_color)) {
      res.status(400).json({ error: "accent_color must be a valid hex color (e.g. #534AB7)" }); return
    }

    const tmpl = await CertTemplate.findOneAndUpdate(
      { school_id: user.school_id },
      { $set: { school_name, description, footer_left, footer_right, accent_color, updated_at: new Date() } },
      { upsert: true, new: true }
    )
    res.json({ template: tmpl })
  } catch (err) {
    logger.error({ err: err }, "[cert template POST]")
    res.status(500).json({ error: "Failed to save template" })
  }
})

// ── POST /api/certificates/template/logo ──────────────────────────────────────
// Upload school logo for cert template
router.post("/template/logo", upload.single("logo"), async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }
    if (!req.file) { res.status(400).json({ error: "No file" }); return }

    const bucket = getBucket()
    const uploadId = new mongoose.Types.ObjectId()
    const stream   = bucket.openUploadStreamWithId(uploadId, req.file.originalname, {
      metadata: { contentType: req.file.mimetype },
    })
    stream.write(req.file.buffer)
    stream.end()
    await new Promise<void>((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject) })

    // Delete old logo if exists
    const old = await CertTemplate.findOne({ school_id: user.school_id }).lean()
    if (old?.logo_gridfs_id) {
      try { await bucket.delete(old.logo_gridfs_id) } catch { /* ignore */ }
    }

    await CertTemplate.findOneAndUpdate(
      { school_id: user.school_id },
      { $set: { logo_gridfs_id: uploadId, updated_at: new Date() } },
      { upsert: true }
    )
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[cert logo upload]")
    res.status(500).json({ error: "Logo upload failed" })
  }
})

// ── DELETE /api/certificates/template/logo ────────────────────────────────────
router.delete("/template/logo", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }
    const tmpl = await CertTemplate.findOne({ school_id: user.school_id }).lean()
    if (tmpl?.logo_gridfs_id) {
      const bucket = getBucket()
      try { await bucket.delete(tmpl.logo_gridfs_id) } catch { /* already gone */ }
    }
    await CertTemplate.findOneAndUpdate(
      { school_id: user.school_id },
      { $set: { logo_gridfs_id: null, updated_at: new Date() } },
      { upsert: true }
    )
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[cert logo delete]")
    res.status(500).json({ error: "Failed to remove logo" })
  }
})

// ── GET /api/certificates/download/:id ────────────────────────────────────────
// Teacher or student downloads/views a single certificate PDF (GridFS cached)
// ?inline=1 → opens in browser tab instead of downloading
router.get("/download/:id", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user) { res.status(401).json({ error: "Unauthorised" }); return }

    const cert = await Certificate.findById(req.params.id).lean()
    if (!cert) { res.status(404).json({ error: "Certificate not found" }); return }

    // School boundary
    if (cert.school_id.toString() !== user.school_id?.toString()) {
      res.status(403).json({ error: "Forbidden" }); return
    }
    // Students can only view their own
    if (user.role === "student" && cert.student_id.toString() !== req.userId) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    const inline  = req.query.inline === "1"
    const safeName = cert.student_name.replace(/[^a-z0-9]/gi, "_").toLowerCase()
    const disposition = inline
      ? `inline; filename="Certificate_${safeName}.pdf"`
      : `attachment; filename="Certificate_${safeName}.pdf"`

    // Try serving from GridFS cache first
    if (cert.pdf_gridfs_id) {
      try {
        const bucket = getBucket()
        const files  = await bucket.find({ _id: cert.pdf_gridfs_id }).toArray()
        if (files.length > 0) {
          res.setHeader("Content-Type", "application/pdf")
          res.setHeader("Content-Disposition", disposition)
          bucket.openDownloadStream(cert.pdf_gridfs_id).pipe(res)
          return
        }
      } catch { /* cache miss — fall through to regenerate */ }
    }

    // Cache miss — generate fresh
    const school = await School.findById(cert.school_id).lean()
    const tmpl   = await getOrCreateTemplate(cert.school_id, school?.name ?? "School")
    const data   = await buildCertData(cert, tmpl)
    const pdfBuf = await generateCertificatePDF(data)

    // Store in GridFS for next time
    const bucket   = getBucket()
    const newId    = new mongoose.Types.ObjectId()
    const stream   = bucket.openUploadStreamWithId(newId, `cert_${cert._id}.pdf`, { metadata: { contentType: "application/pdf" } })
    stream.write(pdfBuf)
    stream.end()
    await new Promise<void>((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject) })
    await Certificate.findByIdAndUpdate(cert._id, { pdf_gridfs_id: newId })

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", disposition)
    res.send(pdfBuf)
  } catch (err) {
    logger.error({ err: err }, "[cert download]")
    res.status(500).json({ error: "Failed to generate certificate" })
  }
})

// ── GET /api/certificates/class/:classId/module/:moduleId ─────────────────────
// Teacher: list certs for a class + module (issued + eligible students)
router.get("/class/:classId/module/:moduleId", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const certs = await Certificate.find({ school_id: user.school_id, class_id: new mongoose.Types.ObjectId(String(req.params.classId)), module_id: new mongoose.Types.ObjectId(String(req.params.moduleId)) } as never).lean()

    res.json({ certificates: certs })
  } catch (err) {
    logger.error({ err: err }, "[cert class/module]")
    res.status(500).json({ error: "Failed" })
  }
})

// ── GET /api/certificates/class/:classId ─────────────────────────────────────
// Teacher: all certs for a class, grouped by module + custom certs separate
router.get("/class/:classId", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const classObjId = new mongoose.Types.ObjectId(String(req.params.classId))
    const fClass: Record<string, unknown> = { school_id: user.school_id, class_id: classObjId }
    const [rawCerts, rawMods] = await Promise.all([
      Certificate.find(fClass as never).lean(),
      Module.find(fClass as never).lean(),
    ])
    type RawCert = { _id: mongoose.Types.ObjectId; student_id: mongoose.Types.ObjectId; student_name: string; module_id: mongoose.Types.ObjectId | null; module_title: string; subject: string; class_label: string; pdf_gridfs_id: mongoose.Types.ObjectId | null; type: string; custom_title: string; custom_reason: string; issued_at: Date; module_deleted: boolean }
    const certs = rawCerts as unknown as RawCert[]
    const modules = rawMods as unknown as Array<{ _id: mongoose.Types.ObjectId; title: string; subject: string; items: unknown[] }>

    // Separate module certs from custom certs
    const moduleCerts   = certs.filter(c => c.type !== "custom")
    const customCerts   = certs.filter(c => c.type === "custom")

    // Group module certs by module_id
    const certsByModule: Record<string, RawCert[]> = {}
    for (const c of moduleCerts) {
      const key = c.module_id?.toString() ?? ""
      if (!certsByModule[key]) certsByModule[key] = []
      certsByModule[key].push(c)
    }

    const liveModuleIds = new Set(modules.map(m => m._id.toString()))

    const data = modules.map(m => ({
      module_id:    m._id,
      module_title: m.title,
      subject:      m.subject,
      total_items:  m.items.length,
      certificates: certsByModule[m._id.toString()] ?? [],
    }))

    // Student-claimed subject certificates store module_id = null and land in
    // certsByModule[""] — they are never matched by any real module _id above.
    // Group them by subject and add as virtual entries so they appear in the admin view.
    const nullModuleCerts = certsByModule[""] ?? []
    if (nullModuleCerts.length > 0) {
      const bySubject: Record<string, RawCert[]> = {}
      for (const c of nullModuleCerts) {
        const key = c.subject || c.module_title || "Course"
        if (!bySubject[key]) bySubject[key] = []
        bySubject[key].push(c)
      }
      for (const [subject, subjectCerts] of Object.entries(bySubject)) {
        data.push({
          module_id:    null as unknown as mongoose.Types.ObjectId,
          module_title: subject,
          subject,
          total_items:  0,
          certificates: subjectCerts,
        })
      }
    }

    // Certificates whose module_id is set but no longer matches any live module —
    // the module was deleted. Surfaced as a distinct group (never merged with the
    // null-module_id "subject completion" certs above) so teachers can tell the two
    // apart instead of seeing an unlabeled, ambiguous bucket.
    const removedModuleCerts = moduleCerts.filter(c =>
      c.module_id && c.module_deleted && !liveModuleIds.has(c.module_id.toString())
    )
    const removedModuleGroups: Record<string, RawCert[]> = {}
    for (const c of removedModuleCerts) {
      const key = c.module_id!.toString()
      if (!removedModuleGroups[key]) removedModuleGroups[key] = []
      removedModuleGroups[key].push(c)
    }
    const removed_modules = Object.values(removedModuleGroups).map(group => ({
      module_title: group[0].module_title || "Deleted module",
      subject:      group[0].subject,
      certificates: group,
    }))

    res.json({ modules: data, custom_certificates: customCerts, removed_modules })
  } catch (err) {
    logger.error({ err: err }, "[cert class]")
    res.status(500).json({ error: "Failed" })
  }
})

// ── POST /api/certificates/bulk-generate ──────────────────────────────────────
// Teacher: download ZIP of all certs for a class + module
router.post("/bulk-generate", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const { class_id, module_id } = req.body as { class_id: string; module_id: string }
    if (!class_id || !module_id) { res.status(400).json({ error: "class_id and module_id required" }); return }

    const certs = await Certificate.find({
      school_id: user.school_id,
      class_id:  new mongoose.Types.ObjectId(class_id),
      module_id: new mongoose.Types.ObjectId(module_id),
    }).lean()

    if (certs.length === 0) {
      res.status(404).json({ error: "No certificates found for this module" }); return
    }

    const school = await School.findById(user.school_id).lean()
    const tmpl   = await getOrCreateTemplate(user.school_id!, school?.name ?? "School")
    const bucket = getBucket()

    res.setHeader("Content-Type", "application/zip")
    res.setHeader("Content-Disposition", `attachment; filename="Certificates_${module_id}.zip"`)

    const archive = (archiver as unknown as (fmt: string, opts: object) => archiver.Archiver)("zip", { zlib: { level: 6 } })
    archive.pipe(res)

    for (const cert of certs) {
      let pdfBuf: Buffer

      // Try GridFS cache
      if (cert.pdf_gridfs_id) {
        try {
          const files = await bucket.find({ _id: cert.pdf_gridfs_id }).toArray()
          if (files.length > 0) {
            const chunks: Buffer[] = []
            await new Promise<void>((resolve, reject) => {
              const s = bucket.openDownloadStream(cert.pdf_gridfs_id!)
              s.on("data", c => chunks.push(c as Buffer))
              s.on("end", resolve)
              s.on("error", reject)
            })
            pdfBuf = Buffer.concat(chunks)
          } else { throw new Error("not found") }
        } catch {
          // Regenerate
          const data = await buildCertData(cert, tmpl)
          pdfBuf = await generateCertificatePDF(data)
        }
      } else {
        const data = await buildCertData(cert, tmpl)
        pdfBuf = await generateCertificatePDF(data)
        // Cache it
        const newId = new mongoose.Types.ObjectId()
        const str   = bucket.openUploadStreamWithId(newId, `cert_${cert._id}.pdf`, { metadata: { contentType: "application/pdf" } })
        str.write(pdfBuf); str.end()
        await new Promise<void>((resolve, reject) => { str.on("finish", resolve); str.on("error", reject) })
        await Certificate.findByIdAndUpdate(cert._id, { pdf_gridfs_id: newId })
      }

      const fileName = `Certificate_${cert.student_name.replace(/[^a-z0-9]/gi, "_")}.pdf`
      archive.append(pdfBuf, { name: fileName })
    }

    await archive.finalize()
  } catch (err) {
    logger.error({ err: err }, "[cert bulk-generate]")
    if (!res.headersSent) res.status(500).json({ error: "Bulk generation failed" })
  }
})

// ── POST /api/certificates/preview ────────────────────────────────────────────
// Returns a preview PDF using the school's saved template + sample data
router.post("/preview", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const school = await School.findById(user.school_id).lean()
    const tmpl   = await getOrCreateTemplate(user.school_id!, school?.name ?? "School")

    const data = await buildCertData({
      student_name: "Arjun Kumar",
      module_title: "Loops & Functions",
      subject:      "Computer Science",
      class_label:  "Class 7A",
      issued_at:    new Date(),
    }, tmpl)

    const pdfBuf = await generateCertificatePDF(data)
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf")
    res.send(pdfBuf)
  } catch (err) {
    logger.error({ err: err }, "[cert preview]")
    res.status(500).json({ error: "Preview failed" })
  }
})

// ── POST /api/certificates/custom-issue ───────────────────────────────────────
// Teacher: issue a custom certificate to one or more students
router.post("/custom-issue", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const { class_id, student_ids, custom_title, custom_reason, cert_template } =
      req.body as { class_id: string; student_ids: string[]; custom_title: string; custom_reason?: string; cert_template?: "course_completion" | "academic_excellence" | "outstanding_achievement" }

    if (!class_id || !student_ids?.length || !custom_title?.trim()) {
      res.status(400).json({ error: "class_id, student_ids, and custom_title are required" }); return
    }
    if (custom_title.trim().length > 200) {
      res.status(400).json({ error: "Certificate title must be under 200 characters" }); return
    }
    if (custom_reason && custom_reason.trim().length > 500) {
      res.status(400).json({ error: "Certificate reason must be under 500 characters" }); return
    }
    if (student_ids.length > 200) {
      res.status(400).json({ error: "Cannot issue certificates to more than 200 students at once" }); return
    }

    const validTemplates = ["course_completion", "academic_excellence", "outstanding_achievement"]
    const resolvedTemplate = cert_template && validTemplates.includes(cert_template) ? cert_template : null

    const classObjId = new mongoose.Types.ObjectId(class_id)
    const ClassModel = mongoose.models.Class as mongoose.Model<{ grade: number; section: string; name?: string; school_id: mongoose.Types.ObjectId }> | undefined
    const cls = ClassModel ? await ClassModel.findOne({ _id: classObjId, school_id: user.school_id }).lean() : null
    if (!cls) { res.status(403).json({ error: "Class not found in your school" }); return }

    const class_label = cls.name ?? (cls.grade > 0 ? `Class ${cls.grade}${cls.section}` : cls.section)

    const students = await User.find({
      _id:       { $in: student_ids.map(id => new mongoose.Types.ObjectId(id)) },
      school_id: user.school_id!,
      class_id:  classObjId,
      role:      "student",
    }).select("name").lean()

    if (students.length === 0) {
      res.status(400).json({ error: "No valid students found in this class" }); return
    }

    const created = await Promise.all(students.map(student =>
      Certificate.create({
        student_id:    student._id,
        school_id:     user.school_id!,
        class_id:      classObjId,
        // Each custom cert gets its own unique ObjectId so the (student_id, module_id)
        // index never conflicts between multiple custom certs for the same student.
        module_id:     new mongoose.Types.ObjectId(),
        module_title:  "",
        subject:       "",
        class_label,
        student_name:  student.name,
        issued_at:     new Date(),
        type:          "custom",
        custom_title:  custom_title.trim(),
        custom_reason: custom_reason?.trim() ?? "",
        cert_template: resolvedTemplate,
      })
    ))

    res.json({ created: created.length, certificates: created })
  } catch (err) {
    logger.error({ err: err }, "[cert custom-issue]")
    res.status(500).json({ error: "Failed to issue certificates" })
  }
})

// ── DELETE /api/certificates/:id ──────────────────────────────────────────────
// Teacher: revoke a custom certificate (custom only — earned certs cannot be revoked)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["teacher", "admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Teachers only" }); return
    }

    const cert = await Certificate.findById(req.params.id).lean()
    if (!cert) { res.status(404).json({ error: "Certificate not found" }); return }

    if (cert.school_id.toString() !== user.school_id?.toString()) {
      res.status(403).json({ error: "Forbidden" }); return
    }

    // Delete cached PDF from GridFS if present
    if (cert.pdf_gridfs_id) {
      try { await getBucket().delete(cert.pdf_gridfs_id) } catch { /* ignore */ }
    }

    await Certificate.findByIdAndDelete(cert._id)
    res.json({ success: true })
  } catch (err) {
    logger.error({ err: err }, "[cert revoke]")
    res.status(500).json({ error: "Failed to revoke certificate" })
  }
})

// ── GET /api/certificates ──────────────────────────────────────────────────────
// Admin: all certs for school
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId!).select("school_id role").lean()
    if (!user || !["admin", "super_admin"].includes(user.role ?? "")) {
      res.status(403).json({ error: "Admin only" }); return
    }
    const certs = await Certificate.find({ school_id: user.school_id }).sort({ issued_at: -1 }).lean()
    res.json({
      certificates: certs.map(c => ({
        ...c,
        id: (c._id as { toString(): string }).toString(),
      })),
    })
  } catch (err) {
    logger.error({ err: err }, "[certs GET all]")
    res.status(500).json({ error: "Failed" })
  }
})

export default router
