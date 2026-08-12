import mongoose, { type Document, type Model } from "mongoose"

export interface IHomework extends Document {
  school_id:   mongoose.Types.ObjectId
  class_id:    mongoose.Types.ObjectId
  created_by:  mongoose.Types.ObjectId
  subject:     string
  title:       string
  description: string
  due_date:    Date
  is_active:   boolean
  created_at:  Date
}

const HomeworkSchema = new mongoose.Schema<IHomework>({
  school_id:   { type: mongoose.Schema.Types.ObjectId, ref: "School",  required: true },
  class_id:    { type: mongoose.Schema.Types.ObjectId, ref: "Class",   required: true },
  created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
  subject:     { type: String, required: true, trim: true },
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true, maxlength: 2000 },
  due_date:    { type: Date, required: true },
  is_active:   { type: Boolean, default: true },
  created_at:  { type: Date, default: Date.now },
})

HomeworkSchema.index({ school_id: 1, class_id: 1, due_date: -1 })
HomeworkSchema.index({ created_by: 1 })

export const Homework: Model<IHomework> =
  (mongoose.models.Homework as Model<IHomework>) ??
  mongoose.model<IHomework>("Homework", HomeworkSchema)
