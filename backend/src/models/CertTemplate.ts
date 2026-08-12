// ─────────────────────────────────────────────────────────────────────────────
// models/CertTemplate.ts — Mongoose model for a school's certificate template.
// Unique per school. Stores the logo in GridFS and customisable fields like
// accent colour, footer names, and description text.
// Exports: ICertTemplate, CertTemplate
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface ICertTemplate extends Document {
  school_id:    mongoose.Types.ObjectId  // unique per school
  school_name:  string
  logo_gridfs_id: mongoose.Types.ObjectId | null  // school logo stored in GridFS
  description:  string   // e.g. "for completing {module} in {subject}"
  footer_left:  string   // e.g. teacher name / "Class Teacher"
  footer_right: string   // e.g. "School Principal"
  accent_color: string   // hex — default #534AB7
  updated_at:   Date
}

const schema = new mongoose.Schema<ICertTemplate>({
  school_id:      { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  school_name:    { type: String, default: "" },
  logo_gridfs_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  description:    { type: String, default: "for successfully completing {module} in {subject}" },
  footer_left:    { type: String, default: "Class Teacher" },
  footer_right:   { type: String, default: "School Principal" },
  accent_color:   { type: String, default: "#534AB7" },
  updated_at:     { type: Date, default: Date.now },
})

export const CertTemplate: Model<ICertTemplate> =
  mongoose.models.CertTemplate ?? mongoose.model<ICertTemplate>("CertTemplate", schema)
