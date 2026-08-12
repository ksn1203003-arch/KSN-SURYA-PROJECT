// ─────────────────────────────────────────────────────────────────────────────
// models/ModuleProgress.ts — Mongoose model for per-item lesson progress.
// One record per (student_id, module_id, item_id) — used to calculate
// completion percentage and determine certificate eligibility.
// Exports: IModuleProgress, ModuleProgress
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IModuleProgress extends Document {
  student_id: mongoose.Types.ObjectId
  module_id:  mongoose.Types.ObjectId
  item_id:    mongoose.Types.ObjectId
  viewed_at:  Date
}

const schema = new mongoose.Schema<IModuleProgress>({
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },
  module_id:  { type: mongoose.Schema.Types.ObjectId, ref: "Module", required: true },
  item_id:    { type: mongoose.Schema.Types.ObjectId, required: true },
  viewed_at:  { type: Date, default: Date.now },
})

schema.index({ student_id: 1, module_id: 1, item_id: 1 }, { unique: true })
schema.index({ student_id: 1 })
schema.index({ module_id: 1, student_id: 1 })  // teacher student-progress panel: group by module first

export const ModuleProgress: Model<IModuleProgress> =
  mongoose.models.ModuleProgress ?? mongoose.model<IModuleProgress>("ModuleProgress", schema)
