import mongoose, { type Document, type Model } from "mongoose"

export interface IDataDeletionRequest extends Document {
  user_id:    mongoose.Types.ObjectId
  user_name:  string
  user_email: string
  user_role:  string
  school_id:  mongoose.Types.ObjectId
  reason:     string
  status:     "pending" | "approved" | "rejected"
  reviewed_at?: Date
  reviewed_by?: mongoose.Types.ObjectId
  created_at: Date
}

const DataDeletionRequestSchema = new mongoose.Schema<IDataDeletionRequest>({
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  user_name:  { type: String, required: true },
  user_email: { type: String, required: true },
  user_role:  { type: String, required: true },
  school_id:  { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  reason:     { type: String, default: "" },
  status:     { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  reviewed_at: { type: Date },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  created_at: { type: Date, default: Date.now },
})

DataDeletionRequestSchema.index({ school_id: 1, status: 1 })
DataDeletionRequestSchema.index({ user_id: 1 })

export const DataDeletionRequest: Model<IDataDeletionRequest> =
  (mongoose.models.DataDeletionRequest as Model<IDataDeletionRequest>) ??
  mongoose.model<IDataDeletionRequest>("DataDeletionRequest", DataDeletionRequestSchema)
