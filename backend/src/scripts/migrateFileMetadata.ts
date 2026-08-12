// ─────────────────────────────────────────────────────────────────────────────
// scripts/migrateFileMetadata.ts — One-time migration to populate school_id
// in GridFS file metadata for all files uploaded before the school boundary
// check was introduced.
//
// Safe to run multiple times (idempotent): files that already have school_id
// in their metadata are skipped.
//
// Usage:
//   cd backend
//   npx tsx --env-file=.env src/scripts/migrateFileMetadata.ts
// ─────────────────────────────────────────────────────────────────────────────
import mongoose from "mongoose"
import { connectDB } from "../lib/mongodb.js"
import { Module } from "../models/Module.js"
import { logger } from "../lib/logger.js"

async function migrate(): Promise<void> {
  await connectDB()

  const db = mongoose.connection.db
  if (!db) throw new Error("DB not connected")

  const filesCollection = db.collection("lesson_files.files")

  // Build a map: gridfsId (string) → school_id (string)
  // by scanning all Module documents and their items arrays.
  logger.info("[migrate-file-metadata] Building gridfsId → school_id map from modules...")

  const modules = await Module.find({}, { school_id: 1, "items.gridfs_id": 1, "items.pdf_gridfs_id": 1 }).lean()

  const idToSchool = new Map<string, string>()
  for (const mod of modules) {
    const sid = mod.school_id?.toString()
    if (!sid) continue
    for (const item of mod.items ?? []) {
      if (item.gridfs_id)     idToSchool.set(item.gridfs_id.toString(), sid)
      if (item.pdf_gridfs_id) idToSchool.set(item.pdf_gridfs_id.toString(), sid)
    }
  }

  logger.info({ total: idToSchool.size }, "[migrate-file-metadata] Map built")

  // Iterate all GridFS files that are missing school_id in metadata
  const cursor = filesCollection.find({
    $or: [
      { "metadata.school_id": { $exists: false } },
      { "metadata.school_id": null },
      { metadata: null },
    ],
  })

  let updated = 0
  let skipped = 0
  let notFound = 0

  for await (const file of cursor) {
    const fileId = (file._id as mongoose.Types.ObjectId).toString()
    const schoolId = idToSchool.get(fileId)

    if (!schoolId) {
      notFound++
      continue
    }

    await filesCollection.updateOne(
      { _id: file._id },
      { $set: { "metadata.school_id": schoolId } },
    )
    updated++
  }

  logger.info(
    { updated, skipped, notFound },
    "[migrate-file-metadata] Migration complete. Files with school_id set, files already having it (skipped), files with no matching module (notFound — may be orphaned uploads or cert/report PDFs)."
  )

  await mongoose.disconnect()
}

migrate().catch(err => {
  logger.error({ err }, "[migrate-file-metadata] Fatal error")
  process.exit(1)
})
