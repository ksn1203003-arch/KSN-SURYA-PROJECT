// ─────────────────────────────────────────────────────────────────────────────
// models/Certificate.ts — Mongoose model for an issued subject certificate.
// A partial unique index on (student_id, class_id, subject) where type="module"
// prevents double-claiming the same subject certificate.
// Exports: ICertificate, Certificate
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface ICertificate extends Document {
  student_id:      mongoose.Types.ObjectId
  school_id:       mongoose.Types.ObjectId
  class_id:        mongoose.Types.ObjectId
  module_id:       mongoose.Types.ObjectId | null
  module_title:    string
  subject:         string
  class_label:     string
  student_name:    string
  issued_at:       Date
  type:            "module" | "custom"
  custom_title:    string
  custom_reason:   string
  cert_template:   "course_completion" | "academic_excellence" | "outstanding_achievement" | null
  pdf_gridfs_id?:  mongoose.Types.ObjectId | null
  module_deleted:  boolean
  // Who issued it (teacher/admin). null for certificates claimed by students before
  // teacher-issued certificates replaced self-claim.
  issued_by:       mongoose.Types.ObjectId | null
  // Revoked certificates are kept (never deleted) so the school can show what happened.
  status:          "active" | "revoked"
  revoked_at:      Date | null
  revoked_by:      mongoose.Types.ObjectId | null
  revoke_reason:   string
}

const schema = new mongoose.Schema<ICertificate>({
  student_id:    { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },
  school_id:     { type: mongoose.Schema.Types.ObjectId,                 required: true },
  class_id:      { type: mongoose.Schema.Types.ObjectId, ref: "Class",  required: true },
  module_id:     { type: mongoose.Schema.Types.ObjectId, ref: "Module", default: null },
  module_title:  { type: String, default: "" },
  subject:       { type: String, default: "" },
  class_label:   { type: String, required: true },
  student_name:  { type: String, required: true },
  issued_at:     { type: Date, default: Date.now },
  type:           { type: String, enum: ["module", "custom"], default: "module" },
  custom_title:   { type: String, default: "" },
  custom_reason:  { type: String, default: "" },
  cert_template:  { type: String, enum: ["course_completion", "academic_excellence", "outstanding_achievement", null], default: null },
  pdf_gridfs_id:  { type: mongoose.Schema.Types.ObjectId, default: null },
  module_deleted: { type: Boolean, default: false },
  issued_by:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status:         { type: String, enum: ["active", "revoked"], default: "active" },
  revoked_at:     { type: Date, default: null },
  revoked_by:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  revoke_reason:  { type: String, default: "", maxlength: 300 },
})

schema.index({ school_id: 1 })
schema.index({ student_id: 1 })
// Partial unique index: one subject cert per (student, class, subject) — enforced only for type:"module"
schema.index(
  { student_id: 1, class_id: 1, subject: 1 },
  { unique: true, partialFilterExpression: { type: "module" } }
)

export const Certificate: Model<ICertificate> =
  mongoose.models.Certificate ?? mongoose.model<ICertificate>("Certificate", schema)
