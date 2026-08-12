// ─────────────────────────────────────────────────────────────────────────────
// models/FileToken.ts — Mongoose model for short-lived GridFS file access tokens.
// Avoids embedding the JWT in file URLs (which leaks into server logs and browser
// history). A MongoDB TTL index auto-expires tokens after a short window.
// Exports: IFileToken, FileToken
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type Document, type Model } from "mongoose"

export interface IFileToken extends Document {
  token: string
  userId: string
  gridfsId: string
  expiresAt: Date
}

const schema = new mongoose.Schema<IFileToken>({
  token:    { type: String, required: true, unique: true },
  userId:   { type: String, required: true },
  gridfsId: { type: String, required: true },
  expiresAt:{ type: Date, required: true },
})

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // MongoDB TTL auto-cleanup

export const FileToken: Model<IFileToken> =
  mongoose.models.FileToken ?? mongoose.model<IFileToken>("FileToken", schema)
