// ─────────────────────────────────────────────────────────────────────────────
// models/CodeChallenge.ts — Mongoose model for a teacher-created coding challenge.
// Supports JavaScript, Python, and HTML challenges with optional deadlines.
// Exports: ICodeChallenge, CodeChallenge
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface ICodeChallenge extends Document {
  school_id:       mongoose.Types.ObjectId
  class_id:        mongoose.Types.ObjectId
  created_by:      mongoose.Types.ObjectId
  title:           string
  difficulty:      "Easy" | "Medium" | "Hard"
  language:        "javascript" | "python" | "html"
  description:     string
  constraints:     string
  expected_output: string
  deadline:        Date | null
  is_active:       boolean
  created_at:      Date
}

const schema = new mongoose.Schema<ICodeChallenge>({
  school_id:       { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  class_id:        { type: mongoose.Schema.Types.ObjectId, ref: "Class",  required: true },
  created_by:      { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },
  title:           { type: String, required: true },
  difficulty:      { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
  language:        { type: String, enum: ["javascript", "python", "html"], required: true },
  description:     { type: String, required: true },
  constraints:     { type: String, default: "" },
  expected_output: { type: String, default: "" },
  deadline:        { type: Date, default: null },
  is_active:       { type: Boolean, default: true },
  created_at:      { type: Date, default: Date.now },
})

schema.index({ school_id: 1, class_id: 1 })

export const CodeChallenge: Model<ICodeChallenge> =
  mongoose.models.CodeChallenge ?? mongoose.model<ICodeChallenge>("CodeChallenge", schema)
