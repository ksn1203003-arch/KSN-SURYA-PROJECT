// ─────────────────────────────────────────────────────────────────────────────
// lib/mongodb.ts — Mongoose connection helper.
// Connects to MongoDB once and drops the stale single-period attendance index
// that blocks recording multiple periods per day.
// Exports: connectDB()
// ─────────────────────────────────────────────────────────────────────────────
import mongoose from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/teachscript"

let connected = false

export async function connectDB(): Promise<void> {
  if (connected) return
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  })
  connected = true

  // Drop stale attendance index — old schema had unique(class_id, date) which blocks
  // multiple periods per day. New correct index is unique(class_id, date, period).
  try {
    const db = mongoose.connection.db
    if (db) {
      const indexes = await db.collection("attendances").indexes()
      const stale = indexes.find(idx => {
        const keys = Object.keys(idx.key ?? {})
        return keys.length === 2 && keys.includes("class_id") && keys.includes("date") && !keys.includes("period")
      })
      if (stale?.name) {
        await db.collection("attendances").dropIndex(stale.name)
      }
    }
  } catch { /* index may not exist — ignore */ }
}

export default mongoose
