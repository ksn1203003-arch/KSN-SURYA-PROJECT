// ─────────────────────────────────────────────────────────────────────────────
// models/OTPSession.ts — Short-lived OTP sessions.
// Used for two flows:
//   1. 2FA (channel="email") — teacher/admin with 2FA enabled logs in via email OTP
//   2. SMS login (channel="sms") — passwordless login via phone OTP
// Stores a hashed session token (returned to the client) and a bcrypt-hashed
// 6-digit OTP. Both must match on /verify-otp to issue the JWT.
// TTL index auto-deletes documents 10 minutes after expires_at.
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IOTPSession extends Document {
  session_token_hash: string
  otp_hash:           string
  user_id:            mongoose.Types.ObjectId
  email:              string | null
  phone:              string | null
  channel:            "email" | "sms"
  role:               string
  school_id:          mongoose.Types.ObjectId
  expires_at:         Date
  used:               boolean
  failed_attempts:    number
}

const otpSessionSchema = new mongoose.Schema<IOTPSession>({
  session_token_hash: { type: String, required: true, unique: true },
  otp_hash:           { type: String, required: true },
  user_id:            { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  email:              { type: String, default: null },
  phone:              { type: String, default: null },
  channel:            { type: String, enum: ["email", "sms"], default: "email" },
  role:               { type: String, required: true },
  school_id:          { type: mongoose.Schema.Types.ObjectId, required: true, ref: "School" },
  expires_at:         { type: Date, required: true },
  used:               { type: Boolean, default: false },
  failed_attempts:    { type: Number, default: 0 },
})

otpSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 })
// Unique per user+channel ensures only one active OTP session at a time.
// Combined with the atomic findOneAndUpdate upsert in auth.ts this prevents
// concurrent logins from producing two valid OTP sessions.
otpSessionSchema.index({ user_id: 1, channel: 1 }, { unique: true })

export const OTPSession: Model<IOTPSession> =
  mongoose.models.OTPSession ?? mongoose.model<IOTPSession>("OTPSession", otpSessionSchema)
