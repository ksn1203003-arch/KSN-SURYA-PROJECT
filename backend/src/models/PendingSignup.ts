// ─────────────────────────────────────────────────────────────────────────────
// models/PendingSignup.ts — Mongoose model for school signup applications.
// Captures all details submitted via the public signup form. Status transitions
// from "pending" to "approved" or "rejected" via HMAC-protected email links.
// Exports: IPendingSignup, PendingSignup
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IPendingSignup extends Document {
  school_name: string
  board: string
  city: string
  state: string
  total_students: number
  admin_name: string
  admin_email: string
  admin_phone: string
  first_class_grade: number | null
  first_class_section: string | null
  first_class_name: string | null
  first_class_students: number | null
  first_teacher_name: string | null
  first_teacher_email: string | null
  first_teacher_phone: string | null
  status: "pending" | "approved" | "rejected"
  reviewed_at: Date | null
  created_at: Date
}

const pendingSignupSchema = new mongoose.Schema<IPendingSignup>({
  school_name:          { type: String, required: true },
  board:                { type: String, required: true },
  city:                 { type: String, required: true },
  state:                { type: String, required: true },
  total_students:       { type: Number, default: 0 },
  admin_name:           { type: String, required: true },
  admin_email:          { type: String, required: true, lowercase: true },
  admin_phone:          { type: String, required: true },
  first_class_grade:    { type: Number, default: null },
  first_class_section:  { type: String, default: null },
  first_class_name:     { type: String, default: null },
  first_class_students: { type: Number, default: null },
  first_teacher_name:   { type: String, default: null },
  first_teacher_email:  { type: String, default: null },
  first_teacher_phone:  { type: String, default: null },
  status:               { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  reviewed_at:          { type: Date, default: null },
  created_at:           { type: Date, default: Date.now },
})

pendingSignupSchema.index({ admin_email: 1 }, { unique: true, sparse: true })

export const PendingSignup: Model<IPendingSignup> = mongoose.models.PendingSignup ?? mongoose.model<IPendingSignup>("PendingSignup", pendingSignupSchema)
