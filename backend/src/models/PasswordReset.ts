// ─────────────────────────────────────────────────────────────────────────────
// models/PasswordReset.ts — Mongoose model for password reset tokens.
// Stores a hashed token (never the raw value). A MongoDB TTL index auto-deletes
// expired documents so no manual cleanup job is needed.
// Exports: IPasswordReset, PasswordReset
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IPasswordReset extends Document {
  user_id: mongoose.Types.ObjectId
  token_hash: string
  expires_at: Date
  used: boolean
}

const passwordResetSchema = new mongoose.Schema<IPasswordReset>({
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token_hash: { type: String, required: true },
  expires_at: { type: Date, required: true },
  used:       { type: Boolean, default: false },
})

passwordResetSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 })

export const PasswordReset: Model<IPasswordReset> = mongoose.models.PasswordReset ?? mongoose.model<IPasswordReset>("PasswordReset", passwordResetSchema)
