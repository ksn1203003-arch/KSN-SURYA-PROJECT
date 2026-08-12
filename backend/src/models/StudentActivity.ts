// ─────────────────────────────────────────────────────────────────────────────
// models/StudentActivity.ts — Mongoose model for daily student activity.
// One record per (student_id, date). Tracks items viewed, logins, and active
// minutes (capped at 600/day). Drives the dashboard weekly activity chart.
// Exports: IStudentActivity, StudentActivity
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IStudentActivity extends Document {
  student_id:    mongoose.Types.ObjectId
  school_id:     mongoose.Types.ObjectId
  date:          string   // "YYYY-MM-DD" — one record per student per day
  items_viewed:  number
  logins:        number
  minutes_active: number  // incremented by 5 per ping after first login
}

const schema = new mongoose.Schema<IStudentActivity>({
  student_id:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  school_id:     { type: mongoose.Schema.Types.ObjectId, required: true },
  date:          { type: String, required: true },  // "2026-05-30"
  items_viewed:  { type: Number, default: 0 },
  logins:        { type: Number, default: 0 },
  minutes_active:{ type: Number, default: 0 },
})

schema.index({ student_id: 1, date: 1 }, { unique: true })
schema.index({ school_id: 1, date: 1 })

export const StudentActivity: Model<IStudentActivity> =
  mongoose.models.StudentActivity ?? mongoose.model<IStudentActivity>("StudentActivity", schema)
