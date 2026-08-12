import { GridFSBucket } from "mongodb"
import mongoose from "mongoose"

// Bucket names used across the app
export type BucketName = "lesson_files" | "uploads" | "pdf_reports"

// Cache bucket instances — creating a new GridFSBucket per request adds unnecessary
// allocation overhead. Buckets are stateless beyond their DB reference, so one
// instance per bucket name is safe to reuse for the lifetime of the connection.
const _bucketCache = new Map<BucketName, GridFSBucket>()

export function getGridFSBucket(bucketName: BucketName = "lesson_files"): GridFSBucket {
  const db = mongoose.connection.db
  if (!db) throw new Error("MongoDB not connected")
  const cached = _bucketCache.get(bucketName)
  if (cached) return cached
  const bucket = new GridFSBucket(db, { bucketName })
  _bucketCache.set(bucketName, bucket)
  return bucket
}

// Call this when the MongoDB connection is closed/reset so stale buckets are evicted.
export function clearGridFSBucketCache(): void {
  _bucketCache.clear()
}
