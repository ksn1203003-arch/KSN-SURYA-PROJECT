// ─────────────────────────────────────────────────────────────────────────────
// lib/studentApi.ts — API functions for student-specific data.
// Dashboard stats, quiz attempts, challenge submissions, certificates,
// activity ping/clockout, and classmate leaderboard.
// ─────────────────────────────────────────────────────────────────────────────
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    if (!res.ok) return { error: (data as { error?: string }).error ?? `Request failed (${res.status})`, requestId } as T
    return data as T
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { error: "Request timed out. Please try again.", requestId } as T
    return { error: err instanceof Error ? err.message : "Network error", requestId } as T
  } finally {
    clearTimeout(timer)
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  modules_completed: number
  modules_total:     number
  points_total:      number
  avg_quiz_score:    number
  quizzes_taken:     number
  days_present:      number
  days_total:        number
  attendance_rate:   number
  streak_days:       number
  module_progress:   { subject: string; completed: number; total: number }[]
  weekly_activity:   { date: string; day: string; minutes: number; school_day_minutes: number }[]
  continue_learning: { module_id: string; module_title: string; subject: string; completed: number; total: number }[]
  upcoming_events:   AppNotificationEvent[]
}

export interface AppNotificationEvent {
  _id:           string
  type:          string
  title:         string
  message:       string
  created_at:    string
  target_label?: string
}

export interface Quiz {
  _id:               string
  title:             string
  class_id:          string
  questions:         QuizQuestion[]
  is_active:         boolean
  created_at:        string
  deadline:          string | null
  max_attempts:      number
  shuffle_on_retry:  boolean
  attempts_reset_at: string | null
  attempt_count?:    number
  best_score?:       number | null
}

export interface QuizQuestion {
  text:          string
  options:       [string, string, string, string]
  correct_index: number
  explanation:   string
}

export interface QuizAttemptResult {
  attempt:      { _id: string; score: number; total: number; percentage: number; submitted_at: string }
  per_question: Array<{ was_correct: boolean }>
  explanations: string[]
}

export interface QuizHistory {
  _id:          string
  quiz_title:   string
  score:        number
  total:        number
  percentage:   number
  submitted_at: string
}

export interface CodeChallenge {
  _id:             string
  class_id?:       string
  title:           string
  difficulty:      "Easy" | "Medium" | "Hard"
  language:        "javascript" | "python" | "html"
  description:     string
  constraints:     string
  expected_output: string
  deadline:        string | null
  submitted:       boolean
  created_at:      string
}

export interface StudentCertificate {
  _id:           string
  module_id:     string | null
  module_title:  string
  subject:       string
  class_label:   string
  student_name:  string
  student_id:    string
  issued_at:     string
  type:          "module" | "custom"
  custom_title:  string
  custom_reason: string
}

export interface EligibleSubject {
  subject:           string
  modules_count:     number
  total_items_count: number
}

export interface StudentQuest {
  id:          string
  icon:        string
  label:       string
  description: string
  points:      number
  done:        boolean
  progress:    number
  total:       number
  resets:      "daily" | "weekly" | "ongoing"
}

// ── API calls ──────────────────────────────────────────────────────────────────

// Dashboard
export async function getStudentDashboard(): Promise<DashboardSummary | { error: string }> {
  return apiFetch("/api/student/dashboard")
}

export async function getStudentQuests(): Promise<{ quests: StudentQuest[] } | { error: string }> {
  return apiFetch("/api/student/quests")
}

export async function getClassmates(): Promise<{
  classmates: { _id: string; name: string; points: number; initials: string }[]
} | { error: string }> {
  return apiFetch("/api/student/classmates")
}

export interface MyTeacher {
  id:                string
  name:              string
  phone:             string | null
  profile_photo_url: string | null
  subjects:          string[]
}

export async function getMyTeachers(): Promise<{ teachers: MyTeacher[] } | { error: string }> {
  return apiFetch("/api/student/teachers")
}

export interface AttendancePeriodSummary {
  total:    number
  present:  number
  absent:   number
  late:     number
  rate:     number
  recorded: boolean
}

export interface AttendanceSummary {
  today:      AttendancePeriodSummary
  this_week:  AttendancePeriodSummary
  this_month: AttendancePeriodSummary
  this_year:  AttendancePeriodSummary
}

export async function getMyAttendance(): Promise<{
  summary: AttendanceSummary
  records: Array<{ date: string; period: number; subject: string; status: string }>
} | { error: string }> {
  return apiFetch("/api/student/attendance")
}

