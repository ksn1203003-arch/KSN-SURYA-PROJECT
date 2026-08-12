// ─────────────────────────────────────────────────────────────────────────────
// lib/userApi.ts — API functions for admin and teacher operations.
// Covers: school info, class CRUD, timetable, user management, attendance,
// notifications, teacher clock-in/out, and Excel exports.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from "xlsx"

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

async function authFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const requestId = crypto.randomUUID()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        ...(options.headers ?? {}),
      },
    })
    const data = await res.json()
    if (!res.ok) {
      return { error: (data as { error?: string }).error ?? `Request failed (${res.status})`, requestId }
    }
    return data
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { error: "Request timed out. Please try again.", requestId }
    return { error: err instanceof Error ? err.message : "Network error", requestId }
  } finally {
    clearTimeout(timer)
  }
}

export async function getMyClass(): Promise<{
  class: { id: string; grade: number; section: string; label: string; teacher_name?: string | null; subject_teachers?: Array<{ teacher_id: string | null; teacher_name: string | null; subject: string }> } | null
  students: Array<{ id: string; name: string; username: string | null; is_active: boolean; profile_photo_url: string | null }>
} | { error: string }> {
  return authFetch("/api/school/my-class") as never
}

export async function getSchool(): Promise<{
  school: { id: string; name: string; board: string; city: string | null; state: string | null; udise_code: string | null; subscription_plan: string; two_factor_enabled: boolean }
  stats: { teachers: number; students: number; classes: number }
} | { error: string }> {
  return authFetch("/api/school") as never
}

export async function toggleTwoFactor(
  enabled: boolean
): Promise<{ success: boolean; two_factor_enabled: boolean } | { error: string }> {
  return authFetch("/api/school/two-factor", {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  }) as never
}

export async function getClasses(): Promise<{
  classes: Array<{
    id: string; grade: number; section: string; teacher_id: string | null; teacher_name: string | null; student_count: number
    teachers: Array<{ teacher_id: string; teacher_name: string | null; subject: string }>
  }>
} | { error: string }> {
  return authFetch("/api/school/classes") as never
}

export async function createClass(name: string, subjects?: string[]): Promise<{ class: { id: string; grade: number; section: string; name: string | null; subjects: string[] } } | { error: string }> {
  return authFetch("/api/school/classes", {
    method: "POST",
    body: JSON.stringify({ name, subjects }),
  }) as never
}

