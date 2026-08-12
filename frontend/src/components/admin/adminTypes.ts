import type { DeletionRequest } from "@/lib/dpdpApi"
import type { AdminNotification, NotifType, CertTemplateData, AdminCertificate, StudentAttendanceToday } from "@/lib/userApi"
import type { ExamDefinition as ExamDef, ExamResultRow } from "@/lib/marksApi"

export type { DeletionRequest, AdminNotification, NotifType, CertTemplateData, AdminCertificate, StudentAttendanceToday, ExamDef, ExamResultRow }

export interface SchoolData {
  id: string; name: string; board: string; city: string | null; state: string | null
  udise_code: string | null; subscription_plan: string; two_factor_enabled: boolean
}
export interface Stats { teachers: number; students: number; classes: number }
export interface TimetableSlot { day: string; period: number; subject: string; teacher_id: string | null; start_time: string; end_time: string }
export interface TimetableVersion { updated_by_name: string; updated_at: string; slots: TimetableSlot[] }
export interface ClassRow { id: string; grade: number; section: string; name: string | null; subjects: string[]; teacher_id: string | null; teacher_name: string | null; student_count: number; teachers: Array<{ teacher_id: string; teacher_name: string | null; subject: string }>; timetable: TimetableSlot[]; timetable_updated_by_name?: string | null; timetable_updated_at?: string | null; timetable_versions?: TimetableVersion[] }
export interface TeacherRow { id: string; name: string; email: string; phone: string | null; is_active: boolean; profile_photo_url: string | null; created_at: string | null; class_label: string | null; subject_assignments: Array<{ class_id: string; class_label: string; subject: string }> }
export interface TeacherDetail { last_login: string | null; sessions_this_month: number; modules_count: number; quizzes_count: number; challenges_count: number; total_students: number; class_details: Array<{ label: string; student_count: number; subjects: string[] }> }
export interface BulkTeacherResult { name: string; email: string; temp_password: string; error?: string }
export interface StudentRow { id: string; name: string; email: string; phone: string | null; username: string | null; gender: string | null; class_id: string | null; class_label: string | null; is_active: boolean; profile_photo_url: string | null; points: number; created_at: string | null }
export interface StudentDetail { attendance_rate: number | null; attendance_breakdown: { present: number; late: number; absent: number; total: number }; last_active: string | null; minutes_active_last_day: number; certificates_count: number; modules_completed: number; quizzes_attempted: number; quiz_avg_score: number | null }
export interface BulkResult { name: string; username: string; temp_password: string; error?: string }
export interface ChallengeRow { _id: string; title: string; difficulty: "Easy" | "Medium" | "Hard"; language: string; description: string; class_id: string; deadline: string | null; is_active: boolean; created_at: string }
export type AttPeriod = "today" | "week" | "month" | "year" | "custom"
export interface TeacherAttDetail { period: string; from: string; to: string; login_days: number; total_days: number; total_hours: number; attendance_pct: number; sessions: Array<{ date: string; login_at: string | null; logout_at: string | null; duration_minutes: number }> }
export interface StudentAttDetail { period: string; from: string; to: string; summary: { total: number; present: number; late: number; absent: number; rate: number | null }; records: Array<{ date: string; period: number; subject: string; status: string }> }
export interface TeacherSessionSummary {
  id: string; name: string; email: string
  login_days: number; total_hours: number; attendance_pct: number
  is_online: boolean; last_login: string | null
  today: { clock_in: string; clock_out: string | null; duration_minutes: number } | null
}
