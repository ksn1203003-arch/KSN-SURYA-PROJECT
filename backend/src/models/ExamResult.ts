import mongoose, { type Document } from "mongoose"

export interface IExamResult extends Document {
  exam_id:         mongoose.Types.ObjectId
  student_id:      mongoose.Types.ObjectId
  school_id:       mongoose.Types.ObjectId
  class_id:        mongoose.Types.ObjectId
  subject:         string
  marks_obtained:  number | null
  is_absent:       boolean
}

const examResultSchema = new mongoose.Schema<IExamResult>({
  exam_id:        { type: mongoose.Schema.Types.ObjectId, ref: "ExamDefinition", required: true },
  student_id:     { type: mongoose.Schema.Types.ObjectId, ref: "User",           required: true },
  school_id:      { type: mongoose.Schema.Types.ObjectId, ref: "School",         required: true },
  class_id:       { type: mongoose.Schema.Types.ObjectId, ref: "Class",          required: true },
  subject:        { type: String, required: true, trim: true },
  marks_obtained: { type: Number, default: null },
  is_absent:      { type: Boolean, default: false },
})

examResultSchema.index({ exam_id: 1, student_id: 1, subject: 1 }, { unique: true })
examResultSchema.index({ student_id: 1, school_id: 1 })
examResultSchema.index({ exam_id: 1, school_id: 1 })

export const ExamResult =
  (mongoose.models.ExamResult as mongoose.Model<IExamResult>) ??
  mongoose.model<IExamResult>("ExamResult", examResultSchema)
