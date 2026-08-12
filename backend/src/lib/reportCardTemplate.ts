// ─────────────────────────────────────────────────────────────────────────────
// lib/reportCardTemplate.ts — HTML builder for student report card PDFs.
// Extracted from routes/marks.ts so it can be unit-tested independently and
// reused by any future route that needs a report card layout.
// ─────────────────────────────────────────────────────────────────────────────
import type { IExamDefinition, IGradeScale } from "../models/ExamDefinition.js"

export interface ReportCardTemplateData {
  studentName: string
  classLabel:  string
  schoolName:  string
  schoolBoard: string
  exams:       IExamDefinition[]
  resultMap:   Record<string, Record<string, { marks_obtained: number | null; is_absent: boolean }>>
  attPct:      number | null
}

function calcGrade(pct: number, scale: IGradeScale[]): string {
  const sorted = [...scale].sort((a, b) => b.min - a.min)
  return sorted.find(s => pct >= s.min)?.grade ?? "F"
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function buildReportCardHTML(data: ReportCardTemplateData): string {
  const { studentName, classLabel, schoolName, schoolBoard, exams, resultMap, attPct } = data

  const examTypeLabel: Record<string, string> = {
    unit_test: "Unit Test", mid_term: "Mid-Term", final: "Final",
    practical: "Practical", other: "Other",
  }

  const examRows = exams.map(exam => {
    const eid = exam._id.toString()
    const subjectCells = exam.subjects.map(sub => {
      const r = resultMap[eid]?.[sub.name]
      if (!r || (r.marks_obtained === null && !r.is_absent)) return `<td class="c">—</td><td class="c">—</td><td class="c">—</td>`
      if (r.is_absent) return `<td class="c ab">AB</td><td class="c">—</td><td class="c">—</td>`
      const pct = r.marks_obtained !== null ? Math.round((r.marks_obtained / sub.max_marks) * 100) : 0
      const grade = calcGrade(pct, exam.grade_scale)
      return `<td class="c">${r.marks_obtained}/${sub.max_marks}</td><td class="c">${pct}%</td><td class="c gd">${grade}</td>`
    }).join("")

    const validSubs = exam.subjects.filter(s => {
      const r = resultMap[eid]?.[s.name]
      return r && !r.is_absent && r.marks_obtained !== null
    })
    const totalObt    = validSubs.reduce((a, s) => a + ((resultMap[eid]?.[s.name]?.marks_obtained ?? 0)), 0)
    const totalMax    = validSubs.reduce((a, s) => a + s.max_marks, 0)
    const overallPct  = totalMax > 0 ? Math.round((totalObt / totalMax) * 100) : null
    const overallGrade = overallPct !== null ? calcGrade(overallPct, exam.grade_scale) : "—"

    return `
      <tr>
        <td class="el">${esc(exam.title)}<br/><span class="sub">${examTypeLabel[exam.exam_type] ?? exam.exam_type} · ${new Date(exam.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></td>
        ${subjectCells}
        <td class="c tot">${totalMax > 0 ? `${totalObt}/${totalMax}` : "—"}</td>
        <td class="c tot">${overallPct !== null ? `${overallPct}%` : "—"}</td>
        <td class="c gd">${overallGrade}</td>
      </tr>`
  }).join("")

  const allSubjectNames = exams.length > 0
    ? [...new Set(exams.flatMap(e => e.subjects.map(s => s.name)))]
    : []
  const subjectHeaders    = allSubjectNames.map(n => `<th colspan="3">${esc(n)}</th>`).join("")
  const subjectSubHeaders = allSubjectNames.map(() => "<th>Marks</th><th>%</th><th>Grade</th>").join("")
  const attLabel = attPct !== null ? `${attPct}%` : "N/A"
  const attClass = attPct !== null ? (attPct >= 75 ? "att-good" : attPct >= 50 ? "att-warn" : "att-bad") : ""
  const today    = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;background:#fff;color:#111;font-size:12px;padding:32px 40px}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #534AB7;padding-bottom:12px;margin-bottom:18px}
.school-name{font-size:20px;font-weight:900;color:#534AB7}
.school-board{font-size:11px;color:#6b7280;margin-top:2px}
.report-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;margin-bottom:4px}
.student-info{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:#f9fafb;border-radius:10px;padding:14px 16px;margin-bottom:18px;border:1px solid #e5e7eb}
.info-item .label{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.info-item .value{font-size:13px;font-weight:700;color:#111;margin-top:2px}
.att-good{color:#059669}.att-warn{color:#d97706}.att-bad{color:#dc2626}
table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px}
th{background:#534AB7;color:#fff;padding:6px 8px;text-align:center;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
th.el{text-align:left}
td{padding:5px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
td.c{text-align:center}
td.el{font-weight:600}
td.ab{color:#dc2626;font-weight:700}
td.tot{font-weight:700;color:#374151}
td.gd{font-weight:800}
tr:nth-child(even) td{background:#fafafa}
.sub{font-size:10px;font-weight:400;color:#9ca3af}
.footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb}
.sig{text-align:center}
.sig-line{width:140px;height:1px;background:#d1d5db;margin:0 auto 6px}
.sig-name{font-size:11px;font-weight:700;color:#374151}
.sig-role{font-size:10px;color:#9ca3af;margin-top:2px}
.generated{font-size:10px;color:#9ca3af;margin-top:16px;text-align:center}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="school-name">🎓 ${esc(schoolName)}</div>
    <div class="school-board">${esc(schoolBoard)}</div>
  </div>
  <div style="text-align:right">
    <div class="report-label">Academic Report Card</div>
    <div style="font-size:12px;font-weight:700;color:#111">${esc(studentName)}</div>
    <div style="font-size:11px;color:#6b7280">${esc(classLabel)}</div>
  </div>
</div>

<div class="student-info">
  <div class="info-item"><div class="label">Student Name</div><div class="value">${esc(studentName)}</div></div>
  <div class="info-item"><div class="label">Class</div><div class="value">${esc(classLabel)}</div></div>
  <div class="info-item"><div class="label">Total Exams</div><div class="value">${exams.length}</div></div>
  <div class="info-item"><div class="label">Attendance</div><div class="value ${attClass}">${attLabel}</div></div>
</div>

${exams.length === 0
  ? `<p style="color:#9ca3af;text-align:center;padding:24px">No exams recorded yet.</p>`
  : `<table>
      <thead>
        <tr><th class="el" rowspan="2">Exam</th>${subjectHeaders}<th colspan="2">Overall</th><th rowspan="2">Grade</th></tr>
        <tr>${subjectSubHeaders}<th>Total</th><th>%</th></tr>
      </thead>
      <tbody>${examRows}</tbody>
    </table>`}

<div class="footer">
  <div class="sig">
    <div class="sig-line"></div>
    <div class="sig-name">Class Teacher</div>
    <div class="sig-role">Signature</div>
  </div>
  <div style="text-align:center">
    <div style="font-size:11px;color:#6b7280">Date of Issue</div>
    <div style="font-size:12px;font-weight:700">${today}</div>
  </div>
  <div class="sig">
    <div class="sig-line"></div>
    <div class="sig-name">School Principal</div>
    <div class="sig-role">Signature</div>
  </div>
</div>
<p class="generated">Generated by TeachScript · ${esc(schoolName)}</p>
</body>
</html>`
}
