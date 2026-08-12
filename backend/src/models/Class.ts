// ─────────────────────────────────────────────────────────────────────────────
// models/Class.ts — Mongoose model for a school class (e.g. "Grade 5 – A").
// Stores the timetable as an embedded array and keeps the last 10 timetable
// snapshots in timetable_versions[] for admin audit.
// Exports: IClass, IClassTeacher, ITimetableSlot, Class
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IClassTeacher {
  teacher_id: mongoose.Types.ObjectId
  subject: string
}

export interface ITimetableSlot {
  day: string        // "Monday" … "Saturday"
  period: number     // 1-8
  subject: string
  teacher_id: mongoose.Types.ObjectId | null
  start_time: string // "09:00"
  end_time: string   // "09:45"
}

export interface ITimetableVersion {
  slots: ITimetableSlot[]
  updated_by_id: mongoose.Types.ObjectId
  updated_by_name: string
  updated_at: Date
}

export interface IClass extends Document {
  school_id: mongoose.Types.ObjectId
  grade: number
  section: string
  name: string | null                          // custom class name e.g. "Orchids"
  subjects: string[]                           // subjects taught in this class
  teacher_id: mongoose.Types.ObjectId | null  // legacy: primary teacher
  teachers: IClassTeacher[]                    // subject-based multi-teacher
  timetable: ITimetableSlot[]                  // current weekly timetable
  timetable_versions: ITimetableVersion[]      // last 10 versions for audit
  timetable_updated_by_id: mongoose.Types.ObjectId | null
  timetable_updated_by_name: string | null
  timetable_updated_at: Date | null
  created_at: Date
}

const classTeacherSchema = new mongoose.Schema<IClassTeacher>({
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  subject:    { type: String, required: true },
}, { _id: false })

const timetableSlotSchema = new mongoose.Schema<ITimetableSlot>({
  day:        { type: String, required: true },
  period:     { type: Number, required: true },
  subject:    { type: String, required: true },
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  start_time: { type: String, required: true },
  end_time:   { type: String, required: true },
}, { _id: false })

const timetableVersionSchema = new mongoose.Schema({
  slots:             { type: [timetableSlotSchema], default: [] },
  updated_by_id:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updated_by_name:  { type: String, required: true },
  updated_at:       { type: Date, default: Date.now },
}, { _id: false })

const classSchema = new mongoose.Schema<IClass>({
  school_id:  { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  grade:      { type: Number, default: 0 },
  section:    { type: String, default: "" },
  name:       { type: String, default: null },
  subjects:   { type: [String], default: [] },
  teacher_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  teachers:   { type: [classTeacherSchema], default: [] },
  timetable:  { type: [timetableSlotSchema], default: [] },
  timetable_versions:         { type: [timetableVersionSchema], default: [] },
  timetable_updated_by_id:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  timetable_updated_by_name: { type: String, default: null },
  timetable_updated_at:      { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
})

classSchema.index({ school_id: 1, grade: 1, section: 1 }, { unique: true })

export const Class: Model<IClass> = mongoose.models.Class ?? mongoose.model<IClass>("Class", classSchema)
