// ─────────────────────────────────────────────────────────────────────────────
// models/StudentEnrollment.ts — Class history: one line per student per class,
// like a school's admission register. A line is "open" (is_current) while the
// student studies in that class and is closed (to_date + end_reason) when the
// class changes. Lines hold ids and dates only — never names or marks.
// autoIndex is off: indexes are built on first use (ensureEnrollmentIndexes) or by
// scripts/createEnrollmentIndexes.ts — never at app start.
// Exports: IStudentEnrollment, StudentEnrollment, END_REASONS, EndReason,
//          ensureEnrollmentIndexes, runInTransaction, openEnrollment, changeEnrollment
// ─────────────────────────────────────────────────────────────────────────────
import mongoose, { type ClientSession, type Document, type Model } from "mongoose"
import { logger } from "../lib/logger.js"
import { todayIST } from "../lib/dateHelpers.js"

export const END_REASONS = ["promoted", "stayed_back", "passed_out", "transferred", "correction"] as const
export type EndReason = (typeof END_REASONS)[number]

export interface IStudentEnrollment extends Document {
  school_id:        mongoose.Types.ObjectId
  student_id:       mongoose.Types.ObjectId
  class_id:         mongoose.Types.ObjectId
  class_year_start: string | null   // YYYY-MM-DD, copied from the class when the line opens (filled in a later release)
  class_year_label: string | null   // e.g. "2026-27" (filled in a later release)
  class_label:      string | null   // the class's name as it was when the line opened, e.g. "Class 5A"
  from_date:        string          // YYYY-MM-DD (IST)
  to_date:          string | null   // null while the line is open
  is_current:       boolean
  end_reason:       EndReason | null
  created_by:       mongoose.Types.ObjectId
  run_id:           string | null
}

const studentEnrollmentSchema = new mongoose.Schema<IStudentEnrollment>({
  school_id:        { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
  student_id:       { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },
  class_id:         { type: mongoose.Schema.Types.ObjectId, ref: "Class",  required: true },
  class_year_start: { type: String, default: null },
  class_year_label: { type: String, default: null },
  class_label:      { type: String, default: null },
  from_date:        { type: String, required: true },
  to_date:          { type: String, default: null },
  is_current:       { type: Boolean, required: true, default: true },
  end_reason:       { type: String, enum: [...END_REASONS], default: null },
  created_by:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  run_id:           { type: String, default: null },
}, { timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, autoIndex: false })

// One open line per student: this partial index is what makes a replayed or concurrent move safe.
studentEnrollmentSchema.index({ student_id: 1 }, { unique: true, partialFilterExpression: { is_current: true } })
studentEnrollmentSchema.index({ student_id: 1, from_date: -1 })
studentEnrollmentSchema.index({ school_id: 1, class_id: 1 })

export const StudentEnrollment: Model<IStudentEnrollment> =
  mongoose.models.StudentEnrollment ?? mongoose.model<IStudentEnrollment>("StudentEnrollment", studentEnrollmentSchema)

let indexesReady: Promise<void> | null = null

/**
 * Builds the StudentEnrollment indexes the first time class history is used (the collection is
 * new and small, so this is quick). The partial unique index keeps a student to one open line
 * when two requests race. A failure is logged loudly and never blocks a class change.
 * scripts/createEnrollmentIndexes.ts does the same thing on purpose for operations.
 */
export function ensureEnrollmentIndexes(): Promise<void> {
  const ready = indexesReady ?? StudentEnrollment.createIndexes()
    .then(() => undefined)
    .catch(err => {
      indexesReady = null
      logger.error({ err }, "[enrollment] could not build the class-history indexes — one open line per student is NOT enforced until they exist")
    })
  indexesReady = ready
  return ready
}

const NO_REPLICA_SET = "Transaction numbers are only allowed on a replica set"

/**
 * Runs fn inside a MongoDB transaction. On a standalone server (local development)
 * it runs fn once without a session, so fn must be safe to repeat.
 */
export async function runInTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  await ensureEnrollmentIndexes()
  const session = await mongoose.startSession()
  try {
    let result: T | undefined
    await session.withTransaction(async () => { result = await fn(session) })
    return result as T
  } catch (err) {
    if (err instanceof Error && err.message.includes(NO_REPLICA_SET)) {
      logger.warn("[enrollment] MongoDB is standalone — running without a transaction. Use a replica set in production.")
      return fn(undefined)
    }
    throw err
  } finally {
    await session.endSession()
  }
}

interface EnrollmentArgs {
  schoolId:  mongoose.Types.ObjectId
  studentId: mongoose.Types.ObjectId
  classId:   mongoose.Types.ObjectId
  createdBy: mongoose.Types.ObjectId
  classLabel?: string | null   // saved on the new line so history keeps the name the class had at the time
  session?:  ClientSession
}

function newLine(a: EnrollmentArgs, fromDate: string) {
  return {
    school_id:  a.schoolId,
    student_id: a.studentId,
    class_id:   a.classId,
    class_label: a.classLabel ?? null,
    from_date:  fromDate,
    to_date:    null,
    is_current: true,
    end_reason: null,
    created_by: a.createdBy,
  }
}

/** Opens the first line for a newly admitted student. */
export async function openEnrollment(a: EnrollmentArgs): Promise<void> {
  await StudentEnrollment.create([newLine(a, todayIST())], { session: a.session })
}

/**
 * Closes the student's open line (if any) and opens a line for the new class.
 * Returns "unchanged" when the open line already is the new class, so repeating
 * the same move writes nothing. A student with no open line (added before class
 * history existed) simply gets the new line.
 */
export async function changeEnrollment(a: EnrollmentArgs & { reason: EndReason }): Promise<"changed" | "unchanged"> {
  const today = todayIST()
  const open = await StudentEnrollment.findOne({ school_id: a.schoolId, student_id: a.studentId, is_current: true })
    .session(a.session ?? null)
  if (open && open.class_id.equals(a.classId)) return "unchanged"
  if (open) {
    open.is_current = false
    open.to_date    = open.from_date > today ? open.from_date : today
    open.end_reason = a.reason
    await open.save({ session: a.session })
  }
  await StudentEnrollment.create([newLine(a, today)], { session: a.session })
  return "changed"
}
