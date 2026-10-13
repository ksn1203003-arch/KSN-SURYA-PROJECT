// ─────────────────────────────────────────────────────────────────────────────
// scripts/createEnrollmentIndexes.ts — One-off, create-only: builds the
// StudentEnrollment indexes (autoIndex is off for that model). Safe to run again.
// Run once per deployment, off-peak, after taking a backup:
//   npx tsx --env-file=.env src/scripts/createEnrollmentIndexes.ts
// ─────────────────────────────────────────────────────────────────────────────
import mongoose from "mongoose"
import { connectDB } from "../lib/mongodb.js"
import { StudentEnrollment } from "../models/StudentEnrollment.js"
import { logger } from "../lib/logger.js"

async function main(): Promise<void> {
  await connectDB()
  await StudentEnrollment.createIndexes()
  const indexes = await StudentEnrollment.collection.indexes()
  logger.info({ indexes: indexes.map(i => i.name) }, "[createEnrollmentIndexes] done")
  await mongoose.disconnect()
}

main().catch(err => {
  logger.error({ err }, "[createEnrollmentIndexes] failed")
  process.exit(1)
})
