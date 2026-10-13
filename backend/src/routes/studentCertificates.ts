import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/studentCertificates.ts — Student certificate routes at /api/student-certificates.
// Students list and download their own certificates. Certificates are issued by
// teachers (routes/certificates.ts) — students can no longer claim them, and the
// old claim/eligible endpoints answer 403 so an old client cannot create one.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { validateObjectId } from "../lib/validateId.js"
import { Certificate } from "../models/Certificate.js"
import { getCertificatePdf, type CertForPdf } from "../services/certificates.js"

const router = Router()
router.use(requireAuth)

const TEACHER_ISSUES = "Certificates are now issued by your teacher once you complete a subject."

// ── GET /api/student-certificates/mine (alias /my) ───────────────────────────
async function listMine(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (req.userRole !== "student") { res.status(403).json({ error: "Students only" }); return }
    const certs = await Certificate.find({
      student_id: new mongoose.Types.ObjectId(req.userId),
      school_id:  new mongoose.Types.ObjectId(req.schoolId),
    })
      .select("student_id module_id module_title subject class_label student_name issued_at type custom_title custom_reason cert_template status revoked_at revoke_reason")
      .sort({ issued_at: -1 }).lean()
    res.json({ certificates: certs })
  } catch (err) {
    logger.error({ err }, "[student-certs mine]")
    res.status(500).json({ error: "Failed to load certificates" })
  }
}
router.get("/mine", listMine)
router.get("/my", listMine)

// ── POST /claim, GET /eligible — retired: teachers issue certificates now ────
router.post("/claim", (_req: AuthRequest, res: Response) => { res.status(403).json({ error: TEACHER_ISSUES }) })
router.get("/eligible", (_req: AuthRequest, res: Response) => { res.status(403).json({ error: TEACHER_ISSUES }) })

// ── GET /api/student-certificates/download/:id ────────────────────────────────
// Student downloads their own certificate PDF (built once, then served from GridFS)
router.get("/download/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!validateObjectId(req.params.id, res, "certificate ID")) return
    const cert = await Certificate.findById(req.params.id).lean<CertForPdf & { student_id: mongoose.Types.ObjectId; status?: string }>()
    if (!cert || cert.student_id.toString() !== req.userId || cert.school_id.toString() !== req.schoolId) {
      res.status(404).json({ error: "Certificate not found" }); return
    }
    if (cert.status === "revoked") { res.status(410).json({ error: "This certificate was revoked by your school." }); return }

    const pdf = await getCertificatePdf(cert)
    const safeName = cert.student_name.replace(/[^a-z0-9]/gi, "_").toLowerCase()
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("Content-Disposition", `${req.query.inline === "1" ? "inline" : "attachment"}; filename="Certificate_${safeName}.pdf"`)
    res.send(pdf)
  } catch (err) {
    logger.error({ err }, "[student-cert download]")
    res.status(500).json({ error: "Failed to prepare your certificate" })
  }
})

export default router
