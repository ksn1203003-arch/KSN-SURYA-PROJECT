// ─────────────────────────────────────────────────────────────────────────────
// pages/AdminDashboard.tsx — All admin views in one component.
// Views: overview | classes | teachers | students | timetable | notifications | settings
// Note: DB role is "super_admin" — mapped to the "admin" tab on the login page.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react"
import { TimeInput12h } from "@/components/shared/TimeInput12h"
import { getExams, getExamResults, type ExamDefinition as ExamDef, type ExamResultRow } from "@/lib/marksApi"
import { getDeletionRequests, reviewDeletionRequest, type DeletionRequest } from "@/lib/dpdpApi"
import { createPortal } from "react-dom"
import { TimetableDisplayView } from "@/components/TimetableDisplayView"
import { withXlsx } from "@/lib/excel"
import { DashboardLayout } from "@/components/DashboardLayout"
import { SkeletonList } from "@/components/SkeletonCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import {
  LayoutDashboard, BookOpen, Users, UserCheck,
  Settings, Plus, Search, X, Upload,
  Copy, CheckCircle, AlertCircle, Loader2, Trash2,
  GraduationCap, School, ChevronDown, ChevronRight,
  TrendingUp, Bell, Send, Megaphone, Clock, AlertTriangle, Info, Trophy, CalendarDays, ChevronUp,
  Award, Download, Lock, Eye, EyeOff, Palette, RotateCcw, Ban,
  BarChart3, Star, Activity, BookMarked, FileQuestion, Zap, UserX, CalendarCheck, FileSpreadsheet, UserRound,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import AdminOverviewPanel from "@/components/admin/AdminOverviewPanel"
import AdminClassesPanel from "@/components/admin/AdminClassesPanel"
import { formatYmdForDisplay, classStartDate, istToday, YEAR_START_CHOOSE_DATE, type ClassRow, type StudentDetail, type YearStartPreview, type BulkYearStartOutcome } from "@/components/admin/adminTypes"
import AdminTeachersPanel from "@/components/admin/AdminTeachersPanel"
import AdminStudentsPanel, { ParentsSection } from "@/components/admin/AdminStudentsPanel"
import { CertificateCompletionPanel } from "@/components/teacher/CertificateCompletionPanel"
import {
  getSchool, getClasses, createClass, deleteClass,
  getTeachers, getStudents, inviteTeacher, addStudent, updateStudent, updateTeacher,
  bulkAddStudents, bulkInviteTeachers, removeUser, parseStudentFile, parseTeacherFile, updateSchool, updateProfile,
  bulkTransferStudents, bulkSetGender, bulkAssignTeachersToClass, bulkDeleteUsers,
  getTeacherSessions, setTeacherAssignments, updateClass, saveTimetable, getYearStartPreview, bulkSetYearStart,
  createNotification, getAdminNotifications, deleteNotification, type NotifType, type AdminNotification,
  changePassword,
  getCertTemplate, saveCertTemplate, uploadCertLogo, deleteCertLogo,
  issueCustomCertificate, revokeCertificate, openCertPreview,
  getCertsByClass, viewCertPDF, downloadCertPDF,
  getClassStudents, type CertTemplateData, type AdminCertificate,
  getSchoolAttendanceToday, type StudentAttendanceToday,
  getChallenges, downloadComplianceReport,
  getTeacherDetail, getStudentDetail,
  getTeacherAttDetail, getStudentAttDetail,
  toggleTwoFactor,
} from "@/lib/userApi"

function Modal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = document.activeElement as HTMLElement | null
    const first = containerRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    first?.focus()
    return () => { saved?.focus() }
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose?.(); return }
      if (e.key !== "Tab" || !containerRef.current) return
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(el => el.offsetParent !== null)
      if (focusable.length < 2) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault() }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault() }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  return createPortal(<div ref={containerRef}>{children}</div>, document.body)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchoolData {
  id: string; name: string; board: string; city: string | null; state: string | null
  udise_code: string | null; subscription_plan: string; two_factor_enabled: boolean
}
interface Stats { teachers: number; students: number; classes: number }
interface TimetableSlot { day: string; period: number; subject: string; teacher_id: string | null; start_time: string; end_time: string }
interface TeacherRow { id: string; name: string; email: string; phone: string | null; is_active: boolean; photo_url: string | null; created_at: string | null; class_label: string | null; subject_assignments: Array<{ class_id: string; class_label: string; subject: string }> }
interface TeacherDetail { last_login: string | null; sessions_this_month: number; modules_count: number; quizzes_count: number; challenges_count: number; total_students: number; class_details: Array<{ label: string; student_count: number; subjects: string[] }> }
interface BulkTeacherResult { name: string; email: string; temp_password: string; error?: string }
interface StudentRow { id: string; name: string; email: string; phone: string | null; username: string | null; gender: string | null; class_id: string | null; class_label: string | null; is_active: boolean; photo_url: string | null; points: number; created_at: string | null }
interface BulkResult { name: string; username: string; temp_password: string; error?: string }
interface ChallengeRow { _id: string; title: string; difficulty: "Easy" | "Medium" | "Hard"; language: string; description: string; class_id: string; deadline: string | null; is_active: boolean; created_at: string }
type AttPeriod = "today" | "week" | "month" | "year" | "custom"
interface TeacherAttDetail { period: string; from: string; to: string; login_days: number; total_days: number; total_hours: number; attendance_pct: number; sessions: Array<{ date: string; login_at: string | null; logout_at: string | null; duration_minutes: number }> }
interface StudentAttDetail { period: string; from: string; to: string; summary: { total: number; present: number; late: number; absent: number; rate: number | null }; records: Array<{ date: string; period: number; subject: string; status: string }> }

const clsLabel = (c: { name?: string | null; grade: number; section: string }) =>
  c.name ?? (c.grade > 0 ? `Class ${c.grade}${c.section}` : c.section)
const clsCompact = (c: { name?: string | null; grade: number; section: string }) =>
  c.name ?? (c.grade > 0 ? `${c.grade}${c.section}` : c.section)

const NAV = [
  { icon: <LayoutDashboard className="w-4 h-4" />, label: "Overview",       key: "overview" },
  { icon: <BookOpen className="w-4 h-4" />,        label: "Classes",        key: "classes" },
  { icon: <Users className="w-4 h-4" />,           label: "Teachers",       key: "teachers" },
  { icon: <UserCheck className="w-4 h-4" />,       label: "Students",       key: "students" },
  { icon: <UserRound className="w-4 h-4" />,       label: "Parents",        key: "parents" },
  { icon: <TrendingUp className="w-4 h-4" />,      label: "Timetable",      key: "timetable" },
  { icon: <Award className="w-4 h-4" />,           label: "Certificates",   key: "certificates" },
  { icon: <Bell className="w-4 h-4" />,            label: "Notifications",  key: "notifications" },
  { icon: <FileSpreadsheet className="w-4 h-4" />,  label: "Marks",          key: "marks" },
  { icon: <BarChart3 className="w-4 h-4" />,       label: "Reports",        key: "reports" },
  { icon: <AlertTriangle className="w-4 h-4" />,    label: "Data Requests",  key: "data-requests" },
  { icon: <Settings className="w-4 h-4" />,        label: "Settings",       key: "settings" },
]

// Notification type config
const NOTIF_TYPES: Array<{ value: NotifType; label: string; icon: React.ReactNode; color: string; desc: string }> = [
  { value: "announcement", label: "Announcement", icon: <Megaphone className="w-4 h-4" />,    color: "#534AB7", desc: "General info, school updates" },
  { value: "reminder",     label: "Reminder",     icon: <Clock className="w-4 h-4" />,         color: "#f59e0b", desc: "Deadlines, upcoming exams" },
  { value: "achievement",  label: "Achievement",  icon: <Trophy className="w-4 h-4" />,        color: "#10b981", desc: "Class awards, 100% attendance" },
  { value: "alert",        label: "Alert",        icon: <AlertTriangle className="w-4 h-4" />, color: "#EF4444", desc: "Urgent — school closed, emergency" },
  { value: "event",        label: "Event",        icon: <CalendarDays className="w-4 h-4" />,  color: "#378ADD", desc: "PTM, sports day, cultural programs" },
]

const NOTIF_ICONS: Record<string, string> = {
  announcement: "📢", reminder: "⏰", achievement: "🏆", alert: "🚨", event: "📅",
}

function notifTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000); const hours = Math.floor(diff / 3600000); const days = Math.floor(diff / 86400000)
  if (mins < 2) return "Just now"; if (mins < 60) return `${mins}m ago`; if (hours < 24) return `${hours}h ago`
  if (days === 1) return "Yesterday"; return `${days}d ago`
}

const CLASS_COLORS = ["#534AB7","#378ADD","#EF9F27","#639922","#E84393","#9D59C7","#E2625A","#0EA5E9"]

// ─── Small reusable pieces ────────────────────────────────────────────────────

function Stat({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-card rounded-xl p-5 border border-border flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">{icon}</div>
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">{body}</p>
      {action}
    </div>
  )
}

function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

function Spinner() {
  return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
}

function downloadExcel(rows: Record<string, string>[], filename: string) {
  withXlsx(filename, XLSX => {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Credentials")
    XLSX.writeFile(wb, filename)
  })
}

function downloadStudentCredential(name: string, username: string, password: string) {
  downloadExcel([{ "Student Name": name, "Username": username, "Temp Password": password }], `${username}_credentials.xlsx`)
}

function downloadTeacherCredential(name: string, email: string, password: string) {
  downloadExcel([{ "Teacher Name": name, "Email": email, "Temp Password": password }], `${name.replace(/\s+/g, "_")}_credentials.xlsx`)
}

function downloadBulkStudentCredentials(results: BulkResult[]) {
  const rows = results.filter(r => !r.error).map(r => ({ "Student Name": r.name, "Username": r.username, "Temp Password": r.temp_password }))
  downloadExcel(rows, "student_credentials.xlsx")
}

function downloadBulkTeacherCredentials(results: BulkTeacherResult[]) {
  const rows = results.filter(r => !r.error).map(r => ({ "Teacher Name": r.name, "Email": r.email, "Temp Password": r.temp_password }))
  downloadExcel(rows, "teacher_credentials.xlsx")
}

