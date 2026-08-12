// ─────────────────────────────────────────────────────────────────────────────
// models/QuizAttempt.ts — Mongoose model for a student's quiz submission.
// Stores the selected answer index for every question plus the computed score.
// Exports: IQuizAttempt, QuizAttempt
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IQuizAttempt extends Document {
  quiz_id:      mongoose.Types.ObjectId
  student_id:   mongoose.Types.ObjectId
  school_id:    mongoose.Types.ObjectId
  answers:      number[]   // chosen option index per question
  score:        number     // correct count
  total:        number     // total questions
  percentage:   number     // 0-100
  submitted_at: Date
}

const schema = new mongoose.Schema<IQuizAttempt>({
  quiz_id:      { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
  student_id:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  school_id:    { type: mongoose.Schema.Types.ObjectId, required: true },
  answers:      { type: [Number], default: [] },
  score:        { type: Number, required: true },
  total:        { type: Number, required: true },
  percentage:   { type: Number, required: true },
  submitted_at: { type: Date, default: Date.now },
})

schema.index({ student_id: 1, quiz_id: 1 })
schema.index({ school_id: 1, quiz_id: 1 })
schema.index({ student_id: 1, submitted_at: -1 })

export const QuizAttempt: Model<IQuizAttempt> =
  mongoose.models.QuizAttempt ?? mongoose.model<IQuizAttempt>("QuizAttempt", schema)
