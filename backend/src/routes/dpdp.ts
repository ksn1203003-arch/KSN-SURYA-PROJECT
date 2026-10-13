import { Router, type Response } from "express"
import mongoose from "mongoose"
import { requireAuth, type AuthRequest } from "../middleware/auth.js"
import { DataDeletionRequest } from "../models/DataDeletionRequest.js"
import { User } from "../models/User.js"
import { AuditLog } from "../models/AuditLog.js"
import { logger } from "../lib/logger.js"
import { deleteStoredReportCards } from "../services/reportCardPdf.js"
import { StudentEnrollment } from "../models/StudentEnrollment.js"
import { withRetry } from "../lib/retry.js"

const router = Router()
router.use(requireAuth)

// POST /api/dpdp/deletion-request — user submits a data deletion request
router.post("/deletion-request", async (req: AuthRequest, res: Response) => {
  const { reason } = req.body as { reason?: string }

  const user = await User.findById(req.userId).select("name email school_id role").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const existing = await DataDeletionRequest.findOne({
    user_id: req.userId,
    status:  "pending",
  }).lean()
  if (existing) {
    return void res.status(409).json({ error: "You already have a pending deletion request." })
  }

  if (!user.school_id) return void res.status(400).json({ error: "User is not associated with a school." })

  const request = await DataDeletionRequest.create({
    user_id:    new mongoose.Types.ObjectId(req.userId!),
    user_name:  user.name as string,
    user_email: user.email ?? "",
    user_role:  user.role as string,
    school_id:  user.school_id,
    reason:     (reason ?? "").trim().slice(0, 500),
  })

  res.status(201).json({ success: true, request_id: request._id.toString() })
})

// GET /api/dpdp/deletion-requests — admin views all pending requests for their school
router.get("/deletion-requests", async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    return void res.status(403).json({ error: "Admins only" })
  }
  const user = await User.findById(req.userId).select("school_id").lean()
  if (!user) return void res.status(401).json({ error: "User not found" })

  const requests = await DataDeletionRequest.find({
    school_id: user.school_id,
  })
    .sort({ created_at: -1 })
    .lean()

  res.json({ requests })
})

// PATCH /api/dpdp/deletion-requests/:id — admin approves or rejects
router.patch("/deletion-requests/:id", async (req: AuthRequest, res: Response) => {
  if (req.userRole !== "admin" && req.userRole !== "super_admin") {
    return void res.status(403).json({ error: "Admins only" })
  }
  const { action } = req.body as { action: "approve" | "reject" }
  if (action !== "approve" && action !== "reject") {
    return void res.status(400).json({ error: "action must be 'approve' or 'reject'" })
  }

  const admin = await User.findById(req.userId).select("school_id").lean()
  if (!admin) return void res.status(401).json({ error: "Admin not found" })

  const request = await DataDeletionRequest.findOne({
    _id:       req.params.id,
    school_id: admin.school_id,
    status:    "pending",
  })
  if (!request) return void res.status(404).json({ error: "Request not found or already reviewed" })

  request.status      = action === "approve" ? "approved" : "rejected"
  request.reviewed_at = new Date()
  request.reviewed_by = req.userId as unknown as import("mongoose").Types.ObjectId
  await request.save()

  let historyErased = true
  if (action === "approve") {
    await User.findByIdAndUpdate(request.user_id, { is_active: false })
    await deleteStoredReportCards(String(request.user_id)).catch(err =>
      logger.error({ err }, "[dpdp] could not remove stored report cards"))
    // The student's class history goes with the rest of his data. A failure is retried, then recorded in the audit entry.
    try {
      await withRetry(() => StudentEnrollment.deleteMany({ student_id: request.user_id, school_id: admin.school_id }).exec(), 3, 200)
    } catch (err) {
      historyErased = false
      logger.error({ err }, "[dpdp] could not remove class history")
    }
  }

  // Write to AuditLog — DPDP Act 2023 requires a record of every approve/reject decision
  try {
    await AuditLog.create({
      school_id:     admin.school_id,
      actor_id:      new mongoose.Types.ObjectId(req.userId!),
      actor_role:    req.userRole ?? "admin",
      action:        action === "approve" ? "dpdp.deletion_approved" : "dpdp.deletion_rejected",
      resource_type: "DataDeletionRequest",
      resource_id:   request._id.toString(),
      before:        { status: "pending" },
      after:         { status: request.status, user_id: request.user_id.toString(), user_email: request.user_email, ...(action === "approve" ? { history_erased: historyErased } : {}) },
      ip:            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? null,
    })
  } catch (auditErr) {
    logger.error({ err: auditErr }, "[dpdp] Failed to write AuditLog entry — action still succeeded")
  }

  res.json({ success: true, status: request.status })
})

export default router