function SingleSelectDropdown({ options, value, onChange, placeholder = "Select…" }: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (val: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current && !btnRef.current.contains(target)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width })
    }
    setOpen(o => !o)
  }

  return (
    <div className="relative w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="w-full h-8 rounded-lg border border-border px-2.5 text-xs flex items-center justify-between gap-1 focus:outline-none hover:border-[#534AB7]/60 transition-colors"
        style={{ background: "var(--card)", color: selected ? "var(--foreground)" : "var(--muted-foreground)" }}
      >
        <span className="truncate text-left flex-1 font-medium">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform`} style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: "absolute",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
            background: "var(--popover, var(--card))",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
            padding: "4px 0",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={() => { onChange(""); setOpen(false) }}
            style={{
              padding: "6px 12px",
              fontSize: "11px",
              cursor: "pointer",
              color: "var(--muted-foreground)",
              fontStyle: "italic",
              background: !value ? "var(--muted)" : "transparent",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
            onMouseLeave={e => (e.currentTarget.style.background = !value ? "var(--muted)" : "transparent")}
          >
            {placeholder}
          </div>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                padding: "6px 12px",
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: 500,
                color: value === opt.value ? "#534AB7" : "var(--foreground)",
                background: value === opt.value ? "rgba(83,74,183,0.12)" : "transparent",
              }}
              onMouseEnter={e => { if (value !== opt.value) e.currentTarget.style.background = "var(--muted)" }}
              onMouseLeave={e => { e.currentTarget.style.background = value === opt.value ? "rgba(83,74,183,0.12)" : "transparent" }}
            >
              {opt.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function MultiSelectDropdown({ options, selected, onChange, placeholder = "Select…", disabled = false }: {
  options: string[]
  selected: string[]
  onChange: (val: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current && !btnRef.current.contains(target)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function handleOpen() {
    if (disabled) return
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width })
    }
    setOpen(o => !o)
  }

  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt])
  }

  return (
    <div className="relative w-full">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className="w-full h-8 rounded-md border border-input px-2.5 text-xs flex items-center justify-between gap-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: "var(--background)" }}
      >
        <span className="truncate text-left flex-1">
          {selected.length === 0
            ? <span style={{ color: "var(--muted-foreground)" }}>{placeholder}</span>
            : <span className="flex flex-wrap gap-1">
                {selected.map(s => (
                  <span key={s} className="px-1.5 py-0 rounded text-[10px] font-medium" style={{ background: "rgba(83,74,183,0.15)", color: "#534AB7" }}>{s}</span>
                ))}
              </span>
          }
        </span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: "absolute",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
            background: "var(--popover, var(--card))",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
            padding: "4px 0",
            maxHeight: "220px",
            overflowY: "auto",
          }}
        >
          {options.map(opt => {
            const checked = selected.includes(opt)
            return (
              <label
                key={opt}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 12px", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt)}
                  className="rounded accent-[#534AB7] w-3.5 h-3.5 flex-shrink-0"
                />
                <span style={{ fontSize: "12px", color: "var(--foreground)", fontWeight: checked ? 600 : 400 }}>{opt}</span>
              </label>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── Animated helper components ──────────────────────────────────────────────

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const duration = 1200
    const steps = 40
    const increment = value / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= value) { setDisplay(value); clearInterval(timer) }
      else setDisplay(Math.floor(current))
    }, duration / steps)
    return () => clearInterval(timer)
  }, [value])
  return <>{display}{suffix}</>
}

function MiniRing({ value, color, size = 52 }: { value: number; color: string; size?: number }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const [offset, setOffset] = useState(circ)
  useEffect(() => {
    const t = setTimeout(() => setOffset(circ - (value / 100) * circ), 200)
    return () => clearTimeout(t)
  }, [value, circ])
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={5} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)" }}
      />
    </svg>
  )
}


function DonutChart({ total, maleCount, femaleCount, otherCount = 0 }: { total: number; maleCount: number; femaleCount: number; otherCount?: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 300); return () => clearTimeout(t) }, [])
  const size = 190
  const r1 = 72, sw1 = 13, c1 = 2 * Math.PI * r1
  const r2 = 54, sw2 = 12, c2 = 2 * Math.PI * r2
  const r3 = 37, sw3 = 11, c3 = 2 * Math.PI * r3
  const malePct  = total > 0 ? maleCount  / total : 0
  const femPct   = total > 0 ? femaleCount / total : 0
  const othPct   = total > 0 ? otherCount  / total : 0
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <defs>
            <linearGradient id="adm-male" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#534AB7"/><stop offset="100%" stopColor="#7B73E4"/>
            </linearGradient>
            <linearGradient id="adm-female" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EF9F27"/><stop offset="100%" stopColor="#F7BC61"/>
            </linearGradient>
            <linearGradient id="adm-other" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1FA04C"/><stop offset="100%" stopColor="#44C56A"/>
            </linearGradient>
            <filter id="adm-glow">
              <feGaussianBlur stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {/* Outer ring — Male */}
          <circle cx={size/2} cy={size/2} r={r1} fill="none" stroke="var(--muted)" strokeWidth={sw1}/>
          <circle cx={size/2} cy={size/2} r={r1} fill="none" stroke="url(#adm-male)" strokeWidth={sw1}
            strokeDasharray={c1} strokeLinecap="round" filter="url(#adm-glow)"
            strokeDashoffset={mounted ? c1 * (1 - malePct) : c1}
            style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)" }}
          />
          {/* Middle ring — Female */}
          <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke="var(--muted)" strokeWidth={sw2}/>
          <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke="url(#adm-female)" strokeWidth={sw2}
            strokeDasharray={c2} strokeLinecap="round" filter="url(#adm-glow)"
            strokeDashoffset={mounted ? c2 * (1 - femPct) : c2}
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1) 0.2s" }}
          />
          {/* Inner ring — Other */}
          <circle cx={size/2} cy={size/2} r={r3} fill="none" stroke="var(--muted)" strokeWidth={sw3}/>
          <circle cx={size/2} cy={size/2} r={r3} fill="none" stroke="url(#adm-other)" strokeWidth={sw3}
            strokeDasharray={c3} strokeLinecap="round" filter="url(#adm-glow)"
            strokeDashoffset={mounted ? c3 * (1 - othPct) : c3}
            style={{ transition: "stroke-dashoffset 1.0s cubic-bezier(0.16,1,0.3,1) 0.4s" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] text-muted-foreground">Total</span>
          <span className={`font-bold text-foreground leading-tight ${total >= 10000 ? "text-base" : total >= 1000 ? "text-lg" : "text-2xl"}`}>
            {total > 0 ? total.toLocaleString() : "—"}
          </span>
        </div>
      </div>
      <div className="flex gap-4 flex-wrap justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "linear-gradient(135deg,#534AB7,#7B73E4)" }}/>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground">Male</span>
            <span className="text-xs font-bold text-foreground">{maleCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "linear-gradient(135deg,#EF9F27,#F7BC61)" }}/>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground">Female</span>
            <span className="text-xs font-bold text-foreground">{femaleCount}</span>
          </div>
        </div>
        {otherCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "linear-gradient(135deg,#1FA04C,#44C56A)" }}/>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground">Other</span>
              <span className="text-xs font-bold text-foreground">{otherCount}</span>
            </div>
          </div>
        )}
        {total > 0 && maleCount + femaleCount + otherCount < total && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0 bg-muted"/>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground">Unset</span>
              <span className="text-xs font-bold text-foreground">{total - maleCount - femaleCount - otherCount}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Student avatar — DB photo > localStorage > gradient initials ──
// ─── Timetable view component ─────────────────────────────────────────────────

const TT_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const TT_PERIODS = [1,2,3,4,5,6,7,8]
const TT_SUBJECT_COLORS: Record<string, string> = {
  "CT & AI":"#534AB7","Maths":"#378ADD","Science":"#639922","English":"#E2625A",
  "Social Studies":"#EF9F27","Hindi":"#9D59C7","Telugu":"#0EA5E9","EVS":"#1FA04C",
}
function ttSubjectColor(s: string) { return TT_SUBJECT_COLORS[s] ?? "#534AB7" }

// Convert "HH:MM" (24h) → "hh:MM AM/PM"
function to12h(val: string): string {
  if (!val) return ""
  const [hStr, mStr] = val.split(":")
  let h = parseInt(hStr, 10)
  const m = mStr ?? "00"
  const ampm = h >= 12 ? "PM" : "AM"
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m} ${ampm}`
}



function TimetableView({
  classes, teachers,
  timetableClassId, setTimetableClassId,
  timetableSlots, setTimetableSlots,
  periodTimes, setPeriodTimes,
  timetableSaving, setTimetableSaving,
  timetableMsg, setTimetableMsg,
  onSaved,
}: {
  classes: ClassRow[]
  teachers: TeacherRow[]
  timetableClassId: string
  setTimetableClassId: (id: string) => void
  timetableSlots: TimetableSlot[]
  setTimetableSlots: React.Dispatch<React.SetStateAction<TimetableSlot[]>>
  periodTimes: Record<number, { start: string; end: string }>
  setPeriodTimes: React.Dispatch<React.SetStateAction<Record<number, { start: string; end: string }>>>
  timetableSaving: boolean
  setTimetableSaving: (v: boolean) => void
  timetableMsg: string
  setTimetableMsg: (v: string) => void
  onSaved: (slots: TimetableSlot[]) => void
}) {
  const cls = classes.find(c => c.id === timetableClassId)
  const subjectOptions = cls?.subjects?.length ? cls.subjects : ["CT & AI","Maths","Science","English","Social Studies","Hindi","Telugu","EVS"]
  const [historyOpen, setHistoryOpen] = useState(false)
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)
  const [previewMode, setPreviewMode] = useState(false)

  function getSlot(day: string, period: number) {
    return timetableSlots.find(s => s.day === day && s.period === period)
  }

  function removeSlot(day: string, period: number) {
    setTimetableSlots(prev => prev.filter(s => !(s.day === day && s.period === period)))
  }

  function setSlotSubject(day: string, period: number, subject: string) {
    const st = periodTimes[period]?.start ?? timetableSlots.find(s => s.period === period)?.start_time ?? ""
    const et = periodTimes[period]?.end   ?? timetableSlots.find(s => s.period === period)?.end_time   ?? ""
    if (!subject) { removeSlot(day, period); return }
    setTimetableSlots(prev => {
      const exists = prev.find(s => s.day === day && s.period === period)
      if (exists) return prev.map(s => s.day === day && s.period === period ? { ...s, subject } : s)
      return [...prev, { day, period, subject, teacher_id: null, start_time: st, end_time: et }]
    })
  }

  function setSlotTeacher(day: string, period: number, teacher_id: string | null) {
    setTimetableSlots(prev => prev.map(s => s.day === day && s.period === period ? { ...s, teacher_id } : s))
  }

  function setPeriodStart(period: number, val: string) {
    setPeriodTimes(pt => ({ ...pt, [period]: { start: val, end: pt[period]?.end ?? "" } }))
    setTimetableSlots(prev => prev.map(s => s.period === period ? { ...s, start_time: val } : s))
  }

  function setPeriodEnd(period: number, val: string) {
    setPeriodTimes(pt => ({ ...pt, [period]: { start: pt[period]?.start ?? "", end: val } }))
    setTimetableSlots(prev => prev.map(s => s.period === period ? { ...s, end_time: val } : s))
  }

  async function handleSave() {
    setTimetableSaving(true); setTimetableMsg("")
    const validSlots = timetableSlots.filter(s => s.subject && s.start_time && s.end_time)
    const invalidTime = validSlots.find(s => s.start_time >= s.end_time)
    if (invalidTime) {
      setTimetableMsg(`Error: Period ${invalidTime.period} on ${invalidTime.day} has end time at or before start time.`)
      setTimetableSaving(false); return
    }
    const res = await saveTimetable(timetableClassId, validSlots)
    setTimetableSaving(false)
    if ("error" in res) { setTimetableMsg("Error: " + res.error); return }
    onSaved(validSlots)
    setTimetableSlots(validSlots)
    setTimetableMsg("Saved!")
    setTimeout(() => setTimetableMsg(""), 2500)
  }

  function fillSampleTimetable() {
    const TIMES: Record<number, { start: string; end: string }> = {
      1: { start: "08:00", end: "08:40" },
      2: { start: "08:40", end: "09:20" },
      3: { start: "09:30", end: "10:10" },
      4: { start: "10:10", end: "10:50" },
      5: { start: "11:10", end: "11:50" },
      6: { start: "11:50", end: "12:30" },
      7: { start: "13:05", end: "13:45" },
      8: { start: "13:45", end: "14:25" },
    }
    const subjects = cls?.subjects?.length
      ? cls.subjects
      : ["CT & AI","Maths","Science","English","Hindi","Social Studies","Telugu","EVS"]
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    const periods = [1,2,3,4,5,6,7,8]
    const slots: TimetableSlot[] = []
    days.forEach((day, di) => {
      periods.forEach((period) => {
        const subj = subjects[(di * periods.length + period - 1) % subjects.length]
        slots.push({ day, period, subject: subj, teacher_id: null, start_time: TIMES[period].start, end_time: TIMES[period].end })
      })
    })
    setTimetableSlots(slots)
    setPeriodTimes(TIMES)
  }

  function handleClassChange(id: string) {
    setTimetableClassId(id)
    setTimetableMsg("")
    setPeriodTimes({})
    if (!id) { setTimetableSlots([]); return }
    const c = classes.find(x => x.id === id)
    const slots = c?.timetable ?? []
    setTimetableSlots(slots)
    const pt: Record<number, { start: string; end: string }> = {}
    for (const s of slots) {
      if (!pt[s.period]) pt[s.period] = { start: s.start_time, end: s.end_time }
    }
    setPeriodTimes(pt)
    // auto-fill sample if class has no timetable yet
    if (slots.length === 0) {
      const TIMES: Record<number, { start: string; end: string }> = {
        1: { start: "08:00", end: "08:40" }, 2: { start: "08:40", end: "09:20" },
        3: { start: "09:30", end: "10:10" }, 4: { start: "10:10", end: "10:50" },
        5: { start: "11:10", end: "11:50" }, 6: { start: "11:50", end: "12:30" },
        7: { start: "13:05", end: "13:45" }, 8: { start: "13:45", end: "14:25" },
      }
      const SCHED: Record<string, Record<number, string>> = {
        Monday:    { 1:"CT & AI", 2:"Maths",   3:"English", 4:"Science", 5:"Hindi",   6:"CT & AI", 7:"Maths",   8:"English" },
        Tuesday:   { 1:"Maths",   2:"CT & AI", 3:"Science", 4:"English", 5:"CT & AI", 6:"Hindi",   7:"Science", 8:"Maths"   },
        Wednesday: { 1:"English", 2:"Science", 3:"CT & AI", 4:"Maths",   5:"English", 6:"CT & AI", 7:"Hindi",   8:"Science" },
        Thursday:  { 1:"Science", 2:"English", 3:"Maths",   4:"CT & AI", 5:"Science", 6:"Maths",   7:"CT & AI", 8:"Hindi"   },
        Friday:    { 1:"Hindi",   2:"Maths",   3:"CT & AI", 4:"Science", 5:"Maths",   6:"English", 7:"Science", 8:"CT & AI" },
        Saturday:  { 1:"CT & AI", 2:"English", 3:"Hindi",   4:"Maths",   5:"CT & AI", 6:"Science", 7:"English", 8:"Maths"   },
      }
      const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
      const periods = [1,2,3,4,5,6,7,8]
      const filled: TimetableSlot[] = []
      days.forEach(day => periods.forEach(period => {
        const subject = SCHED[day]?.[period] ?? ""
        if (subject) filled.push({ day, period, subject, teacher_id: null, start_time: TIMES[period].start, end_time: TIMES[period].end })
      }))
      setTimetableSlots(filled)
      setPeriodTimes(TIMES)
    }
  }

  return (
    <div className="w-full">
      <SectionHeader title="Timetable" sub="Set up weekly schedules for each class" />

      {/* Class picker */}
      <div className="flex items-center gap-3 mb-5">
        <Label className="text-xs flex-shrink-0 text-muted-foreground">Select Class</Label>
        <div className="min-w-[220px]">
          <SingleSelectDropdown
            options={[...classes]
              .sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
              .map(c => ({ value: c.id, label: clsLabel(c) }))}
            value={timetableClassId}
            onChange={id => handleClassChange(id)}
            placeholder="— Choose a class —"
          />
        </div>
      </div>

      {!timetableClassId ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <TrendingUp className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Select a class to view or edit its timetable</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {cls ? clsLabel(cls) : ''}
              </span>
              {subjectOptions.map(s => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white" style={{ background: ttSubjectColor(s) }}>{s}</span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {timetableMsg && (
                <span className={`text-xs font-medium ${timetableMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{timetableMsg}</span>
              )}
              {/* Preview / Edit toggle */}
              <div style={{ display:"flex", background:"rgba(0,0,0,.06)", border:"1px solid var(--border)", borderRadius:"10px", padding:"3px", gap:"2px" }}>
                <button
                  type="button"
                  onClick={() => setPreviewMode(false)}
                  className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                  style={{ background: !previewMode ? "var(--background)" : "transparent", color: !previewMode ? "var(--foreground)" : "var(--muted-foreground)", boxShadow: !previewMode ? "0 1px 3px rgba(0,0,0,.15)" : "none" }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode(true)}
                  className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                  style={{ background: previewMode ? "var(--background)" : "transparent", color: previewMode ? "var(--foreground)" : "var(--muted-foreground)", boxShadow: previewMode ? "0 1px 3px rgba(0,0,0,.15)" : "none" }}
                >
                  Preview
                </button>
              </div>
              {!previewMode && (
                <Button onClick={handleSave} disabled={timetableSaving} className="h-8 text-xs rounded-lg px-4" style={{ background: "var(--ts-blue)", color: "white" }}>
                  {timetableSaving ? <><Spinner /> Saving…</> : "Save Timetable"}
                </Button>
              )}
            </div>
          </div>

          {/* Edit History dropdown — up to 10 previous versions with diffs */}
          {cls?.timetable_updated_by_name && (() => {
            const currentAt = cls.timetable_updated_at
            const versions = (cls?.timetable_versions ?? []).filter(v =>
              new Date(v.updated_at).getTime() < new Date(currentAt ?? 0).getTime() - 5000
            )
            if (versions.length === 0) return null

            // newest version first
            const sorted = [...versions].reverse()

            // compute diff: slots that changed between this version and the next (newer) version or current timetable
            function computeDiff(oldSlots: TimetableSlot[], newSlots: TimetableSlot[]) {
              const changes: { label: string; from: string; to: string }[] = []
              for (const ns of newSlots) {
                const os = oldSlots.find(s => s.day === ns.day && s.period === ns.period)
                if (!os) {
                  changes.push({ label: `${ns.day.slice(0,3)} P${ns.period}`, from: "—", to: ns.subject })
                } else if (os.subject !== ns.subject) {
                  changes.push({ label: `${ns.day.slice(0,3)} P${ns.period}`, from: os.subject, to: ns.subject })
                } else if (os.start_time !== ns.start_time || os.end_time !== ns.end_time) {
                  const fmt = (t: string) => t ? to12h(t) : "—"
                  changes.push({ label: `${ns.day.slice(0,3)} P${ns.period}`, from: `${fmt(os.start_time)}–${fmt(os.end_time)}`, to: `${fmt(ns.start_time)}–${fmt(ns.end_time)}` })
                }
              }
              // slots removed
              for (const os of oldSlots) {
                if (!newSlots.find(s => s.day === os.day && s.period === os.period)) {
                  changes.push({ label: `${os.day.slice(0,3)} P${os.period}`, from: os.subject, to: "—" })
                }
              }
              return changes
            }

            // "newer" snapshot for each version: index 0 (newest) diffs against current timetable; rest diff against the next newer
            const newerSlots = (idx: number) =>
              idx === 0 ? (cls.timetable ?? []) : sorted[idx - 1].slots

            return (
              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                {/* Header — click to toggle */}
                <button
                  type="button"
                  onClick={() => setHistoryOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors"
                >
                  <span>Edit History <span className="font-normal text-muted-foreground">({sorted.length} version{sorted.length !== 1 ? "s" : ""})</span></span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: historyOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {historyOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {sorted.map((v, i) => {
                      const diffs = computeDiff(v.slots, newerSlots(i))
                      const isExpanded = expandedVersion === i
                      return (
                        <div key={i}>
                          {/* Version row */}
                          <button
                            type="button"
                            onClick={() => setExpandedVersion(isExpanded ? null : i)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                          >
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-muted text-muted-foreground flex-shrink-0" style={{ minWidth: "28px", textAlign: "center" }}>
                              v{sorted.length - i}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold text-foreground">{v.updated_by_name}</span>
                              <span className="text-[11px] text-muted-foreground ml-2">
                                {new Date(v.updated_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {diffs.length > 0 && (
                                <span className="text-[10px] text-muted-foreground ml-2">· {diffs.length} change{diffs.length !== 1 ? "s" : ""}</span>
                              )}
                            </div>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0, opacity: 0.5 }}>
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>

                          {/* Expanded diff */}
                          {isExpanded && (
                            <div className="px-4 pb-3 pt-0.5 bg-muted/10">
                              {diffs.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic">No subject or time changes detected.</p>
                              ) : (
                                <div className="space-y-1">
                                  {diffs.map((d, j) => (
                                    <div key={j} className="flex items-center gap-2 text-[11px]">
                                      <span className="font-semibold text-foreground w-14 flex-shrink-0">{d.label}</span>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white flex-shrink-0"
                                        style={{ background: TT_SUBJECT_COLORS[d.from] ?? (d.from === "—" ? "#9ca3af" : "#6b7280") }}>
                                        {d.from}
                                      </span>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
                                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                                      </svg>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white flex-shrink-0"
                                        style={{ background: TT_SUBJECT_COLORS[d.to] ?? (d.to === "—" ? "#9ca3af" : "#6b7280") }}>
                                        {d.to}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Preview mode — beautiful dark display */}
          {previewMode ? (
            <TimetableDisplayView
              slots={timetableSlots}
              subjects={subjectOptions}
              updatedByName={cls?.timetable_updated_by_name ?? null}
              updatedAt={cls?.timetable_updated_at ?? null}
            />
          ) : (
            <>
              {/* Grid — full width, responsive */}
              <div className="overflow-x-auto -mx-1">
                <div className="space-y-1" style={{ minWidth: "600px" }}>
                  {/* Day header */}
                  <div className="grid px-1" style={{ gridTemplateColumns: "160px repeat(6, 1fr)", gap: "6px" }}>
                    <div className="text-[11px] font-bold uppercase tracking-wide py-1 pl-2" style={{ color: "var(--muted-foreground)" }}>Period</div>
                    {TT_DAYS.map(d => (
                      <div key={d} className="text-[11px] font-bold text-center uppercase tracking-wide py-1" style={{ color: "var(--muted-foreground)" }}>{d.slice(0, 3)}</div>
                    ))}
                  </div>

                  {TT_PERIODS.map(period => {
                    const start = periodTimes[period]?.start ?? timetableSlots.find(s => s.period === period)?.start_time ?? ""
                    const end   = periodTimes[period]?.end   ?? timetableSlots.find(s => s.period === period)?.end_time   ?? ""
                    return (
                      <div key={period} className="skillio-card rounded-xl px-3 py-2.5 grid items-center" style={{ gridTemplateColumns: "160px repeat(6, 1fr)", gap: "6px" }}>

                        {/* Period badge + stacked time pickers */}
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[13px] font-black text-white flex-shrink-0 shadow-md" style={{ background: "#534AB7" }}>
                            P{period}
                          </span>
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                            <TimeInput12h value={start} onChange={v => setPeriodStart(period, v)} />
                            <TimeInput12h value={end} onChange={v => setPeriodEnd(period, v)} />
                          </div>
                        </div>

                        {/* Day cells */}
                        {TT_DAYS.map(day => {
                          const slot = getSlot(day, period)
                          const color = slot?.subject ? ttSubjectColor(slot.subject) : null
                          return (
                            <div key={day} className="space-y-1">
                              <div className="rounded-lg border transition-all"
                                style={{ borderColor: color ? `${color}60` : "var(--border)", background: color ? `${color}15` : "var(--card)" }}>
                                <SingleSelectDropdown
                                  options={subjectOptions.map(s => ({ value: s, label: s }))}
                                  value={slot?.subject ?? ""}
                                  onChange={v => setSlotSubject(day, period, v)}
                                  placeholder="Free"
                                />
                              </div>
                              {slot?.subject && (
                                <SingleSelectDropdown
                                  options={teachers.map(t => ({ value: t.id, label: t.name }))}
                                  value={slot.teacher_id ?? ""}
                                  onChange={v => setSlotTeacher(day, period, v || null)}
                                  placeholder="Teacher"
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Set start/end times per period, assign subjects per day, then click Save Timetable.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Parents View ─────────────────────────────────────────────────────────────

function ParentsView({ students, loadingStudents, classes }: {
  students: StudentRow[]
  loadingStudents: boolean
  classes: ClassRow[]
}) {
  const [search, setSearch] = useState("")
  const [filterCls, setFilterCls] = useState("")

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return (
      (!q || s.name.toLowerCase().includes(q) || (s.username ?? "").toLowerCase().includes(q)) &&
      (!filterCls || s.class_id === filterCls)
    )
  })

  if (loadingStudents) return <div className="flex items-center gap-2 py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">Loading students…</span></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search students…" className="pl-9 h-9 text-sm rounded-xl bg-muted/40" />
        </div>
        <select value={filterCls} onChange={e => setFilterCls(e.target.value)}
          className="h-9 px-3 rounded-xl border border-border bg-card text-sm text-foreground min-w-[140px]">
          <option value="">All classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No students found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s.id} className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ background: "#534AB7" }}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.class_label ?? "No class"}{s.username ? ` · @${s.username}` : ""}</p>
                </div>
              </div>
              <ParentsSection studentId={s.id} studentName={s.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminDashboard() {
  const { user } = useAuth()
  const [view, setView] = useState("overview")

  // Data deletion requests
  const [deletionReqs,       setDeletionReqs]       = useState<DeletionRequest[]>([])
  const [deletionReqsLoaded, setDeletionReqsLoaded] = useState(false)
  const [deletionReqsLoading,setDeletionReqsLoading]= useState(false)
  const [reviewingId,        setReviewingId]        = useState<string | null>(null)

  // Notifications
  const [adminNotifs,     setAdminNotifs]     = useState<AdminNotification[]>([])
  const [notifsLoaded,    setNotifsLoaded]    = useState(false)
  const [notifsLoading,   setNotifsLoading]   = useState(false)
  const [notifForm, setNotifForm] = useState<{ type: NotifType; title: string; message: string; target: string; target_label: string; expires_days: string; audienceMode: string; scheduleDate: string; scheduleTime: string }>({
    type: "announcement", title: "", message: "", target: "all", target_label: "Everyone", expires_days: "7", audienceMode: "all", scheduleDate: "", scheduleTime: "09:00",
  })
  const [notifSending,    setNotifSending]    = useState(false)
  const [notifMsg,        setNotifMsg]        = useState("")
  const [notifError,      setNotifError]      = useState("")
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null)
  const [showAllNotifs,   setShowAllNotifs]   = useState(false)

  // School data
  const [school, setSchool] = useState<SchoolData | null>(null)
  const [stats, setStats] = useState<Stats>({ teachers: 0, students: 0, classes: 0 })
  const [loadingSchool, setLoadingSchool] = useState(true)

  // Classes
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [loadingClasses, setLoadingClasses] = useState(false)

  // Teachers
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [loadingTeachers, setLoadingTeachers] = useState(false)

  // Teacher sessions (login/logout tracking)
  interface TeacherSessionSummary {
    id: string; name: string; email: string
    login_days: number; total_hours: number; attendance_pct: number
    is_online: boolean; last_login: string | null
    today: { clock_in: string; clock_out: string | null; duration_minutes: number } | null
  }
  const [teacherSessions, setTeacherSessions] = useState<TeacherSessionSummary[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [sessionPeriod, setSessionPeriod] = useState<"today" | "week" | "month" | "custom">("today")
  const [sessionFrom, setSessionFrom] = useState("")
  const [sessionTo, setSessionTo] = useState("")
  const [alertFilter, setAlertFilter] = useState<"all" | "warning" | "info">("all")
  const [alertsRefreshing, setAlertsRefreshing] = useState(false)
  const [studentAttendance, setStudentAttendance] = useState<Map<string, StudentAttendanceToday>>(new Map())

  // Students
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [filterClass, setFilterClass] = useState("")
  const [searchStudents, setSearchStudents] = useState("")
  const [searchTeachers, setSearchTeachers] = useState("")

  // Expandable rows — teacher detail
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null)
  const [teacherDetailMap, setTeacherDetailMap] = useState<Record<string, TeacherDetail>>({})
  const [teacherDetailLoading, setTeacherDetailLoading] = useState<string | null>(null)

  // Expandable rows — student detail
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [studentDetailMap, setStudentDetailMap] = useState<Record<string, StudentDetail>>({})
  const [studentDetailLoading, setStudentDetailLoading] = useState<string | null>(null)

  // Teacher attendance panels (keyed by `${teacherId}_${period}` or `${teacherId}_custom_from_to`)
  const [teacherAttPeriod, setTeacherAttPeriod] = useState<AttPeriod>("month")
  const [teacherAttCache, setTeacherAttCache] = useState<Record<string, TeacherAttDetail>>({})
  const [teacherAttLoading, setTeacherAttLoading] = useState(false)
  const [teacherAttCustomFrom, setTeacherAttCustomFrom] = useState("")
  const [teacherAttCustomTo, setTeacherAttCustomTo] = useState("")

  // Student attendance panels
  const [studentAttPeriod, setStudentAttPeriod] = useState<AttPeriod>("month")
  const [studentAttCache, setStudentAttCache] = useState<Record<string, StudentAttDetail>>({})
  const [studentAttLoading, setStudentAttLoading] = useState(false)
  const [studentAttCustomFrom, setStudentAttCustomFrom] = useState("")
  const [studentAttCustomTo, setStudentAttCustomTo] = useState("")

  // Add class modal
  const [showAddClass, setShowAddClass] = useState(false)
  const [newClassName, setNewClassName] = useState("")
  const [newSubjectInput, setNewSubjectInput] = useState("")
  const [newSubjects, setNewSubjects] = useState<string[]>([])
  const [addClassLoading, setAddClassLoading] = useState(false)
  const [addClassErr, setAddClassErr] = useState("")

  // Edit class modal
  const [editClass, setEditClass] = useState<ClassRow | null>(null)
  const [editClassName, setEditClassName] = useState("")
  const [editSubjectInput, setEditSubjectInput] = useState("")
  const [editSubjects, setEditSubjects] = useState<string[]>([])
  const [editClassLoading, setEditClassLoading] = useState(false)
  const [editClassErr, setEditClassErr] = useState("")
  const [editYearStart, setEditYearStart] = useState("")
  const [editYearStartReason, setEditYearStartReason] = useState("")
  const [yearStartError, setYearStartError] = useState<string | null>(null)
  const [yearStartConfirmOpen, setYearStartConfirmOpen] = useState(false)
  // Saved-attendance preview shown inside the confirmation (only when a class that already has a date changes it)
  const [yearStartPreviewLoading, setYearStartPreviewLoading] = useState(false)
  const [yearStartPreview, setYearStartPreview] = useState<YearStartPreview | null>(null)
  const [yearStartCheckFailed, setYearStartCheckFailed] = useState(false)
  const yearStartPreviewToken = useRef(0)

  // Set the school year start for many classes at once
  const [showBulkYearStart, setShowBulkYearStart] = useState(false)
  const [bulkYsDate, setBulkYsDate] = useState("")
  const [bulkYsIncludeDated, setBulkYsIncludeDated] = useState(false)
  const [bulkYsReason, setBulkYsReason] = useState("")
  const [bulkYsLoading, setBulkYsLoading] = useState(false)
  const [bulkYsError, setBulkYsError] = useState<string | null>(null)
  const [bulkYsOutcome, setBulkYsOutcome] = useState<BulkYearStartOutcome | null>(null)
  const [bulkYsFailedIds, setBulkYsFailedIds] = useState<string[]>([])

  // Timetable state
  const [timetableClassId, setTimetableClassId] = useState("")
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([])
  const [timetableSaving, setTimetableSaving] = useState(false)
  const [timetableMsg, setTimetableMsg] = useState("")
  const [periodTimes, setPeriodTimes] = useState<Record<number, { start: string; end: string }>>({})

  // Invite teacher modal
  const [showTeacherModal, setShowTeacherModal] = useState(false)
  const [teacherForm, setTeacherForm] = useState({ name: "", email: "", phone: "", class_id: "", subject: "" })
  const [teacherLoading, setTeacherLoading] = useState(false)
  const [teacherResult, setTeacherResult] = useState<{ email: string; temp_password: string } | null>(null)
  const [teacherErr, setTeacherErr] = useState("")

  // Edit teacher modal
  const [editTeacher, setEditTeacher] = useState<TeacherRow | null>(null)
  const [editTeacherForm, setEditTeacherForm] = useState({ name: "", email: "", phone: "", class_id: "", subject: "" })
  const [editTeacherLoading, setEditTeacherLoading] = useState(false)
  const [editTeacherErr, setEditTeacherErr] = useState("")
  // Multi-class assignment state: array of { class_id, subjects[] }
  const [editAssignments, setEditAssignments] = useState<Array<{ class_id: string; subjects: string[] }>>([])

  // Teacher bulk select
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<Set<string>>(new Set())
  const [showTeacherBulkActions, setShowTeacherBulkActions] = useState(false)
  const [teacherBulkActionLoading, setTeacherBulkActionLoading] = useState(false)
  const [teacherBulkClass, setTeacherBulkClass] = useState("")

  // Bulk import teachers
  const [showBulkTeacher, setShowBulkTeacher] = useState(false)
  const [bulkTeacherRows, setBulkTeacherRows] = useState<Array<{ name: string; email: string; phone?: string }>>([])
  const [bulkTeacherLoading, setBulkTeacherLoading] = useState(false)
  const [bulkTeacherResults, setBulkTeacherResults] = useState<BulkTeacherResult[]>([])
  const csvTeacherRef = useRef<HTMLInputElement>(null)

  // Add student modal
  const [showStudentModal, setShowStudentModal] = useState(false)
  const [studentForm, setStudentForm] = useState({ name: "", email: "", phone: "", roll_no: "", class_id: "", gender: "" })
  const [studentLoading, setStudentLoading] = useState(false)
  const [studentResult, setStudentResult] = useState<{ username: string; temp_password: string; name: string } | null>(null)
  const [studentErr, setStudentErr] = useState("")

  // Edit student modal
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null)
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", gender: "", class_id: "" })
  const [editLoading, setEditLoading] = useState(false)
  const [editErr, setEditErr] = useState("")

  // Bulk select / bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [bulkActionClass, setBulkActionClass] = useState("")
  const [bulkActionGender, setBulkActionGender] = useState("")

  // Bulk import modal
  const [showBulk, setShowBulk] = useState(false)
  const [bulkClassId, setBulkClassId] = useState("")
  const [bulkRows, setBulkRows] = useState<Array<{ name: string; roll_no: string }>>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([])
  const csvRef = useRef<HTMLInputElement>(null)

  // Confirm remove (teacher/student)
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  // Class bulk select
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [classBulkDeleteLoading, setClassBulkDeleteLoading] = useState(false)

  // Confirm delete class
  const [confirmDeleteClass, setConfirmDeleteClass] = useState<{ id: string; label: string } | null>(null)
  const [deleteClassLoading, setDeleteClassLoading] = useState(false)

  // Settings
  const [settingsForm, setSettingsForm] = useState({ name: "", board: "", city: "", state: "", udise_code: "" })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState("")
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorToggling, setTwoFactorToggling] = useState(false)

  // Admin profile
  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "" })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState("")

  // Stat tile expand
  const [expandedTile, setExpandedTile] = useState<string | null>(null)

  // Change password
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState("")
  const [pwErr, setPwErr] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)

  // Certificates — template settings
  const [certTemplate, setCertTemplate] = useState<CertTemplateData | null>(null)
  const [certTemplateLoading, setCertTemplateLoading] = useState(false)
  const [certTemplateSaving, setCertTemplateSaving] = useState(false)
  const [certTmplSaved, setCertTmplSaved] = useState(false)
  const [certTemplateMsg, setCertTemplateMsg] = useState("")
  const [certTemplateForm, setCertTemplateForm] = useState<Partial<CertTemplateData>>({
    school_name: "", description: "", footer_left: "", footer_right: "", accent_color: "#534AB7",
  })
  const [certLogoUploading, setCertLogoUploading] = useState(false)
  const [certLogoRemoving, setCertLogoRemoving] = useState(false)
  const certLogoRef = useRef<HTMLInputElement>(null)
  // Certificates — tab + class picker
  const [certTab, setCertTab] = useState<"certs" | "settings">("certs")
  const [certClassId, setCertClassId] = useState("")
  const [certModules, setCertModules] = useState<Array<{ module_id: string | null; module_title: string; subject: string; total_items: number; certificates: AdminCertificate[] }>>([])
  const [certCustomCerts, setCertCustomCerts] = useState<AdminCertificate[]>([])
  const [certModulesLoading, setCertModulesLoading] = useState(false)
  // Certificates — issue modal
  const [certIssueOpen, setCertIssueOpen] = useState(false)
  const [certIssueTitle, setCertIssueTitle] = useState("")
  const [certIssueReason, setCertIssueReason] = useState("")
  const [certIssueLoading, setCertIssueLoading] = useState(false)
  const [certIssueTemplate, setCertIssueTemplate] = useState<"course_completion" | "academic_excellence" | "outstanding_achievement" | null>(null)
  const [certIssueError, setCertIssueError] = useState("")
  const [certClassStudents, setCertClassStudents] = useState<Array<{ id: string; name: string }>>([])
  const [certSelectedIds, setCertSelectedIds] = useState<Set<string>>(new Set())
  // Certificates — per-cert actions
  const [certRevokeReason, setCertRevokeReason] = useState("")
  const [certRevokeCount, setCertRevokeCount] = useState(0)
  const [certActionError, setCertActionError] = useState("")
  const [certDeleteConfirm, setCertDeleteConfirm] = useState<{ certId: string; studentName: string; moduleTitle: string } | null>(null)
  const [certModuleDeleting, setCertModuleDeleting] = useState<string | null>(null)
  // Certificates — bulk actions on custom certs
  const [certBulkIds, setCertBulkIds] = useState<Set<string>>(new Set())
  const [certBulkDeleting, setCertBulkDeleting] = useState(false)
  const [certBulkConfirm, setCertBulkConfirm] = useState(false)
  // Live Code / Reports
  const [challenges, setChallenges] = useState<ChallengeRow[]>([])
  const [challengesLoading, setChallengesLoading] = useState(false)
  // Reports
  const [reportsDownloading, setReportsDownloading] = useState(false)

  // ── data loaders ─────────────────────────────────────────────────────────────

  // Each list is loaded when a section that shows it opens, and not again for a minute
  // while the admin moves between sections. Add/edit/remove actions reload explicitly.
  const loadedAtRef = useRef<Record<string, number>>({})
  function loadOnce(key: string, load: () => void, maxAgeMs = 60_000) {
    const at = loadedAtRef.current[key]
    if (at && Date.now() - at < maxAgeMs) return
    loadedAtRef.current[key] = Date.now()
    load()
  }

  // School name/stats feed the header and settings on every section
  useEffect(() => { loadOverview() }, [])

  useEffect(() => {
    if (view === "classes") { loadOnce("classes", loadClasses); setSelectedClassIds(new Set()) }
    if (view === "teachers") { loadOnce("teachers", loadTeachers); loadOnce("classes", loadClasses) }
    if (view === "students") { loadOnce("students", loadStudents); loadOnce("classes", loadClasses) }
    if (view === "overview") {
      loadOnce("students", loadStudents); loadOnce("classes", loadClasses); loadOnce("teachers", loadTeachers)
      loadOnce("sessions-today", () => { loadTeacherSessions("today") }); loadOnce("attendance-today", () => { loadStudentAttendance() })
    }
    if (view === "timetable") { loadOnce("classes", loadClasses); loadOnce("teachers", loadTeachers); setTimetableClassId(""); setTimetableSlots([]); setPeriodTimes({}) }
    if (view === "notifications" && !notifsLoaded) { loadAdminNotifs() }
    if (view === "certificates") { loadOnce("cert-template", loadCertTemplate); loadOnce("classes", loadClasses) }
    if (view === "reports") { loadOnce("challenges", loadChallenges); loadOnce("classes", loadClasses); loadOnce("teachers", loadTeachers); loadOnce("students", loadStudents) }
  }, [view])

  // Auto-select first class on views that show a class dropdown with no default
  useEffect(() => {
    if (view === "timetable" && classes.length > 0 && !timetableClassId) {
      const sorted = [...classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
      const c = sorted[0]
      setTimetableClassId(c.id)
      setTimetableSlots(c.timetable)
      const pt: Record<number, { start: string; end: string }> = {}
      for (const s of c.timetable) {
        if (!pt[s.period]) pt[s.period] = { start: s.start_time, end: s.end_time }
      }
      setPeriodTimes(pt)
    }
    if (view === "certificates" && classes.length > 0 && !certClassId) {
      loadCertClass(classes[0].id)
    }
  }, [view, classes])

  async function loadAdminNotifs() {
    setNotifsLoading(true)
    const res = await getAdminNotifications()
    setNotifsLoading(false)
    setNotifsLoaded(true)
    if (!("error" in res)) setAdminNotifs(res.notifications)
  }

  async function loadChallenges() {
    setChallengesLoading(true)
    const res = await getChallenges()
    setChallengesLoading(false)
    if (!("error" in res)) setChallenges(res.challenges)
  }

  async function loadTeacherAtt(id: string, period: AttPeriod, from?: string, to?: string) {
    const key = period === "custom" ? `${id}_custom_${from}_${to}` : `${id}_${period}`
    if (teacherAttCache[key]) return
    setTeacherAttLoading(true)
    const res = await getTeacherAttDetail(id, period, from, to)
    setTeacherAttLoading(false)
    if (!("error" in res)) setTeacherAttCache(prev => ({ ...prev, [key]: res }))
  }

  async function loadStudentAtt(id: string, period: AttPeriod, from?: string, to?: string) {
    const key = period === "custom" ? `${id}_custom_${from}_${to}` : `${id}_${period}`
    if (studentAttCache[key]) return
    setStudentAttLoading(true)
    const res = await getStudentAttDetail(id, period, from, to)
    setStudentAttLoading(false)
    if (!("error" in res)) setStudentAttCache(prev => ({ ...prev, [key]: res }))
  }

  async function handleToggleTeacher(id: string) {
    if (expandedTeacherId === id) { setExpandedTeacherId(null); return }
    setExpandedTeacherId(id)
    setTeacherAttPeriod("month")
    setTeacherAttCustomFrom("")
    setTeacherAttCustomTo("")
    if (!teacherDetailMap[id]) {
      setTeacherDetailLoading(id)
      const res = await getTeacherDetail(id)
      setTeacherDetailLoading(null)
      if (!("error" in res)) setTeacherDetailMap(prev => ({ ...prev, [id]: res }))
    }
    void loadTeacherAtt(id, "month")
  }

  async function handleToggleStudent(id: string) {
    if (expandedStudentId === id) { setExpandedStudentId(null); return }
    setExpandedStudentId(id)
    setStudentAttPeriod("month")
    setStudentAttCustomFrom("")
    setStudentAttCustomTo("")
    if (!studentDetailMap[id]) await loadStudentDetail(id)
    void loadStudentAtt(id, "month")
  }

  async function loadStudentDetail(id: string) {
    setStudentDetailLoading(id)
    const res = await getStudentDetail(id)
    setStudentDetailLoading(null)
    if (!("error" in res)) {
      // counted_from / counted_class_label say which class and date the attendance figure was counted from
      const detail: StudentDetail = { ...res, counted_from: res.counted_from, counted_class_label: res.counted_class_label }
      setStudentDetailMap(prev => ({ ...prev, [id]: detail }))
    }
  }

  // After a move, the open row's class history is stale — forget it so it is fetched fresh next time the row opens
  function dropStudentDetails(ids: string[]) {
    setStudentDetailMap(prev => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
    setExpandedStudentId(cur => (cur && ids.includes(cur) ? null : cur))
  }

  function handleDownloadCompliance() {
    setReportsDownloading(true)
    fetch(`${import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"}/api/reports/compliance`, { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.blob() })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url; a.download = "compliance_report.pdf"
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      })
      .catch(err => alert(`Download failed: ${err.message}`))
      .finally(() => setReportsDownloading(false))
  }

  async function handleSendNotif() {
    if (!notifForm.title.trim() || !notifForm.message.trim()) {
      setNotifError("Title and message are required."); return
    }
    if ((notifForm.audienceMode === "class" || notifForm.audienceMode === "teacher") && !notifForm.target) {
      setNotifError(notifForm.audienceMode === "class" ? "Please select a class." : "Please select a teacher."); return
    }
    const scheduledAt = notifForm.scheduleDate
      ? `${notifForm.scheduleDate}T${notifForm.scheduleTime || "09:00"}:00`
      : undefined
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) {
      setNotifError("Scheduled time must be in the future."); return
    }
    setNotifSending(true); setNotifError(""); setNotifMsg("")
    const expiresDate = new Date(Date.now() + parseInt(notifForm.expires_days || "7") * 86400000).toISOString()
    const res = await createNotification({
      ...notifForm,
      expires_at: expiresDate,
      scheduled_at: scheduledAt,
    })
    setNotifSending(false)
    if ("error" in res) { setNotifError(res.error || "Failed to send notification. Please try again."); return }
    setNotifMsg(scheduledAt
      ? `Scheduled for ${new Date(scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} at ${notifForm.scheduleTime}!`
      : "Notification sent successfully!")
    setNotifForm({ type: "announcement", title: "", message: "", target: "all", target_label: "Everyone", expires_days: "7", audienceMode: "all", scheduleDate: "", scheduleTime: "09:00" })
    loadAdminNotifs()
    setTimeout(() => setNotifMsg(""), 4000)
  }

  async function handleDeleteNotif(id: string) {
    if (!confirm("Delete this notification? It will be removed for all users.")) return
    setAdminNotifs(prev => prev.filter(n => n.id !== id))
    await deleteNotification(id)
  }

  useEffect(() => {
    if (view === "settings" && user) {
      setProfileForm({ name: user.name ?? "", email: user.email ?? "", phone: (user as { phone?: string }).phone ?? "" })
    }
  }, [view, user])

  useEffect(() => {
    if (view !== "data-requests" || deletionReqsLoaded) return
    setDeletionReqsLoading(true)
    getDeletionRequests().then(res => {
      if (!("error" in res)) setDeletionReqs(res.requests)
      setDeletionReqsLoaded(true)
      setDeletionReqsLoading(false)
    })
  }, [view, deletionReqsLoaded])

  async function loadOverview() {
    setLoadingSchool(true)
    const res = await getSchool()
    if ("error" in res) { setLoadingSchool(false); return }
    setSchool(res.school)
    setStats(res.stats)
    setSettingsForm({
      name: res.school.name,
      board: res.school.board,
      city: res.school.city ?? "",
      state: res.school.state ?? "",
      udise_code: res.school.udise_code ?? "",
    })
    setTwoFactorEnabled(res.school.two_factor_enabled ?? false)
    setLoadingSchool(false)
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileSaving(true); setProfileMsg("")
    const res = await updateProfile({
      name: profileForm.name || undefined,
      phone: profileForm.phone,
    })
    setProfileSaving(false)
    if ("error" in res) { setProfileMsg("Error: " + (res as { error: string }).error); return }
    setProfileMsg("Saved!")
    setTimeout(() => setProfileMsg(""), 2000)
  }

  async function loadClasses() {
    setLoadingClasses(true)
    const res = await getClasses()
    if (!("error" in res)) setClasses(res.classes)
    setLoadingClasses(false)
  }

  async function loadTeachers() {
    setLoadingTeachers(true)
    const res = await getTeachers()
    if (!("error" in res)) setTeachers(res.teachers)
    setLoadingTeachers(false)
  }

  async function loadStudents() {
    setLoadingStudents(true)
    const res = await getStudents()
    if (!("error" in res)) setStudents(res.students)
    setLoadingStudents(false)
  }

  async function loadTeacherSessions(
    period: "today" | "week" | "month" | "custom" = "today",
    from?: string,
    to?: string,
  ) {
    setLoadingSessions(true)
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    let res
    if (period === "today") {
      // Pass exact calendar date so sessions from yesterday don't bleed in
      res = await getTeacherSessions(0, todayStr, todayStr)
    } else if (period === "custom" && from && to) {
      res = await getTeacherSessions(0, from, to)
    } else {
      const daysMap: Record<string, number> = { week: 7, month: 30 }
      res = await getTeacherSessions(daysMap[period] ?? 30)
    }
    if (!("error" in res)) setTeacherSessions(res.summary)
    setLoadingSessions(false)
  }

  async function loadStudentAttendance() {
    const res = await getSchoolAttendanceToday()
    if (!("error" in res)) {
      setStudentAttendance(new Map(res.attendance.map(a => [a.student_id, a])))
    }
  }

  async function loadCertTemplate() {
    setCertTemplateLoading(true)
    const res = await getCertTemplate()
    setCertTemplateLoading(false)
    if ("error" in res) return
    const tmpl = (res as { template: CertTemplateData }).template
    setCertTemplate(tmpl)
    setCertTemplateForm({
      school_name: tmpl.school_name ?? "",
      description: tmpl.description ?? "",
      footer_left: tmpl.footer_left ?? "",
      footer_right: tmpl.footer_right ?? "",
      accent_color: tmpl.accent_color ?? "#534AB7",
    })
  }

  async function handleSaveCertTemplate() {
    setCertTemplateSaving(true)
    const res = await saveCertTemplate({
      school_name: (certTemplateForm as { school_name?: string }).school_name ?? school?.name ?? "",
      description: certTemplateForm.description ?? "",
      footer_left: certTemplateForm.footer_left ?? "",
      footer_right: certTemplateForm.footer_right ?? "",
      accent_color: certTemplateForm.accent_color ?? "#534AB7",
    })
    setCertTemplateSaving(false)
    if (!("error" in res)) { setCertTmplSaved(true); setTimeout(() => setCertTmplSaved(false), 2500) }
  }

  async function handleCertLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCertLogoUploading(true)
    await uploadCertLogo(file)
    const res = await getCertTemplate()
    if (!("error" in res)) setCertTemplate((res as { template: CertTemplateData }).template)
    setCertLogoUploading(false)
    if (certLogoRef.current) certLogoRef.current.value = ""
  }

  async function handleDeleteCertLogo() {
    if (!confirm("Remove the school logo? You can re-upload it anytime.")) return
    setCertLogoRemoving(true)
    await deleteCertLogo()
    setCertTemplate(t => t ? { ...t, logo_base64: null, logo_mime: null } : t)
    setCertLogoRemoving(false)
  }

  // Only the most recent class request may update the screen (fast class switching)
  const certClassRequestRef = useRef(0)
  function loadCertClass(classId: string) {
    const requestNo = ++certClassRequestRef.current
    setCertClassId(classId)
    setCertModulesLoading(true)
    setCertCustomCerts([])
    setCertSelectedIds(new Set())
    setCertBulkIds(new Set())
    setCertBulkConfirm(false)
    Promise.all([
      getCertsByClass(classId),
      getClassStudents(classId),
    ]).then(([certsRes, studentsRes]) => {
      if (requestNo !== certClassRequestRef.current) return
      setCertModulesLoading(false)
      if ("error" in certsRes) { setCertModules([]); setCertCustomCerts([]); setCertActionError(certsRes.error) }
      else {
        setCertModules(certsRes.modules)
        setCertCustomCerts(certsRes.custom_certificates ?? [])
      }
      if (!("error" in studentsRes)) {
        setCertClassStudents(studentsRes.students.filter(s => s.is_active).map(s => ({ id: s.id, name: s.name })))
      }
    })
  }

  async function handleIssueCerts() {
    if (!certClassId || certSelectedIds.size === 0 || !certIssueTitle.trim()) return
    if (!certIssueTemplate) { setCertIssueError("Please choose a certificate type."); return }
    setCertIssueLoading(true)
    setCertIssueError("")
    const res = await issueCustomCertificate({
      class_id: certClassId,
      student_ids: Array.from(certSelectedIds),
      custom_title: certIssueTitle.trim(),
      custom_reason: certIssueReason.trim() || undefined,
      cert_template: certIssueTemplate,
    })
    setCertIssueLoading(false)
    if ("error" in res) { setCertIssueError(res.error || "Failed to issue certificate. Please try again."); return }
    setCertCustomCerts(prev => [...prev, ...res.certificates])
    setCertIssueOpen(false)
    setCertIssueTitle("")
    setCertIssueReason("")
    setCertIssueTemplate(null)
    setCertSelectedIds(new Set())
  }

  // A revoked certificate stays in every list, shown as "Revoked" (it is never deleted)
  function markCertsRevoked(ids: Set<string>, reason: string) {
    if (ids.size > 0) setCertRevokeCount(n => n + 1)
    const revokedAt = new Date().toISOString()
    const mark = (c: AdminCertificate): AdminCertificate =>
      ids.has(c._id) ? { ...c, status: "revoked", revoked_at: revokedAt, revoke_reason: reason } : c
    setCertModules(prev => prev.map(mod => ({ ...mod, certificates: mod.certificates.map(mark) })))
    setCertCustomCerts(prev => prev.map(mark))
  }

  async function handleBulkRevokeCerts() {
    if (certBulkIds.size === 0) return
    setCertBulkDeleting(true)
    setCertActionError("")
    const reason = certRevokeReason.trim()
    const ids = Array.from(certBulkIds)
    const results = await Promise.all(ids.map(id => revokeCertificate(id, reason)))
    const revoked = new Set(ids.filter((_, i) => !("error" in results[i])))
    markCertsRevoked(revoked, reason)
    if (revoked.size < ids.length) setCertActionError(`${ids.length - revoked.size} certificate(s) could not be revoked. Please try again.`)
    setCertBulkIds(new Set())
    setCertBulkDeleting(false)
    setCertBulkConfirm(false)
    setCertRevokeReason("")
  }

  async function handleConfirmRevoke() {
    if (!certDeleteConfirm) return
    const { certId } = certDeleteConfirm
    const reason = certRevokeReason.trim()
    setCertModuleDeleting(certId)
    const res = await revokeCertificate(certId, reason)
    setCertModuleDeleting(null)
    if ("error" in res) { setCertActionError(res.error); return }
    setCertDeleteConfirm(null)
    setCertRevokeReason("")
    markCertsRevoked(new Set([certId]), reason)
  }

  // ── handlers ──────────────────────────────────────────────────────────────────

  async function handleAddClass(e: React.FormEvent) {
    e.preventDefault()
    if (!newClassName.trim()) { setAddClassErr("Class name is required"); return }
    setAddClassErr(""); setAddClassLoading(true)
    const res = await createClass(newClassName.trim(), newSubjects.length ? newSubjects : undefined)
    setAddClassLoading(false)
    if ("error" in res) { setAddClassErr(res.error || "Failed to create class. Please try again."); return }
    setShowAddClass(false)
    setNewClassName(""); setNewSubjects([]); setNewSubjectInput("")
    await loadClasses()
    setStats(s => ({ ...s, classes: s.classes + 1 }))
  }

  // Opening (or closing) the Edit class form always starts with a clean school-year-start state
  function openEditClass(c: ClassRow | null) {
    yearStartPreviewToken.current += 1
    setEditClass(c)
    // A class with no saved date starts with an empty box, so only a date the admin picks is saved
    setEditYearStart(c ? (classStartDate(c) ?? "") : "")
    setEditYearStartReason("")
    setYearStartError(null)
    setEditClassErr("")
    setYearStartConfirmOpen(false)
    setYearStartPreviewLoading(false)
    setYearStartPreview(null)
    setYearStartCheckFailed(false)
  }

  function yearStartChanged() {
    return !!editClass && editYearStart !== "" && editYearStart !== (classStartDate(editClass) ?? "")
  }

  // Asks the server what the new date would do to saved attendance sheets (writes nothing), then opens the confirmation
  async function checkYearStartPreview() {
    if (!editClass) return
    const token = ++yearStartPreviewToken.current
    setYearStartError(null); setYearStartCheckFailed(false); setYearStartPreview(null)
    setYearStartConfirmOpen(true); setYearStartPreviewLoading(true)
    const res = await getYearStartPreview(editClass.id, editYearStart)
    if (token !== yearStartPreviewToken.current) return
    setYearStartPreviewLoading(false)
    if ("error" in res) {
      // Back to the form: a refused date shows the server's sentence, anything else offers "Try again"
      setYearStartConfirmOpen(false)
      if (res.code) setYearStartError(res.error)
      else setYearStartCheckFailed(true)
      return
    }
    setYearStartPreview(res)
  }

  function handleEditClass(e: React.FormEvent) {
    e.preventDefault()
    if (!editClass || editClassLoading || yearStartPreviewLoading) return
    const hasSavedDate = classStartDate(editClass) !== null
    // A saved date cannot be removed by emptying the box
    if (hasSavedDate && editYearStart === "") { setYearStartError(YEAR_START_CHOOSE_DATE); return }
    // Changing a date that is already saved is confirmed first (with a preview of the saved sheets)
    if (yearStartChanged() && hasSavedDate) {
      void checkYearStartPreview()
      return
    }
    // A first date in the future keeps teachers out until that day, so it is confirmed too (no preview: nothing is saved yet)
    if (yearStartChanged() && editYearStart > istToday()) {
      yearStartPreviewToken.current += 1
      setYearStartError(null); setYearStartCheckFailed(false); setYearStartPreview(null)
      setYearStartPreviewLoading(false); setYearStartConfirmOpen(true)
      return
    }
    void saveEditedClass()
  }

  // "Keep <old date>" in the confirmation: back to the form with the old date
  function cancelYearStartChange() {
    yearStartPreviewToken.current += 1
    setEditYearStart(editClass ? (classStartDate(editClass) ?? "") : "")
    setYearStartConfirmOpen(false)
    setYearStartPreviewLoading(false)
    setYearStartPreview(null)
    setYearStartError(null)
  }

  async function saveEditedClass() {
    if (!editClass) return
    const dateChanged = yearStartChanged()
    const reason = editYearStartReason.trim()
    setEditClassErr(""); setYearStartError(null); setEditClassLoading(true)
    const res = await updateClass(editClass.id, {
      name: editClassName || undefined,
      subjects: editSubjects,
      ...(dateChanged ? { year_start: editYearStart, expected_current: classStartDate(editClass) } : {}),
      ...(dateChanged && reason ? { reason } : {}),
    })
    setEditClassLoading(false)
    setYearStartConfirmOpen(false)
    if ("error" in res) {
      if (res.code === "conflict" && res.year_start_effective) {
        // Someone else changed the date: show it, keep the typed reason, and use it as the new starting point.
        // The saved date comes from the server's year_start (null = none saved); the effective date may be only a default.
        const savedStart = res.year_start ?? null
        setYearStartError(savedStart
          ? `Someone else just changed this date to ${formatYmdForDisplay(savedStart)}. Nothing was saved. Check the new date and try again.`
          : "Someone else just changed this class. Nothing was saved. Check the class and try again.")
        setEditClass({ ...editClass, year_start: savedStart, year_start_effective: res.year_start_effective, has_start_date: savedStart !== null })
        setEditYearStart(savedStart ?? "")
        void loadClasses()
      } else if (dateChanged) {
        setYearStartError(res.error || "Failed to save the school year start. Please try again.")
      } else {
        setEditClassErr(res.error || "Failed to save changes. Please try again.")
      }
      return
    }
    setClasses(prev => prev.map(c => c.id === editClass.id
      ? { ...c, name: res.name, subjects: res.subjects, year_start: res.year_start, year_start_effective: res.year_start_effective, has_start_date: res.year_start !== null }
      : c))
    if (dateChanged) void loadClasses()
    openEditClass(null)
  }

  // ── Set the school year start for many classes at once ──
  // `ids` (when given) become the ticked classes, e.g. "Set dates" ticks exactly the classes without a date
  function openBulkYearStart(ids?: string[]) {
    if (ids) setSelectedClassIds(new Set(ids))
    setBulkYsDate(""); setBulkYsIncludeDated(false); setBulkYsReason("")
    setBulkYsError(null); setBulkYsOutcome(null); setBulkYsFailedIds([])
    setShowBulkYearStart(true)
  }

  function closeBulkYearStart() {
    if (bulkYsLoading) return
    if (bulkYsOutcome && bulkYsOutcome.updated > 0) setSelectedClassIds(new Set())
    setShowBulkYearStart(false)
  }

  // `onlyIds` is the "Retry": only the classes that could not be saved are sent again
  async function sendBulkYearStart(onlyIds?: string[]) {
    if (bulkYsLoading || !bulkYsDate) return
    const wanted = classes.filter(c => (onlyIds ? onlyIds.includes(c.id) : selectedClassIds.has(c.id)))
    if (wanted.length === 0) return
    if (wanted.length > 200) { setBulkYsError("You can set at most 200 classes at a time. Please untick some classes."); return }
    const reason = bulkYsReason.trim()
    setBulkYsLoading(true); setBulkYsError(null)
    const res = await bulkSetYearStart({
      year_start: bulkYsDate,
      classes: wanted.map(c => ({ id: c.id, expected_current: classStartDate(c) })),
      ...(bulkYsIncludeDated ? { include_dated: true } : {}),
      ...(reason ? { reason } : {}),
    })
    if ("error" in res) {
      // A timeout or network error may still have saved some classes: reload so a retry sends fresh expected dates
      await loadClasses()
      setBulkYsLoading(false)
      setBulkYsError(res.error || "Could not save the start dates. Please try again.")
      return
    }
    let updated = 0, leftAsTheyWere = 0, notFound = 0
    const failedIds: string[] = []
    for (const r of res.results) {
      if (r.status === "saved" || r.status === "unchanged") updated += 1
      else if (r.status === "error") failedIds.push(r.id)
      else if (r.status === "not_found") notFound += 1
      else leftAsTheyWere += 1
    }
    await loadClasses()
    // A retry adds to what the first attempt already did
    const before = onlyIds ? bulkYsOutcome : null
    setBulkYsOutcome({
      updated: updated + (before?.updated ?? 0),
      leftAsTheyWere: leftAsTheyWere + (before?.leftAsTheyWere ?? 0),
      notFound: notFound + (before?.notFound ?? 0),
      failed: failedIds.length,
    })
    setBulkYsFailedIds(failedIds)
    setBulkYsLoading(false)
  }

  async function handleDeleteClass() {
    if (!confirmDeleteClass) return
    setDeleteClassLoading(true)
    const res = await deleteClass(confirmDeleteClass.id)
    setDeleteClassLoading(false)
    if ("error" in res) return
    setClasses(cls => cls.filter(c => c.id !== confirmDeleteClass.id))
    setStats(s => ({ ...s, classes: Math.max(0, s.classes - 1) }))
    setConfirmDeleteClass(null)
  }

  async function handleBulkDeleteClasses() {
    if (selectedClassIds.size === 0) return
    setClassBulkDeleteLoading(true)
    const ids = Array.from(selectedClassIds)
    await Promise.all(ids.map(id => deleteClass(id)))
    setClasses(prev => prev.filter(c => !selectedClassIds.has(c.id)))
    setStats(s => ({ ...s, classes: Math.max(0, s.classes - ids.length) }))
    setClassBulkDeleteLoading(false)
    setSelectedClassIds(new Set())
  }

  async function handleInviteTeacher(e: React.FormEvent) {
    e.preventDefault()
    if (!school) return
    setTeacherErr(""); setTeacherLoading(true)
    const res = await inviteTeacher({
      name: teacherForm.name,
      email: teacherForm.email,
      phone: teacherForm.phone || undefined,
      school_id: school.id,
      class_id: teacherForm.class_id || undefined,
      subject: teacherForm.subject || undefined,
    })
    setTeacherLoading(false)
    if (res.error) { setTeacherErr(res.error); return }
    setTeacherResult({ email: teacherForm.email, temp_password: res.temp_password! })
    setStats(s => ({ ...s, teachers: s.teachers + 1 }))
    await loadTeachers()
  }

  async function handleBulkTeacherImport() {
    if (!school || !bulkTeacherRows.length) return
    setBulkTeacherLoading(true)
    const res = await bulkInviteTeachers({ teachers: bulkTeacherRows, school_id: school.id })
    setBulkTeacherLoading(false)
    if (res.error) return
    setBulkTeacherResults(res.results ?? [])
    setStats(s => ({ ...s, teachers: s.teachers + (res.results?.filter(r => !r.error).length ?? 0) }))
    await loadTeachers()
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!school) return
    setStudentErr(""); setStudentLoading(true)
    const res = await addStudent({
      name: studentForm.name,
      email: studentForm.email || undefined,
      phone: studentForm.phone || undefined,
      gender: studentForm.gender || undefined,
      roll_no: studentForm.roll_no,
      class_id: studentForm.class_id,
      school_id: school.id,
    })
    setStudentLoading(false)
    if (res.error) { setStudentErr(res.error); return }
    setStudentResult({ username: res.username!, temp_password: res.temp_password!, name: studentForm.name })
    setStats(s => ({ ...s, students: s.students + 1 }))
    if (view === "students") await loadStudents()
  }

  async function handleEditStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!editStudent) return
    setEditErr(""); setEditLoading(true)
    const res = await updateStudent(editStudent.id, {
      name: editForm.name || undefined,
      email: editForm.email,          // send even if empty — backend sets null to clear
      phone: editForm.phone,          // send even if empty — backend sets null to clear
      gender: editForm.gender,        // send even if empty — backend sets null to clear
      class_id: editForm.class_id || undefined, // empty = no change
    })
    setEditLoading(false)
    if ("error" in res) { setEditErr(res.error); return }
    setStudents(prev => prev.map(s => s.id === editStudent.id ? {
      ...s,
      name: res.name, email: res.email, phone: res.phone,
      gender: res.gender, class_id: res.class_id, class_label: res.class_label,
    } : s))
    dropStudentDetails([editStudent.id])
    setEditStudent(null)
  }

  async function handleBulkAction(action: "class" | "gender" | "delete") {
    const visibleSelectedIds = new Set(filteredStudents.map(s => s.id).filter(id => selectedIds.has(id)))
    if (visibleSelectedIds.size === 0) return
    setBulkActionLoading(true)
    const ids = Array.from(visibleSelectedIds)

    if (action === "delete") {
      // single request — deleteMany on backend
      await bulkDeleteUsers(ids)
      setStudents(prev => prev.filter(s => !visibleSelectedIds.has(s.id)))
      setStats(s => ({ ...s, students: Math.max(0, s.students - ids.length) }))
      setSelectedIds(new Set())
      setShowBulkActions(false)
    } else if (action === "class" && bulkActionClass) {
      // single request — updateMany on backend
      const res = await bulkTransferStudents(ids, bulkActionClass)
      if (!("error" in res)) {
        setStudents(prev => prev.map(s =>
          visibleSelectedIds.has(s.id)
            ? { ...s, class_id: res.class_id, class_label: res.class_label }
            : s
        ))
        dropStudentDetails(ids)
      }
    } else if (action === "gender" && bulkActionGender) {
      // single request — updateMany on backend
      await bulkSetGender(ids, bulkActionGender)
      setStudents(prev => prev.map(s => visibleSelectedIds.has(s.id) ? { ...s, gender: bulkActionGender } : s))
    }

    setBulkActionLoading(false)
    setBulkActionClass("")
    setBulkActionGender("")
  }

  async function handleEditTeacher(e: React.FormEvent) {
    e.preventDefault()
    if (!editTeacher) return
    // Validate: every selected class must have at least one subject
    const incomplete = editAssignments.find(a => a.subjects.length === 0)
    if (incomplete) { setEditTeacherErr("Please select at least one subject for every assigned class."); return }

    setEditTeacherErr(""); setEditTeacherLoading(true)

    // 1. Save profile fields (name/email/phone) via existing PATCH
    const profileRes = await updateTeacher(editTeacher.id, {
      name: editTeacherForm.name || undefined,
      email: editTeacherForm.email,
      phone: editTeacherForm.phone,
    })
    if ("error" in profileRes) { setEditTeacherLoading(false); setEditTeacherErr(profileRes.error); return }

    // 2. Expand { class_id, subjects[] } → flat { class_id, subject }[] for backend
    const flatAssignments = editAssignments.flatMap(a => a.subjects.map(s => ({ class_id: a.class_id, subject: s })))
    const assignRes = await setTeacherAssignments(editTeacher.id, flatAssignments)
    setEditTeacherLoading(false)
    if ("error" in assignRes) { setEditTeacherErr(assignRes.error); return }

    setTeachers(prev => prev.map(t => t.id === editTeacher.id ? {
      ...t, name: profileRes.name, email: profileRes.email, phone: profileRes.phone,
      class_label: assignRes.class_label, subject_assignments: assignRes.subject_assignments,
    } : t))
    setEditTeacher(null)
  }

  async function handleTeacherBulkAction(action: "class" | "delete") {
    // Only teachers the current search shows — never someone hidden by the search
    const ids = filteredTeachers.filter(t => selectedTeacherIds.has(t.id)).map(t => t.id)
    if (ids.length === 0) return
    const idSet = new Set(ids)
    setTeacherBulkActionLoading(true)
    if (action === "delete") {
      await bulkDeleteUsers(ids)
      setTeachers(prev => prev.filter(t => !idSet.has(t.id)))
      setStats(s => ({ ...s, teachers: Math.max(0, s.teachers - ids.length) }))
    } else if (action === "class" && teacherBulkClass) {
      // single request — bulk assign on backend
      const res = await bulkAssignTeachersToClass(ids, teacherBulkClass)
      if (!("error" in res)) {
        setTeachers(prev => prev.map(t =>
          idSet.has(t.id) ? { ...t, class_label: res.class_label } : t
        ))
      }
    }
    setTeacherBulkActionLoading(false)
    setSelectedTeacherIds(new Set())
    setShowTeacherBulkActions(false)
    setTeacherBulkClass("")
    await loadTeachers()
  }

  async function handleBulkImport() {
    if (!school || !bulkClassId || !bulkRows.length) return
    setBulkLoading(true)
    const res = await bulkAddStudents({ students: bulkRows, class_id: bulkClassId, school_id: school.id })
    setBulkLoading(false)
    if (res.error) return
    setBulkResults(res.results ?? [])
    setStats(s => ({ ...s, students: s.students + (res.results?.filter(r => !r.error).length ?? 0) }))
    if (view === "students") await loadStudents()
  }

  async function handleRemove() {
    if (!confirmRemove) return
    setRemoveLoading(true)
    await removeUser(confirmRemove.id)
    setRemoveLoading(false)
    setConfirmRemove(null)
    if (view === "teachers") loadTeachers()
    if (view === "students") loadStudents()
    await loadOverview()
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSettingsSaving(true); setSettingsMsg("")
    const res = await updateSchool(settingsForm)
    setSettingsSaving(false)
    if ("error" in res) { setSettingsMsg("Error: " + res.error); return }
    setSchool(res.school as SchoolData)
    setSettingsMsg("Saved!")
    setTimeout(() => setSettingsMsg(""), 2000)
  }

  async function handleToggleTwoFactor() {
    setTwoFactorToggling(true)
    const newValue = !twoFactorEnabled
    const res = await toggleTwoFactor(newValue)
    setTwoFactorToggling(false)
    if ("error" in res) return
    setTwoFactorEnabled(newValue)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwErr(""); setPwMsg("")
    if (!pwForm.current || !pwForm.next) { setPwErr("All fields are required."); return }
    if (pwForm.next !== pwForm.confirm) { setPwErr("New passwords do not match."); return }
    if (pwForm.next.length < 8) { setPwErr("New password must be at least 8 characters."); return }
    setPwSaving(true)
    const res = await changePassword(pwForm.current, pwForm.next)
    setPwSaving(false)
    if ("error" in res) { setPwErr(res.error); return }
    setPwMsg("Password changed successfully!")
    setPwForm({ current: "", next: "", confirm: "" })
    setTimeout(() => setPwMsg(""), 3000)
  }

  // ── filtered lists ────────────────────────────────────────────────────────────

  // ── class sort order lookup: class_id → {grade, section} ────────────────────
  const classSortMap = Object.fromEntries(classes.map(c => [c.id, { grade: c.grade, section: c.section }]))

  function classLabel(grade: number, section: string) { return `${grade}${section}` }

  const filteredTeachers = teachers
    .filter(t =>
      t.name.toLowerCase().includes(searchTeachers.toLowerCase()) ||
      t.email.toLowerCase().includes(searchTeachers.toLowerCase())
    )
    .sort((a, b) => {
      // sort by first assignment class (grade asc → section asc → name asc)
      const aAssign = a.subject_assignments?.[0]
      const bAssign = b.subject_assignments?.[0]
      const aCls = aAssign
        ? classes.find(c => clsLabel(c) === aAssign.class_label)
        : a.class_label ? classes.find(c => clsLabel(c) === a.class_label) : null
      const bCls = bAssign
        ? classes.find(c => clsLabel(c) === bAssign.class_label)
        : b.class_label ? classes.find(c => clsLabel(c) === b.class_label) : null
      // unassigned teachers go to the bottom
      if (!aCls && !bCls) return a.name.localeCompare(b.name)
      if (!aCls) return 1
      if (!bCls) return -1
      if (aCls.grade !== bCls.grade) return aCls.grade - bCls.grade
      if (aCls.section !== bCls.section) return aCls.section.localeCompare(bCls.section)
      return a.name.localeCompare(b.name)
    })

  const filteredStudents = students
    .filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchStudents.toLowerCase()) ||
        (s.class_label ?? "").toLowerCase().includes(searchStudents.toLowerCase())
      const matchClass = !filterClass || s.class_id === filterClass
      return matchSearch && matchClass
    })
    .sort((a, b) => {
      const aCls = a.class_id ? classSortMap[a.class_id] : null
      const bCls = b.class_id ? classSortMap[b.class_id] : null
      if (!aCls && !bCls) return a.name.localeCompare(b.name)
      if (!aCls) return 1
      if (!bCls) return -1
      if (aCls.grade !== bCls.grade) return aCls.grade - bCls.grade
      if (aCls.section !== bCls.section) return aCls.section.localeCompare(bCls.section)
      return a.name.localeCompare(b.name)
    })

  // ── nav items ─────────────────────────────────────────────────────────────────

  const navItems = NAV.map(item => ({
    icon: item.icon,
    label: item.label,
    path: `#${item.key}`,
    onClick: () => setView(item.key),
  }))

  // ── greeting ──────────────────────────────────────────────────────────────────

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const greetEmoji = hour < 12 ? "🌅" : hour < 17 ? "☀️" : "🌙"
  const todayStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
  // ── stat tiles config ─────────────────────────────────────────────────────────

  const statTiles = [
    {
      label: "Classes",
      value: stats.classes,
      icon: <BookOpen className="w-5 h-5" />,
      gradient: "linear-gradient(135deg,#534AB7,#7B73E4)",
      bg: "rgba(83,74,183,0.08)",
      color: "#534AB7",
    },
    {
      label: "Teachers",
      value: stats.teachers,
      icon: <Users className="w-5 h-5" />,
      gradient: "linear-gradient(135deg,#378ADD,#5BA3EE)",
      bg: "rgba(55,138,221,0.08)",
      color: "#378ADD",
    },
    {
      label: "Students",
      value: stats.students,
      icon: <GraduationCap className="w-5 h-5" />,
      gradient: "linear-gradient(135deg,#EF9F27,#F7BC61)",
      bg: "rgba(239,159,39,0.08)",
      color: "#EF9F27",
    },
    {
      label: "Online Now",
      value: teacherSessions.filter(t => t.is_online).length,
      suffix: "",
      icon: <UserCheck className="w-5 h-5" />,
      gradient: "linear-gradient(135deg,#639922,#82C62B)",
      bg: "rgba(99,153,34,0.08)",
      color: "#639922",
    },
  ]

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout
      role="admin"
      userName={user?.name ?? "Admin"}
      userSubtitle={school?.name ?? "Loading…"}
      navItems={navItems}
      activeView={view}
      onSettingsClick={() => setView("settings")}
    >
      {/* ── OVERVIEW ── */}
      {view === "overview" && (
        <AdminOverviewPanel
          school={school}
          stats={stats}
          loadingSchool={loadingSchool}
          user={user}
          classes={classes}
          loadingClasses={loadingClasses}
          teachers={teachers}
          loadingTeachers={loadingTeachers}
          students={students}
          loadingStudents={loadingStudents}
          teacherSessions={teacherSessions}
          loadingSessions={loadingSessions}
          studentAttendance={studentAttendance}
          sessionPeriod={sessionPeriod}
          setSessionPeriod={setSessionPeriod}
          sessionFrom={sessionFrom}
          setSessionFrom={setSessionFrom}
          sessionTo={sessionTo}
          setSessionTo={setSessionTo}
          alertFilter={alertFilter}
          setAlertFilter={setAlertFilter}
          alertsRefreshing={alertsRefreshing}
          setAlertsRefreshing={setAlertsRefreshing}
          expandedTile={expandedTile}
          setExpandedTile={setExpandedTile}
          loadTeacherSessions={loadTeacherSessions}
          loadStudentAttendance={loadStudentAttendance}
          loadTeachers={loadTeachers}
          loadClasses={loadClasses}
          loadStudents={loadStudents}
          setView={setView}
          setShowAddClass={setShowAddClass}
          setShowTeacherModal={setShowTeacherModal}
          setShowStudentModal={setShowStudentModal}
        />
      )}
      {/* ── CLASSES ── */}
      {view === "classes" && (
        <AdminClassesPanel
          classes={classes}
          loadingClasses={loadingClasses}
          selectedClassIds={selectedClassIds}
          setSelectedClassIds={setSelectedClassIds}
          classBulkDeleteLoading={classBulkDeleteLoading}
          handleBulkDeleteClasses={handleBulkDeleteClasses}
          showAddClass={showAddClass}
          setShowAddClass={setShowAddClass}
          addClassErr={addClassErr}
          setAddClassErr={setAddClassErr}
          handleAddClass={handleAddClass}
          addClassLoading={addClassLoading}
          newClassName={newClassName}
          setNewClassName={setNewClassName}
          newSubjectInput={newSubjectInput}
          setNewSubjectInput={setNewSubjectInput}
          newSubjects={newSubjects}
          setNewSubjects={setNewSubjects}
          editClass={editClass}
          setEditClass={openEditClass}
          editClassName={editClassName}
          setEditClassName={setEditClassName}
          editSubjectInput={editSubjectInput}
          setEditSubjectInput={setEditSubjectInput}
          editSubjects={editSubjects}
          setEditSubjects={setEditSubjects}
          editClassErr={editClassErr}
          editClassLoading={editClassLoading}
          handleEditClass={handleEditClass}
          editYearStart={editYearStart}
          setEditYearStart={setEditYearStart}
          editYearStartReason={editYearStartReason}
          setEditYearStartReason={setEditYearStartReason}
          yearStartError={yearStartError}
          yearStartConfirmOpen={yearStartConfirmOpen}
          yearStartPreviewLoading={yearStartPreviewLoading}
          yearStartPreview={yearStartPreview}
          yearStartCheckFailed={yearStartCheckFailed}
          retryYearStartPreview={() => void checkYearStartPreview()}
          confirmYearStartChange={() => void saveEditedClass()}
          cancelYearStartChange={cancelYearStartChange}
          showBulkYearStart={showBulkYearStart}
          openBulkYearStart={openBulkYearStart}
          closeBulkYearStart={closeBulkYearStart}
          bulkYsDate={bulkYsDate}
          setBulkYsDate={setBulkYsDate}
          bulkYsIncludeDated={bulkYsIncludeDated}
          setBulkYsIncludeDated={setBulkYsIncludeDated}
          bulkYsReason={bulkYsReason}
          setBulkYsReason={setBulkYsReason}
          bulkYsLoading={bulkYsLoading}
          bulkYsError={bulkYsError}
          bulkYsOutcome={bulkYsOutcome}
          bulkYsFailedCount={bulkYsFailedIds.length}
          submitBulkYearStart={() => void sendBulkYearStart()}
          retryBulkYearStart={() => void sendBulkYearStart(bulkYsFailedIds)}
          confirmDeleteClass={confirmDeleteClass}
          setConfirmDeleteClass={setConfirmDeleteClass}
          handleDeleteClass={handleDeleteClass}
          deleteClassLoading={deleteClassLoading}
        />
      )}

      {/* ── TEACHERS ── */}
      {view === "teachers" && (
        <AdminTeachersPanel
          teachers={teachers}
          filteredTeachers={filteredTeachers}
          loadingTeachers={loadingTeachers}
          classes={classes}
          searchTeachers={searchTeachers}
          setSearchTeachers={setSearchTeachers}
          selectedTeacherIds={selectedTeacherIds}
          setSelectedTeacherIds={setSelectedTeacherIds}
          showTeacherBulkActions={showTeacherBulkActions}
          setShowTeacherBulkActions={setShowTeacherBulkActions}
          teacherBulkClass={teacherBulkClass}
          setTeacherBulkClass={setTeacherBulkClass}
          teacherBulkActionLoading={teacherBulkActionLoading}
          handleTeacherBulkAction={handleTeacherBulkAction}
          expandedTeacherId={expandedTeacherId}
          teacherDetailMap={teacherDetailMap}
          teacherDetailLoading={teacherDetailLoading}
          handleToggleTeacher={handleToggleTeacher}
          teacherAttPeriod={teacherAttPeriod}
          setTeacherAttPeriod={setTeacherAttPeriod}
          teacherAttCache={teacherAttCache}
          teacherAttLoading={teacherAttLoading}
          teacherAttCustomFrom={teacherAttCustomFrom}
          setTeacherAttCustomFrom={setTeacherAttCustomFrom}
          teacherAttCustomTo={teacherAttCustomTo}
          setTeacherAttCustomTo={setTeacherAttCustomTo}
          loadTeacherAtt={loadTeacherAtt}
          showTeacherModal={showTeacherModal}
          setShowTeacherModal={setShowTeacherModal}
          teacherForm={teacherForm}
          setTeacherForm={setTeacherForm}
          teacherErr={teacherErr}
          teacherLoading={teacherLoading}
          teacherResult={teacherResult}
          setTeacherResult={setTeacherResult}
          handleInviteTeacher={handleInviteTeacher}
          showBulkTeacher={showBulkTeacher}
          setShowBulkTeacher={setShowBulkTeacher}
          bulkTeacherRows={bulkTeacherRows}
          setBulkTeacherRows={setBulkTeacherRows}
          bulkTeacherResults={bulkTeacherResults}
          setBulkTeacherResults={setBulkTeacherResults}
          bulkTeacherLoading={bulkTeacherLoading}
          handleBulkTeacherImport={handleBulkTeacherImport}
          editTeacher={editTeacher}
          setEditTeacher={setEditTeacher}
          editTeacherForm={editTeacherForm}
          setEditTeacherForm={setEditTeacherForm}
          editAssignments={editAssignments}
          setEditAssignments={setEditAssignments}
          editTeacherErr={editTeacherErr}
          editTeacherLoading={editTeacherLoading}
          handleEditTeacher={handleEditTeacher}
          confirmRemove={confirmRemove}
          setConfirmRemove={setConfirmRemove}
          handleRemove={handleRemove}
          removeLoading={removeLoading}
        />
      )}
      {/* ── STUDENTS ── */}
      {view === "students" && (
        <AdminStudentsPanel
          students={students}
          filteredStudents={filteredStudents}
          loadingStudents={loadingStudents}
          classes={classes}
          searchStudents={searchStudents}
          setSearchStudents={setSearchStudents}
          filterClass={filterClass}
          setFilterClass={setFilterClass}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          showBulkActions={showBulkActions}
          setShowBulkActions={setShowBulkActions}
          bulkActionClass={bulkActionClass}
          setBulkActionClass={setBulkActionClass}
          bulkActionGender={bulkActionGender}
          setBulkActionGender={setBulkActionGender}
          bulkActionLoading={bulkActionLoading}
          handleBulkAction={handleBulkAction}
          expandedStudentId={expandedStudentId}
          studentDetailMap={studentDetailMap}
          studentDetailLoading={studentDetailLoading}
          handleToggleStudent={handleToggleStudent}
          retryStudentDetail={id => void loadStudentDetail(id)}
          studentAttPeriod={studentAttPeriod}
          setStudentAttPeriod={setStudentAttPeriod}
          studentAttCache={studentAttCache}
          studentAttLoading={studentAttLoading}
          studentAttCustomFrom={studentAttCustomFrom}
          setStudentAttCustomFrom={setStudentAttCustomFrom}
          studentAttCustomTo={studentAttCustomTo}
          setStudentAttCustomTo={setStudentAttCustomTo}
          loadStudentAtt={loadStudentAtt}
          showStudentModal={showStudentModal}
          setShowStudentModal={setShowStudentModal}
          studentForm={studentForm}
          setStudentForm={setStudentForm}
          studentErr={studentErr}
          studentLoading={studentLoading}
          studentResult={studentResult}
          setStudentResult={setStudentResult}
          handleAddStudent={handleAddStudent}
          showBulk={showBulk}
          setShowBulk={setShowBulk}
          bulkRows={bulkRows}
          setBulkRows={setBulkRows}
          bulkClassId={bulkClassId}
          setBulkClassId={setBulkClassId}
          bulkResults={bulkResults}
          setBulkResults={setBulkResults}
          bulkLoading={bulkLoading}
          handleBulkImport={handleBulkImport}
          editStudent={editStudent}
          setEditStudent={setEditStudent}
          editForm={editForm}
          setEditForm={setEditForm}
          editErr={editErr}
          editLoading={editLoading}
          handleEditStudent={handleEditStudent}
          confirmRemove={confirmRemove}
          setConfirmRemove={setConfirmRemove}
          handleRemove={handleRemove}
          removeLoading={removeLoading}
        />
      )}

      {/* ── PARENTS ── */}
      {view === "parents" && (
        <ParentsView students={students} loadingStudents={loadingStudents} classes={classes} />
      )}

      {/* ── TIMETABLE ── */}
      {view === "timetable" && (
        <TimetableView
          classes={classes}
          teachers={teachers}
          timetableClassId={timetableClassId}
          setTimetableClassId={setTimetableClassId}
          timetableSlots={timetableSlots}
          setTimetableSlots={setTimetableSlots}
          periodTimes={periodTimes}
          setPeriodTimes={setPeriodTimes}
          timetableSaving={timetableSaving}
          setTimetableSaving={setTimetableSaving}
          timetableMsg={timetableMsg}
          setTimetableMsg={setTimetableMsg}
          onSaved={validSlots => setClasses(prev => prev.map(c => c.id === timetableClassId ? { ...c, timetable: validSlots } : c))}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          NOTIFICATIONS VIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {view === "notifications" && (() => {
        const activeTypeConf = NOTIF_TYPES.find(t => t.value === notifForm.type)
        return (
        <div className="flex flex-col gap-5 w-full">
          <SectionHeader title="Notifications" sub="Send announcements, reminders and alerts to teachers and students" />

          {/* ── Two-column layout: composer left, preview + history right ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start w-full">

            {/* LEFT — Composer */}
            <div className="skillio-card p-5 flex flex-col gap-5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Send className="w-4 h-4" style={{ color: "#534AB7" }} />
                Create Notification
              </h3>

              {/* Type selector */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Type</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {NOTIF_TYPES.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setNotifForm(f => ({ ...f, type: t.value }))}
                      className={[
                        "flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-center",
                        notifForm.type === t.value
                          ? "border-transparent text-white shadow-md"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                      ].join(" ")}
                      style={notifForm.type === t.value ? { background: t.color, borderColor: t.color } : {}}>
                      <span className="text-2xl leading-none" style={notifForm.type !== t.value ? { color: t.color } : {}}>{t.icon}</span>
                      <span className="text-[10px] font-bold leading-tight break-words w-full">{t.label}</span>
                    </button>
                  ))}
                </div>
                {activeTypeConf && <p className="text-[11px] text-muted-foreground mt-1.5">{activeTypeConf.desc}</p>}
              </div>

              {/* Target selector — two-level dropdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Send To</label>
                  <select
                    value={notifForm.audienceMode}
                    onChange={e => {
                      const mode = e.target.value
                      const presets: Record<string, { target: string; target_label: string }> = {
                        all:      { target: "all",      target_label: "Everyone" },
                        teachers: { target: "teachers", target_label: "All Teachers" },
                        students: { target: "students", target_label: "All Students" },
                      }
                      if (presets[mode]) {
                        setNotifForm(f => ({ ...f, audienceMode: mode, ...presets[mode] }))
                      } else {
                        setNotifForm(f => ({ ...f, audienceMode: mode, target: "", target_label: "" }))
                      }
                    }}
                    className="w-full h-10 text-sm rounded-lg px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground">
                    <option value="all">Everyone (teachers + students)</option>
                    <option value="teachers">All Teachers</option>
                    <option value="students">All Students</option>
                    <option value="class">Specific Class</option>
                    <option value="teacher">Specific Teacher</option>
                  </select>
                </div>

                {/* Second dropdown — appears for Specific Class or Specific Teacher */}
                {notifForm.audienceMode === "class" && (
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Select Class</label>
                    <select
                      value={notifForm.target}
                      onChange={e => {
                        const cls = classes.find(c => c.id === e.target.value)
                        setNotifForm(f => ({
                          ...f,
                          target: e.target.value,
                          target_label: cls ? (clsLabel(cls)) : "",
                        }))
                      }}
                      className="w-full h-10 text-sm rounded-lg px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground">
                      <option value="">— Pick a class —</option>
                      {[...classes]
                        .sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            Class {c.grade}{c.section} · {c.student_count} student{c.student_count !== 1 ? "s" : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {notifForm.audienceMode === "teacher" && (
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Select Teacher</label>
                    <select
                      value={notifForm.target}
                      onChange={e => {
                        const t = teachers.find(t => t.id === e.target.value)
                        setNotifForm(f => ({
                          ...f,
                          target: e.target.value,
                          target_label: t ? t.name : "",
                        }))
                      }}
                      className="w-full h-10 text-sm rounded-lg px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground">
                      <option value="">— Pick a teacher —</option>
                      {[...teachers]
                        .filter(t => t.is_active)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name}{t.subject_assignments.length > 0 ? ` · ${t.subject_assignments.map(a => a.subject).join(", ")}` : ""}
                          </option>
                        ))}
                    </select>
                    {notifForm.target && (() => {
                      const t = teachers.find(t => t.id === notifForm.target)
                      return t?.subject_assignments.length ? (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Teaches: {t.subject_assignments.map(a => `${a.subject} (${a.class_label})`).join(" · ")}
                        </p>
                      ) : null
                    })()}
                  </div>
                )}
              </div>

              {/* Title + Message side by side on md+ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Title *</label>
                  <input
                    value={notifForm.title}
                    onChange={e => setNotifForm(f => ({ ...f, title: e.target.value.slice(0, 80) }))}
                    placeholder="e.g. School closed on Monday due to PTM"
                    className="w-full h-9 text-sm rounded-lg px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{notifForm.title.length}/80</p>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Auto-expire after</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { days: "1",  label: "1 day",   note: "Urgent" },
                      { days: "3",  label: "3 days",  note: "" },
                      { days: "7",  label: "1 week",  note: "Default" },
                      { days: "30", label: "1 month", note: "" },
                    ].map(opt => (
                      <button key={opt.days} type="button"
                        onClick={() => setNotifForm(f => ({ ...f, expires_days: opt.days }))}
                        className={[
                          "px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                          notifForm.expires_days === opt.days
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground bg-background",
                        ].join(" ")}>
                        {opt.label}{opt.note ? ` (${opt.note})` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Message *</label>
                <textarea
                  value={notifForm.message}
                  onChange={e => setNotifForm(f => ({ ...f, message: e.target.value.slice(0, 300) }))}
                  placeholder="Write a clear, concise message for your audience…"
                  rows={4}
                  className="w-full text-sm rounded-lg px-3 py-2.5 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{notifForm.message.length}/300</p>
              </div>

              {/* Send now OR schedule */}
              <div className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col gap-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">When to send</p>

                {/* Toggle */}
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setNotifForm(f => ({ ...f, scheduleDate: "" }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${!notifForm.scheduleDate ? "text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                    style={!notifForm.scheduleDate ? { background: activeTypeConf?.color ?? "#534AB7" } : {}}>
                    🚀 Send now
                  </button>
                  <button type="button"
                    onClick={() => setNotifForm(f => ({ ...f, scheduleDate: new Date().toISOString().slice(0, 10) }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${notifForm.scheduleDate ? "text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                    style={notifForm.scheduleDate ? { background: activeTypeConf?.color ?? "#534AB7" } : {}}>
                    📅 Schedule
                  </button>
                </div>

                {/* Date + Time pickers */}
                {notifForm.scheduleDate && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Date</label>
                      <DatePicker value={notifForm.scheduleDate} onChange={d => setNotifForm(f => ({ ...f, scheduleDate: d }))} min={new Date().toISOString().slice(0, 10)} placeholder="Pick a date" />
                    </div>
                    <div className="w-28">
                      <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Time</label>
                      <input type="time"
                        value={notifForm.scheduleTime}
                        onChange={e => setNotifForm(f => ({ ...f, scheduleTime: e.target.value }))}
                        className="w-full h-9 text-sm rounded-lg px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  </div>
                )}

                {notifForm.scheduleDate && (
                  <p className="text-[11px] text-ts-blue">
                    Will be sent on {new Date(`${notifForm.scheduleDate}T${notifForm.scheduleTime}`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} at {notifForm.scheduleTime}
                  </p>
                )}

                {/* Send button */}
                <Button onClick={handleSendNotif} disabled={notifSending || !notifForm.title || !notifForm.message}
                  className="h-10 px-6 rounded-xl text-sm font-bold text-white gap-2 w-full"
                  style={{ background: activeTypeConf?.color ?? "#534AB7" }}>
                  {notifSending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {notifForm.scheduleDate ? "Scheduling…" : "Sending…"}</>
                    : <><Send className="w-4 h-4" /> {notifForm.scheduleDate ? "Schedule Notification" : "Send Notification"}</>}
                </Button>
                {notifMsg   && <p className="text-sm text-green-600 font-semibold flex items-center gap-1"><CheckCircle className="w-4 h-4" />{notifMsg}</p>}
                {notifError && <p className="text-sm text-red-500 font-semibold flex items-center gap-1"><AlertCircle className="w-4 h-4" />{notifError}</p>}
              </div>
            </div>

            {/* RIGHT — Live preview + Sent history */}
            <div className="flex flex-col gap-5">

              {/* Live preview card — always visible */}
              <div className="skillio-card p-5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Live Preview</p>
                <div className="rounded-xl border border-dashed border-border p-4 bg-muted/20">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: `${activeTypeConf?.color ?? "#534AB7"}18` }}>
                      {NOTIF_ICONS[notifForm.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground">{notifForm.title || <span className="text-muted-foreground/50 font-normal">Your title here…</span>}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{notifForm.message || <span className="opacity-50">Your message here…</span>}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${activeTypeConf?.color ?? "#534AB7"}18`, color: activeTypeConf?.color ?? "#534AB7" }}>
                          {activeTypeConf?.label ?? "Announcement"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">→ {notifForm.target_label}</span>
                        <span className="text-[10px] text-muted-foreground">expires {notifForm.expires_days}d</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 text-center">This is how recipients see it in their bell panel</p>
              </div>

              {/* Sent history */}
              <div className="skillio-card overflow-hidden">
                <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Bell className="w-4 h-4 text-muted-foreground" />
                    Sent History
                    {adminNotifs.length > 0 && <span className="text-xs font-semibold text-muted-foreground">({adminNotifs.length})</span>}
                  </h3>
                  <button onClick={loadAdminNotifs} className="text-[11px] text-primary font-semibold hover:opacity-80">Refresh</button>
                </div>

                {notifsLoading ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs">Loading…</span>
                  </div>
                ) : adminNotifs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-2xl">📭</div>
                    <p className="text-xs font-semibold text-foreground">No notifications sent yet</p>
                    <p className="text-[11px] text-muted-foreground text-center px-4">Send your first notification using the composer.</p>
                  </div>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto">
                    {(showAllNotifs ? adminNotifs : adminNotifs.slice(0, 10)).map((n, i) => {
                      const typeConf = NOTIF_TYPES.find(t => t.value === n.type)
                      const color    = typeConf?.color ?? "#534AB7"
                      const isExp    = expandedNotifId === n.id
                      return (
                        <div key={n.id} style={{ borderBottom: i < adminNotifs.length - 1 ? "1px solid var(--border)" : "none" }}>
                          <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => setExpandedNotifId(isExp ? null : n.id)}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5"
                              style={{ background: `${color}18` }}>
                              {NOTIF_ICONS[n.type]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <p className="text-xs font-bold text-foreground leading-tight truncate">{n.title}</p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{notifTimeAgo(String(n.created_at))}</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleDeleteNotif(n.id) }}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Delete notification" aria-label="Delete notification">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  {isExp ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                  style={{ background: `${color}15`, color }}>
                                  {typeConf?.label ?? n.type}
                                </span>
                                <span className="text-[10px] text-muted-foreground truncate">→ {n.target_label}</span>
                              </div>
                              {!isExp && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>}
                            </div>
                          </div>
                          {isExp && (
                            <div className="px-4 pb-3 flex gap-3">
                              <div className="w-8 shrink-0" />
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{n.message}</p>
                                <button onClick={() => handleDeleteNotif(n.id)}
                                  className="flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {adminNotifs.length > 10 && (
                      <button
                        onClick={() => setShowAllNotifs(p => !p)}
                        className="w-full py-2.5 text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity border-t border-border"
                      >
                        {showAllNotifs ? "Show less ↑" : `Show ${adminNotifs.length - 10} more ↓`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* ── CERTIFICATES ── */}
      {view === "certificates" && (
        <div className="w-full space-y-4">
          <SectionHeader
            title="Certificates"
            sub={certClassId && !certModulesLoading
              ? `${certModules.reduce((s, m) => s + m.certificates.length, 0) + certCustomCerts.length} certificate${certModules.reduce((s, m) => s + m.certificates.length, 0) + certCustomCerts.length !== 1 ? "s" : ""} issued in selected class`
              : "Select a class to view and manage certificates"
            }
            action={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setCertTab(certTab === "settings" ? "certs" : "settings")}
                  className="h-8 text-xs rounded-lg gap-1.5">
                  <Settings className="w-3.5 h-3.5" /> Template Settings
                </Button>
                {certClassId && (
                  <Button size="sm" onClick={() => { setCertIssueOpen(true); setCertIssueError("") }}
                    style={{ background: "var(--ts-purple)", color: "white" }} className="h-8 text-xs rounded-lg gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Issue Certificate
                  </Button>
                )}
              </div>
            }
          />

          {/* Class picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={certClassId}
              onChange={e => { if (e.target.value) loadCertClass(e.target.value) }}
              className="h-8 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none min-w-[180px]"
            >
              <option value="">Select a class…</option>
              {[...classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section)).map(cls => (
                <option key={cls.id} value={cls.id}>{clsLabel(cls)}</option>
              ))}
            </select>
            {certClassId && certModulesLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading certificates…
              </span>
            )}
          </div>

          {/* Stat tiles — shown after class is loaded */}
          {certClassId && !certModulesLoading && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Active Certificates", value: certModules.reduce((s, m) => s + m.certificates.filter(c => c.status !== "revoked").length, 0) + certCustomCerts.filter(c => c.status !== "revoked").length, color: "var(--ts-purple)" },
                { label: "Special Certificates", value: certCustomCerts.filter(c => c.status !== "revoked").length, color: "#F59E0B" },
                { label: "Course Certificates", value: certModules.reduce((s, m) => s + m.certificates.filter(c => c.status !== "revoked").length, 0), color: "var(--ts-blue)" },
              ].map(tile => (
                <div key={tile.label} className="skillio-card p-4 flex flex-col gap-1">
                  <p className="text-2xl font-bold text-foreground">{tile.value}</p>
                  <p className="text-xs text-muted-foreground">{tile.label}</p>
                  <div className="h-0.5 w-8 rounded-full mt-1" style={{ background: tile.color }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty state — no class selected */}
          {!certClassId && (
            <Empty
              icon={<Award className="w-6 h-6" />}
              title="Select a class to view certificates"
              body="Choose a class from the dropdown above, then view, download, or issue certificates for students."
            />
          )}

          {/* Who has completed — teacher/admin issues subject certificates on demand */}
          {certClassId && (
            <CertificateCompletionPanel classId={certClassId} refreshKey={certRevokeCount} onIssued={() => loadCertClass(certClassId)} />
          )}

          {certActionError && (
            <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <span className="text-xs text-destructive">{certActionError}</span>
              <button type="button" className="text-muted-foreground hover:text-foreground cursor-pointer" onClick={() => setCertActionError("")} aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Certificates list */}
          {certClassId && !certModulesLoading && (
            <>
              {/* Special / Custom Certificates */}
              {certCustomCerts.length > 0 && (() => {
                const activeCustom = certCustomCerts.filter(c => c.status !== "revoked")
                return (
                <div className="skillio-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b gap-2 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {activeCustom.length > 0 && (
                        <input
                          type="checkbox"
                          className="rounded cursor-pointer"
                          aria-label="Select all active special certificates"
                          checked={certBulkIds.size === activeCustom.length}
                          onChange={e => setCertBulkIds(e.target.checked ? new Set(activeCustom.map(c => c._id)) : new Set())}
                        />
                      )}
                      <div>
                        <p className="text-xs font-bold text-foreground">Special Certificates</p>
                        <p className="text-[11px] text-muted-foreground">{activeCustom.length} active{certCustomCerts.length > activeCustom.length ? ` · ${certCustomCerts.length - activeCustom.length} revoked` : ""}</p>
                      </div>
                    </div>
                    {certBulkIds.size > 0 && !certBulkConfirm && (
                      <Button size="sm" className="text-xs rounded-lg gap-1 h-7 text-white border-0 bg-destructive hover:bg-destructive/90"
                        onClick={() => { setCertRevokeReason(""); setCertBulkConfirm(true) }}>
                        <Ban className="w-3 h-3" />Revoke {certBulkIds.size} selected
                      </Button>
                    )}
                  </div>

                  {certBulkConfirm && (
                    <div className="flex flex-col gap-2 px-4 py-2.5 bg-destructive/5 border-b border-destructive/20">
                      <p className="text-xs text-destructive font-medium">
                        Revoke {certBulkIds.size} certificate{certBulkIds.size !== 1 ? "s" : ""}? They stay on record marked "Revoked" and can no longer be downloaded.
                      </p>
                      <Input className="h-8 text-xs" maxLength={300} placeholder="Reason (optional), e.g. issued to the wrong student"
                        aria-label="Reason for revoking" value={certRevokeReason} onChange={e => setCertRevokeReason(e.target.value)} />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" className="text-xs rounded-lg h-7"
                          disabled={certBulkDeleting}
                          onClick={() => setCertBulkConfirm(false)}>Cancel</Button>
                        <Button size="sm" className="text-xs rounded-lg h-7 text-white border-0 bg-destructive hover:bg-destructive/90"
                          disabled={certBulkDeleting}
                          onClick={handleBulkRevokeCerts}>
                          {certBulkDeleting ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Revoking…</> : "Confirm Revoke"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="divide-y divide-border">
                    {certCustomCerts.map(cert => cert.status === "revoked" ? (
                      <div key={cert._id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{cert.student_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{cert.custom_title} — revoked{cert.revoked_at ? ` ${new Date(cert.revoked_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}{cert.revoke_reason ? `: ${cert.revoke_reason}` : ""}</p>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">Revoked</span>
                      </div>
                    ) : (
                      <div key={cert._id} className="flex items-center justify-between px-4 py-2.5 gap-2 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            className="rounded cursor-pointer flex-shrink-0"
                            aria-label={`Select ${cert.student_name}'s certificate`}
                            checked={certBulkIds.has(cert._id)}
                            onChange={e => setCertBulkIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(cert._id); else next.delete(cert._id)
                              return next
                            })}
                          />
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-amber-400">
                            {cert.student_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{cert.student_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{cert.custom_title}{cert.custom_reason ? ` — ${cert.custom_reason}` : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button size="sm" variant="outline" className="text-xs rounded-lg gap-1 h-7"
                            onClick={() => viewCertPDF(cert._id)}>
                            <Eye className="w-3 h-3" />View
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs rounded-lg gap-1 h-7" aria-label={`Download ${cert.student_name}'s certificate`}
                            onClick={() => downloadCertPDF(cert._id, cert.student_name)}>
                            <Download className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs rounded-lg gap-1 h-7 text-destructive hover:text-destructive border-destructive/30"
                            aria-label={`Revoke ${cert.student_name}'s certificate`}
                            onClick={() => { setCertRevokeReason(""); setCertDeleteConfirm({ certId: cert._id, studentName: cert.student_name, moduleTitle: cert.custom_title }) }}>
                            <Ban className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                )
              })()}

              {/* Course / subject certificates — flat list */}
              {(() => {
                const allModuleCerts = certModules.flatMap(mod =>
                  mod.certificates.map(cert => ({ ...cert, module_title: mod.module_title, subject: mod.subject }))
                )
                if (allModuleCerts.length === 0 && certCustomCerts.length === 0) {
                  return (
                    <Empty
                      icon={<Award className="w-6 h-6" />}
                      title="No certificates yet"
                      body="No certificates have been issued in this class. Use “Who has completed a subject” above to issue course certificates, or issue a special award."
                    />
                  )
                }
                if (allModuleCerts.length === 0) return null
                const activeCount = allModuleCerts.filter(c => c.status !== "revoked").length
                return (
                  <div className="skillio-card overflow-hidden">
                    <div className="px-4 py-3 bg-muted/30 border-b">
                      <p className="text-xs font-bold text-foreground">Course Certificates</p>
                      <p className="text-[11px] text-muted-foreground">{activeCount} active{allModuleCerts.length > activeCount ? ` · ${allModuleCerts.length - activeCount} revoked` : ""}</p>
                    </div>
                    <div className="divide-y divide-border">
                      {allModuleCerts.map(cert => cert.status === "revoked" ? (
                        <div key={cert._id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{cert.student_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{cert.module_title} · {cert.subject}{cert.revoke_reason ? ` — revoked: ${cert.revoke_reason}` : ""}</p>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">Revoked</span>
                        </div>
                      ) : (
                        <div key={cert._id} className="flex items-center justify-between px-4 py-2.5 gap-2 hover:bg-muted/20 transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ background: "var(--ts-purple)" }}>
                              {cert.student_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{cert.student_name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{cert.module_title} · {cert.subject}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button title="View certificate" aria-label={`View certificate for ${cert.student_name}`}
                              className="min-w-[44px] min-h-[44px] rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                              onClick={() => viewCertPDF(cert._id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button title="Download PDF" aria-label={`Download certificate PDF for ${cert.student_name}`}
                              className="min-w-[44px] min-h-[44px] rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                              onClick={() => downloadCertPDF(cert._id, cert.student_name)}>
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button title="Revoke certificate" aria-label={`Revoke certificate for ${cert.student_name}`}
                              disabled={certModuleDeleting === cert._id}
                              className="min-w-[44px] min-h-[44px] rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-40"
                              onClick={() => { setCertRevokeReason(""); setCertDeleteConfirm({ certId: cert._id, studentName: cert.student_name, moduleTitle: cert.module_title }) }}>
                              {certModuleDeleting === cert._id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Ban className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Revoke confirmation dialog */}
              {certDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                  <div role="alertdialog" aria-modal="true" aria-labelledby="admin-cert-revoke-heading" className="bg-background rounded-xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                        <Ban className="w-4 h-4 text-destructive" />
                      </div>
                      <div>
                        <p id="admin-cert-revoke-heading" className="text-sm font-bold text-foreground">Revoke certificate?</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-semibold text-foreground">{certDeleteConfirm.studentName}</span>'s certificate for <span className="font-semibold text-foreground">"{certDeleteConfirm.moduleTitle}"</span> will
                          stay on record marked "Revoked" and can no longer be downloaded. It can be issued again later.
                        </p>
                      </div>
                    </div>
                    <Input className="h-9 text-xs" maxLength={300} placeholder="Reason (optional), e.g. issued to the wrong student"
                      autoFocus aria-label="Reason for revoking" value={certRevokeReason} onChange={e => setCertRevokeReason(e.target.value)} />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="text-xs rounded-lg"
                        onClick={() => setCertDeleteConfirm(null)}>Cancel</Button>
                      <Button size="sm" className="text-xs rounded-lg text-white border-0 bg-destructive hover:bg-destructive/90"
                        disabled={!!certModuleDeleting}
                        onClick={handleConfirmRevoke}>
                        {certModuleDeleting ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Revoking…</> : "Revoke"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Template Settings Modal */}
          {certTab === "settings" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-background rounded-xl shadow-xl w-full max-w-lg flex flex-col gap-4 p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Settings className="w-4 h-4 text-muted-foreground" /> Certificate Template Settings
                  </p>
                  <button onClick={() => setCertTab("certs")} className="text-muted-foreground hover:text-foreground cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {certTemplateLoading ? (
                  <div className="flex justify-center py-6"><Spinner /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">School Name</label>
                        <Input className="h-9 text-sm rounded-lg" placeholder="e.g. Delhi Public School"
                          value={certTemplateForm.school_name ?? ""}
                          onChange={e => setCertTemplateForm(f => ({ ...f, school_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">School Logo</label>
                        <input ref={certLogoRef} type="file" accept="image/*" className="hidden" onChange={handleCertLogoUpload} />
                        {certTemplate?.logo_base64 ? (
                          <div className="flex items-center gap-3">
                            <img
                              src={`data:${certTemplate.logo_mime ?? "image/png"};base64,${certTemplate.logo_base64}`}
                              className="w-14 h-14 rounded-lg border border-border object-contain bg-muted/20 flex-shrink-0"
                              alt="School logo"
                            />
                            <div className="flex flex-col gap-1.5">
                              <label className="flex items-center gap-1.5 h-7 rounded-md border border-input bg-background px-2.5 text-xs cursor-pointer hover:bg-muted/30 transition-colors w-fit">
                                <input type="file" accept="image/*" className="hidden" onChange={handleCertLogoUpload} disabled={certLogoUploading} />
                                {certLogoUploading
                                  ? <><Loader2 className="w-3 h-3 animate-spin" /><span className="text-muted-foreground">Uploading…</span></>
                                  : <><Upload className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground">Change logo</span></>}
                              </label>
                              <button
                                className="flex items-center gap-1.5 h-7 rounded-md border border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/5 transition-colors w-fit disabled:opacity-50"
                                onClick={handleDeleteCertLogo}
                                disabled={certLogoRemoving}
                                type="button"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>{certLogoRemoving ? "Removing…" : "Remove logo"}</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="flex items-center gap-2 h-9 rounded-lg border border-input bg-background px-3 text-sm cursor-pointer hover:bg-muted/30 transition-colors">
                            <input type="file" accept="image/*" className="hidden" onChange={handleCertLogoUpload} disabled={certLogoUploading} />
                            {certLogoUploading
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="text-xs text-muted-foreground">Uploading…</span></>
                              : <><Upload className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Upload logo (PNG/JPG)</span></>}
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Footer Left (e.g. Principal)</label>
                        <Input className="h-9 text-sm rounded-lg" placeholder="School Principal"
                          value={certTemplateForm.footer_left ?? ""}
                          onChange={e => setCertTemplateForm(f => ({ ...f, footer_left: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Footer Right (e.g. Teacher)</label>
                        <Input className="h-9 text-sm rounded-lg" placeholder="Class Teacher"
                          value={certTemplateForm.footer_right ?? ""}
                          onChange={e => setCertTemplateForm(f => ({ ...f, footer_right: e.target.value }))} />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end flex-wrap pt-1">
                      <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg"
                        onClick={() => openCertPreview()}>
                        Preview PDF ↗
                      </Button>
                      <Button size="sm" style={{ background: "var(--ts-purple)", color: "white" }} className="h-8 text-xs rounded-lg"
                        onClick={handleSaveCertTemplate} disabled={certTemplateSaving}>
                        {certTemplateSaving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Saving…</> : certTmplSaved ? "✓ Saved!" : "Save Settings"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Issue Certificate Modal */}
          {certIssueOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-background rounded-xl shadow-xl w-full max-w-md flex flex-col gap-4 p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">Issue Special Certificate</p>
                  <button onClick={() => { setCertIssueOpen(false); setCertIssueTemplate(null) }} className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Certificate Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: "course_completion",       icon: "🎓", label: "Course Completion"       },
                        { key: "academic_excellence",     icon: "⭐", label: "Academic Excellence"     },
                        { key: "outstanding_achievement", icon: "🏆", label: "Outstanding Achievement" },
                      ] as const).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => { setCertIssueTemplate(opt.key); setCertIssueTitle(opt.label) }}
                          className="flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-center transition-all cursor-pointer"
                          style={certIssueTemplate === opt.key
                            ? { background: "var(--ts-purple)", borderColor: "var(--ts-purple)", color: "white" }
                            : { borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                        >
                          <span className="text-lg">{opt.icon}</span>
                          <span className="text-[10px] font-semibold leading-tight">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Certificate Title</label>
                    <Input className="h-9 text-sm rounded-lg" placeholder="e.g. Best Science Project"
                      value={certIssueTitle} onChange={e => setCertIssueTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Reason (optional)</label>
                    <Input className="h-9 text-sm rounded-lg" placeholder="e.g. for outstanding science fair participation"
                      value={certIssueReason} onChange={e => setCertIssueReason(e.target.value)} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-muted-foreground">Select Students</label>
                      <button className="text-[10px] text-ts-purple cursor-pointer hover:underline"
                        onClick={() => setCertSelectedIds(certSelectedIds.size === certClassStudents.length ? new Set() : new Set(certClassStudents.map(s => s.id)))}>
                        {certSelectedIds.size === certClassStudents.length ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    {certClassStudents.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No students in this class.</p>
                    ) : (
                      <div className="border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                        {certClassStudents.map(s => (
                          <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                            <input type="checkbox" className="rounded" checked={certSelectedIds.has(s.id)}
                              onChange={e => setCertSelectedIds(prev => {
                                const next = new Set(prev)
                                e.target.checked ? next.add(s.id) : next.delete(s.id)
                                return next
                              })} />
                            <span className="text-xs text-foreground">{s.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {certSelectedIds.size > 0 && (
                      <p className="text-[10px] text-ts-purple mt-1">{certSelectedIds.size} student{certSelectedIds.size !== 1 ? "s" : ""} selected</p>
                    )}
                  </div>
                </div>

                {certIssueError && <p className="text-xs text-destructive">{certIssueError}</p>}

                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" className="text-xs rounded-lg"
                    onClick={() => { setCertIssueOpen(false); setCertIssueTemplate(null) }}>Cancel</Button>
                  <Button size="sm" style={{ background: "var(--ts-purple)", color: "white" }} className="text-xs rounded-lg gap-1"
                    disabled={!certIssueTitle.trim() || !certIssueTemplate || certSelectedIds.size === 0 || certIssueLoading}
                    onClick={handleIssueCerts}>
                    {certIssueLoading ? <><Loader2 className="w-3 h-3 animate-spin" />Issuing…</> : `Issue to ${certSelectedIds.size || 0} student${certSelectedIds.size !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DATA DELETION REQUESTS ── */}
      {view === "data-requests" && (
        <div className="w-full space-y-5">
          <SectionHeader title="Data Deletion Requests" sub="Review and action user data deletion requests (DPDP Act 2023)" />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{deletionReqs.length} request(s) total · {deletionReqs.filter(r => r.status === "pending").length} pending</p>
            <button onClick={() => { setDeletionReqsLoaded(false) }} className="text-xs text-primary hover:underline">Refresh</button>
          </div>
          {deletionReqsLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}
          {!deletionReqsLoading && deletionReqs.length === 0 && (
            <div className="text-center py-16 border border-dashed rounded-2xl">
              <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No data deletion requests</p>
              <p className="text-xs text-muted-foreground mt-1">Users can submit requests from their Settings page.</p>
            </div>
          )}
          {!deletionReqsLoading && deletionReqs.length > 0 && (
            <div className="flex flex-col gap-3">
              {deletionReqs.map(req => (
                <div key={req._id} className={`bg-card rounded-xl p-4 border ${req.status === "pending" ? "border-orange-200 dark:border-orange-800" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-foreground">{req.user_name}</p>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${req.user_role === "student" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{req.user_role}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${req.status === "pending" ? "bg-orange-100 text-orange-700" : req.status === "approved" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{req.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{req.user_email}</p>
                      {req.reason && <p className="text-xs text-foreground mt-1.5 italic">"{req.reason}"</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">Requested: {new Date(req.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                    {req.status === "pending" && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button disabled={reviewingId === req._id}
                          onClick={async () => {
                            if (!confirm(`Approve deletion for ${req.user_name}? Their account will be deactivated.`)) return
                            setReviewingId(req._id)
                            const res = await reviewDeletionRequest(req._id, "approve")
                            if (!("error" in res)) setDeletionReqs(prev => prev.map(r => r._id === req._id ? { ...r, status: "approved" } : r))
                            setReviewingId(null)
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50">
                          {reviewingId === req._id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Approve"}
                        </button>
                        <button disabled={reviewingId === req._id}
                          onClick={async () => {
                            setReviewingId(req._id)
                            const res = await reviewDeletionRequest(req._id, "reject")
                            if (!("error" in res)) setDeletionReqs(prev => prev.map(r => r._id === req._id ? { ...r, status: "rejected" } : r))
                            setReviewingId(null)
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-foreground font-medium disabled:opacity-50">
                          Reject
                        </button>
                      </div>
                    )}
                    {req.status !== "pending" && (
                      <p className="text-xs text-muted-foreground shrink-0">
                        {req.status === "approved" ? "Account deactivated" : "Request rejected"}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS ── */}
      {view === "settings" && (
        <div className="w-full space-y-5">
          <SectionHeader title="Settings" sub="Manage your profile and school details" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── Admin Profile ── */}
          <div className="skillio-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <UserCheck className="w-4 h-4" style={{ color: "#534AB7" }} />
              Admin Profile
            </h3>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <Label className="text-xs mb-1.5 block">Full Name *</Label>
                <Input
                  value={profileForm.name}
                  onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Your name"
                  className="h-9 text-sm rounded-lg"
                  required
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Login Email</Label>
                <Input
                  type="email"
                  value={profileForm.email}
                  readOnly
                  disabled
                  className="h-9 text-sm rounded-lg bg-muted text-muted-foreground cursor-not-allowed"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Email address cannot be changed. Contact support if you need to update it.</p>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Phone Number</Label>
                <Input
                  value={profileForm.phone}
                  onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 43210"
                  type="tel"
                  className="h-9 text-sm rounded-lg"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" disabled={profileSaving} className="h-9 text-sm rounded-lg px-6"
                  style={{ background: "var(--ts-blue)", color: "white" }}>
                  {profileSaving ? <><Spinner /> Saving…</> : "Save Profile"}
                </Button>
                {profileMsg && <span className={`text-sm ${profileMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{profileMsg}</span>}
              </div>
            </form>
          </div>

          {/* ── School Settings ── */}
          <div className="skillio-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <School className="w-4 h-4" style={{ color: "#378ADD" }} />
              School Details
            </h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <Label className="text-xs mb-1.5 block">School Name *</Label>
                <Input value={settingsForm.name} onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))}
                  className="h-9 text-sm rounded-lg" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Board</Label>
                  <select value={settingsForm.board} onChange={e => setSettingsForm(f => ({ ...f, board: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none">
                    {["CBSE","ICSE","State Board","IB","IGCSE"].map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">UDISE Code</Label>
                  <Input value={settingsForm.udise_code} onChange={e => setSettingsForm(f => ({ ...f, udise_code: e.target.value }))}
                    placeholder="11 digit code" className="h-9 text-sm rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">City</Label>
                  <Input value={settingsForm.city} onChange={e => setSettingsForm(f => ({ ...f, city: e.target.value }))}
                    className="h-9 text-sm rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">State</Label>
                  <Input value={settingsForm.state} onChange={e => setSettingsForm(f => ({ ...f, state: e.target.value }))}
                    className="h-9 text-sm rounded-lg" />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" disabled={settingsSaving} className="h-9 text-sm rounded-lg px-6"
                  style={{ background: "var(--ts-blue)", color: "white" }}>
                  {settingsSaving ? <><Spinner /> Saving…</> : "Save School"}
                </Button>
                {settingsMsg && <span className={`text-sm ${settingsMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{settingsMsg}</span>}
              </div>
            </form>
          </div>
          </div>{/* end settings grid */}

          {/* ── Change Password ── */}
          <div className="skillio-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4" style={{ color: "#534AB7" }} />
              Change Password
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
              <div>
                <Label className="text-xs mb-1.5 block">Current Password</Label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={pwForm.current}
                    onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                    placeholder="Enter current password"
                    className="h-9 text-sm rounded-lg pr-9"
                  />
                  <button type="button" onClick={() => setShowCurrent(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">New Password</Label>
                <div className="relative">
                  <Input
                    type={showNext ? "text" : "password"}
                    value={pwForm.next}
                    onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                    placeholder="At least 8 characters"
                    className="h-9 text-sm rounded-lg pr-9"
                  />
                  <button type="button" onClick={() => setShowNext(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Confirm New Password</Label>
                <Input
                  type="password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Repeat new password"
                  className="h-9 text-sm rounded-lg"
                />
              </div>
              {pwErr && <p className="text-xs text-red-500">{pwErr}</p>}
              {pwMsg && <p className="text-xs text-green-600">{pwMsg}</p>}
              <Button type="submit" disabled={pwSaving} className="h-9 text-sm rounded-lg px-6"
                style={{ background: "var(--ts-blue)", color: "white" }}>
                {pwSaving ? <><Spinner /> Saving…</> : "Change Password"}
              </Button>
            </form>
          </div>

          {/* ── Two-Factor Authentication ── */}
          <div className="skillio-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <Lock className="w-4 h-4" style={{ color: "#639922" }} />
              Two-Factor Authentication
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              When enabled, all teacher and admin accounts in your school must verify their identity with a 6-digit code sent to their email each time they sign in.
            </p>
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {twoFactorEnabled ? "2FA is enabled" : "2FA is disabled"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {twoFactorEnabled
                    ? "Teachers and admins receive an email code on every sign-in."
                    : "Sign-in requires only email and password."}
                </p>
              </div>
              <button
                onClick={handleToggleTwoFactor}
                disabled={twoFactorToggling}
                className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
                style={{ backgroundColor: twoFactorEnabled ? "#639922" : "var(--border)" }}
                role="switch"
                aria-checked={twoFactorEnabled}
                aria-label="Toggle two-factor authentication"
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                  style={{ transform: twoFactorEnabled ? "translateX(20px)" : "translateX(0)" }}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reports ── */}
      {view === "reports" && (() => {
        const totalStudents = students.length
        const totalTeachers = teachers.length
        const totalClasses  = classes.length
        const totalChallenges = challenges.length
        const statTiles = [
          { label: "Classes",    value: totalClasses,    color: "#534AB7" },
          { label: "Teachers",   value: totalTeachers,   color: "#378ADD" },
          { label: "Students",   value: totalStudents,   color: "#10b981" },
          { label: "Challenges", value: totalChallenges, color: "#f59e0b" },
        ]
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">School Reports & Analytics</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Overview of all school activity</p>
              </div>
              <Button onClick={handleDownloadCompliance} disabled={reportsDownloading}
                className="h-9 text-sm rounded-lg flex items-center gap-2"
                style={{ background: "var(--ts-blue)", color: "white" }}>
                {reportsDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Download Compliance PDF
              </Button>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statTiles.map(t => (
                <div key={t.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground font-medium">{t.label}</span>
                  <span className="text-2xl font-black" style={{ color: t.color }}>{t.value}</span>
                </div>
              ))}
            </div>

            {/* Per-class breakdown */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Class Breakdown</h3>
              </div>
              {classes.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">No classes found</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground border-b border-border">
                      <th className="text-left px-4 py-2.5 font-medium">Class</th>
                      <th className="text-left px-4 py-2.5 font-medium">Students</th>
                      <th className="text-left px-4 py-2.5 font-medium">Teachers</th>
                      <th className="text-left px-4 py-2.5 font-medium">Subjects</th>
                      <th className="text-left px-4 py-2.5 font-medium">Challenges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section)).map(cls => {
                      const teacherCount = new Set((cls.teachers ?? []).map(t => t.teacher_id)).size
                      const challengeCount = challenges.filter(ch => ch.class_id === cls.id).length
                      return (
                        <tr key={cls.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{clsLabel(cls)}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{cls.student_count}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{teacherCount}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{cls.subjects?.length ?? 0}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{challengeCount}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                The compliance PDF includes lesson progress, attendance, and quiz performance data for all classes in your school.
              </p>
            </div>
          </div>
        )
      })()}

      {/* ── Confirm delete class ── */}
      {confirmDeleteClass && (
        <Modal onClose={() => !deleteClassLoading && setConfirmDeleteClass(null)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deleteClassLoading && setConfirmDeleteClass(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-xs p-6 border border-border">
            <div className="flex items-center gap-2 text-red-500 mb-3">
              <AlertCircle className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Delete {confirmDeleteClass.label}?</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              This will permanently delete the class. Students and teachers assigned to this class will lose their class assignment. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteClass(null)} className="flex-1 h-8 text-xs rounded-lg">Cancel</Button>
              <Button onClick={handleDeleteClass} disabled={deleteClassLoading} className="flex-1 h-8 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white">
                {deleteClassLoading ? <Spinner /> : "Delete"}
              </Button>
            </div>
          </div>
        </div></Modal>
      )}

      {/* ── Global: Confirm remove ── */}
      {confirmRemove && (
        <Modal onClose={() => !removeLoading && setConfirmRemove(null)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !removeLoading && setConfirmRemove(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-xs p-6 border border-border">
            <div className="flex items-center gap-2 text-red-500 mb-3">
              <AlertCircle className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Remove {confirmRemove.name}?</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">This will permanently delete their account and all data. This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmRemove(null)} className="flex-1 h-8 text-xs rounded-lg">Cancel</Button>
              <Button onClick={handleRemove} disabled={removeLoading} className="flex-1 h-8 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white">
                {removeLoading ? <Spinner /> : "Remove"}
              </Button>
            </div>
          </div>
        </div></Modal>
      )}
      {view === "marks" && <AdminMarksView />}

    </DashboardLayout>
  )
}

// ── AdminMarksView ─────────────────────────────────────────────────────────────
function GradeBadgeA({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-xs text-muted-foreground">—</span>
  const color =
    grade === "A+" ? "bg-emerald-100 text-emerald-700" :
    grade === "A"  ? "bg-teal-100 text-teal-700" :
    grade === "B+" ? "bg-blue-100 text-blue-700" :
    grade === "B"  ? "bg-sky-100 text-sky-700" :
    grade === "C"  ? "bg-yellow-100 text-yellow-700" :
    grade === "D"  ? "bg-orange-100 text-orange-700" :
                     "bg-red-100 text-red-700"
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${color}`}>{grade}</span>
}

function AdminMarksView() {
  const [classes, setClasses] = useState<Array<{ _id: string; name?: string; grade: number; section: string }>>([])
  const [classId, setClassId] = useState("")
  const [exams, setExams] = useState<ExamDef[]>([])
  const [selectedExam, setSelectedExam] = useState<ExamDef | null>(null)
  const [rows, setRows] = useState<ExamResultRow[]>([])
  const [loading, setLoading] = useState(false)
  const [gridLoading, setGridLoading] = useState(false)
  const [classesLoaded, setClassesLoaded] = useState(false)

  useEffect(() => {
    import("@/lib/userApi").then(({ getClasses }) => {
      getClasses().then(res => {
        if (!("error" in res)) {
          setClasses(res.classes)
          if (res.classes.length > 0) setClassId(res.classes[0]._id)
        }
        setClassesLoaded(true)
      })
    })
  }, [])

  useEffect(() => {
    if (!classId) return
    setLoading(true); setExams([]); setSelectedExam(null); setRows([])
    getExams(classId).then(res => {
      if (!("error" in res)) setExams(res.exams)
      setLoading(false)
    })
  }, [classId])

  useEffect(() => {
    if (!selectedExam) return
    setGridLoading(true); setRows([])
    getExamResults(selectedExam._id).then(res => {
      if (!("error" in res)) setRows(res.rows)
      setGridLoading(false)
    })
  }, [selectedExam])

  const EXAM_TYPE_LABELS: Record<string, string> = { unit_test: "Unit Test", mid_term: "Mid-Term", final: "Final", practical: "Practical", other: "Other" }

  return (
    <div className="p-6">
      <h2 className="text-lg font-bold text-foreground mb-1">Marks Overview</h2>
      <p className="text-xs text-muted-foreground mb-4">View exam results across all classes</p>

      {/* Class tabs */}
      {classesLoaded && classes.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {classes.map(c => (
            <button key={c._id} onClick={() => setClassId(c._id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${classId === c._id ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:border-primary/50"}`}>
              {c.name ?? `${c.grade}${c.section}`}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        {/* Exam list */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Exams</p>
          {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}
          {!loading && exams.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-xl">No exams for this class.</div>}
          <div className="flex flex-col gap-1.5">
            {exams.map(exam => (
              <button key={exam._id} onClick={() => setSelectedExam(exam)}
                className={`flex items-start gap-2 p-2.5 rounded-xl border transition-all text-left w-full ${selectedExam?._id === exam._id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{exam.title}</p>
                  <p className="text-[11px] text-muted-foreground">{EXAM_TYPE_LABELS[exam.exam_type] ?? exam.exam_type} · {new Date(exam.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Results table */}
        <div>
          {!selectedExam && <div className="flex items-center justify-center h-40 text-xs text-muted-foreground border border-dashed rounded-xl">Select an exam to view results</div>}
          {selectedExam && (
            <div>
              <p className="text-sm font-semibold mb-1">{selectedExam.title}</p>
              <p className="text-[11px] text-muted-foreground mb-3">{selectedExam.subjects.map(s => `${s.name} (/${s.max_marks})`).join(" · ")}</p>
              {gridLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Loading results…</div>}
              {!gridLoading && rows.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-xl">No marks entered yet.</div>}
              {!gridLoading && rows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[140px]">Student</th>
                        {selectedExam.subjects.map(sub => (
                          <th key={sub.name} className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[80px]">
                            <div>{sub.name}</div><div className="text-[10px] font-normal">/{sub.max_marks}</div>
                          </th>
                        ))}
                        <th className="text-center px-2 py-2 font-medium text-muted-foreground">Total</th>
                        <th className="text-center px-2 py-2 font-medium text-muted-foreground">%</th>
                        <th className="text-center px-2 py-2 font-medium text-muted-foreground">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, ri) => (
                        <tr key={row.student_id} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          <td className="px-3 py-1.5 font-medium">{row.student_name}</td>
                          {row.subjects.map(sr => (
                            <td key={sr.subject} className="px-2 py-1.5 text-center">
                              {sr.is_absent ? <span className="text-[11px] font-bold text-red-500">AB</span>
                                : sr.marks_obtained !== null ? sr.marks_obtained : <span className="text-muted-foreground">—</span>}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-center font-semibold">{row.total_max > 0 ? `${row.total_obtained}/${row.total_max}` : "—"}</td>
                          <td className="px-2 py-1.5 text-center">{row.overall_pct !== null ? `${row.overall_pct}%` : "—"}</td>
                          <td className="px-2 py-1.5 text-center"><GradeBadgeA grade={row.overall_grade} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