// Fetches attendance stats for a custom date range (called on-demand)
// from / to must be YYYY-MM-DD strings
export async function getAttendanceRange(from: string, to: string): Promise<{
  result: AttendancePeriodSummary
} | { error: string }> {
  return apiFetch(`/api/student/attendance/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
}

export async function pingActivity(action: "login" | "item_viewed"): Promise<void> {
  try {
    await apiFetch("/api/student/activity/ping", {
      method: "POST",
      body: JSON.stringify({ action }),
    })
  } catch { /* non-fatal */ }
}

// Called when student clicks Clock Out — saves total minutes spent in session
export async function studentClockOut(minutes: number): Promise<void> {
  try {
    await apiFetch("/api/student/activity/clockout", {
      method: "POST",
      body: JSON.stringify({ minutes }),
    })
  } catch { /* non-fatal */ }
}

// Quizzes
export async function getMyQuizzes(): Promise<{ quizzes: Quiz[] } | { error: string }> {
  return apiFetch("/api/quizzes")
}

export async function submitQuizAttempt(
  quizId: string,
  answers: number[]
): Promise<QuizAttemptResult | { error: string }> {
  return apiFetch(`/api/quizzes/${quizId}/attempt`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  })
}

export async function getMyQuizAttempts(): Promise<{ history: QuizHistory[] } | { error: string }> {
  return apiFetch("/api/quizzes/my-attempts")
}

// Teacher: create quiz
export async function createQuiz(data: {
  title:            string
  class_id:         string
  questions:        Array<{ text: string; options: string[]; correct_index: number; explanation?: string }>
  deadline?:        string | null
  shuffle_on_retry?: boolean
}): Promise<{ quiz: Quiz } | { error: string }> {
  return apiFetch("/api/quizzes", { method: "POST", body: JSON.stringify(data) })
}

export async function updateQuizDeadline(
  quizId: string,
  deadline: string | null
): Promise<{ quiz: Quiz } | { error: string }> {
  return apiFetch(`/api/quizzes/${quizId}`, { method: "PATCH", body: JSON.stringify({ deadline }) })
}

export async function deleteQuiz(quizId: string): Promise<{ success: boolean } | { error: string }> {
  return apiFetch(`/api/quizzes/${quizId}`, { method: "DELETE" })
}

export async function getQuizResults(quizId: string): Promise<{
  results: Array<{
    student_name:        string
    attempt_count:       number
    best_score:          number
    best_percentage:     number
    latest_percentage:   number
    latest_submitted_at: string
  }>
} | { error: string }> {
  return apiFetch(`/api/quizzes/${quizId}/results`)
}

export async function getMyQuizzesForClass(classId: string): Promise<{ quizzes: Quiz[] } | { error: string }> {
  return apiFetch(`/api/quizzes?class_id=${encodeURIComponent(classId)}`)
}

// Code Challenges
export async function getActiveChallenges(): Promise<{ challenges: CodeChallenge[] } | { error: string }> {
  return apiFetch("/api/challenges")
}

export async function submitChallenge(
  challengeId: string,
  code: string,
  language: string
): Promise<{ submission: unknown } | { error: string }> {
  return apiFetch(`/api/challenges/${challengeId}/submit`, {
    method: "POST",
    body: JSON.stringify({ code, language }),
  })
}

export async function createChallenge(data: {
  title: string
  class_id: string
  difficulty: string
  language: string
  description: string
  constraints: string
  expected_output: string
  deadline?: string
}): Promise<{ challenge: CodeChallenge } | { error: string }> {
  return apiFetch("/api/challenges", { method: "POST", body: JSON.stringify(data) })
}

export async function deleteChallenge(id: string): Promise<{ success: boolean } | { error: string }> {
  return apiFetch(`/api/challenges/${id}`, { method: "DELETE" })
}

export async function getChallengeSubmissions(challengeId: string): Promise<{
  submissions: Array<{ student_name: string; code: string; language: string; submitted_at: string }>
} | { error: string }> {
  return apiFetch(`/api/challenges/${challengeId}/submissions`)
}

// Certificates
export async function getMyCertificates(): Promise<{ certificates: StudentCertificate[] } | { error: string }> {
  return apiFetch("/api/student-certificates/mine")
}

export async function claimCertificate(subject: string): Promise<{ certificate: StudentCertificate } | { error: string }> {
  return apiFetch("/api/student-certificates/claim", {
    method: "POST",
    body: JSON.stringify({ subject }),
  })
}

export async function getEligibleCertificates(): Promise<{ eligible: EligibleSubject[] } | { error: string }> {
  return apiFetch("/api/student-certificates/eligible")
}

// Download student's own cert PDF — triggers browser download
export function downloadStudentCertPDF(certId: string, studentName: string): void {
  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
  const url = `${BACKEND}/api/student-certificates/download/${certId}`

  // iOS Safari ignores the `download` attribute on cross-origin links.
  // Opening in a new tab lets the user save via the PDF viewer's share/action sheet.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream
  if (isIOS) {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }

  const a = document.createElement("a")
  a.href = url
  a.download = `Certificate_${studentName.replace(/\s+/g, "_")}.pdf`
  a.click()
}

// Open student's own cert PDF in browser tab (view without download)
export function viewStudentCertPDF_student(certId: string): void {
  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
  window.open(`${BACKEND}/api/student-certificates/download/${certId}?inline=1`, "_blank", "noopener,noreferrer")
}

export interface CertTemplate {
  school_name:    string
  description:    string
  footer_left:    string
  footer_right:   string
  accent_color:   string
  logo_gridfs_id: string | null
  logo_base64?:   string | null
  logo_mime?:     string | null
}

export async function getCertTemplate(): Promise<{ template: CertTemplate } | { error: string }> {
  return apiFetch("/api/certificates/template")
}

export async function saveCertTemplate(data: Omit<CertTemplate, "logo_gridfs_id">): Promise<{ template: CertTemplate } | { error: string }> {
  return apiFetch("/api/certificates/template", { method: "POST", body: JSON.stringify(data) })
}

export async function uploadCertLogo(file: File): Promise<{ success: boolean } | { error: string }> {
  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
  const form = new FormData(); form.append("logo", file)
  const res = await fetch(`${BACKEND}/api/certificates/template/logo`, {
    method: "POST", body: form, credentials: "include",
  })
  return res.json()
}

export async function removeCertLogo(): Promise<{ success: boolean } | { error: string }> {
  return apiFetch("/api/certificates/template/logo", { method: "DELETE" })
}

export async function getCertsByClass(classId: string): Promise<{
  modules: Array<{
    module_id: string; module_title: string; subject: string; total_items: number
    certificates: StudentCertificate[]
  }>
  custom_certificates: StudentCertificate[]
  removed_modules: Array<{
    module_title: string; subject: string; certificates: StudentCertificate[]
  }>
} | { error: string }> {
  return apiFetch(`/api/certificates/class/${classId}`)
}

// Teacher downloads any cert PDF
export function downloadCertPDF(certId: string, studentName: string): void {
  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
  const a = document.createElement("a")
  a.href = `${BACKEND}/api/certificates/download/${certId}`
  a.download = `Certificate_${studentName.replace(/\s+/g, "_")}.pdf`
  a.click()
}

// Teacher views any cert PDF inline in a new browser tab
export function viewCertPDF(certId: string): void {
  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
  window.open(`${BACKEND}/api/certificates/download/${certId}?inline=1`, "_blank", "noopener,noreferrer")
}

// Teacher issues custom certificates to one or more students
export async function issueCertificates(data: {
  class_id: string
  student_ids: string[]
  custom_title: string
  custom_reason?: string
  cert_template?: "course_completion" | "academic_excellence" | "outstanding_achievement"
}): Promise<{ created: number; certificates: StudentCertificate[] } | { error: string }> {
  return apiFetch("/api/certificates/custom-issue", { method: "POST", body: JSON.stringify(data) })
}

// Teacher revokes a custom certificate
export async function revokeCustomCert(certId: string): Promise<{ success: boolean } | { error: string }> {
  return apiFetch(`/api/certificates/${certId}`, { method: "DELETE" })
}

// Teacher deletes any certificate (module or custom)
export async function deleteCert(certId: string): Promise<{ success: boolean } | { error: string }> {
  return apiFetch(`/api/certificates/${certId}`, { method: "DELETE" })
}

// Teacher: open preview in new tab
// Opens window synchronously (before async fetch) so popup blocker doesn't block it
export function previewCertPDF(data: Omit<CertTemplate, "logo_gridfs_id">): void {
  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

  // Must open the window synchronously from the user click — async .then() gets blocked
  const win = window.open("", "_blank", "noopener,noreferrer")
  if (!win) {
    alert("Please allow popups for this site to preview certificates.")
    return
  }
  win.document.write("<p style='font-family:sans-serif;padding:40px;color:#666'>Generating preview…</p>")

  fetch(`${BACKEND}/api/certificates/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  })
    .then(r => {
      if (!r.ok) throw new Error(`Server error ${r.status}`)
      return r.blob()
    })
    .then(blob => {
      // Use <embed> — Chrome's PDF viewer renders blob URLs reliably this way
      // win.location.href = blobUrl does NOT reliably trigger Chrome's PDF viewer
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }))
      win.document.open()
      win.document.write(
        `<!DOCTYPE html><html><head><style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#525659}</style></head>` +
        `<body><embed src="${url}" type="application/pdf" width="100%" height="100%"/></body></html>`
      )
      win.document.close()
    })
    .catch(err => {
      win.document.open()
      win.document.write(`<html><body style="font-family:sans-serif;padding:40px;color:red"><h3>Preview failed</h3><p>${err.message}</p><p>Make sure the backend is running on port 4000.</p></body></html>`)
      win.document.close()
    })
}

// Teacher: bulk download ZIP for a module
export function bulkDownloadCerts(classId: string, moduleId: string): void {
  const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
  fetch(`${BACKEND}/api/certificates/bulk-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_id: classId, module_id: moduleId }),
    credentials: "include",
  }).then(r => {
    if (!r.ok) throw new Error("Failed")
    return r.blob()
  }).then(blob => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.download = `Certificates_${moduleId}.zip`; a.click()
  })
}
