// ─────────────────────────────────────────────────────────────────────────────
// models/ChallengeSubmission.ts — Mongoose model for a student's code submission.
// Unique per (challenge_id, student_id) — re-submissions overwrite the previous
// code via findOneAndUpdate with upsert:true. Never use create() here.
// Exports: IChallengeSubmission, ChallengeSubmission
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IChallengeSubmission extends Document {
  challenge_id: mongoose.Types.ObjectId
  student_id:   mongoose.Types.ObjectId
  school_id:    mongoose.Types.ObjectId
  code:         string
  language:     string
  submitted_at: Date
}

const schema = new mongoose.Schema<IChallengeSubmission>({
  challenge_id: { type: mongoose.Schema.Types.ObjectId, ref: "CodeChallenge", required: true },
  student_id:   { type: mongoose.Schema.Types.ObjectId, ref: "User",          required: true },
  school_id:    { type: mongoose.Schema.Types.ObjectId,                        required: true },
  code:         { type: String, required: true },
  language:     { type: String, required: true },
  submitted_at: { type: Date, default: Date.now },
})

schema.index({ student_id: 1, challenge_id: 1 })

export const ChallengeSubmission: Model<IChallengeSubmission> =
  mongoose.models.ChallengeSubmission ??
  mongoose.model<IChallengeSubmission>("ChallengeSubmission", schema)
