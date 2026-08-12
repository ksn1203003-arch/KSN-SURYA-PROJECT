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
    const data = await res.json()
    if (!res.ok) return { error: (data as { error?: string }).error ?? "Request failed", requestId }
    return data as T
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { error: "Request timed out. Please try again.", requestId }
    return { error: "Network error. Please check your connection.", requestId }
  } finally {
    clearTimeout(timer)
  }
}

export interface ChildProfile {
  _id: string
  name: string
  email: string
  phone: string | null
  class_id: string | null
  school_id: string
  profile_photo_url: string | null
  preferred_language: string
}

export interface ChildClass {
  _id: string
  name: string
  grade: number
  section: string
  subjects: string[]
}

export interface ChildTeacher {
  _id: string
  name: string
  email: string
}

export interface AttendanceRecord {
  date: string
  period: number
  status: "present" | "absent" | "late"
}

export interface ChildAttendance {
  records: AttendanceRecord[]
  total: number
  present: number
  late: number
  absent: number
  rate: number | null
}

export interface ModuleProgress {
  module_id: string
  title: string
  subject: string
  total_items: number
  viewed_items: number
  percentage: number
}

export interface ExamSubjectResult {
  subject: string
  max_marks: number
  marks_obtained: number | null
  is_absent: boolean
  percentage: number | null
}

export interface ChildExamResult {
  exam_id: string
  title: string
  exam_type: string
  date: string
  subjects: ExamSubjectResult[]
  total_obtained: number
  total_max: number
  overall_pct: number | null
}

export interface ChildCertificate {
  _id: string
  module_title: string
  subject: string
  class_label: string
  issued_at: string
  type: string
}

export async function getChildProfile() {
  return apiFetch<{ child: ChildProfile; class: ChildClass | null; teachers: ChildTeacher[] }>("/api/parent/child")
}

export async function getChildAttendance() {
  return apiFetch<ChildAttendance>("/api/parent/child/attendance")
}

export async function getChildProgress() {
  return apiFetch<{ modules: ModuleProgress[] }>("/api/parent/child/progress")
}

export async function getChildMarks() {
  return apiFetch<{ exams: ChildExamResult[] }>("/api/parent/child/marks")
}

export async function getChildCertificates() {
  return apiFetch<{ certificates: ChildCertificate[] }>("/api/parent/child/certificates")
}
