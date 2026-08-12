import mongoose, { type Document } from "mongoose"

export interface IGradeScale {
  min: number
  grade: string
  label: string
}

export interface ISubjectConfig {
  name: string
  max_marks: number
}

export interface IExamDefinition extends Document {
  school_id: mongoose.Types.ObjectId
  class_id: mongoose.Types.ObjectId
  title: string
  exam_type: "unit_test" | "mid_term" | "final" | "practical" | "other"
  date: Date
  subjects: ISubjectConfig[]
  grade_scale: IGradeScale[]
  created_by: mongoose.Types.ObjectId
  created_at: Date
}

const DEFAULT_GRADE_SCALE: IGradeScale[] = [
  { min: 90, grade: "A+", label: "Outstanding" },
  { min: 80, grade: "A",  label: "Excellent" },
  { min: 70, grade: "B+", label: "Very Good" },
  { min: 60, grade: "B",  label: "Good" },
  { min: 50, grade: "C",  label: "Average" },
  { min: 40, grade: "D",  label: "Below Average" },
  { min: 0,  grade: "F",  label: "Fail" },
]

const subjectConfigSchema = new mongoose.Schema<ISubjectConfig>({
  name:      { type: String, required: true, trim: true },
  max_marks: { type: Number, required: true, min: 1 },
}, { _id: false })

const gradeScaleSchema = new mongoose.Schema<IGradeScale>({
  min:   { type: Number, required: true },
  grade: { type: String, required: true },
  label: { type: String, required: true },
}, { _id: false })

const examDefinitionSchema = new mongoose.Schema<IExamDefinition>({
  school_id:   { type: mongoose.Schema.Types.ObjectId, ref: "School",  required: true },
  class_id:    { type: mongoose.Schema.Types.ObjectId, ref: "Class",   required: true },
  title:       { type: String, required: true, trim: true },
  exam_type:   { type: String, enum: ["unit_test", "mid_term", "final", "practical", "other"], default: "unit_test" },
  date:        { type: Date, required: true },
  subjects:    { type: [subjectConfigSchema], default: [] },
  grade_scale: { type: [gradeScaleSchema],   default: DEFAULT_GRADE_SCALE },
  created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  created_at:  { type: Date, default: Date.now },
})

examDefinitionSchema.index({ school_id: 1, class_id: 1, created_at: -1 })

export const ExamDefinition =
  (mongoose.models.ExamDefinition as mongoose.Model<IExamDefinition>) ??
  mongoose.model<IExamDefinition>("ExamDefinition", examDefinitionSchema)
