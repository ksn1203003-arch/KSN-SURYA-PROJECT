import mongoose, { type Document, type Model } from "mongoose"

export interface INotifRead extends Document {
  notification_id: mongoose.Types.ObjectId
  user_id:         mongoose.Types.ObjectId
  read_at:         Date
}

const readSchema = new mongoose.Schema<INotifRead>({
  notification_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  user_id:         { type: mongoose.Schema.Types.ObjectId, required: true },
  read_at:         { type: Date, default: () => new Date() },
})

readSchema.index({ notification_id: 1, user_id: 1 }, { unique: true })
readSchema.index({ user_id: 1 })

export const NotifRead: Model<INotifRead> =
  mongoose.models.NotifRead ?? mongoose.model<INotifRead>("NotifRead", readSchema)
