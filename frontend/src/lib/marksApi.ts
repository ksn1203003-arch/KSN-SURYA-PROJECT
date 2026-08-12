const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T | { error: string; requestId?: string }> {
  const requestId = crypto.randomUUID()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Request-ID": requestId, ...(options.headers ?? {}) },
    })
    const data = await res.json() as T | { error: string }
    if (!res.ok) return { error: (data as { error?: string }).error ?? "Request failed", requestId }
    return data
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { error: "Request timed out. Please try again.", requestId }
    return { error: "Network error. Please check your connection.", requestId }
  } finally {
    clearTimeout(timer)
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GradeScale {
  min: number
  grade: string
  label: string
}

export interface SubjectConfig {
  name: string
  max_marks: number
}

export interface ExamDefinition {
  _id: string
  title: string
  exam_type: "unit_test" | "mid_term" | "final" | "practical" | "other"
  date: string
  subjects: SubjectConfig[]
  grade_scale: GradeScale[]
  created_by: string
  created_at: string
}

export interface SubjectResult {
  subject:        string
  max_marks:      number
  marks_obtained: number | null
  is_absent:      boolean
  percentage:     number | null
  grade:          string | null
}

export interface ExamResultRow {
  student_id:     string
  student_name:   string
  subjects:       SubjectResult[]
  total_obtained: number
  total_max:      number
  overall_pct:    number | null
  overall_grade:  string | null
}

export interface StudentExamResult {
  exam_id:        string
  title:          string
  exam_type:      string
  date:           string
  subjects:       SubjectResult[]
  total_obtained: number
  total_max:      number
  overall_pct:    number | null
  overall_grade:  string | null
}

export interface BulkEntry {
  student_id:     string
  subject:        string
  marks_obtained: number | null
  is_absent:      boolean
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function getExams(classId: string) {
  return apiFetch<{ exams: ExamDefinition[] }>(`/api/marks/exams?class_id=${classId}`)
}

export async function createExam(data: {
  class_id:    string
  title:       string
  exam_type:   string
  date:        string
  subjects:    SubjectConfig[]
  grade_scale?: GradeScale[]
}) {
  return apiFetch<{ exam: ExamDefinition }>("/api/marks/exams", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateExam(examId: string, data: Partial<{
  title:       string
  exam_type:   string
  date:        string
  subjects:    SubjectConfig[]
  grade_scale: GradeScale[]
}>) {
  return apiFetch<{ exam: ExamDefinition }>(`/api/marks/exams/${examId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteExam(examId: string) {
  return apiFetch<{ success: boolean }>(`/api/marks/exams/${examId}`, { method: "DELETE" })
}

export async function getExamResults(examId: string) {
  return apiFetch<{ exam: ExamDefinition; rows: ExamResultRow[] }>(`/api/marks/exams/${examId}/results`)
}

export async function saveMarks(examId: string, entries: BulkEntry[]) {
  return apiFetch<{ success: boolean; count: number }>(`/api/marks/exams/${examId}/results`, {
    method: "PUT",
    body: JSON.stringify({ entries }),
  })
}

export async function getMyResults() {
  return apiFetch<{ exams: StudentExamResult[] }>("/api/marks/my-results")
}

export async function getClassSummary(classId: string) {
  return apiFetch<{ exams: ExamDefinition[]; students: Array<{ id: string; name: string }> }>(
    `/api/marks/class-summary?class_id=${classId}`
  )
}

export async function downloadReportCard(studentId: string): Promise<{ error: string } | null> {
  try {
    const res = await fetch(`${BACKEND}/api/marks/report-card/${studentId}`, {
      credentials: "include",
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      return { error: data.error ?? "Failed to generate report card" }
    }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `report-card.pdf`
    a.click()
    URL.revokeObjectURL(url)
    return null
  } catch {
    return { error: "Network error. Please check your connection." }
  }
}

export async function downloadMyReportCard(): Promise<{ error: string } | null> {
  try {
    const res = await fetch(`${BACKEND}/api/marks/my-report-card`, {
      credentials: "include",
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      return { error: data.error ?? "Failed to generate report card" }
    }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `my-report-card.pdf`
    a.click()
    URL.revokeObjectURL(url)
    return null
  } catch {
    return { error: "Network error. Please check your connection." }
  }
}
