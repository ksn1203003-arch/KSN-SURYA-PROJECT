import mongoose, { type Document, type Model } from "mongoose"

export interface INotification extends Document {
  school_id:       mongoose.Types.ObjectId
  created_by:      mongoose.Types.ObjectId
  created_by_name: string
  created_by_role: string
  type:            "announcement" | "reminder" | "achievement" | "alert" | "event"
  title:           string
  message:         string
  target:          string
  target_label:    string
  scheduled_at:    Date | null
  expires_at:      Date | null
  createdAt:       Date
  updatedAt:       Date
}

const notifSchema = new mongoose.Schema<INotification>({
  school_id:       { type: mongoose.Schema.Types.ObjectId, required: true },
  created_by:      { type: mongoose.Schema.Types.ObjectId, required: true },
  created_by_name: { type: String, default: "" },
  created_by_role: { type: String, default: "admin" },
  type:            { type: String, enum: ["announcement", "reminder", "achievement", "alert", "event"], default: "announcement" },
  title:           { type: String, required: true },
  message:         { type: String, required: true },
  target:          { type: String, default: "all" },
  target_label:    { type: String, default: "Everyone" },
  scheduled_at:    { type: Date, default: null },
  expires_at:      { type: Date, default: null },
}, { timestamps: true })

notifSchema.index({ school_id: 1, createdAt: -1 })

export const Notification: Model<INotification> =
  mongoose.models.Notification ?? mongoose.model<INotification>("Notification", notifSchema)
