// ─────────────────────────────────────────────────────────────────────────────
// models/TeacherSession.ts — Mongoose model for teacher login/logout sessions.
// Records one entry per teacher per day in IST. Duration is computed on logout
// and used for teacher activity reporting.
// Exports: ITeacherSession, TeacherSession
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface ITeacherSession extends Document {
  teacher_id: mongoose.Types.ObjectId
  school_id:  mongoose.Types.ObjectId
  date:       string   // YYYY-MM-DD in IST
  login_at:   Date
  logout_at:  Date | null
  duration_minutes: number  // filled on logout
}

const schema = new mongoose.Schema<ITeacherSession>({
  teacher_id:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  school_id:        { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  date:             { type: String, required: true },
  login_at:         { type: Date, required: true },
  logout_at:        { type: Date, default: null },
  duration_minutes: { type: Number, default: 0 },
})

schema.index({ teacher_id: 1, date: 1 })
schema.index({ school_id: 1, date: 1 })

export const TeacherSession: Model<ITeacherSession> =
  mongoose.models.TeacherSession ??
  mongoose.model<ITeacherSession>("TeacherSession", schema)
