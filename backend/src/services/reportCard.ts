// ─────────────────────────────────────────────────────────────────────────────
// services/reportCard.ts — Shared report-card data-fetching logic.
// Used by both the teacher route (GET /marks/report-card/:studentId) and the
// student route (GET /marks/my-report-card) to avoid ~100 lines of duplication.
//
// fetchReportCardData   — single student (used by student self-download)
// fetchReportCardDataBatch — multiple students in one call (used by teacher
//   bulk download) — reduces N×4 DB round-trips to ~5 regardless of class size.
// ─────────────────────────────────────────────────────────────────────────────
import mongoose from "mongoose"
import { ExamDefinition, type IExamDefinition } from "../models/ExamDefinition.js"
import { ExamResult } from "../models/ExamResult.js"
import { Class } from "../models/Class.js"
import { School } from "../models/School.js"
import { calculateAttendanceRate } from "../lib/attendanceHelpers.js"

export interface ReportCardData {
  studentName: string
  classLabel:  string
  schoolName:  string
  schoolBoard: string
  exams:       IExamDefinition[]
  resultMap:   Record<string, Record<string, { marks_obtained: number | null; is_absent: boolean }>>
  attPct:      number | null
}

interface StudentDoc {
  name:      unknown
  class_id:  mongoose.Types.ObjectId | null
  school_id: mongoose.Types.ObjectId | null
}

// ── Single-student fetch (unchanged interface for backward compatibility) ─────
export async function fetchReportCardData(
  student: StudentDoc,
  studentId: string,
): Promise<ReportCardData> {
  const studentOid = new mongoose.Types.ObjectId(studentId)

  const [cls, school, exams] = await Promise.all([
    Class.findById(student.class_id).select("name grade section").lean(),
    School.findById(student.school_id).select("name board").lean(),
    ExamDefinition.find({
      school_id: student.school_id,
      class_id:  student.class_id,
    }).sort({ date: 1 }).lean(),
  ])

  const examIds = exams.map(e => e._id)
  const results = await ExamResult.find({
    exam_id:    { $in: examIds },
    student_id: studentOid,
  }).lean()

  const resultMap: Record<string, Record<string, { marks_obtained: number | null; is_absent: boolean }>> = {}
  for (const r of results) {
    const eid = r.exam_id.toString()
    if (!resultMap[eid]) resultMap[eid] = {}
    resultMap[eid][r.subject] = { marks_obtained: r.marks_obtained, is_absent: r.is_absent }
  }

  // Attendance — aggregate at the DB level to avoid loading all attendance docs
  // into memory. The compound index on {class_id, "records.student_id"} is used
  // by the $match stage; $unwind+$match then narrows to exactly this student.
  const db = mongoose.connection.db
  let presentCount = 0; let lateCount = 0; let totalCount = 0
  if (db) {
    const [agg] = await db.collection("attendances").aggregate([
      { $match: { class_id: student.class_id, "records.student_id": studentOid } },
      { $unwind: "$records" },
      { $match: { "records.student_id": studentOid } },
      { $group: {
        _id:     null,
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ["$records.status", "late"]    }, 1, 0] } },
      }},
    ]).toArray() as Array<{ total: number; present: number; late: number }> | []
    if (agg) {
      totalCount   = agg.total   ?? 0
      presentCount = agg.present ?? 0
      lateCount    = agg.late    ?? 0
    }
  }

  const classLabel = cls ? (cls.name || `Class ${cls.grade}${cls.section}`) : ""

  return {
    studentName: student.name as string,
    classLabel,
    schoolName:  school?.name ?? "School",
    schoolBoard: school?.board ?? "",
    exams,
    resultMap,
    attPct: calculateAttendanceRate(presentCount, lateCount, totalCount),
  }
}

// ── Batch fetch for multiple students ────────────────────────────────────────
// Reduces bulk report-card generation from N×5 queries to ~5 total queries,
// regardless of class size. For a class of 40 students this cuts ~195 DB
// round-trips down to 5.
export interface BatchReportCardEntry {
  studentId:   string
  studentName: string
  classLabel:  string
  schoolName:  string
  schoolBoard: string
  exams:       IExamDefinition[]
  resultMap:   Record<string, Record<string, { marks_obtained: number | null; is_absent: boolean }>>
  attPct:      number | null
}

export async function fetchReportCardDataBatch(
  students: Array<{ _id: mongoose.Types.ObjectId; name: string; class_id: mongoose.Types.ObjectId | null; school_id: mongoose.Types.ObjectId | null }>,
): Promise<BatchReportCardEntry[]> {
  if (students.length === 0) return []

  // All students in a batch must belong to the same class (enforced by callers).
  const firstStudent = students[0]
  const classId  = firstStudent.class_id
  const schoolId = firstStudent.school_id

  // Fetch class, school, and exams once for the whole batch
  const [cls, school, exams] = await Promise.all([
    Class.findById(classId).select("name grade section").lean(),
    School.findById(schoolId).select("name board").lean(),
    ExamDefinition.find({ school_id: schoolId, class_id: classId }).sort({ date: 1 }).lean(),
  ])

  const classLabel = cls ? (cls.name || `Class ${cls.grade}${cls.section}`) : ""
  const schoolName  = school?.name  ?? "School"
  const schoolBoard = school?.board ?? ""
  const examIds     = exams.map(e => e._id)
  const studentIds  = students.map(s => s._id)

  // Fetch all exam results for all students in one query
  const allResults = await ExamResult.find({
    exam_id:    { $in: examIds },
    student_id: { $in: studentIds },
  }).lean()

  // Group results by student_id → exam_id → subject
  const resultsByStudent = new Map<string, Record<string, Record<string, { marks_obtained: number | null; is_absent: boolean }>>>()
  for (const r of allResults) {
    const sid = r.student_id.toString()
    const eid = r.exam_id.toString()
    if (!resultsByStudent.has(sid)) resultsByStudent.set(sid, {})
    const byExam = resultsByStudent.get(sid)!
    if (!byExam[eid]) byExam[eid] = {}
    byExam[eid][r.subject] = { marks_obtained: r.marks_obtained, is_absent: r.is_absent }
  }

  // Fetch attendance for all students in one aggregation pipeline
  const db = mongoose.connection.db
  const attByStudent = new Map<string, { present: number; late: number; total: number }>()
  if (db) {
    const attAgg = await db.collection("attendances").aggregate([
      { $match: { class_id: classId, "records.student_id": { $in: studentIds } } },
      { $unwind: "$records" },
      { $match: { "records.student_id": { $in: studentIds } } },
      { $group: {
        _id:     "$records.student_id",
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ["$records.status", "present"] }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ["$records.status", "late"]    }, 1, 0] } },
      }},
    ]).toArray() as Array<{ _id: mongoose.Types.ObjectId; total: number; present: number; late: number }>

    for (const row of attAgg) {
      attByStudent.set(row._id.toString(), { present: row.present, late: row.late, total: row.total })
    }
  }

  // Assemble per-student results
  return students.map(s => {
    const sid     = s._id.toString()
    const att     = attByStudent.get(sid) ?? { present: 0, late: 0, total: 0 }
    const attPct  = calculateAttendanceRate(att.present, att.late, att.total)
    return {
      studentId:   sid,
      studentName: s.name,
      classLabel,
      schoolName,
      schoolBoard,
      exams,
      resultMap: resultsByStudent.get(sid) ?? {},
      attPct,
    }
  })
}