export async function updateClass(id: string, data: { name?: string; subjects?: string[] }): Promise<{ success: boolean; name: string | null; subjects: string[] } | { error: string }> {
  return authFetch(`/api/school/classes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }) as never
}

export async function saveTimetable(classId: string, slots: Array<{ day: string; period: number; subject: string; teacher_id?: string; start_time: string; end_time: string }>): Promise<{ success: boolean } | { error: string }> {
  return authFetch(`/api/school/classes/${classId}/timetable`, {
    method: "PUT",
    body: JSON.stringify({ slots }),
  }) as never
}

export async function getTeacherClasses(): Promise<{
  classes: Array<{
    id: string; grade: number; section: string; name: string | null; subjects: string[]
    timetable: Array<{ day: string; period: number; subject: string; teacher_id: string | null; teacher_name: string | null; start_time: string; end_time: string }>
    timetable_updated_by_name: string | null; timetable_updated_at: string | null
  }>
} | { error: string }> {
  return authFetch("/api/teacher/my-classes") as never
}

export async function getTeacherTimetable(class_id: string): Promise<{
  class: { id: string; grade: number; section: string; name: string | null }
  timetable: Array<{ day: string; period: number; subject: string; teacher_id: string | null; start_time: string; end_time: string }>
  timetable_updated_by_name: string | null; timetable_updated_at: string | null
} | { error: string }> {
  return authFetch(`/api/teacher/timetable?class_id=${class_id}`) as never
}

export async function saveTeacherTimetable(classId: string, slots: Array<{ day: string; period: number; subject: string; teacher_id?: string | null; start_time: string; end_time: string }>): Promise<{ success: boolean } | { error: string }> {
  return authFetch(`/api/teacher/timetable/${classId}`, {
    method: "PUT",
    body: JSON.stringify({ slots }),
  }) as never
}

export async function getStudentTimetable(): Promise<{
  class: { id: string; grade: number; section: string; name: string | null } | null
  subjects: string[]
  timetable: Array<{ day: string; period: number; subject: string; teacher_id: string | null; teacher_name: string | null; start_time: string; end_time: string }>
  timetable_updated_by_name: string | null; timetable_updated_at: string | null
} | { error: string }> {
  return authFetch("/api/teacher/student-timetable") as never
}

export async function deleteClass(id: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch(`/api/school/classes/${id}`, { method: "DELETE" }) as never
}

export async function getTeachers(): Promise<{
  teachers: Array<{
    id: string; name: string; email: string; phone: string | null; is_active: boolean; class_label: string | null
    subject_assignments: Array<{ class_label: string; subject: string }>
  }>
} | { error: string }> {
  return authFetch("/api/school/teachers") as never
}

export async function getStudents(class_id?: string): Promise<{
  students: Array<{ id: string; name: string; email: string; phone: string | null; username: string | null; gender: string | null; class_id: string | null; class_label: string | null; is_active: boolean; profile_photo_url: string | null }>
} | { error: string }> {
  const qs = class_id ? `?class_id=${class_id}` : ""
  return authFetch(`/api/school/students${qs}`) as never
}

export async function inviteTeacher(data: {
  name: string; email: string; phone?: string; school_id: string; class_id?: string; subject?: string
}): Promise<{ success?: boolean; user_id?: string; temp_password?: string; error?: string }> {
  return authFetch("/api/users/invite-teacher", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

export async function addStudent(data: {
  name: string; email?: string; phone?: string; gender?: string
  school_id: string; class_id: string; roll_no: string
}): Promise<{ success?: boolean; username?: string; temp_password?: string; error?: string }> {
  return authFetch("/api/users/add-student", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

export async function addParent(data: {
  name: string; email: string; student_id: string
}): Promise<{ success?: boolean; email_sent?: boolean; warning?: string; error?: string }> {
  return authFetch("/api/users/add-parent", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

export async function getParents(student_id: string): Promise<{
  parents: Array<{ id: string; name: string; email: string; is_active: boolean; created_at: string | null }>
} | { error: string }> {
  return authFetch(`/api/users/parents?student_id=${encodeURIComponent(student_id)}`) as never
}

export async function updateTeacher(id: string, data: {
  name?: string; email?: string; phone?: string; class_id?: string; subject?: string
}): Promise<{
  id: string; name: string; email: string; phone: string | null; username: string | null
  class_label: string | null; subject_assignments: Array<{ class_label: string; subject: string }>; is_active: boolean
} | { error: string }> {
  return authFetch(`/api/users/teacher/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }) as never
}

