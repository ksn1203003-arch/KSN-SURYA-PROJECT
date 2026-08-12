// ─────────────────────────────────────────────────────────────────────────────
// models/School.ts — Mongoose model for a registered school.
// Every other document in the system references a school_id for multi-tenancy.
// Exports: ISchool, School
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

// Storage quota limits per plan (bytes)
export const PLAN_STORAGE_QUOTAS: Record<string, number> = {
  free:     2  * 1024 * 1024 * 1024,  // 2 GB
  starter:  10 * 1024 * 1024 * 1024,  // 10 GB
  standard: 50 * 1024 * 1024 * 1024,  // 50 GB
  premium:  200 * 1024 * 1024 * 1024, // 200 GB
}

// Features gated per plan. A school must be at or above the minimum plan to access the feature.
export const PLAN_ORDER: Record<string, number> = { free: 0, starter: 1, standard: 2, premium: 3 }

export interface ISchool extends Document {
  name: string
  board: string
  city: string | null
  state: string | null
  udise_code: string | null
  subscription_plan: "free" | "starter" | "standard" | "premium"
  two_factor_enabled: boolean
  storage_used_bytes: number
  created_at: Date
}

const schoolSchema = new mongoose.Schema<ISchool>({
  name:                { type: String, required: true },
  board:               { type: String, required: true },
  city:                { type: String, default: null },
  state:               { type: String, default: null },
  udise_code:          { type: String, default: null },
  subscription_plan:   { type: String, enum: ["free", "starter", "standard", "premium"], default: "free" },
  two_factor_enabled:  { type: Boolean, default: false },
  storage_used_bytes:  { type: Number, default: 0, min: 0 },
  created_at:          { type: Date, default: Date.now },
})

schoolSchema.index({ udise_code: 1 }, { unique: true, sparse: true })

export const School: Model<ISchool> = mongoose.models.School ?? mongoose.model<ISchool>("School", schoolSchema)
