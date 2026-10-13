// ─────────────────────────────────────────────────────────────────────────────
// lib/attendanceHelpers.ts — the attendance rate formula and the class "counted from" date.
//
// Rule (owner decision): Class.year_start is a string YYYY-MM-DD (IST) or null.
//   - a class WITH a stored date counts only the sheets dated on or after it (the start day counts);
//   - a class with NO stored date (null) counts every sheet — the shown default start of the school
//     year is never used as a floor here;
//   - a class that cannot be found inside the caller's school gives empty figures (the caller decides).
// Sheets are never deleted; only the window moves.
// ─────────────────────────────────────────────────────────────────────────────
import mongoose from "mongoose"
import { Class } from "../models/Class.js"

export function calculateAttendanceRate(
  present: number,
  late: number,
  total: number
): number | null {
  if (total === 0) return null
  return Math.round(((present + late * 0.5) / total) * 100 * 10) / 10
}

// The date a class's attendance is counted from, and the label shown beside it.
export interface CountedClass { start: string | null; label: string | null }

// A real calendar date written YYYY-MM-DD (rejects 2026-02-30 and 2026-13-01).
export function isYmd(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

// The later of `from` and the stored start (plain string comparison — both are IST dates).
// undefined when neither is a valid date.
export function floorFrom(start: string | null | undefined, from?: string): string | undefined {
  const s = isYmd(start) ? start : undefined
  const f = isYmd(from) ? from : undefined
  if (s && f) return s > f ? s : f
  return s ?? f
}

// A fragment ready to spread into a $match / find. {} when there is no bound at all.
export function attendanceDateFilter(
  start: string | null | undefined,
  from?: string,
  to?: string,
): Record<string, unknown> {
  const lower = floorFrom(start, from)
  const upper = isYmd(to) ? to : undefined
  if (!lower && !upper) return {}
  return {
    date: {
      ...(lower ? { $gte: lower } : {}),
      ...(upper ? { $lte: upper } : {}),
    },
  }
}

// One way to build a class label: "Class 7A" for a numbered class, the class's own name otherwise.
export function classLabelOf(c: { grade: number; section: string; name?: string | null }): string {
  return c.grade > 0 ? `Class ${c.grade}${c.section}` : (c.name ?? c.section)
}

// The two fields every attendance reader adds to its answer.
export function countedFields(c: CountedClass | null): { counted_from: string | null; counted_class_label: string | null } {
  return { counted_from: c?.start ?? null, counted_class_label: c?.label ?? null }
}

function toObjectId(v: unknown): mongoose.Types.ObjectId | null {
  if (v instanceof mongoose.Types.ObjectId) return v
  if (typeof v === "string" || (typeof v === "object" && v !== null && !Array.isArray(v))) {
    const s = String(v)
    if (/^[a-f\d]{24}$/i.test(s)) return new mongoose.Types.ObjectId(s)
  }
  return null
}

// The class inside the caller's school, with the date its attendance is counted from.
// null when the id is invalid, the class does not exist, or it belongs to another school.
export async function loadCountedClass(classId: unknown, schoolId: unknown): Promise<CountedClass | null> {
  const cid = toObjectId(classId)
  const sid = toObjectId(schoolId)
  if (!cid || !sid) return null
  const c = await Class.findOne({ _id: cid, school_id: sid }).select("year_start grade section name").lean()
  if (!c) return null
  return { start: isYmd(c.year_start) ? c.year_start : null, label: classLabelOf(c) }
}
