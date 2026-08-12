import mongoose, { type Document, type Model } from "mongoose"

export interface IAttendanceRecord {
  student_id:   mongoose.Types.ObjectId
  student_name: string
  status:       "present" | "absent" | "late"
}

export interface IAttendance extends Document {
  school_id:  mongoose.Types.ObjectId
  class_id:   mongoose.Types.ObjectId
  teacher_id: mongoose.Types.ObjectId
  date:       string   // YYYY-MM-DD
  period:     number   // 1–8
  subject:    string
  records:    IAttendanceRecord[]
  createdAt:  Date
  updatedAt:  Date
}

const attendanceSchema = new mongoose.Schema<IAttendance>({
  school_id:  { type: mongoose.Schema.Types.ObjectId },
  class_id:   { type: mongoose.Schema.Types.ObjectId, required: true },
  teacher_id: { type: mongoose.Schema.Types.ObjectId },
  date:       { type: String, required: true },
  period:     { type: Number, required: true, min: 1, max: 8 },
  subject:    { type: String, default: "" },
  records: [{
    student_id:   { type: mongoose.Schema.Types.ObjectId },
    student_name: { type: String },
    status:       { type: String, enum: ["present", "absent", "late"], default: "present" },
  }],
}, { timestamps: true })

// Unique per class + date + period — one attendance record per period per day
attendanceSchema.index({ class_id: 1, date: 1, period: 1 }, { unique: true })
attendanceSchema.index({ school_id: 1, date: 1 })
// Enables efficient per-student attendance history queries
attendanceSchema.index({ class_id: 1, "records.student_id": 1 })

export const Attendance: Model<IAttendance> =
  mongoose.models.Attendance ?? mongoose.model<IAttendance>("Attendance", attendanceSchema)
