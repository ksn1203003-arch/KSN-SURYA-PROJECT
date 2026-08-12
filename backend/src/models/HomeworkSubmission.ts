import mongoose, { type Document, type Model } from "mongoose"

export interface IHomeworkSubmission extends Document {
  homework_id:  mongoose.Types.ObjectId
  student_id:   mongoose.Types.ObjectId
  school_id:    mongoose.Types.ObjectId
  answer_text:  string
  feedback:     string
  marks:        number | null
  submitted_at: Date
  updated_at:   Date
}

const HomeworkSubmissionSchema = new mongoose.Schema<IHomeworkSubmission>({
  homework_id:  { type: mongoose.Schema.Types.ObjectId, ref: "Homework", required: true },
  student_id:   { type: mongoose.Schema.Types.ObjectId, ref: "User",     required: true },
  school_id:    { type: mongoose.Schema.Types.ObjectId, ref: "School",   required: true },
  answer_text:  { type: String, default: "", trim: true, maxlength: 5000 },
  feedback:     { type: String, default: "", trim: true, maxlength: 1000 },
  marks:        { type: Number, default: null },
  submitted_at: { type: Date, default: Date.now },
  updated_at:   { type: Date, default: Date.now },
})

HomeworkSubmissionSchema.index({ homework_id: 1, student_id: 1 }, { unique: true })
HomeworkSubmissionSchema.index({ student_id: 1 })
HomeworkSubmissionSchema.index({ school_id: 1 })

export const HomeworkSubmission: Model<IHomeworkSubmission> =
  (mongoose.models.HomeworkSubmission as Model<IHomeworkSubmission>) ??
  mongoose.model<IHomeworkSubmission>("HomeworkSubmission", HomeworkSubmissionSchema)
