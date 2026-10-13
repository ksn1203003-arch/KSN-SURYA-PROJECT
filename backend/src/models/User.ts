// ─────────────────────────────────────────────────────────────────────────────
// models/User.ts — Mongoose model for all users (students, teachers, admins).
// One collection differentiated by the role field. Never return password_hash
// to the frontend — always use .select("-password_hash") on queries.
// Exports: IUser, User
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IUser extends Document {
  name: string
  email: string
  phone: string | null
  username: string | null
  gender: string | null
  password_hash: string
  role: "student" | "teacher" | "admin" | "super_admin" | "parent"
  school_id: mongoose.Types.ObjectId | null
  class_id: mongoose.Types.ObjectId | null
  linked_student_id: mongoose.Types.ObjectId | null
  is_active: boolean
  preferred_language: "english" | "hindi"
  profile_photo_url: string | null
  // Set whenever the photo changes. Lists send a photo address that includes this time, so a
  // browser only downloads a photo again after it has really changed.
  profile_photo_updated_at: Date | null
  points: number
  must_change_password: boolean
  // Incremented on explicit sign-out so existing JWTs are immediately rejected.
  // Middleware rejects any token whose tv claim doesn't match this value.
  token_version: number
  created_at: Date
}

const userSchema = new mongoose.Schema<IUser>({
  name:              { type: String, required: true },
  email:             { type: String, required: true, unique: true, lowercase: true },
  phone:             { type: String, default: null },
  gender:            { type: String, default: null },
  username:          { type: String, default: null, unique: true, sparse: true },
  password_hash:     { type: String, required: true },
  role:              { type: String, enum: ["student", "teacher", "admin", "super_admin", "parent"], required: true },
  school_id:         { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null },
  class_id:          { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
  linked_student_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  is_active:         { type: Boolean, default: true },
  preferred_language:{ type: String, enum: ["english", "hindi"], default: "english" },
  profile_photo_url:    { type: String, default: null },
  profile_photo_updated_at: { type: Date, default: null },
  points:               { type: Number, default: 0 },
  must_change_password: { type: Boolean, default: false },
  token_version:        { type: Number, default: 0 },
  created_at:           { type: Date, default: Date.now },
})

userSchema.index({ school_id: 1, role: 1, is_active: 1 })
userSchema.index({ class_id: 1 })

export const User: Model<IUser> = mongoose.models.User ?? mongoose.model<IUser>("User", userSchema)