export async function bulkInviteTeachers(data: {
  teachers: Array<{ name: string; email: string; phone?: string }>
  school_id: string
}): Promise<{ results?: Array<{ name: string; email: string; temp_password: string; error?: string }>; error?: string }> {
  return authFetch("/api/users/bulk-teachers", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

function sheetToRows(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = e.target?.result
        const wb = XLSX.read(data, { type: "array" })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" })
        // normalise keys: lowercase + underscores
        const normalised = rows.map(r => {
          const out: Record<string, string> = {}
          for (const k of Object.keys(r)) out[k.trim().toLowerCase().replace(/\s+/g, "_")] = String(r[k]).trim()
          return out
        })
        resolve(normalised)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export async function parseTeacherFile(file: File): Promise<Array<{ name: string; email: string; phone?: string }>> {
  const rows = await sheetToRows(file)
  return rows
    .map(row => ({
      name: row["name"] ?? row["teacher_name"] ?? row["full_name"] ?? "",
      email: row["email"] ?? "",
      phone: row["phone"] || row["mobile"] || undefined,
    }))
    .filter(r => r.name && r.email)
}

// keep old name as alias so nothing else breaks
export async function parseTeacherCSV(text: string): Promise<Array<{ name: string; email: string; phone?: string }>> {
  const blob = new Blob([text], { type: "text/csv" })
  const file = new File([blob], "data.csv", { type: "text/csv" })
  return parseTeacherFile(file)
}

export async function setTeacherAssignments(id: string, assignments: Array<{ class_id: string; subject: string }>): Promise<{
  id: string; name: string; email: string; phone: string | null; username: string | null
  class_label: string | null
  subject_assignments: Array<{ class_label: string; subject: string; class_id: string }>
  is_active: boolean
} | { error: string }> {
  return authFetch(`/api/users/teacher/${id}/assignments`, {
    method: "PUT",
    body: JSON.stringify({ assignments }),
  }) as never
}

export async function bulkTransferStudents(student_ids: string[], class_id: string): Promise<{ success: boolean; class_id: string; class_label: string | null } | { error: string }> {
  return authFetch("/api/users/bulk-transfer", {
    method: "PATCH",
    body: JSON.stringify({ student_ids, class_id }),
  }) as never
}

export async function bulkSetGender(student_ids: string[], gender: string): Promise<{ success: boolean; gender: string } | { error: string }> {
  return authFetch("/api/users/bulk-gender", {
    method: "PATCH",
    body: JSON.stringify({ student_ids, gender }),
  }) as never
}

export async function bulkAssignTeachersToClass(teacher_ids: string[], class_id: string): Promise<{ success: boolean; class_id: string; class_label: string | null } | { error: string }> {
  return authFetch("/api/users/bulk-assign-class", {
    method: "PATCH",
    body: JSON.stringify({ teacher_ids, class_id }),
  }) as never
}

export async function bulkDeleteUsers(ids: string[]): Promise<{ success: boolean; deleted: number } | { error: string }> {
  return authFetch("/api/users/bulk-delete", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  }) as never
}

export async function updateStudent(id: string, data: {
  name?: string; email?: string; phone?: string; gender?: string; class_id?: string
}): Promise<{ id: string; name: string; email: string; phone: string | null; username: string | null; gender: string | null; class_id: string | null; class_label: string | null; is_active: boolean } | { error: string }> {
  return authFetch(`/api/users/student/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }) as never
}

export async function bulkAddStudents(data: {
  students: Array<{ name: string; roll_no: string; email?: string; phone?: string }>
  class_id: string
  school_id: string
}): Promise<{ results?: Array<{ name: string; username: string; temp_password: string; error?: string }>; error?: string }> {
  return authFetch("/api/users/bulk-students", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

export async function removeUser(id: string): Promise<{ success?: boolean; error?: string }> {
  return authFetch(`/api/users/${id}`, { method: "DELETE" }) as never
}

export async function updateSchool(data: {
  name?: string; board?: string; city?: string; state?: string; udise_code?: string
}): Promise<{ school: unknown } | { error: string }> {
  return authFetch("/api/school", {
    method: "PATCH",
    body: JSON.stringify(data),
  }) as never
}

export async function updateProfile(data: {
  name?: string; email?: string; phone?: string; preferred_language?: string
}): Promise<{ user: unknown } | { error: string }> {
  return authFetch("/api/users/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  }) as never
}

export async function uploadAvatar(base64: string): Promise<{ user: unknown } | { error: string }> {
  return authFetch("/api/users/profile", {
    method: "PATCH",
    body: JSON.stringify({ profile_photo_url: base64 }),
  }) as never
}

export async function saveAttendance(data: {
  class_id: string; date: string; period: number; subject?: string
  records: Array<{ student_id: string; student_name: string; status: "present" | "absent" | "late" }>
}): Promise<{ success: boolean } | { error: string }> {
  return authFetch("/api/teacher/attendance", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

export async function getAttendance(class_id: string, date: string, period?: number): Promise<{
  attendance: { period: number; subject: string; records: Array<{ student_id: string; student_name: string; status: string }> } | null
} | { error: string }> {
  const params = new URLSearchParams({ class_id, date })
  if (period) params.set("period", String(period))
  return authFetch(`/api/teacher/attendance?${params}`) as never
}

export async function getStudentAttendance(): Promise<{
  records: Array<{ date: string; period: number; subject: string; status: string }>
} | { error: string }> {
  return authFetch("/api/teacher/student-attendance") as never
}

export async function getClassStudents(class_id: string): Promise<{
  students: Array<{ id: string; name: string; username: string | null; is_active: boolean }>
} | { error: string }> {
  return authFetch(`/api/teacher/class-students?class_id=${encodeURIComponent(class_id)}`) as never
}

export async function getClockStatus(): Promise<{ clocked_in: boolean; since: string | null } | { error: string }> {
  return authFetch("/api/auth/clock-status") as never
}

export async function clockIn(): Promise<{ success: boolean; clocked_in: boolean; time?: string; error?: string }> {
  return authFetch("/api/auth/clock-in", { method: "POST" }) as never
}

export async function clockOut(): Promise<{ success: boolean; clocked_in: boolean; duration_minutes?: number; time?: string; error?: string }> {
  return authFetch("/api/auth/clock-out", { method: "POST" }) as never
}

export async function getStudentProgress(class_id: string): Promise<{
  progress: Array<{ student_id: string; course: number; attendance: number | null }>
} | { error: string }> {
  return authFetch(`/api/teacher/student-progress?class_id=${encodeURIComponent(class_id)}`) as never
}

export interface AttSlot {
  total: number; present: number; absent: number; late: number; rate: number; recorded: boolean
}
export interface StudentAttStats {
  student_id: string
  name:       string
  today:      AttSlot
  this_week:  AttSlot
  this_month: AttSlot
  this_year:  AttSlot
}
export interface ClassAttStats {
  class_total: { today: AttSlot; this_week: AttSlot; this_month: AttSlot; this_year: AttSlot }
  students:    StudentAttStats[]
}

export async function getClassAttendanceStats(class_id: string): Promise<ClassAttStats | { error: string }> {
  return authFetch(`/api/teacher/attendance-stats?class_id=${encodeURIComponent(class_id)}`) as never
}

export interface ClassRangeStats {
  class_total: AttSlot
  students:    Array<{ student_id: string; name: string; slot: AttSlot }>
  from:        string
  to:          string
}

export async function getClassAttendanceRange(
  class_id: string, from: string, to: string
): Promise<ClassRangeStats | { error: string }> {
  const p = new URLSearchParams({ class_id, from, to })
  return authFetch(`/api/teacher/attendance-range?${p}`) as never
}

export async function getWeekActivity(weekOffset = 0): Promise<{
  week:         Array<{ day: string; date: string; minutes: number; hours: number; isToday: boolean }>
  weekLabel:    string
  totalMinutes: number
  totalHours:   number
} | { error: string }> {
  return authFetch(`/api/teacher/activity/week?weekOffset=${weekOffset}`) as never
}

export async function getTeacherSessions(
  days = 30,
  startDate?: string,
  endDate?: string,
): Promise<{
  summary: Array<{
    id: string; name: string; email: string
    login_days: number; total_hours: number; attendance_pct: number
    is_online: boolean; last_login: string | null
    today: { clock_in: string; clock_out: string | null; duration_minutes: number } | null
  }>
  days: number
} | { error: string }> {
  const params = startDate && endDate
    ? `start_date=${startDate}&end_date=${endDate}`
    : `days=${days}`
  return authFetch(`/api/school/teacher-sessions?${params}`) as never
}

export interface StudentAttendanceToday {
  student_id: string
  status: "present" | "absent" | "not_recorded"
  present_count: number
  total_count: number
}

export async function getSchoolAttendanceToday(): Promise<{ attendance: StudentAttendanceToday[]; date: string } | { error: string }> {
  return authFetch("/api/school/attendance/today") as never
}

export async function parseStudentFile(file: File): Promise<Array<{ name: string; roll_no: string; email?: string; phone?: string }>> {
  const rows = await sheetToRows(file)
  return rows
    .map(row => ({
      name: row["name"] ?? row["student_name"] ?? row["full_name"] ?? "",
      roll_no: row["roll_no"] ?? row["roll"] ?? row["roll_number"] ?? "",
      email: row["email"] || undefined,
      phone: row["phone"] || row["mobile"] || undefined,
    }))
    .filter(r => r.name && r.roll_no)
}

// keep old name as alias
export async function parseStudentCSV(text: string): Promise<Array<{ name: string; roll_no: string; email?: string; phone?: string }>> {
  const blob = new Blob([text], { type: "text/csv" })
  const file = new File([blob], "data.csv", { type: "text/csv" })
  return parseStudentFile(file)
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotifType = "announcement" | "reminder" | "achievement" | "alert" | "event"

export interface AppNotification {
  id: string
  type: NotifType
  title: string
  message: string
  target_label: string
  created_by_name: string
  created_by_role: string
  created_at: string
  expires_at: string | null
  read: boolean
}

export interface AdminNotification extends AppNotification {
  target: string
}

/** Fetch notifications for the current user (teacher / student) */
export async function getMyNotifications(): Promise<{ notifications: AppNotification[] } | { error: string }> {
  return authFetch("/api/teacher/notifications") as never
}

/** Mark a single notification as read */
export async function markNotificationRead(notification_id: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch("/api/teacher/notifications/read", {
    method: "PATCH",
    body: JSON.stringify({ notification_id }),
  }) as never
}

/** Mark ALL notifications as read */
export async function markAllNotificationsRead(): Promise<{ success: boolean } | { error: string }> {
  return authFetch("/api/teacher/notifications/read-all", { method: "PATCH" }) as never
}

/** Admin: fetch all sent notifications */
export async function getAdminNotifications(): Promise<{ notifications: AdminNotification[] } | { error: string }> {
  return authFetch("/api/school/notifications") as never
}

/** Admin: create a notification */
export async function createNotification(data: {
  type: NotifType
  title: string
  message: string
  target: string
  target_label: string
  expires_at?: string
  scheduled_at?: string
}): Promise<{ success: boolean; notification: { id: string } } | { error: string }> {
  return authFetch("/api/school/notifications", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

/** Admin: delete a notification */
export async function deleteNotification(id: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch(`/api/school/notifications/${id}`, { method: "DELETE" }) as never
}

/** Teacher: send notification to their class */
export async function sendTeacherNotification(data: {
  type: NotifType
  title: string
  message: string
  class_id?: string
  student_ids?: string[]
  scheduled_at?: string   // ISO date string "YYYY-MM-DD"
}): Promise<{ success: boolean } | { error: string }> {
  return authFetch("/api/teacher/notifications", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

export async function getTeacherSentNotifications(): Promise<{
  notifications: Array<{
    id: string; type: string; title: string; message: string;
    target_label: string; scheduled_at: string | null; created_at: string
  }>
} | { error: string }> {
  return authFetch("/api/teacher/notifications/sent") as never
}

export async function deleteTeacherNotification(id: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch(`/api/teacher/notifications/${id}`, { method: "DELETE" }) as never
}

// ── Password change ───────────────────────────────────────────────────────────

export async function changePassword(current_password: string, new_password: string): Promise<{ user: unknown } | { error: string }> {
  return authFetch("/api/users/profile", {
    method: "PATCH",
    body: JSON.stringify({ current_password, new_password }),
  }) as never
}

// ── Certificates (admin) ──────────────────────────────────────────────────────

export interface IssuedCertificate {
  id: string
  student_id: string
  student_name: string
  class_label: string
  module_title: string
  subject: string
  issued_at: string
  type: string
  custom_title?: string
  custom_reason?: string
  pdf_gridfs_id?: string | null
}

export interface AdminCertificate {
  _id: string
  student_id: string
  student_name: string
  module_title: string
  subject: string
  class_label: string
  issued_at: string
  type: string
  custom_title: string
  custom_reason: string
  cert_template?: string | null
}

export interface CertTemplateData {
  school_name: string
  description: string
  footer_left: string
  footer_right: string
  accent_color: string
  logo_base64: string | null
  logo_mime: string | null
}

export async function getAllCertificates(): Promise<{ certificates: IssuedCertificate[] } | { error: string }> {
  return authFetch("/api/certificates") as never
}

export async function getCertsByClass(classId: string): Promise<{
  modules: Array<{ module_id: string; module_title: string; subject: string; total_items: number; certificates: AdminCertificate[] }>
  custom_certificates: AdminCertificate[]
} | { error: string }> {
  return authFetch(`/api/certificates/class/${encodeURIComponent(classId)}`) as never
}

export async function getCertTemplate(): Promise<{ template: CertTemplateData } | { error: string }> {
  return authFetch("/api/certificates/template") as never
}

export async function saveCertTemplate(data: {
  school_name: string; description: string; footer_left: string; footer_right: string; accent_color: string
}): Promise<{ template: unknown } | { error: string }> {
  return authFetch("/api/certificates/template", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

export async function uploadCertLogo(file: File): Promise<{ success: boolean } | { error: string }> {
  const form = new FormData()
  form.append("logo", file)
  try {
    const res = await fetch(`${BACKEND}/api/certificates/template/logo`, {
      method: "POST",
      credentials: "include",
      body: form,
    })
    const data = await res.json()
    if (!res.ok) return { error: (data as { error?: string }).error ?? `Upload failed (${res.status})` }
    return data as { success: boolean }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error" }
  }
}

export async function deleteCertLogo(): Promise<{ success: boolean } | { error: string }> {
  return authFetch("/api/certificates/template/logo", { method: "DELETE" }) as never
}

export async function issueCustomCertificate(data: {
  class_id: string
  student_ids: string[]
  custom_title: string
  custom_reason?: string
  cert_template?: "course_completion" | "academic_excellence" | "outstanding_achievement"
}): Promise<{ created: number; certificates: unknown[] } | { error: string }> {
  return authFetch("/api/certificates/custom-issue", {
    method: "POST",
    body: JSON.stringify(data),
  }) as never
}

export async function revokeCertificate(id: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch(`/api/certificates/${id}`, { method: "DELETE" }) as never
}

export async function openCertPdf(certId: string): Promise<{ error: string } | null> {
  try {
    const res = await fetch(`${BACKEND}/api/certificates/download/${certId}?inline=1`, {
      credentials: "include",
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: (data as { error?: string }).error ?? `Failed (${res.status})` }
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return null
  } catch {
    return { error: "Network error — could not load certificate" }
  }
}

export function openCertPreview(): void {
  const win = window.open("", "_blank", "noopener,noreferrer")
  if (!win) { alert("Please allow popups for this site to preview certificates."); return }
  win.document.write("<p style='font-family:sans-serif;padding:20px'>Generating preview…</p>")
  fetch(`${BACKEND}/api/certificates/preview`, {
    method: "POST",
    credentials: "include",
  })
    .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.blob() })
    .then(blob => {
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }))
      win.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    })
    .catch(err => {
      win.document.open()
      win.document.write(`<html><body style='font-family:sans-serif;padding:20px'>Preview failed: ${err.message}</body></html>`)
      win.document.close()
    })
}

export function viewCertPDF(certId: string): void {
  const win = window.open(`${BACKEND}/api/certificates/download/${certId}?inline=1`, "_blank", "noopener,noreferrer")
  if (!win) alert("Please allow popups for this site to view certificates.")
}

export function downloadCertPDF(certId: string, studentName: string): void {
  const a = document.createElement("a")
  a.href = `${BACKEND}/api/certificates/download/${certId}`
  a.download = `Certificate_${studentName.replace(/[^a-z0-9]/gi, "_")}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function bulkDownloadCerts(classId: string, moduleId: string): void {
  fetch(`${BACKEND}/api/certificates/bulk-generate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_id: classId, module_id: moduleId }),
  })
    .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.blob() })
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Certificates_${moduleId}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    })
    .catch(err => alert(`Download failed: ${err.message}`))
}

export async function deleteCert(certId: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch(`/api/certificates/${certId}`, { method: "DELETE" }) as never
}

export async function getChallenges(): Promise<{
  challenges: Array<{
    _id: string; title: string; difficulty: "Easy" | "Medium" | "Hard"
    language: string; description: string; class_id: string
    deadline: string | null; is_active: boolean; created_at: string
  }>
} | { error: string }> {
  return authFetch("/api/challenges") as never
}

export async function getChallengeSubmissions(challengeId: string): Promise<{
  submissions: Array<{ student_name: string; code: string; language: string; submitted_at: string }>
} | { error: string }> {
  return authFetch(`/api/challenges/${challengeId}/submissions`) as never
}

export async function getTeacherDetail(teacherId: string): Promise<{
  last_login: string | null
  sessions_this_month: number
  modules_count: number
  quizzes_count: number
  challenges_count: number
  total_students: number
  class_details: Array<{ label: string; student_count: number; subjects: string[] }>
} | { error: string }> {
  return authFetch(`/api/school/teacher-detail/${teacherId}`) as never
}

export async function getStudentDetail(studentId: string): Promise<{
  attendance_rate: number | null
  attendance_breakdown: { present: number; late: number; absent: number; total: number }
  last_active: string | null
  minutes_active_last_day: number
  certificates_count: number
  modules_completed: number
  quizzes_attempted: number
  quiz_avg_score: number | null
} | { error: string }> {
  return authFetch(`/api/school/student-detail/${studentId}`) as never
}

export async function getTeacherAttDetail(
  teacherId: string,
  period: "today" | "week" | "month" | "year" | "custom",
  from?: string,
  to?: string,
): Promise<{
  period: string; from: string; to: string
  login_days: number; total_days: number; total_hours: number; attendance_pct: number
  sessions: Array<{ date: string; login_at: string | null; logout_at: string | null; duration_minutes: number }>
} | { error: string }> {
  let url = `/api/school/teacher-attendance-detail/${teacherId}?period=${period}`
  if (period === "custom" && from && to) url += `&from=${from}&to=${to}`
  return authFetch(url) as never
}

export async function getStudentAttDetail(
  studentId: string,
  period: "today" | "week" | "month" | "year" | "custom",
  from?: string,
  to?: string,
): Promise<{
  period: string; from: string; to: string
  summary: { total: number; present: number; late: number; absent: number; rate: number | null }
  records: Array<{ date: string; period: number; subject: string; status: string }>
} | { error: string }> {
  let url = `/api/school/student-attendance-detail/${studentId}?period=${period}`
  if (period === "custom" && from && to) url += `&from=${from}&to=${to}`
  return authFetch(url) as never
}

export function downloadComplianceReport(): void {
  fetch(`${BACKEND}/api/reports/compliance`, { credentials: "include" })
    .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.blob() })
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "compliance_report.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    })
    .catch(err => alert(`Download failed: ${err.message}`))
}
