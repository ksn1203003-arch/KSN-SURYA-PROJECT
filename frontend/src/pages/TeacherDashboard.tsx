// ─────────────────────────────────────────────────────────────────────────────
// pages/TeacherDashboard.tsx — All teacher views in one component.
// Views: dashboard | lessons | attendance | students | quizzes | challenges
//         | certificates | ai-assistant | notifications | timetable | settings
// Also exports SubjectIcon and getSubjectMeta used by the student lessons view.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useMemo, type ChangeEvent } from "react"
import { TimeInput12h, TIME_OPTIONS, to12h, parseTyped } from "@/components/shared/TimeInput12h"
import * as XLSX from "xlsx"
import { TimetableDisplayView } from "@/components/TimetableDisplayView"
import { DashboardLayout } from "@/components/DashboardLayout"
import { createPortal } from "react-dom"
import {
  LayoutDashboard, BookOpen, ClipboardList, Award, Calendar, Settings, Users, Bot, MessageSquare,
  ChevronLeft, ChevronRight, Send, Copy, Check, X, Plus, Upload, Trash2, Search,
  Loader2, Code, TrendingUp, ChevronDown, Clock, FlaskConical, Globe2, Music2,
  Palette, Dumbbell, BookMarked, Cpu, Leaf, Landmark, Languages, Microscope, Sigma, Drama,
  Atom, Map, Link2, GripVertical, Pencil, ExternalLink, ChevronUp, Download, FileSpreadsheet, RotateCcw, Eye
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/AuthContext"
import { getMyClass, addStudent, bulkAddStudents, removeUser, parseStudentCSV, updateProfile, saveAttendance, getAttendance, getTeacherClasses, saveTimetable, getClassStudents, sendTeacherNotification, getTeacherSentNotifications, deleteTeacherNotification, getWeekActivity, getStudentProgress, getClassAttendanceStats, getClassAttendanceRange, type NotifType, type ClassAttStats, type ClassRangeStats, type AttSlot } from "@/lib/userApi"
import {
  getModules, createModule, renameModule, deleteModule, getModuleDeleteImpact, reorderModules,
  uploadFiles, addLink, renameItem, deleteItem, reorderItems,
  getViewerUrl, driveEmbedUrl, fetchAsBlobUrl, getModuleCounts, formatFileSize, fileIcon, linkIcon, needsDownloadFallback,
  type LessonModule, type ModuleItem,
} from "@/lib/moduleApi"
import { getActiveChallenges, createChallenge, deleteChallenge, getChallengeSubmissions, type CodeChallenge, getMyQuizzes, getMyQuizzesForClass, createQuiz, deleteQuiz, getQuizResults, updateQuizDeadline, type Quiz, getCertTemplate, saveCertTemplate, uploadCertLogo, removeCertLogo, getCertsByClass, downloadCertPDF, viewCertPDF, previewCertPDF, bulkDownloadCerts, issueCertificates, revokeCustomCert, deleteCert, type CertTemplate, type StudentCertificate } from "@/lib/studentApi"
import { DatePicker } from "@/components/ui/date-picker"
import { requestDataDeletion } from "@/lib/dpdpApi"
import { SkeletonList } from "@/components/SkeletonCard"
import { TeacherHomeworkPanel } from "@/components/teacher/TeacherHomeworkPanel"
import { TeacherMarksPanel } from "@/components/teacher/TeacherMarksPanel"
import { TeacherAttendancePanel } from "@/components/teacher/TeacherAttendancePanel"
import { TeacherQuizzesPanel } from "@/components/teacher/TeacherQuizzesPanel"
import { TeacherLiveCodingPanel } from "@/components/teacher/TeacherLiveCodingPanel"

// ── Static data ────────────────────────────────────────────────────────────────





const NAV_ITEMS = [
  { label: "Dashboard",      icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "Lessons",        icon: <BookOpen        className="w-4 h-4" /> },
  { label: "Timetable",      icon: <Calendar        className="w-4 h-4" /> },
  { label: "Attendance",     icon: <Calendar        className="w-4 h-4" /> },
  { label: "Students",       icon: <Users           className="w-4 h-4" /> },
  { label: "Quizzes",        icon: <ClipboardList   className="w-4 h-4" /> },
  { label: "Marks",          icon: <FileSpreadsheet className="w-4 h-4" /> },
  { label: "Homework",       icon: <ClipboardList   className="w-4 h-4" /> },
  { label: "Live Code",      icon: <Code            className="w-4 h-4" /> },
  { label: "Certificates",   icon: <Award           className="w-4 h-4" /> },
  { label: "AI assistant",   icon: <Bot             className="w-4 h-4" /> },
  { label: "Notifications",  icon: <MessageSquare   className="w-4 h-4" /> },
  { label: "Sunday Sync",    icon: <MessageSquare   className="w-4 h-4" /> },
  { label: "Settings",       icon: <Settings        className="w-4 h-4" /> },
]

// ── Subject meta: icon + gradient per subject name ────────────────────────────
export type SubjectMeta = { gradient: string; iconColor: string; ringColor: string }
const SUBJECT_META: Record<string, SubjectMeta> = {
  "Computer Science": { gradient: "from-violet-500 to-indigo-500",   iconColor: "text-violet-400", ringColor: "ring-violet-400/30" },
  "Mathematics":      { gradient: "from-blue-500 to-cyan-500",        iconColor: "text-blue-400",   ringColor: "ring-blue-400/30" },
  "Science":          { gradient: "from-emerald-500 to-teal-500",     iconColor: "text-emerald-400",ringColor: "ring-emerald-400/30" },
  "Physics":          { gradient: "from-sky-500 to-blue-500",         iconColor: "text-sky-400",    ringColor: "ring-sky-400/30" },
  "Chemistry":        { gradient: "from-orange-500 to-amber-500",     iconColor: "text-orange-400", ringColor: "ring-orange-400/30" },
  "Biology":          { gradient: "from-green-500 to-lime-500",       iconColor: "text-green-400",  ringColor: "ring-green-400/30" },
  "English":          { gradient: "from-pink-500 to-rose-500",        iconColor: "text-pink-400",   ringColor: "ring-pink-400/30" },
  "Hindi":            { gradient: "from-amber-500 to-yellow-500",     iconColor: "text-amber-400",  ringColor: "ring-amber-400/30" },
  "Social Science":   { gradient: "from-brown-500 to-amber-600",      iconColor: "text-amber-600",  ringColor: "ring-amber-500/30" },
  "History":          { gradient: "from-yellow-600 to-orange-600",    iconColor: "text-yellow-500", ringColor: "ring-yellow-500/30" },
  "Geography":        { gradient: "from-teal-500 to-cyan-500",        iconColor: "text-teal-400",   ringColor: "ring-teal-400/30" },
  "Civics":           { gradient: "from-indigo-500 to-purple-500",    iconColor: "text-indigo-400", ringColor: "ring-indigo-400/30" },
  "Art":              { gradient: "from-fuchsia-500 to-pink-500",     iconColor: "text-fuchsia-400",ringColor: "ring-fuchsia-400/30" },
  "Music":            { gradient: "from-purple-500 to-fuchsia-500",   iconColor: "text-purple-400", ringColor: "ring-purple-400/30" },
  "Physical Education":{ gradient: "from-red-500 to-orange-500",      iconColor: "text-red-400",    ringColor: "ring-red-400/30" },
  "Sanskrit":         { gradient: "from-rose-500 to-pink-500",        iconColor: "text-rose-400",   ringColor: "ring-rose-400/30" },
  "EVS":              { gradient: "from-lime-500 to-green-500",       iconColor: "text-lime-500",   ringColor: "ring-lime-400/30" },
}
export function getSubjectMeta(name: string): SubjectMeta {
  return SUBJECT_META[name] ?? { gradient: "from-slate-500 to-gray-500", iconColor: "text-slate-400", ringColor: "ring-slate-400/30" }
}
export function SubjectIcon({ name, size = 28 }: { name: string; size?: number }) {
  const cls = `shrink-0`
  const s = { width: size, height: size }
  const n = name.toLowerCase()
  if (n.includes("computer") || n.includes("cs") || n.includes("ict"))  return <Cpu className={cls} style={s} />
  if (n.includes("math"))         return <Sigma className={cls} style={s} />
  if (n.includes("physics"))      return <Atom className={cls} style={s} />
  if (n.includes("chemistry"))    return <FlaskConical className={cls} style={s} />
  if (n.includes("biology"))      return <Microscope className={cls} style={s} />
  if (n.includes("science"))      return <FlaskConical className={cls} style={s} />
  if (n.includes("english"))      return <BookMarked className={cls} style={s} />
  if (n.includes("hindi") || n.includes("sanskrit") || n.includes("language")) return <Languages className={cls} style={s} />
  if (n.includes("history"))      return <Landmark className={cls} style={s} />
  if (n.includes("geography"))    return <Map className={cls} style={s} />
  if (n.includes("social") || n.includes("civics")) return <Globe2 className={cls} style={s} />
  if (n.includes("art"))          return <Palette className={cls} style={s} />
  if (n.includes("music"))        return <Music2 className={cls} style={s} />
  if (n.includes("physical") || n.includes("pe") || n.includes("sport")) return <Dumbbell className={cls} style={s} />
  if (n.includes("evs") || n.includes("environment")) return <Leaf className={cls} style={s} />
  if (n.includes("drama") || n.includes("theatre")) return <Drama className={cls} style={s} />
  return <BookOpen className={cls} style={s} />
}

// Dummy lesson modules per subject (5 periods each)
export function getLessonsForSubject(_subject: string) {
  return []
}

const LESSONS: Array<{ id: number; period: number; title: string; chapter: string; status: string; date: string | null }> = []




// ── Student avatar — DB photo > localStorage > gradient initials ──
function StudentAvatar({ name, size = 28, atRisk = false, photoUrl }: { name: string; size?: number; atRisk?: boolean; photoUrl?: string | null }) {
  const photo = photoUrl ?? (() => {
    try { return localStorage.getItem(`teachscript_avatar_${name.replace(/\s+/g, "_")}`) }
    catch { return null }
  })()
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{
        width: size, height: size,
        background: photo ? "transparent" : atRisk ? "#ef4444" : "linear-gradient(135deg,#534AB7,#7970D6)",
      }}
    >
      {photo
        ? <img src={photo} alt={name} className="w-full h-full object-cover" />
        : <span className="text-white font-bold" style={{ fontSize: size * 0.36 }}>{initials}</span>
      }
    </div>
  )
}

// ── Timetable constants ────────────────────────────────────────────────────────
const TT_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const TT_PERIODS = [1,2,3,4,5,6,7,8]
const TT_SUBJECT_COLORS: Record<string,string> = {
  "CT & AI":"#534AB7","Maths":"#378ADD","Science":"#639922","English":"#E2625A",
  "Social Studies":"#EF9F27","Hindi":"#9D59C7","Telugu":"#0EA5E9","EVS":"#1FA04C",
}
function ttColor(s: string) { return TT_SUBJECT_COLORS[s] ?? "#534AB7" }


// ── Shared dropdown (same portal pattern as AdminDashboard) ────────────────────
function TTSelectDropdown({ options, value, onChange, placeholder = "Free" }: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
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
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="w-full rounded-lg border border-border px-2 flex items-center justify-between gap-1 focus:outline-none hover:border-[#534AB7]/60 transition-colors"
        style={{ height: "30px", background: "var(--card)", color: selected ? "var(--foreground)" : "var(--muted-foreground)", fontSize: "11px" }}>
        <span className="truncate text-left flex-1 font-medium">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && createPortal(
        <div onMouseDown={e => e.stopPropagation()} style={{
          position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
          background: "var(--popover,var(--card))", border: "1px solid var(--border)",
          borderRadius: "0.5rem", boxShadow: "0 10px 40px rgba(0,0,0,.35)", padding: "4px 0", maxHeight: "220px", overflowY: "auto",
        }}>
          <div onClick={() => { onChange(""); setOpen(false) }}
            style={{ padding: "6px 12px", fontSize: "11px", cursor: "pointer", color: "var(--muted-foreground)", fontStyle: "italic", background: !value ? "var(--muted)" : "transparent" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
            onMouseLeave={e => (e.currentTarget.style.background = !value ? "var(--muted)" : "transparent")}>
            {placeholder}
          </div>
          {options.map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{ padding: "6px 12px", fontSize: "11px", cursor: "pointer", fontWeight: 500, color: value === opt.value ? "#534AB7" : "var(--foreground)", background: value === opt.value ? "rgba(83,74,183,.12)" : "transparent" }}
              onMouseEnter={e => { if (value !== opt.value) e.currentTarget.style.background = "var(--muted)" }}
              onMouseLeave={e => { e.currentTarget.style.background = value === opt.value ? "rgba(83,74,183,.12)" : "transparent" }}>
              {opt.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Read-only timetable grid (for students) ────────────────────────────────────
export function ReadonlyTimetableView({ slots, subjects, updatedByName, updatedAt }: {
  slots: Array<{ day: string; period: number; subject: string; teacher_name?: string | null; start_time: string; end_time: string }>
  subjects: string[]
  updatedByName: string | null
  updatedAt: string | null
}) {
  return (
    <TimetableDisplayView
      slots={slots}
      subjects={subjects}
      updatedByName={updatedByName}
      updatedAt={updatedAt}
    />
  )
}

// ── Teacher timetable view (editable) ─────────────────────────────────────────
function TeacherTimetableView({
  ttClasses, setTtClasses, ttClassId, setTtClassId,
  ttSlots, setTtSlots, ttPeriodTimes, setTtPeriodTimes,
  ttSaving, setTtSaving, ttMsg, setTtMsg,
  ttLoading, setTtLoading, ttUpdatedBy, setTtUpdatedBy, ttUpdatedAt, setTtUpdatedAt,
}: {
  ttClasses: Array<{ id: string; grade: number; section: string; name: string | null; subjects: string[]; timetable: Array<{ day: string; period: number; subject: string; teacher_id: string | null; teacher_name: string | null; start_time: string; end_time: string }>; timetable_updated_by_name: string | null; timetable_updated_at: string | null }>
  setTtClasses: React.Dispatch<React.SetStateAction<typeof ttClasses>>
  ttClassId: string; setTtClassId: (v: string) => void
  ttSlots: Array<{ day: string; period: number; subject: string; teacher_id: string | null; teacher_name: string | null; start_time: string; end_time: string }>
  setTtSlots: React.Dispatch<React.SetStateAction<typeof ttSlots>>
  ttPeriodTimes: Record<number, { start: string; end: string }>
  setTtPeriodTimes: React.Dispatch<React.SetStateAction<Record<number, { start: string; end: string }>>>
  ttSaving: boolean; setTtSaving: (v: boolean) => void
  ttMsg: string; setTtMsg: (v: string) => void
  ttLoading: boolean; setTtLoading: (v: boolean) => void
  ttUpdatedBy: string | null; setTtUpdatedBy: (v: string | null) => void
  ttUpdatedAt: string | null; setTtUpdatedAt: (v: string | null) => void
}) {
  const cls = ttClasses.find(c => c.id === ttClassId)
  const subjectOptions = cls?.subjects?.length ? cls.subjects : ["CT & AI","Maths","Science","English","Social Studies","Hindi","Telugu","EVS"]
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    if (ttClasses.length > 0) return
    setTtLoading(true)
    getTeacherClasses().then(res => {
      setTtLoading(false)
      if ("error" in res) return
      setTtClasses(res.classes)
    })
  }, [])

  function handleClassChange(id: string) {
    setTtClassId(id)
    setTtMsg("")
    setEditMode(false)
    setTtPeriodTimes({})
    if (!id) { setTtSlots([]); setTtUpdatedBy(null); setTtUpdatedAt(null); return }
    const c = ttClasses.find(x => x.id === id)
    const slots = c?.timetable ?? []
    setTtSlots(slots)
    setTtUpdatedBy(c?.timetable_updated_by_name ?? null)
    setTtUpdatedAt(c?.timetable_updated_at ?? null)
    const pt: Record<number, { start: string; end: string }> = {}
    for (const s of slots) { if (!pt[s.period]) pt[s.period] = { start: s.start_time, end: s.end_time } }
    setTtPeriodTimes(pt)
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
      const filled: typeof slots = []
      TT_DAYS.forEach(day => TT_PERIODS.forEach(period => {
        const subject = SCHED[day]?.[period] ?? ""
        if (subject) filled.push({ day, period, subject, teacher_id: null, teacher_name: null, start_time: TIMES[period].start, end_time: TIMES[period].end })
      }))
      setTtSlots(filled)
      setTtPeriodTimes(TIMES)
    }
  }

  function getSlot(day: string, period: number) { return ttSlots.find(s => s.day === day && s.period === period) }

  function setSlotSubject(day: string, period: number, subject: string) {
    const st = ttPeriodTimes[period]?.start ?? ttSlots.find(s => s.period === period)?.start_time ?? ""
    const et = ttPeriodTimes[period]?.end   ?? ttSlots.find(s => s.period === period)?.end_time   ?? ""
    if (!subject) { setTtSlots(prev => prev.filter(s => !(s.day === day && s.period === period))); return }
    setTtSlots(prev => {
      const exists = prev.find(s => s.day === day && s.period === period)
      if (exists) return prev.map(s => s.day === day && s.period === period ? { ...s, subject } : s)
      return [...prev, { day, period, subject, teacher_id: null, teacher_name: null, start_time: st, end_time: et }]
    })
  }

  function setPeriodStart(period: number, val: string) {
    setTtPeriodTimes(pt => ({ ...pt, [period]: { start: val, end: pt[period]?.end ?? "" } }))
    setTtSlots(prev => prev.map(s => s.period === period ? { ...s, start_time: val } : s))
  }

  function setPeriodEnd(period: number, val: string) {
    setTtPeriodTimes(pt => ({ ...pt, [period]: { start: pt[period]?.start ?? "", end: val } }))
    setTtSlots(prev => prev.map(s => s.period === period ? { ...s, end_time: val } : s))
  }

  async function handleSave() {
    setTtSaving(true); setTtMsg("")
    const valid = ttSlots.filter(s => s.subject && s.start_time && s.end_time)
    // use admin route so save is logged in edit history
    const res = await saveTimetable(ttClassId, valid)
    setTtSaving(false)
    if ("error" in res) { setTtMsg("Error: " + res.error); return }
    setTtSlots(valid)
    setTtClasses(prev => prev.map(c => c.id === ttClassId ? { ...c, timetable: valid } : c))
    setTtMsg("Saved!")
    setEditMode(false)
    setTimeout(() => setTtMsg(""), 2500)
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
    // subject rotation per day × period
    const SCHED: Record<string, Record<number, string>> = {
      Monday:    { 1:"CT & AI", 2:"Maths",   3:"English", 4:"Science", 5:"Hindi",   6:"CT & AI", 7:"Maths",   8:"English" },
      Tuesday:   { 1:"Maths",   2:"CT & AI", 3:"Science", 4:"English", 5:"CT & AI", 6:"Hindi",   7:"Science",  8:"Maths"  },
      Wednesday: { 1:"English", 2:"Science", 3:"CT & AI", 4:"Maths",   5:"English", 6:"CT & AI", 7:"Hindi",   8:"Science" },
      Thursday:  { 1:"Science", 2:"English", 3:"Maths",   4:"CT & AI", 5:"Science", 6:"Maths",   7:"CT & AI", 8:"Hindi"  },
      Friday:    { 1:"Hindi",   2:"Maths",   3:"CT & AI", 4:"Science", 5:"Maths",   6:"English", 7:"Science", 8:"CT & AI" },
      Saturday:  { 1:"CT & AI", 2:"English", 3:"Hindi",   4:"Maths",   5:"CT & AI", 6:"Science", 7:"English", 8:"Maths"  },
    }
    const slots: typeof ttSlots = []
    TT_DAYS.forEach(day => {
      TT_PERIODS.forEach(period => {
        const subject = SCHED[day]?.[period] ?? ""
        if (subject) {
          slots.push({ day, period, subject, teacher_id: null, start_time: TIMES[period].start, end_time: TIMES[period].end })
        }
      })
    })
    setTtSlots(slots)
    setTtPeriodTimes(TIMES)
  }

  // Auto-select first class once loaded
  useEffect(() => {
    if (ttClasses.length > 0 && !ttClassId) handleClassChange(
      [...ttClasses].sort((a,b) => a.grade-b.grade || a.section.localeCompare(b.section))[0].id
    )
  }, [ttClasses])

  if (ttLoading) return <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading classes…</div>

  const sortedClasses = [...ttClasses].sort((a,b) => a.grade-b.grade || a.section.localeCompare(b.section))

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Timetable</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Weekly schedule for your assigned classes</p>
        </div>
      </div>

      {ttClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <TrendingUp className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No classes assigned to you yet</p>
          <p className="text-xs mt-1">Ask your admin to assign you to a class.</p>
        </div>
      ) : (
        <>
          {/* Class tabs + last saved inline */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-5 border-b border-border pb-3">
            <div className="flex flex-wrap gap-2">
              {sortedClasses.map(c => {
                const isActive = c.id === ttClassId
                const hasTimetable = c.timetable.length > 0
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleClassChange(c.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus:outline-none"
                    style={{
                      background: isActive ? "#534AB7" : "var(--muted)",
                      color: isActive ? "#fff" : "var(--muted-foreground)",
                      border: isActive ? "none" : "1px solid var(--border)",
                    }}
                  >
                    Class {c.grade}{c.section}
                    {c.name && <span className="font-normal opacity-80">· {c.name}</span>}
                    {hasTimetable && (
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isActive ? "rgba(255,255,255,0.6)" : "#22c55e" }} />
                    )}
                  </button>
                )
              })}
            </div>
            {ttUpdatedBy && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3" /> Last saved by <strong className="text-foreground ml-1">{ttUpdatedBy}</strong>
                {ttUpdatedAt && ` · ${new Date(ttUpdatedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`}
              </span>
            )}
          </div>

          {!ttClassId ? null : (
            <div className="space-y-4">

              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs text-muted-foreground" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                {editMode ? (
                  <>
                    <span className="flex items-center gap-1.5 text-foreground font-medium">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit mode — change subjects then save
                    </span>
                    <div className="flex items-center gap-2">
                      {ttMsg && <span className={`text-xs font-medium ${ttMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{ttMsg}</span>}
                      <Button variant="outline" onClick={() => { setEditMode(false); setTtMsg("") }} className="h-7 text-xs rounded-lg px-3">Cancel</Button>
                      <Button onClick={handleSave} disabled={ttSaving} className="h-7 text-xs rounded-lg px-3" style={{ background: "#534AB7", color: "white" }}>
                        {ttSaving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Saving…</> : "Save Changes"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      View mode — click Edit Timetable to make changes
                    </span>
                    <Button onClick={() => setEditMode(true)} variant="outline" className="h-7 text-xs rounded-lg px-3 flex items-center gap-1.5 flex-shrink-0">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit Timetable
                    </Button>
                  </>
                )}
              </div>

              {/* Grid — editable mode stays as-is; view mode uses the new beautiful display */}
              {editMode ? (
                <div className="overflow-x-auto -mx-1">
                  <div className="space-y-1" style={{ minWidth: "600px" }}>
                    <div className="grid px-1" style={{ gridTemplateColumns: "160px repeat(6,1fr)", gap: "6px" }}>
                      <div className="text-[11px] font-bold uppercase tracking-wide py-1 pl-2" style={{ color: "var(--muted-foreground)" }}>Period</div>
                      {TT_DAYS.map(d => <div key={d} className="text-[11px] font-bold text-center uppercase tracking-wide py-1" style={{ color: "var(--muted-foreground)" }}>{d.slice(0,3)}</div>)}
                    </div>
                    {TT_PERIODS.map(period => {
                      const start = ttPeriodTimes[period]?.start ?? ttSlots.find(s => s.period === period)?.start_time ?? ""
                      const end   = ttPeriodTimes[period]?.end   ?? ttSlots.find(s => s.period === period)?.end_time   ?? ""
                      return (
                        <div key={period} className="skillio-card rounded-xl px-3 py-2.5 grid items-start" style={{ gridTemplateColumns: "160px repeat(6,1fr)", gap: "6px" }}>
                          <div className="flex items-center gap-2.5 flex-shrink-0">
                            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[13px] font-black text-white flex-shrink-0 shadow-md" style={{ background: "#534AB7" }}>P{period}</span>
                            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                              <TimeInput12h value={start} onChange={v => setPeriodStart(period, v)} />
                              <TimeInput12h value={end} onChange={v => setPeriodEnd(period, v)} />
                            </div>
                          </div>
                          {TT_DAYS.map(day => {
                            const slot = getSlot(day, period)
                            const color = slot?.subject ? ttColor(slot.subject) : null
                            return (
                              <div key={day} className="rounded-lg border transition-all flex flex-col" style={{ borderColor: color ? `${color}60` : "var(--border)", background: color ? `${color}15` : "var(--card)" }}>
                                <TTSelectDropdown
                                  options={subjectOptions.map(s => ({ value: s, label: s }))}
                                  value={slot?.subject ?? ""}
                                  onChange={v => setSlotSubject(day, period, v)}
                                  placeholder="Free"
                                />
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <TimetableDisplayView
                  slots={ttSlots}
                  subjects={subjectOptions}
                  updatedByName={ttUpdatedBy}
                  updatedAt={ttUpdatedAt}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

type View = "dashboard" | "classes" | "lessons" | "lesson-player" | "attendance" | "students" | "quizzes" | "quiz-results" | "certificates" | "ai" | "sunday-sync" | "settings" | "problem-statements" | "timetable" | "notifications" | "marks" | "homework"


interface ChatMessage { role: "user" | "ai"; text: string }

const QUICK_ACTIONS = [
  "Simplify this slide for weaker students",
  "Give 3 more activity ideas for this lesson",
  "Translate the script to Hindi",
  "What if a student asks why we need algorithms?",
  "Generate 5 more quiz questions on algorithms",
]

interface DbStudent { id: string; name: string; email: string; username: string | null; class_id: string | null; is_active: boolean; profile_photo_url?: string | null }
interface BulkResult { name: string; username: string; temp_password: string; error?: string }

// ── Working Hours Bar Component ────────────────────────────────────────────────
function WorkingHoursBar({ hours, maxHours, day, isToday }: { hours: number; maxHours: number; day: string; isToday: boolean }) {
  const [h, setH] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setH(hours > 0 ? (hours / maxHours) * 100 : 0), 100)
    return () => clearTimeout(t)
  }, [hours, maxHours])
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[11px] font-semibold" style={{ color: isToday ? "#534AB7" : "var(--muted-foreground)" }}>{hours > 0 ? `${hours}h` : ""}</span>
      <div className="w-5 rounded-full overflow-hidden flex items-end" style={{ height: 60, background: "var(--muted)" }}>
        <div
          className="w-full rounded-full transition-all duration-1000 ease-out"
          style={{
            height: `${h}%`,
            background: isToday
              ? "linear-gradient(to top,#534AB7,#7970D6)"
              : hours === 0
              ? "transparent"
              : "linear-gradient(to top,#9d95e8,#c4c0f8)",
          }}
        />
      </div>
      <span className="text-[11px] font-semibold" style={{ color: isToday ? "#534AB7" : "var(--muted-foreground)" }}>{day}</span>
    </div>
  )
}

// Google URLs that cannot be embedded in iframes (require sign-in / block iframes)
function isGoogleUrl(url: string): boolean {
  return (
    url.includes("drive.google.com") ||
    url.includes("docs.google.com") ||
    url.includes("slides.google.com") ||
    url.includes("sheets.google.com") ||
    url.includes("forms.google.com")
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function TeacherDashboard() {
  const { user } = useAuth()
  const schoolId = user?.school_id ?? ""
  const teacherClassId = user?.class_id ?? ""

  const [view, setView] = useState<View>("dashboard")
  const [currentSlide, setCurrentSlide] = useState(0)
  const [showHindi, setShowHindi] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "ai", text: "Hello! I'm your AI Lesson Assistant. Ask me anything about this lesson, or use the quick actions below." },
  ])
  const [chatInput, setChatInput] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [selectedLesson, setSelectedLesson] = useState<{ id: number; period: number; title: string; chapter: string; status: string; date: string | null }>(
    LESSONS[0] ?? { id: 0, period: 0, title: "", chapter: "", status: "", date: null }
  )
  const [noteText, setNoteText] = useState("")
  const [noteSaved, setNoteSaved] = useState(false)

  // ── real student progress metrics ──────────────────────────────────────────
  type StudentProgressRow = { course: number; attendance: number | null }
  const [studentProgress, setStudentProgress] = useState<Record<string, StudentProgressRow>>({})
  const [progressLoading, setProgressLoading] = useState(false)

  // ── upcoming classes today (from real timetable) ───────────────────────────
  type UpcomingClass = { subject: string; className: string; period: number; start_time: string; end_time: string }
  const [upcomingClasses,        setUpcomingClasses]        = useState<UpcomingClass[]>([])
  const [upcomingClassesLoading, setUpcomingClassesLoading] = useState(true)

  // ── working hours (from clock-in/out sessions) ─────────────────────────────
  const [weekHours, setWeekHours] = useState<Array<{ day: string; hours: number; isToday?: boolean }>>([
    { day: "S", hours: 0 }, { day: "M", hours: 0 }, { day: "T", hours: 0 },
    { day: "W", hours: 0 }, { day: "T", hours: 0 }, { day: "F", hours: 0 }, { day: "S", hours: 0 },
  ])
  const [weekTotalHours, setWeekTotalHours] = useState(0)
  const [weekOffset,     setWeekOffset]     = useState(0)
  const [weekLabel,      setWeekLabel]      = useState("This week")

  // ── live class + students from backend ─────────────────────────────────────
  const [myClass, setMyClass] = useState<{ id: string; grade: number; section: string; label: string } | null>(null)
  const [students, setStudents] = useState<DbStudent[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [searchStudents, setSearchStudents] = useState("")
  const [teacherClasses, setTeacherClasses] = useState<Array<{ id: string; grade: number; section: string }>>([])

  // ── add student modal ───────────────────────────────────────────────────────
  const [showStudentModal, setShowStudentModal] = useState(false)
  const [studentForm, setStudentForm] = useState({ name: "", email: "", phone: "", roll_no: "", class_id: "" })
  const [studentLoading, setStudentLoading] = useState(false)
  const [studentError, setStudentError] = useState("")
  const [studentResult, setStudentResult] = useState<{ username: string; temp_password: string } | null>(null)

  // ── bulk import ─────────────────────────────────────────────────────────────
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkClassId, setBulkClassId] = useState("")
  const [bulkRows, setBulkRows] = useState<Array<{ name: string; roll_no: string; email?: string; phone?: string }>>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([])
  const csvRef = useRef<HTMLInputElement>(null)

  // ── confirm remove ──────────────────────────────────────────────────────────
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  // ── attendance ──────────────────────────────────────────────────────────────
  type AttendanceRecord = { id: string; name: string; todayStatus: "present" | "absent" | "late" }
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split("T")[0])
  const [attendanceClassId, setAttendanceClassId] = useState("")
  const [attendancePeriod, setAttendancePeriod] = useState<number | "">("")
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [attendanceStudentsLoading, setAttendanceStudentsLoading] = useState(false)
  const [attendanceSaving, setAttendanceSaving] = useState(false)
  const [attendanceSavedMsg, setAttendanceSavedMsg] = useState("")
  const [attendanceError, setAttendanceError] = useState("")
  const [attMode, setAttMode] = useState<"mark" | "stats">("mark")
  const [attStatsClassId, setAttStatsClassId] = useState("")
  const [attStats, setAttStats] = useState<ClassAttStats | null>(null)
  const [attStatsLoading, setAttStatsLoading] = useState(false)
  const [attStatsError, setAttStatsError] = useState("")
  const [attRangeFrom, setAttRangeFrom] = useState("")
  const [attRangeTo, setAttRangeTo] = useState("")
  const [attRangeResult, setAttRangeResult] = useState<ClassRangeStats | null>(null)
  const [attRangeLoading, setAttRangeLoading] = useState(false)
  const [attRangeError, setAttRangeError] = useState("")
  const [attRangeQueried, setAttRangeQueried] = useState(false)

  // ── teacher settings (real data) ────────────────────────────────────────────
  const [teacherSettingsForm, setTeacherSettingsForm] = useState({ name: "", phone: "", email: "" })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState("")
  const [tDeletionReason,  setTDeletionReason]  = useState("")
  const [tDeletionLoading, setTDeletionLoading] = useState(false)
  const [tDeletionMsg,     setTDeletionMsg]     = useState("")
  const [tDeletionErr,     setTDeletionErr]     = useState("")

  // ── period complete + PDF download ──────────────────────────────────────────
  const [periodDone, setPeriodDone] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfMsg, setPdfMsg] = useState("")

  // ── new feature state ────────────────────────────────────────────────────────
  const [problemStatements, setProblemStatements] = useState<CodeChallenge[]>([])
  const [problemsLoading, setProblemsLoading] = useState(true)

  // Grouped by title — same challenge pushed to multiple classes = one card
  const groupedChallenges = useMemo(() => {
    const groups = new globalThis.Map<string, { ids: string[]; classIds: string[]; rep: CodeChallenge }>()
    for (const ps of problemStatements) {
      const key = ps.title ?? ps._id
      if (groups.has(key)) {
        groups.get(key)!.ids.push(ps._id)
        if (ps.class_id) groups.get(key)!.classIds.push(ps.class_id)
      } else {
        groups.set(key, { ids: [ps._id], classIds: ps.class_id ? [ps.class_id] : [], rep: ps })
      }
    }
    return Array.from(groups.values())
  }, [problemStatements])
  const [problemError, setProblemError] = useState("")
  const [showProblemModal, setShowProblemModal] = useState(false)
  const [newProblem, setNewProblem] = useState({ title: "", difficulty: "Easy", language: "javascript", description: "", constraints: "", expectedOutput: "", deadline: "" })
  const [problemClassIds, setProblemClassIds] = useState<Set<string>>(new Set())
  const [showQuizCreator, setShowQuizCreator] = useState(false)
  const [quizCreatorTab, setQuizCreatorTab] = useState<"manual" | "paste" | "ai">("manual")
  const [newQuizTitle, setNewQuizTitle] = useState("")
  const [newQuizDeadline, setNewQuizDeadline] = useState("")
  const [newQuizShuffle, setNewQuizShuffle] = useState(false)
  const [newQuizQuestions, setNewQuizQuestions] = useState([{ q: "", options: ["", "", "", ""], correct: 0 }])
  const [quizClassId, setQuizClassId] = useState<string>("")
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null)
  const [editingDeadlineVal, setEditingDeadlineVal] = useState("")
  const [deadlineUpdating, setDeadlineUpdating] = useState(false)

  // ── certificate state ─────────────────────────────────────────────────────
  const [certClassId,    setCertClassId]    = useState<string>("")
  const [certModules,    setCertModules]    = useState<Array<{ module_id: string; module_title: string; subject: string; total_items: number; certificates: StudentCertificate[] }>>([])
  const [certCustomCerts, setCertCustomCerts] = useState<StudentCertificate[]>([])
  const [certRemovedModules, setCertRemovedModules] = useState<Array<{ module_title: string; subject: string; certificates: StudentCertificate[] }>>([])
  const [certShowEmpty, setCertShowEmpty] = useState(false)
  const [certShowRemoved, setCertShowRemoved] = useState(false)
  const [certModulesLoading, setCertModulesLoading] = useState(false)
  const [certTemplate,   setCertTemplate]   = useState<CertTemplate>({ school_name: "", description: "for successfully completing {module} in {subject}", footer_left: "Class Teacher", footer_right: "School Principal", accent_color: "#534AB7", logo_gridfs_id: null })
  const [certTmplLoaded, setCertTmplLoaded] = useState(false)
  const [certTmplSaving, setCertTmplSaving] = useState(false)
  const [certTmplSaved,  setCertTmplSaved]  = useState(false)
  const [certLogoUploading, setCertLogoUploading] = useState(false)
  const [certLogoRemoving,  setCertLogoRemoving]  = useState(false)
  const [certBulkLoading, setCertBulkLoading] = useState<string | null>(null)
  const [certTab,        setCertTab]        = useState<"certs" | "settings">("certs")
  // Issue custom cert modal state
  const [certIssueOpen,     setCertIssueOpen]     = useState(false)
  const [certIssueTitle,    setCertIssueTitle]    = useState("")
  const [certIssueReason,   setCertIssueReason]   = useState("")
  const [certIssueLoading,  setCertIssueLoading]  = useState(false)
  const [certIssueTemplate, setCertIssueTemplate] = useState<"course_completion" | "academic_excellence" | "outstanding_achievement" | null>(null)
  const [certIssueError, setCertIssueError] = useState("")
  const [certClassStudents, setCertClassStudents] = useState<Array<{ id: string; name: string }>>([])
  const [certSelectedIds, setCertSelectedIds] = useState<Set<string>>(new Set())
  const [certRevoking,       setCertRevoking]       = useState<string | null>(null)
  const [certDeleteConfirm, setCertDeleteConfirm]   = useState<{ certId: string; studentName: string; moduleTitle: string } | null>(null)
  const [certModuleDeleting, setCertModuleDeleting] = useState<string | null>(null)
  const [certBulkIds,        setCertBulkIds]        = useState<Set<string>>(new Set())
  const [certBulkDeleting,   setCertBulkDeleting]   = useState(false)
  const [certBulkConfirm,    setCertBulkConfirm]    = useState(false)

  const [pasteText, setPasteText] = useState("")
  const [pasteError, setPasteError] = useState("")
  const [parsedQuestions, setParsedQuestions] = useState<Array<{ q: string; options: string[]; correct: number }>>([])
  const [showFormatHelper, setShowFormatHelper] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [pushedToast, setPushedToast] = useState<string | null>(null)

  // ── quizzes (real backend) ──────────────────────────────────────────────────
  const [quizzes,        setQuizzes]        = useState<Quiz[]>([])
  const [quizzesLoading, setQuizzesLoading] = useState(true)
  const [quizError,      setQuizError]      = useState("")
  const [quizSaving,     setQuizSaving]     = useState(false)
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null)
  const [quizResultsData, setQuizResultsData] = useState<Array<{
    student_name: string; attempt_count: number;
    best_score: number; best_percentage: number;
    latest_percentage: number; latest_submitted_at: string
  }>>([])
  const [quizResultsLoading, setQuizResultsLoading] = useState(false)

  // ── lessons subject navigation ───────────────────────────────────────────────
  const [lessonClassId, setLessonClassId] = useState("")
  const [lessonSubject, setLessonSubject] = useState<string | null>(null)

  // ── module system ────────────────────────────────────────────────────────────
  const [modules, setModules] = useState<LessonModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(false)
  const [modulesError,   setModulesError]   = useState("")
  const [modulesSubjectKey, setModulesSubjectKey] = useState("") // "classId::subject" to detect changes
  const [subjectModuleCounts, setSubjectModuleCounts] = useState<Record<string, number>>({})
  const [newModuleTitle, setNewModuleTitle] = useState("")
  const [showNewModuleInput, setShowNewModuleInput] = useState(false)
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null)
  const [renamingModuleTitle, setRenamingModuleTitle] = useState("")
  const [moduleDeleteConfirm, setModuleDeleteConfirm] = useState<{ id: string; title: string; certificateCount: number | null } | null>(null)
  const [moduleDeleteLoading, setModuleDeleteLoading] = useState(false)
  const [renamingItemKey, setRenamingItemKey] = useState<string | null>(null) // "moduleId::itemId"
  const [renamingItemLabel, setRenamingItemLabel] = useState("")
  const [addingLinkModuleId, setAddingLinkModuleId] = useState<string | null>(null)
  const [linkForm, setLinkForm] = useState({ label: "", url: "" })
  const [linkExcelRows, setLinkExcelRows] = useState<{ label: string; url: string }[]>([])
  const [uploadingModuleId, setUploadingModuleId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({}) // moduleId → 0-100
  const [viewerItem, setViewerItem] = useState<ModuleItem | null>(null)
  const [viewerBlobUrl, setViewerBlobUrl] = useState<string | null>(null)
  const [viewerBlobLoading, setViewerBlobLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const linkExcelRef = useRef<HTMLInputElement>(null)
  const dragSrcRef = useRef<{ moduleId: string; idx: number } | null>(null)

  // Handle Excel/CSV upload for bulk links — defined at component level so
  // the hidden <input onChange> at the root of the layout can reference it
  function handleLinkExcelUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const buf = ev.target?.result
      if (!buf) return
      const { read, utils } = await import("xlsx")
      const wb = read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json<Record<string, string>>(ws, { defval: "" })
      const parsed = rows
        .map(r => {
          const keys = Object.keys(r)
          const urlKey   = keys.find(k => /url|link/i.test(k))   ?? keys[1] ?? ""
          const titleKey = keys.find(k => /title|label|name/i.test(k)) ?? keys[0] ?? ""
          return { label: (r[titleKey] ?? "").trim(), url: (r[urlKey] ?? "").trim() }
        })
        .filter(r => r.url)
      setLinkExcelRows(parsed)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ""
  }

  // ── teacher notifications ────────────────────────────────────────────────────
  const [tNotifForm, setTNotifForm] = useState<{ type: NotifType; title: string; message: string; classId: string; selectedStudentIds: string[]; scheduleDate: string; scheduleTime: string }>({
    type: "announcement", title: "", message: "", classId: "", selectedStudentIds: [], scheduleDate: "", scheduleTime: "09:00",
  })
  const [tNotifSending,        setTNotifSending]        = useState(false)
  const [tNotifMsg,            setTNotifMsg]            = useState("")
  const [tNotifError,          setTNotifError]          = useState("")
  const [tNotifClassStudents,  setTNotifClassStudents]  = useState<DbStudent[]>([])
  const [tNotifHistory,        setTNotifHistory]        = useState<Array<{ id: string; type: string; title: string; message: string; target_label: string; scheduled_at: string | null; created_at: string }>>([])
  const [tNotifHistoryLoaded,  setTNotifHistoryLoaded]  = useState(false)
  const [tNotifStudentsLoading,setTNotifStudentsLoading]= useState(false)
  const [tNotifStudentSearch,  setTNotifStudentSearch]  = useState("")

  // ── timetable ────────────────────────────────────────────────────────────────
  type TimetableSlot = { day: string; period: number; subject: string; teacher_id: string | null; teacher_name: string | null; start_time: string; end_time: string }
  type TeacherClass = { id: string; grade: number; section: string; name: string | null; subjects: string[]; timetable: TimetableSlot[]; timetable_updated_by_name: string | null; timetable_updated_at: string | null }
  const [ttClasses, setTtClasses] = useState<TeacherClass[]>([])
  const [ttClassId, setTtClassId] = useState("")
  const [ttSlots, setTtSlots] = useState<TimetableSlot[]>([])
  const [ttPeriodTimes, setTtPeriodTimes] = useState<Record<number, { start: string; end: string }>>({})
  const [ttSaving, setTtSaving] = useState(false)
  const [ttMsg, setTtMsg] = useState("")
  const [ttLoading, setTtLoading] = useState(false)
  const [ttUpdatedBy, setTtUpdatedBy] = useState<string | null>(null)
  const [ttUpdatedAt, setTtUpdatedAt] = useState<string | null>(null)

  // ── submission tracking ──────────────────────────────────────────────────────
  interface Submission { student_name: string; code: string; language: string; submitted_at: string }
  const [submissionsMap,     setSubmissionsMap]     = useState<Record<string, Submission[]>>({})
  const [submissionsLoading, setSubmissionsLoading] = useState<Record<string, boolean>>({})
  const [expandedSubs,       setExpandedSubs]       = useState<Set<string>>(new Set())
  const [expandedCode,       setExpandedCode]       = useState<{ challengeId: string; idx: number } | null>(null)

  // Close whichever modal is open when the user presses Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      if (certDeleteConfirm) { setCertDeleteConfirm(null); return }
      if (certIssueOpen) { setCertIssueOpen(false); setCertIssueTemplate(null); return }
      if (confirmRemove) { setConfirmRemove(null); return }
      if (viewerItem) { setViewerItem(null); return }
      if (showStudentModal) { setShowStudentModal(false); setStudentResult(null); return }
      if (showBulkModal) { setShowBulkModal(false); return }
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [certDeleteConfirm, certIssueOpen, confirmRemove, viewerItem, showStudentModal, showBulkModal])

  // When problem modal opens: ensure classes are loaded and pre-select all
  useEffect(() => {
    if (!showProblemModal) return
    if (ttClasses.length === 0) {
      getTeacherClasses().then(res => {
        if (!("error" in res)) setTtClasses(res.classes)
      })
    }
    // Pre-select all available classes
    const allIds = ttClasses.length > 0
      ? new Set(ttClasses.map(c => c.id))
      : myClass ? new Set([myClass.id]) : new Set<string>()
    setProblemClassIds(allIds)
  }, [showProblemModal])

  // Load real challenges from backend
  useEffect(() => {
    setProblemsLoading(true)
    getActiveChallenges().then(res => {
      setProblemsLoading(false)
      if ("error" in res) return
      setProblemStatements(res.challenges)
    })
  }, [user?.id])

  // Load quizzes for selected class
  useEffect(() => {
    if (!quizClassId) return
    setQuizzesLoading(true)
    getMyQuizzesForClass(quizClassId).then(res => {
      setQuizzesLoading(false)
      if ("error" in res) return
      setQuizzes(res.quizzes)
    })
  }, [quizClassId])

  const loadAllSubmissions = (challenges: CodeChallenge[]) => {
    if (challenges.length === 0) return
    const loadingState: Record<string, boolean> = {}
    challenges.forEach(c => { loadingState[c._id] = true })
    setSubmissionsLoading(prev => ({ ...prev, ...loadingState }))
    challenges.forEach(c => {
      getChallengeSubmissions(c._id).then(res => {
        setSubmissionsLoading(prev => ({ ...prev, [c._id]: false }))
        if ("error" in res) return
        setSubmissionsMap(prev => ({ ...prev, [c._id]: res.submissions }))
      })
    })
  }

  useEffect(() => {
    if (problemStatements.length === 0) return
    loadAllSubmissions(problemStatements)
  }, [problemStatements])

  useEffect(() => {
    if (view === "problem-statements" && problemStatements.length > 0) {
      loadAllSubmissions(problemStatements)
    }
    // Ensure ttClasses is loaded when quizzes/certs view opens (for class picker)
    if ((view === "quizzes" || view === "certificates") && ttClasses.length === 0) {
      getTeacherClasses().then(res => {
        if (!("error" in res)) {
          setTtClasses(res.classes)
          if (view === "quizzes" && res.classes.length > 0) setQuizClassId(id => id || res.classes[0].id)
          if (view === "certificates" && res.classes.length > 0) loadCertClass(res.classes[0].id)
        }
      })
    }
    // Load cert template settings when certs view opens
    if (view === "certificates" && !certTmplLoaded) {
      getCertTemplate().then(res => {
        setCertTmplLoaded(true)
        if (!("error" in res)) setCertTemplate(res.template)
      })
    }
  }, [view])

  // Reset period status when lesson changes
  useEffect(() => { setPeriodDone(false); setPdfMsg("") }, [selectedLesson.id])


  const handleDownloadPdf = async () => {
    setPdfLoading(true); setPdfMsg("")
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"}/api/reports/activity-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lesson_title: selectedLesson.title, chapter: selectedLesson.chapter }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a"); a.href = url; a.download = `${selectedLesson.title}.pdf`; a.click()
        URL.revokeObjectURL(url)
      } else { setPdfMsg("PDF ready — check downloads folder.") }
    } catch { setPdfMsg("PDF download coming soon.") }
    setPdfLoading(false)
  }

  // Refresh working hours for the given offset (0 = this week, -1 = last week, etc.)
  function refreshWeekActivity(offset = weekOffset) {
    getWeekActivity(offset).then(res => {
      if ("error" in res) return
      setWeekHours(res.week.map(d => ({ day: d.day, hours: d.hours, isToday: d.isToday ?? false })))
      setWeekTotalHours(res.totalHours)
      setWeekLabel(res.weekLabel)
    })
  }

  // Reload when offset changes
  useEffect(() => { refreshWeekActivity(weekOffset) }, [weekOffset, user?.id])

  // Load today's upcoming classes from the real timetable
  useEffect(() => {
    if (!user?.id) return
    setUpcomingClassesLoading(true)
    getTeacherClasses().then(res => {
      setUpcomingClassesLoading(false)
      if ("error" in res) return

      const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
      const todayName = DAY_NAMES[new Date().getDay()]
      const nowMins   = new Date().getHours() * 60 + new Date().getMinutes()
      const toMins    = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m }

      const upcoming: UpcomingClass[] = []
      for (const cls of res.classes) {
        for (const slot of cls.timetable) {
          if (slot.day !== todayName) continue
          if (slot.teacher_id !== user.id) continue
          if (toMins(slot.start_time) <= nowMins) continue
          upcoming.push({
            subject:    slot.subject,
            className:  cls.name ?? `Grade ${cls.grade}${cls.section}`,
            period:     slot.period,
            start_time: slot.start_time,
            end_time:   slot.end_time,
          })
        }
      }
      upcoming.sort((a, b) => toMins(a.start_time) - toMins(b.start_time))
      setUpcomingClasses(upcoming.slice(0, 4))
    })
  }, [user?.id])

  // Load teacher's assigned class + students from backend
  useEffect(() => {
    async function load() {
      setLoadingStudents(true)
      const res = await getMyClass()
      if (!("error" in res)) {
        setMyClass(res.class)
        if (res.class) setTeacherClasses([res.class])
        setStudents(res.students.map(s => ({ ...s, email: "", class_id: res.class?.id ?? null })))
        // Fetch course progress — lightweight (2 queries only)
        if (res.class?.id) {
          setProgressLoading(true)
          getStudentProgress(res.class.id).then(pr => {
            setProgressLoading(false)
            if ("error" in pr) return
            const map: Record<string, StudentProgressRow> = {}
            pr.progress.forEach(p => { map[p.student_id] = p })
            setStudentProgress(map)
          })
        }
      }
      setLoadingStudents(false)
    }
    load()
  }, [user?.id])

  const loadStudents = async () => {
    setLoadingStudents(true)
    const res = await getMyClass()
    if (!("error" in res)) {
      setMyClass(res.class)
      setStudents(res.students.map(s => ({ ...s, email: "", class_id: res.class?.id ?? null })))
    }
    setLoadingStudents(false)
  }

  useEffect(() => { if (view === "students") loadStudents() }, [view, schoolId, teacherClassId])


  // Sync teacher settings form from user object
  useEffect(() => {
    if (user) setTeacherSettingsForm({ name: user.name ?? "", phone: user.phone ?? "", email: user.email ?? "" })
  }, [user?.id])

  // Load teacher's classes when entering attendance or lessons view (if not already loaded)
  useEffect(() => {
    if ((view !== "attendance" && view !== "lessons") || ttClasses.length > 0) return
    getTeacherClasses().then(res => {
      if ("error" in res) return
      setTtClasses(res.classes)
      if (view === "lessons" && res.classes.length > 0) {
        setLessonClassId(c => c || res.classes[0].id)
      }
      if (view === "attendance" && res.classes.length > 0) {
        setAttendanceClassId(c => c || res.classes[0].id)
        setAttStatsClassId(c => c || res.classes[0].id)
      }
    })
  }, [view])

  // Auto-select first class when each view opens and classes are already loaded
  useEffect(() => {
    if (view === "lessons" && ttClasses.length > 0 && !lessonClassId) {
      setLessonClassId(ttClasses[0].id)
    }
    if (view === "attendance" && ttClasses.length > 0 && !attendanceClassId) {
      setAttendanceClassId(ttClasses[0].id)
    }
    if (view === "attendance" && ttClasses.length > 0 && !attStatsClassId) {
      setAttStatsClassId(ttClasses[0].id)
    }
    if (view === "quizzes" && ttClasses.length > 0 && !quizClassId) {
      setQuizClassId(ttClasses[0].id)
    }
    if (view === "certificates" && ttClasses.length > 0 && !certClassId) {
      loadCertClass(ttClasses[0].id)
    }
  }, [view, ttClasses])

  // Load modules when a subject is selected
  useEffect(() => {
    if (!lessonSubject || !lessonClassId) return
    const key = `${lessonClassId}::${lessonSubject}`
    if (key === modulesSubjectKey) return
    setModulesLoading(true)
    setModules([])
    getModules(lessonClassId, lessonSubject).then(res => {
      setModulesLoading(false)
      if ("error" in res) return
      setModules(res.modules)
      setModulesSubjectKey(key)
      // Update count for this subject in the grid
      setSubjectModuleCounts(prev => ({ ...prev, [lessonSubject]: res.modules.length }))
    })
  }, [lessonSubject, lessonClassId])

  // Fetch module counts for all subjects when class is selected (for subject grid cards)
  useEffect(() => {
    if (!lessonClassId) return
    getModuleCounts(lessonClassId).then(counts => setSubjectModuleCounts(counts))
  }, [lessonClassId])

  // All file items are loaded as blob URLs — removes auth tokens from URLs entirely
  useEffect(() => {
    if (!viewerItem) {
      if (viewerBlobUrl) { URL.revokeObjectURL(viewerBlobUrl); setViewerBlobUrl(null) }
      return
    }
    if (viewerItem.type !== "file") { setViewerBlobUrl(null); return }

    let cancelled = false
    let created: string | null = null
    setViewerBlobLoading(true)
    setViewerBlobUrl(null)
    fetchAsBlobUrl(getViewerUrl(viewerItem)).then(url => {
      if (cancelled) { URL.revokeObjectURL(url); return }
      created = url
      setViewerBlobUrl(url)
    }).catch(() => {}).finally(() => { if (!cancelled) setViewerBlobLoading(false) })
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created) }
  }, [viewerItem])

  // Load students + existing records when class+period are selected
  useEffect(() => {
    if (view !== "attendance" || !attendanceClassId || !attendancePeriod) return
    setAttendanceStudentsLoading(true)
    setAttendanceRecords([])
    setAttendanceError("")

    // fetch students for the selected class via teacher-accessible route
    getClassStudents(attendanceClassId).then(async stuRes => {
      setAttendanceStudentsLoading(false)
      if ("error" in stuRes) { setAttendanceError("Failed to load students"); return }
      const defaults: AttendanceRecord[] = stuRes.students
        .map(s => ({ id: s.id, name: s.name, todayStatus: "present" as const }))

      // try to load existing attendance for this period
      const attRes = await getAttendance(attendanceClassId, attendanceDate, attendancePeriod as number)
      if (!("error" in attRes) && attRes.attendance?.records?.length) {
        const saved = new globalThis.Map(attRes.attendance.records.map(r => [r.student_id, r.status]))
        setAttendanceRecords(defaults.map(d => ({ ...d, todayStatus: (saved.get(d.id) as "present" | "absent" | "late") ?? "present" })))
      } else {
        setAttendanceRecords(defaults)
      }
    })
  }, [view, attendanceClassId, attendancePeriod, attendanceDate])

  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchStudents.toLowerCase()))

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault()
    setStudentError(""); setStudentResult(null); setStudentLoading(true)
    const classId = studentForm.class_id || myClass?.id || (teacherClasses[0]?.id ?? "")
    const res = await addStudent({ ...studentForm, class_id: classId, school_id: user?.school_id ?? "" })
    setStudentLoading(false)
    if (res.error) { setStudentError(res.error); return }
    setStudentResult({ username: res.username!, temp_password: res.temp_password! })
    setStudentForm({ name: "", email: "", phone: "", roll_no: "", class_id: "" })
    loadStudents()
  }

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setBulkRows(parseStudentCSV(ev.target?.result as string)) }
    reader.readAsText(file)
  }

  async function handleBulkImport() {
    const classId = bulkClassId || myClass?.id || (teacherClasses[0]?.id ?? "")
    if (!bulkRows.length || !classId) return
    setBulkLoading(true); setBulkResults([])
    const res = await bulkAddStudents({ students: bulkRows, class_id: classId, school_id: user?.school_id ?? "" })
    setBulkLoading(false)
    setBulkResults(res.results ?? [])
    loadStudents()
  }

  async function handleSaveAttendance() {
    if (!attendanceClassId || !attendancePeriod) { setAttendanceError("Select a class and period first."); return }
    if (!attendanceRecords.length) { setAttendanceError("No students to mark attendance for."); return }
    const attClass = ttClasses.find(c => c.id === attendanceClassId)
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" })
    const slotSubject = attClass?.timetable.find(s => s.period === attendancePeriod && s.day === today)?.subject ?? ""
    setAttendanceSaving(true); setAttendanceError(""); setAttendanceSavedMsg("")
    const res = await saveAttendance({
      class_id: attendanceClassId, date: attendanceDate,
      period: attendancePeriod as number, subject: slotSubject,
      records: attendanceRecords.map(s => ({ student_id: s.id, student_name: s.name, status: s.todayStatus })),
    })
    setAttendanceSaving(false)
    if ("error" in res) { setAttendanceError(res.error || "Failed to save"); return }
    setAttendanceSavedMsg("Attendance saved!")
    setTimeout(() => setAttendanceSavedMsg(""), 3000)
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSettingsSaving(true); setSettingsMsg("")
    const res = await updateProfile({ name: teacherSettingsForm.name, phone: teacherSettingsForm.phone })
    setSettingsSaving(false)
    if ("error" in res) { setSettingsMsg("Error saving settings."); return }
    setSettingsMsg("Settings saved!")
    setTimeout(() => setSettingsMsg(""), 3000)
  }

  async function handleRemoveStudent() {
    if (!confirmRemove) return
    setRemoveLoading(true)
    await removeUser(confirmRemove.id)
    setRemoveLoading(false)
    setConfirmRemove(null)
    loadStudents()
  }

  const VIEW_MAP: Record<string, View> = {
    "Dashboard": "dashboard", "Lessons": "lessons",
    "Timetable": "timetable",
    "Attendance": "attendance", "Students": "students", "Quizzes": "quizzes",
    "Homework": "homework", "Marks": "marks",
    "Live Code": "problem-statements",
    "Certificates": "certificates", "AI assistant": "ai",
    "Notifications": "notifications", "Sunday Sync": "sunday-sync",
    "Settings": "settings",
  }

  // Load teacher classes whenever a view that needs them is shown and they haven't been fetched yet
  useEffect(() => {
    if ((view === "notifications" || view === "timetable" || view === "lessons") && ttClasses.length === 0) {
      getTeacherClasses().then(res => {
        if (!("error" in res)) setTtClasses(res.classes)
      })
    }
  }, [view])

  const navItemsWithClick = NAV_ITEMS.map(item => ({
    ...item,
    path: `#${VIEW_MAP[item.label] ?? item.label.toLowerCase().replace(/\s+/g, "-")}`,
    onClick: () => { if (VIEW_MAP[item.label]) { setView(VIEW_MAP[item.label]); if (VIEW_MAP[item.label] !== "lessons") setLessonSubject(null) } },
  }))

  const sendChat = async (text?: string) => {
    const msg = text || chatInput
    if (!msg.trim() || aiLoading) return
    setChatMessages(m => [...m, { role: "user", text: msg }])
    setChatInput("")
    setAiLoading(true)
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
      const res = await fetch(`${backendUrl}/api/ai/lesson-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question: msg,
          context: `${selectedLesson.title} · ${selectedLesson.chapter}${myClass ? ` · ${myClass.label}` : ""}`,
          language: showHindi ? "hindi" : "english",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "AI error")
      setChatMessages(m => [...m, { role: "ai", text: data.answer }])
    } catch {
      setChatMessages(m => [...m, { role: "ai", text: "Sorry, I couldn't connect to the AI assistant right now. Please check your connection and try again." }])
    } finally { setAiLoading(false) }
  }



  const statusColors: Record<string, string> = { taught: "var(--ts-green)", in_progress: "var(--ts-blue)", not_started: "var(--ts-neutral)" }
  const statusLabel: Record<string, string>  = { taught: "Taught", in_progress: "In progress", not_started: "Not started" }
  const statusBg: Record<string, string>     = { taught: "bg-ts-green-light", in_progress: "bg-ts-blue-light", not_started: "bg-muted" }
  const statusText: Record<string, string>   = { taught: "text-ts-green-dark", in_progress: "text-ts-blue-dark", not_started: "text-muted-foreground" }

  // ── computed attendance summary ─────────────────────────────────────────────
  const presentCount = attendanceRecords.filter(r => r.todayStatus === "present").length
  const absentCount  = attendanceRecords.filter(r => r.todayStatus === "absent").length
  const lateCount    = attendanceRecords.filter(r => r.todayStatus === "late").length

  // ── today index — Mon-indexed (0=Mon…6=Sun); backend marks isToday on the correct entry
  const todayDayIdx = weekHours.findIndex(d => d.isToday)

  // ── current date string ─────────────────────────────────────────────────────
  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  // ── teacher first name ──────────────────────────────────────────────────────
  const firstName = user?.name?.split(" ")[0] ?? "Teacher"

  // ── working hours totals ────────────────────────────────────────────────────
  const totalHours = weekTotalHours
  const maxHours   = Math.max(...weekHours.map(d => d.hours), 1)

  // ── diff badge color for difficulty ────────────────────────────────────────
  function diffColor(d: string) {
    if (d === "Easy")   return "bg-ts-green-light text-ts-green-dark"
    if (d === "Medium") return "bg-ts-amber-light text-ts-amber-dark"
    return "bg-ts-red-light text-ts-red"
  }

  // ── quiz creator helpers ────────────────────────────────────────────────────
  function resetQuizCreator() {
    setShowQuizCreator(false)
    setNewQuizTitle("")
    setNewQuizDeadline("")
    setNewQuizShuffle(false)
    setNewQuizQuestions([{ q: "", options: ["", "", "", ""], correct: 0 }])
    setQuizCreatorTab("manual")
    setPasteText("")
    setParsedQuestions([])
    setPasteError("")
    setQuizError("")
    setShowFormatHelper(false)
  }
  function addQuizQuestion() {
    if (newQuizQuestions.length >= 20) return
    setNewQuizQuestions(q => [...q, { q: "", options: ["", "", "", ""], correct: 0 }])
  }
  function duplicateQuestion(idx: number) {
    if (newQuizQuestions.length >= 20) return
    setNewQuizQuestions(qs => {
      const copy = { ...qs[idx], options: [...qs[idx].options] }
      const next = [...qs]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }
  function removeQuestion(idx: number) {
    if (newQuizQuestions.length <= 1) return
    setNewQuizQuestions(qs => qs.filter((_, i) => i !== idx))
  }
  function updateQuestion(idx: number, value: string) {
    setNewQuizQuestions(qs => qs.map((q, i) => i === idx ? { ...q, q: value } : q))
  }
  function updateOption(qIdx: number, oIdx: number, value: string) {
    setNewQuizQuestions(qs => qs.map((q, i) => i === qIdx ? { ...q, options: q.options.map((o, j) => j === oIdx ? value : o) } : q))
  }
  function setCorrect(qIdx: number, oIdx: number) {
    setNewQuizQuestions(qs => qs.map((q, i) => i === qIdx ? { ...q, correct: oIdx } : q))
  }
  function parseFromText(text: string) {
    setPasteError("")
    setParsedQuestions([])
    if (!text.trim()) { setPasteError("Paste your questions first."); return }

    const blocks = text.split(/\n\s*\n/).filter(b => b.trim())
    const result: Array<{ q: string; options: string[]; correct: number }> = []

    for (let bi = 0; bi < blocks.length; bi++) {
      const lines = blocks[bi].split("\n").map(l => l.trim()).filter(l => l)
      if (lines.length < 3) continue

      const qText = lines[0].replace(/^\d+[\.\)]\s*/, "").trim()
      if (!qText) continue

      const options: string[] = []
      let correct = 0

      for (let li = 1; li < lines.length && options.length < 4; li++) {
        const line = lines[li]
        const stripped = line.replace(/^[a-dA-D1-4][\.\)]\s*/, "").trim()
        const isCorrect = stripped.endsWith("*")
        const optText = stripped.replace(/\s*\*\s*$/, "").trim()
        if (optText) {
          if (isCorrect) correct = options.length
          options.push(optText)
        }
      }

      if (options.length < 2) {
        setPasteError(`Question ${bi + 1}: Need at least 2 options. Mark the correct one with * at the end.`)
        return
      }
      while (options.length < 4) options.push("")
      result.push({ q: qText, options, correct })
    }

    if (result.length === 0) { setPasteError("Could not parse any questions. Check the format example."); return }
    if (result.length > 20) { setPasteError(`Too many questions (${result.length}). Maximum 20 per quiz.`); return }
    setParsedQuestions(result)
  }
  function parsePasteText() { parseFromText(pasteText) }
  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileLoading(true)
    setPasteError("")
    setParsedQuestions([])
    try {
      let text = ""
      if (file.name.toLowerCase().endsWith(".txt")) {
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsText(file)
        })
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        // dynamically imported — only loaded when a .docx is actually uploaded
        const mammoth = await import("mammoth")
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value
      }
      if (text.trim()) {
        setPasteText(text)
        parseFromText(text)
      } else {
        setPasteError("Could not read the file. Make sure it contains questions in the required format.")
      }
    } catch {
      setPasteError("Failed to read the file. Try copying and pasting the text manually.")
    }
    setFileLoading(false)
    e.target.value = ""
  }
  function applyParsedQuestions() {
    setNewQuizQuestions(parsedQuestions)
    setQuizCreatorTab("manual")
    setPasteText("")
    setParsedQuestions([])
    setPasteError("")
  }
  async function handleSaveQuiz() {
    if (!quizClassId) { setQuizError("Select a class before creating a quiz."); return }
    if (!newQuizTitle.trim()) { setQuizError("Quiz title is required."); return }
    const incomplete = newQuizQuestions.find(q => !q.q.trim() || q.options.filter(o => o.trim()).length < 2)
    if (incomplete) { setQuizError("All questions need text and at least 2 options filled in."); return }
    setQuizError(""); setQuizSaving(true)
    const res = await createQuiz({
      title:            newQuizTitle.trim(),
      class_id:         quizClassId,
      deadline:         newQuizDeadline || null,
      shuffle_on_retry: newQuizShuffle,
      questions:        newQuizQuestions.map(q => ({
        text:          q.q,
        options:       q.options.filter(o => o.trim()) as [string, string, string, string],
        correct_index: q.correct,
      })),
    })
    setQuizSaving(false)
    if ("error" in res) { setQuizError(res.error || "Failed to save quiz. Please try again."); return }
    setQuizzes(qs => [res.quiz, ...qs])
    resetQuizCreator()
    setPushedToast(`Quiz "${res.quiz.title}" pushed to students! 🚀`)
    setTimeout(() => setPushedToast(null), 3500)
  }
  async function handleUpdateDeadline(quizId: string) {
    setDeadlineUpdating(true)
    const res = await updateQuizDeadline(quizId, editingDeadlineVal || null)
    setDeadlineUpdating(false)
    if ("error" in res) return
    setQuizzes(qs => qs.map(q => q._id === quizId ? { ...q, deadline: res.quiz.deadline } : q))
    setEditingDeadlineId(null)
    setEditingDeadlineVal("")
  }
  // ── certificate helpers ───────────────────────────────────────────────────
  async function handleSaveCertTemplate() {
    setCertTmplSaving(true)
    const res = await saveCertTemplate({ school_name: certTemplate.school_name, description: certTemplate.description, footer_left: certTemplate.footer_left, footer_right: certTemplate.footer_right, accent_color: certTemplate.accent_color })
    setCertTmplSaving(false)
    if (!("error" in res)) { setCertTmplSaved(true); setTimeout(() => setCertTmplSaved(false), 2500) }
  }
  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCertLogoUploading(true)
    await uploadCertLogo(file)
    // Re-fetch template so logo_base64 is updated and preview refreshes
    const res = await getCertTemplate()
    if (!("error" in res)) setCertTemplate(res.template)
    setCertLogoUploading(false)
    e.target.value = ""
  }

  async function handleLogoRemove() {
    setCertLogoRemoving(true)
    await removeCertLogo()
    setCertTemplate(t => ({ ...t, logo_gridfs_id: null, logo_base64: null, logo_mime: null }))
    setCertLogoRemoving(false)
  }
  async function handleBulkDownload(moduleId: string) {
    if (!certClassId) return
    setCertBulkLoading(moduleId)
    bulkDownloadCerts(certClassId, moduleId)
    setTimeout(() => setCertBulkLoading(null), 5000)
  }

  async function handleIssueCerts() {
    if (!certClassId || certSelectedIds.size === 0 || !certIssueTitle.trim()) return
    setCertIssueLoading(true)
    setCertIssueError("")
    const res = await issueCertificates({
      class_id:      certClassId,
      student_ids:   Array.from(certSelectedIds),
      custom_title:  certIssueTitle.trim(),
      custom_reason: certIssueReason.trim() || undefined,
      cert_template: certIssueTemplate ?? undefined,
    })
    setCertIssueLoading(false)
    if ("error" in res) { setCertIssueError(res.error); return }
    setCertCustomCerts(prev => [...prev, ...res.certificates])
    setCertIssueOpen(false)
    setCertIssueTitle("")
    setCertIssueReason("")
    setCertIssueTemplate(null)
    setCertSelectedIds(new Set())
  }

  async function handleRevokeCert(certId: string) {
    if (!confirm("Revoke this custom certificate? This cannot be undone.")) return
    setCertRevoking(certId)
    const res = await revokeCustomCert(certId)
    setCertRevoking(null)
    if (!("error" in res)) {
      setCertCustomCerts(prev => prev.filter(c => c._id !== certId))
    }
  }

  async function handleBulkDeleteCerts() {
    if (certBulkIds.size === 0) return
    setCertBulkDeleting(true)
    const ids = Array.from(certBulkIds)
    const results = await Promise.allSettled(ids.map(id => revokeCustomCert(id)))
    const deletedIds = new Set(
      ids.filter((_, i) => results[i].status === "fulfilled" && !("error" in (results[i] as PromiseFulfilledResult<{ success: boolean } | { error: string }>).value))
    )
    setCertCustomCerts(prev => prev.filter(c => !deletedIds.has(c._id)))
    setCertBulkIds(new Set())
    setCertBulkDeleting(false)
    setCertBulkConfirm(false)
  }

  async function handleDeleteModuleCert() {
    if (!certDeleteConfirm) return
    setCertModuleDeleting(certDeleteConfirm.certId)
    const res = await deleteCert(certDeleteConfirm.certId)
    setCertModuleDeleting(null)
    setCertDeleteConfirm(null)
    if (!("error" in res)) {
      setCertModules(prev => prev.map(mod => ({
        ...mod,
        certificates: mod.certificates.filter(c => c._id !== certDeleteConfirm.certId),
      })))
    }
  }
  async function openDeleteModuleConfirm(id: string, title: string) {
    setModuleDeleteConfirm({ id, title, certificateCount: null })
    const res = await getModuleDeleteImpact(id)
    setModuleDeleteConfirm(prev =>
      prev && prev.id === id
        ? { ...prev, certificateCount: "error" in res ? 0 : res.certificate_count }
        : prev
    )
  }

  async function handleConfirmDeleteModule() {
    if (!moduleDeleteConfirm) return
    setModuleDeleteLoading(true)
    const id = moduleDeleteConfirm.id
    await deleteModule(id)
    setModules(m => m.filter(mod => mod._id !== id))
    setModuleDeleteLoading(false)
    setModuleDeleteConfirm(null)
  }

  function loadCertClass(classId: string) {
    setCertClassId(classId)
    setCertModulesLoading(true)
    setCertCustomCerts([])
    setCertSelectedIds(new Set())
    setCertBulkIds(new Set())
    setCertBulkConfirm(false)
    setCertShowEmpty(false)
    setCertShowRemoved(false)
    Promise.all([
      getCertsByClass(classId),
      getClassStudents(classId),
    ]).then(([certsRes, studentsRes]) => {
      setCertModulesLoading(false)
      if (!("error" in certsRes)) {
        setCertModules(certsRes.modules)
        setCertCustomCerts(certsRes.custom_certificates ?? [])
        setCertRemovedModules(certsRes.removed_modules ?? [])
      }
      if (!("error" in studentsRes)) {
        setCertClassStudents(studentsRes.students.filter(s => s.is_active).map(s => ({ id: s.id, name: s.name })))
      }
    })
  }

  async function handleDeleteQuiz(id: string) {
    if (!confirm("Delete this quiz? Students will no longer see it.")) return
    const res = await deleteQuiz(id)
    if ("error" in res) { setQuizError(res.error || "Failed to save quiz. Please try again."); return }
    setQuizzes(qs => qs.filter(q => q._id !== id))
  }
  async function handleViewQuizResults(quizId: string) {
    setSelectedQuizId(quizId)
    setView("quiz-results")
    setQuizResultsLoading(true)
    const res = await getQuizResults(quizId)
    setQuizResultsLoading(false)
    if ("error" in res) return
    setQuizResultsData(res.results)
  }

  // ── problem statement helpers ───────────────────────────────────────────────
  async function handleDeleteProblemGroup(ids: string[], title: string) {
    if (!confirm(`Delete "${title}"? Students will no longer see it.`)) return
    for (const id of ids) {
      const res = await deleteChallenge(id)
      if ("error" in res) { setProblemError(res.error || "Failed to save challenge. Please try again."); return }
    }
    setProblemStatements(ps => ps.filter(p => !ids.includes(p._id)))
  }
  async function handleCreateProblem(e: React.FormEvent) {
    e.preventDefault()
    if (problemClassIds.size === 0) { setProblemError("Select at least one class to push to."); return }
    setProblemError("")
    const created: CodeChallenge[] = []
    for (const classId of problemClassIds) {
      const res = await createChallenge({
        title:           newProblem.title,
        class_id:        classId,
        difficulty:      newProblem.difficulty,
        language:        newProblem.language,
        description:     newProblem.description,
        constraints:     newProblem.constraints,
        expected_output: newProblem.expectedOutput,
        deadline:        newProblem.deadline || undefined,
      })
      if ("error" in res) { setProblemError(res.error || "Failed to save challenge. Please try again."); return }
      created.push(res.challenge)
    }
    setProblemStatements(ps => [...created, ...ps])
    setNewProblem({ title: "", difficulty: "Easy", language: "javascript", description: "", constraints: "", expectedOutput: "", deadline: "" })
    setProblemClassIds(new Set())
    setShowProblemModal(false)
    const classCount = created.length
    setPushedToast(`"${created[0].title}" pushed to ${classCount} class${classCount > 1 ? "es" : ""}! 🚀`)
    setTimeout(() => setPushedToast(null), 3500)
  }

  return (
    <DashboardLayout role="teacher" userName={user?.name ?? "Teacher"} userSubtitle="Teacher" activeView={view} navItems={navItemsWithClick}
      onClockIn={refreshWeekActivity} onClockOut={refreshWeekActivity}>

      {/* ═══════════════════════════════════════════════════════════════════════
          DASHBOARD VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "dashboard" && (
        <div className="flex flex-col gap-5">

          {/* Row 1 — Welcome header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome back, {firstName} 👋</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
          </div>

          {/* Row 2 — Hero banner + Profile card */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Hero banner — 60% */}
            <div
              className="md:col-span-3 rounded-2xl p-6 text-white relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg,#534AB7 0%,#7C3AED 50%,#a855f7 100%)",
                animationDelay: "0ms",
              }}
            >
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle at 80% 20%,#fff 0%,transparent 60%)" }} />
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-widest opacity-75">Class Performance</p>
                <button
                  className="opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                  disabled={progressLoading}
                  onClick={() => {
                    if (!myClass?.id) return
                    setProgressLoading(true)
                    getStudentProgress(myClass.id).then(pr => {
                      setProgressLoading(false)
                      if ("error" in pr) return
                      const map: Record<string, StudentProgressRow> = {}
                      pr.progress.forEach(p => { map[p.student_id] = p })
                      setStudentProgress(map)
                    })
                  }}
                  title="Refresh progress"
                >
                  <svg className={`w-3 h-3 text-white ${progressLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <h2 className="text-xl font-bold leading-snug mb-3">
                {progressLoading
                  ? <span className="inline-block bg-white/20 rounded animate-pulse w-64 h-7" />
                  : Object.keys(studentProgress).length > 0
                    ? <>Your students' avg course progress is <span className="text-yellow-300">{Math.round(Object.values(studentProgress).reduce((s, p) => s + p.course, 0) / Object.keys(studentProgress).length)}%</span>.<br />Keep pushing challenges to boost their score!</>
                    : <>Welcome back, {firstName}!<br />Push a challenge or quiz to get started.</>
                }
              </h2>
              <div className="flex gap-3 flex-wrap">
                <Button
                  size="sm"
                  className="rounded-full text-xs font-semibold bg-white text-purple-700 hover:bg-yellow-100 transition-all"
                  onClick={() => setView("problem-statements")}
                >
                  Push Problem
                </Button>
                <Button
                  size="sm"
                  className="rounded-full text-xs font-semibold bg-purple-800/60 text-white hover:bg-purple-800/80 transition-all"
                  onClick={() => setView("quizzes")}
                >
                  Create Quiz
                </Button>
              </div>
              {/* floating emoji */}
              <span className="absolute right-6 top-4 text-4xl float-emoji-1 pointer-events-none">🚀</span>
              <span className="absolute right-16 bottom-4 text-2xl float-emoji-3 pointer-events-none">⭐</span>
            </div>

            {/* Profile card — 40% */}
            <div
              className="md:col-span-2 skillio-card p-5 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(83,74,183,0.15)]"
             
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}
                >
                  {(user?.name ?? "T").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{user?.name ?? "Teacher"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Classes</span>
                <span className="font-semibold text-foreground">{myClass ? "1 class" : "—"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Students</span>
                <span className="font-semibold text-foreground">{loadingStudents ? "…" : students.length}</span>
              </div>
              {(() => {
                try {
                  const raw = localStorage.getItem(`ts_clock_${user?.id}`)
                  const clocked = raw ? (JSON.parse(raw) as { clockedIn?: boolean }).clockedIn : false
                  return clocked ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 dot-pulse inline-block" />
                      <span className="text-[11px] text-green-600 font-medium">Clocked in</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />
                      <span className="text-[11px] text-muted-foreground">Not clocked in</span>
                    </div>
                  )
                } catch { return null }
              })()}
            </div>
          </div>

          {/* Row 3 — Working hours + My Students + Upcoming classes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Working Hours */}
            <div className="skillio-card p-5 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(83,74,183,0.15)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Working Hours</h3>
                {/* Week navigation arrows */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setWeekOffset(o => Math.max(-8, o - 1))}
                    className="min-w-[44px] min-h-[44px] rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    title="Previous week"
                    aria-label="Previous week"
                  >‹</button>
                  <span className="text-[11px] text-muted-foreground min-w-[70px] text-center">{weekLabel}</span>
                  <button
                    onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
                    disabled={weekOffset === 0}
                    className="min-w-[44px] min-h-[44px] rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next week"
                    aria-label="Next week"
                  >›</button>
                </div>
              </div>
              <div className="flex items-end gap-1.5 px-1 flex-1">
                {weekHours.map((d, i) => (
                  <WorkingHoursBar key={i} hours={d.hours} maxHours={maxHours} day={d.day} isToday={d.isToday ?? false} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
                {[
                  { label: weekLabel,  value: `${totalHours}h`,                                        color: "#534AB7" },
                  { label: weekOffset === 0 ? "Today" : "–",
                    value: weekOffset === 0 ? `${weekHours[todayDayIdx]?.hours ?? 0}h` : "–",           color: "#10b981" },
                ].map(s => (
                  <div key={s.label} className="flex flex-col items-center gap-0.5">
                    <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* My Students */}
            <div className="skillio-card p-5 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(83,74,183,0.15)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">My Students</h3>
                <button className="text-[11px] text-primary hover:underline font-medium" onClick={() => setView("students")}>View all</button>
              </div>
              {loadingStudents ? (
                <div className="flex-1 flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                </div>
              ) : students.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-6 gap-2">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Users className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">No students in your class yet.</p>
                  <button onClick={() => setView("students")} className="text-[11px] text-primary font-semibold hover:underline">Add students →</button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1">
                  {students.slice(0, 4).map((st) => (
                    <div key={st.id} className="flex items-center gap-2.5">
                      <StudentAvatar name={st.name} size={32} photoUrl={st.profile_photo_url} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate block">{st.name}</span>
                        <span className="text-[10px] text-muted-foreground">{st.username ?? "—"}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${st.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>
                        {st.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))}
                  {students.length > 4 && (
                    <button onClick={() => setView("students")} className="text-[11px] text-primary font-medium hover:underline text-center mt-1">
                      +{students.length - 4} more →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Upcoming classes */}
            <div className="skillio-card p-5 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(83,74,183,0.15)]">
              <h3 className="text-sm font-semibold text-foreground">Upcoming Classes Today</h3>
              <div className="flex flex-col gap-3 flex-1">
                {upcomingClassesLoading ? (
                  <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                  </div>
                ) : upcomingClasses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-4 gap-1 text-center">
                    <p className="text-xs font-semibold text-foreground">No more classes today</p>
                    <p className="text-[10px] text-muted-foreground">All periods for today are done</p>
                  </div>
                ) : (
                  upcomingClasses.map((cls, i) => {
                    const [h, m] = cls.start_time.split(":").map(Number)
                    const ampm = h >= 12 ? "PM" : "AM"
                    const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
                    const timeLabel = `${h12}:${String(m).padStart(2,"0")} ${ampm}`
                    return (
                      <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0"
                          style={{ background: "#534AB7" }}>
                          P{cls.period}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground leading-tight">{cls.subject}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{cls.className} · {timeLabel}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Row 4 — Student Progress table + Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

            {/* Full student table */}
            <div className="md:col-span-3 skillio-card overflow-hidden flex flex-col">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Student Progress</h3>
                <button className="text-[11px] text-primary font-medium hover:underline" onClick={() => setView("students")}>See all</button>
              </div>
              <div className="overflow-x-auto flex-1">
                {loadingStudents ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs">Loading students…</span>
                  </div>
                ) : students.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Users className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-xs text-muted-foreground">No students in your class yet.</p>
                    <button onClick={() => setView("students")} className="text-xs text-primary font-semibold hover:underline">Go to Students →</button>
                  </div>
                ) : (
                  <table className="w-full min-w-[400px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Student", "Username", "Progress", "Attendance"].map(h => (
                          <th key={h} className="text-left text-[11px] font-semibold text-muted-foreground px-5 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((st) => {
                        const p          = studentProgress[st.id]
                        const course     = p?.course ?? 0
                        const attendance = p?.attendance ?? null
                        return (
                          <tr key={st.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <StudentAvatar name={st.name} size={30} photoUrl={st.profile_photo_url} />
                                <p className="text-xs font-semibold text-foreground">{st.name}</p>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs text-muted-foreground font-medium">{st.username ?? "—"}</td>
                            <td className="px-5 py-3">
                              {progressLoading ? (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700"
                                      style={{ width: `${course}%`, background: "linear-gradient(to right,#534AB7,#7970D6)" }} />
                                  </div>
                                  <span className="text-[11px] text-muted-foreground font-mono">{course}%</span>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              {progressLoading ? (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              ) : attendance === null ? (
                                <span className="text-[10px] text-muted-foreground">No data</span>
                              ) : (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  attendance >= 75 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : attendance >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                  : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                }`}>{attendance}%</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="md:col-span-2 skillio-card p-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
              <div className="flex flex-col gap-2.5 flex-1">
                {[
                  { label: "Push Quiz to Class",  icon: "📤", color: "#534AB7", action: () => { setView("quizzes"); setShowQuizCreator(true) } },
                  { label: "Create Problem",        icon: "✏️", color: "#7C3AED", action: () => { setView("problem-statements"); setShowProblemModal(true) } },
                  { label: "Take Attendance",       icon: "✅", color: "#10b981", action: () => setView("attendance") },
                  { label: "Ask AI Assistant",      icon: "🤖", color: "#f59e0b", action: () => setView("ai") },
                ].map(qa => (
                  <button
                    key={qa.label}
                    onClick={qa.action}
                    className="w-full flex items-center gap-3 text-left text-xs font-semibold text-white rounded-xl px-4 py-3.5 transition-all duration-200 hover:opacity-90 hover:scale-[1.02] hover:shadow-md"
                    style={{ background: qa.color }}
                  >
                    <span className="text-base">{qa.icon}</span>
                    {qa.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          LESSONS VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "lessons" && (() => {
        const lessonClass = ttClasses.find(c => c.id === lessonClassId)
        const rawSubjects = lessonClass?.subjects?.length
          ? lessonClass.subjects
          : [...new Set((lessonClass?.timetable ?? []).map(s => s.subject).filter(Boolean))]
        const subjects = rawSubjects.length ? rawSubjects : ["Computer Science", "Mathematics", "Science", "English", "Social Science"]

        // ── module helpers ────────────────────────────────────────────────────
        async function handleCreateModule() {
          if (!lessonClassId || !lessonSubject) return
          const res = await createModule(lessonClassId, lessonSubject, newModuleTitle.trim() || undefined)
          if ("error" in res) return
          setModules(m => [...m, res.module])
          setNewModuleTitle("")
          setShowNewModuleInput(false)
        }

        async function handleRenameModule(id: string) {
          if (!renamingModuleTitle.trim()) return
          const res = await renameModule(id, renamingModuleTitle.trim())
          if ("error" in res) return
          setModules(m => m.map(mod => mod._id === id ? { ...mod, title: res.module.title } : mod))
          setRenamingModuleId(null)
        }


        async function handleMoveModule(idx: number, dir: -1 | 1) {
          const newOrder = [...modules]
          const swap = idx + dir
          if (swap < 0 || swap >= newOrder.length) return;
          [newOrder[idx], newOrder[swap]] = [newOrder[swap], newOrder[idx]]
          setModules(newOrder)
          await reorderModules(newOrder.map(m => m._id))
        }

        async function handleFileUpload(moduleId: string, files: FileList) {
          const arr = Array.from(files).slice(0, 10)
          setUploadingModuleId(moduleId)
          setUploadProgress(p => ({ ...p, [moduleId]: 0 }))
          const res = await uploadFiles(moduleId, arr)
          setUploadingModuleId(null)
          setUploadProgress(p => { const n = { ...p }; delete n[moduleId]; return n })
          if ("error" in res) { setModulesError(res.error); return }
          setModulesError("")
          setModules(m => m.map(mod => mod._id === moduleId
            ? { ...mod, items: [...mod.items, ...res.items] }
            : mod
          ))
        }

        function downloadLinkTemplate() {
          const csv = [
            "Title,URL",
            "Chapter 1 Notes,https://drive.google.com/file/d/EXAMPLE_ID/view",
            "Demo Video,https://youtu.be/EXAMPLE_ID",
            "Reference Article,https://example.com/article",
          ].join("\r\n")
          const blob = new Blob([csv], { type: "text/csv" })
          const a = document.createElement("a")
          a.href = URL.createObjectURL(blob)
          a.download = "links_template.csv"
          a.click()
          URL.revokeObjectURL(a.href)
        }


        async function handleAddLink(moduleId: string) {
          const rows = linkExcelRows.length > 0
            ? linkExcelRows
            : (linkForm.url.trim() ? [{ label: linkForm.label.trim() || linkForm.url.trim(), url: linkForm.url.trim() }] : [])
          if (rows.length === 0) return
          const mod = modules.find(m => m._id === moduleId)
          const slots = 10 - (mod?.items.length ?? 0)
          if (rows.length > slots) { setModulesError(`Only ${slots} slot(s) remaining in this module (max 10 items).`); return }
          setModulesError("")
          const addedItems: import("@/lib/moduleApi").ModuleItem[] = []
          for (const row of rows) {
            const res = await addLink(moduleId, row.label || row.url, row.url)
            if ("error" in res) { setModulesError(res.error); break }
            addedItems.push(res.item)
          }
          if (addedItems.length > 0) {
            setModules(m => m.map(md => md._id === moduleId
              ? { ...md, items: [...md.items, ...addedItems] }
              : md
            ))
          }
          setAddingLinkModuleId(null)
          setLinkForm({ label: "", url: "" })
          setLinkExcelRows([])
        }

        async function handleRenameItem(moduleId: string, itemId: string) {
          if (!renamingItemLabel.trim()) return
          const res = await renameItem(moduleId, itemId, renamingItemLabel.trim())
          if ("error" in res) return
          setModules(m => m.map(mod => mod._id === moduleId
            ? { ...mod, items: mod.items.map(it => it._id === itemId ? { ...it, label: res.item.label } : it) }
            : mod
          ))
          setRenamingItemKey(null)
        }

        async function handleDeleteItem(moduleId: string, itemId: string) {
          if (!confirm("Delete this item? This cannot be undone.")) return
          await deleteItem(moduleId, itemId)
          setModules(m => m.map(mod => mod._id === moduleId
            ? { ...mod, items: mod.items.filter(it => it._id !== itemId) }
            : mod
          ))
        }

        function handleDragStart(moduleId: string, idx: number) {
          dragSrcRef.current = { moduleId, idx }
        }

        function handleDragOver(e: React.DragEvent) {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
        }

        async function handleDrop(moduleId: string, dropIdx: number) {
          const src = dragSrcRef.current
          if (!src || src.moduleId !== moduleId || src.idx === dropIdx) return
          dragSrcRef.current = null
          const mod = modules.find(m => m._id === moduleId)
          if (!mod) return
          const newItems = [...mod.items]
          const [moved] = newItems.splice(src.idx, 1)
          newItems.splice(dropIdx, 0, moved)
          setModules(m => m.map(md => md._id === moduleId ? { ...md, items: newItems } : md))
          await reorderItems(moduleId, newItems.map(i => i._id))
        }

        return (
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
              {lessonSubject && (
                <button onClick={() => { setLessonSubject(null); setModules([]); setModulesSubjectKey("") }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                  <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  Subjects
                </button>
              )}
              <h1 className="text-base font-semibold text-foreground">
                {lessonSubject ?? "Lessons"}
              </h1>
              {lessonSubject && lessonClass && (
                <span className="text-xs text-muted-foreground">— Class {lessonClass.grade}{lessonClass.section}</span>
              )}
            </div>

            {/* Class tabs — hidden when drilled into a subject */}
            {!lessonSubject && (
              <div className="flex gap-2 flex-wrap">
                {ttClasses.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No classes assigned yet</span>
                ) : ttClasses.map(c => {
                  const active = c.id === lessonClassId
                  return (
                    <button key={c.id}
                      onClick={() => { setLessonClassId(c.id); setLessonSubject(null); setModules([]); setModulesSubjectKey("") }}
                      className={[
                        "text-xs px-4 py-1.5 rounded-full font-semibold transition-all border",
                        active ? "bg-primary text-primary-foreground border-primary shadow-sm"
                               : "bg-muted text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
                      ].join(" ")}>
                      Class {c.grade}{c.section}{c.name ? ` · ${c.name}` : ""}
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── Subject grid ── */}
            {!lessonSubject && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
                {subjects.map((subj, idx) => {
                  const meta = getSubjectMeta(subj)
                  return (
                    <button key={idx} onClick={() => setLessonSubject(subj)}
                      className={["group flex flex-col items-start gap-3 p-4 rounded-2xl border bg-card",
                        "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ring-2 ring-transparent hover:ring-2", meta.ringColor].join(" ")}>
                      <div className={["w-12 h-12 rounded-xl flex items-center justify-center", `bg-gradient-to-br ${meta.gradient} shadow-sm`].join(" ")}>
                        <span className="text-white"><SubjectIcon name={subj} size={22} /></span>
                      </div>
                      <div className="w-full text-left">
                        <p className="text-sm font-bold text-foreground leading-tight group-hover:text-primary transition-colors">{subj}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {subjectModuleCounts[subj] != null
                            ? `${subjectModuleCounts[subj]} module${subjectModuleCounts[subj] !== 1 ? "s" : ""}`
                            : "Click to manage modules"}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* ── Module list for selected subject ── */}
            {lessonSubject && (
              <div className="flex flex-col gap-3">
                {modulesError && (
                  <p className="text-xs text-red-500 px-1">{modulesError}</p>
                )}

                {modulesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-12 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading modules…
                  </div>
                ) : (
                  <>
                    {modules.length === 0 && !showNewModuleInput && (
                      <div className="flex flex-col items-center py-12 gap-3 text-center">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${getSubjectMeta(lessonSubject).gradient} opacity-30`}>
                          <SubjectIcon name={lessonSubject} size={26} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">No modules yet</p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-xs">Create your first module to start adding files and links for students.</p>
                        </div>
                        <Button size="sm" onClick={() => setShowNewModuleInput(true)}
                          className="rounded-full text-xs gap-1.5 text-white" style={{ background: "var(--ts-purple)" }}>
                          <Plus className="w-3.5 h-3.5" /> Add first module
                        </Button>
                      </div>
                    )}

                    {/* Module cards */}
                    {modules.map((mod, modIdx) => (
                      <div key={mod._id} className="skillio-card rounded-xl border border-border overflow-hidden">
                        {/* Module header */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b border-border group/modhead">
                          {renamingModuleId === mod._id ? (
                            <form className="flex items-center gap-2 flex-1" onSubmit={e => { e.preventDefault(); handleRenameModule(mod._id) }}>
                              <Input autoFocus value={renamingModuleTitle}
                                onChange={e => setRenamingModuleTitle(e.target.value)}
                                className="h-7 text-sm flex-1 rounded-md" />
                              <Button type="submit" size="sm" className="h-7 text-xs px-2 rounded-md text-white" style={{ background: "var(--ts-purple)" }}>Save</Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2 rounded-md" onClick={() => setRenamingModuleId(null)}>Cancel</Button>
                            </form>
                          ) : (
                            <>
                              <span className="text-sm font-bold text-foreground flex-1">{mod.title}</span>
                              <span className="text-[10px] text-muted-foreground mr-1">{mod.items.length} item{mod.items.length !== 1 ? "s" : ""}</span>
                              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/modhead:opacity-100 transition-opacity">
                                <button onClick={() => handleMoveModule(modIdx, -1)} disabled={modIdx === 0}
                                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors" title="Move up">
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleMoveModule(modIdx, 1)} disabled={modIdx === modules.length - 1}
                                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors" title="Move down">
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => { setRenamingModuleId(mod._id); setRenamingModuleTitle(mod.title) }}
                                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-ts-blue hover:bg-muted transition-colors" title="Rename module" aria-label="Rename module">
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button onClick={() => openDeleteModuleConfirm(mod._id, mod.title)}
                                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete module" aria-label="Delete module">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Items list */}
                        <div className="divide-y divide-border">
                          {mod.items.length === 0 && uploadingModuleId !== mod._id && (
                            <p className="text-xs text-muted-foreground px-4 py-3 italic">No content yet — add files or links below.</p>
                          )}
                          {mod.items.map((item, itemIdx) => (
                            <div
                              key={item._id}
                              draggable
                              onDragStart={() => handleDragStart(mod._id, itemIdx)}
                              onDragOver={handleDragOver}
                              onDrop={() => handleDrop(mod._id, itemIdx)}
                              className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 group transition-colors cursor-default"
                            >
                              {/* Drag handle */}
                              <span className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
                                <GripVertical className="w-3.5 h-3.5" />
                              </span>

                              {/* Type icon */}
                              <span className="text-sm shrink-0 leading-none">{item.type === "file" ? fileIcon(item.file_type) : linkIcon(item.link_type)}</span>

                              {renamingItemKey === `${mod._id}::${item._id}` ? (
                                <form className="flex items-center gap-2 flex-1 min-w-0" onSubmit={e => { e.preventDefault(); handleRenameItem(mod._id, item._id) }}>
                                  <Input autoFocus value={renamingItemLabel} onChange={e => setRenamingItemLabel(e.target.value)}
                                    className="h-6 text-xs flex-1 rounded-md" />
                                  <button type="submit" className="text-xs text-ts-purple font-semibold hover:underline shrink-0">Save</button>
                                  <button type="button" className="text-xs text-muted-foreground hover:underline shrink-0" onClick={() => setRenamingItemKey(null)}>Cancel</button>
                                </form>
                              ) : (
                                <>
                                  {/* Clickable label */}
                                  <button
                                    className="flex-1 text-left min-w-0 group/item"
                                    onClick={() => setViewerItem(item)}
                                  >
                                    <p className="text-xs font-medium text-foreground truncate group-hover/item:text-ts-purple transition-colors leading-tight">{item.label}</p>
                                    {item.type === "file" && item.file_size && (
                                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.file_type?.toUpperCase()} · {formatFileSize(item.file_size)}</p>
                                    )}
                                    {item.type === "link" && item.link_url && (
                                      <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5 max-w-[220px]">{item.link_url}</p>
                                    )}
                                  </button>

                                  {/* Action buttons — always present, visible on hover */}
                                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => { setRenamingItemKey(`${mod._id}::${item._id}`); setRenamingItemLabel(item.label) }}
                                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-ts-blue transition-colors"
                                      title="Rename item" aria-label="Rename item">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(mod._id, item._id)}
                                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors"
                                      title="Delete item" aria-label="Delete item">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Upload progress */}
                        {uploadingModuleId === mod._id && (
                          <div className="px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground border-t border-border">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> Uploading…
                          </div>
                        )}

                        {/* Add link inline form */}
                        {addingLinkModuleId === mod._id && (
                          <div className="px-4 py-3 border-t border-border bg-muted/20 flex flex-col gap-3">

                            {/* Bulk upload section */}
                            <div>
                              <p className="text-xs font-semibold text-foreground mb-1.5">Bulk upload links</p>
                              <div className="rounded-lg border border-dashed border-border bg-background p-3 flex flex-col gap-2">
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                  Fill an Excel or CSV file with two columns — <span className="font-semibold text-foreground">Title</span> and <span className="font-semibold text-foreground">URL</span> — then upload it below.
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={downloadLinkTemplate}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ts-blue hover:underline">
                                    <Download className="w-3 h-3" /> Download template (.csv)
                                  </button>
                                  <span className="text-muted-foreground/40 text-xs">·</span>
                                  <button
                                    onClick={() => linkExcelRef.current?.click()}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ts-purple hover:underline">
                                    <FileSpreadsheet className="w-3 h-3" /> Upload filled file
                                  </button>
                                </div>
                                {linkExcelRows.length > 0 && (
                                  <div className="mt-1 rounded-md border border-border bg-muted/30 divide-y divide-border max-h-36 overflow-y-auto">
                                    {linkExcelRows.map((r, i) => (
                                      <div key={i} className="flex items-center gap-2 px-2 py-1">
                                        <Check className="w-3 h-3 text-green-500 shrink-0" />
                                        <span className="text-[11px] font-medium truncate max-w-[110px]">{r.label || "(no title)"}</span>
                                        <span className="text-muted-foreground/50 text-[10px]">→</span>
                                        <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">{r.url}</span>
                                        <button onClick={() => setLinkExcelRows(rows => rows.filter((_, j) => j !== i))}
                                          className="shrink-0 text-muted-foreground/50 hover:text-red-500 transition-colors">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Single link section */}
                            <div className="flex flex-col gap-1.5">
                              <p className="text-[11px] text-muted-foreground font-medium">Or add a single link</p>
                              <Input placeholder="Title (e.g. Chapter 3 Video)"
                                value={linkForm.label} onChange={e => setLinkForm(f => ({ ...f, label: e.target.value }))}
                                className="h-7 text-xs rounded-md" />
                              <Input placeholder="URL (Google Drive, YouTube, or any website link)"
                                value={linkForm.url} onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))}
                                className="h-7 text-xs rounded-md font-mono" />
                            </div>

                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleAddLink(mod._id)}
                                disabled={linkExcelRows.length === 0 && !linkForm.url.trim()}
                                className="h-7 text-xs rounded-md text-white px-3" style={{ background: "var(--ts-blue)" }}>
                                {linkExcelRows.length > 1 ? `Add ${linkExcelRows.length} links` : "Add link"}
                              </Button>
                              <Button size="sm" variant="ghost"
                                onClick={() => { setAddingLinkModuleId(null); setLinkForm({ label: "", url: "" }); setLinkExcelRows([]) }}
                                className="h-7 text-xs rounded-md px-3">Cancel</Button>
                            </div>
                          </div>
                        )}

                        {/* Module footer — add buttons */}
                        {mod.items.length < 10 && uploadingModuleId !== mod._id && addingLinkModuleId !== mod._id && (
                          <div className="flex flex-col border-t border-border bg-muted/10">
                            <div className="flex items-center gap-2 px-4 py-2.5">
                              <button
                                onClick={() => { fileInputRef.current && (fileInputRef.current.dataset.moduleid = mod._id); fileInputRef.current?.click() }}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ts-purple font-medium transition-colors">
                                <Upload className="w-3.5 h-3.5" /> Add files
                              </button>
                              <span className="text-muted-foreground/40 text-xs">|</span>
                              <button onClick={() => { setAddingLinkModuleId(mod._id); setLinkForm({ label: "", url: "" }); setLinkExcelRows([]) }}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ts-blue font-medium transition-colors">
                                <Link2 className="w-3.5 h-3.5" /> Add link
                              </button>
                              <span className="ml-auto text-[10px] text-muted-foreground/60">{mod.items.length}/10</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground/60 px-4 pb-2 leading-relaxed">
                              Files: PDF, PPTX, MP4, images · Hold <kbd className="px-0.5 rounded bg-muted border border-border font-mono">Ctrl</kbd> / <kbd className="px-0.5 rounded bg-muted border border-border font-mono">⌘</kbd> in the picker to select multiple files at once
                            </p>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add module */}
                    {!showNewModuleInput ? (
                      modules.length > 0 && (
                        <button onClick={() => setShowNewModuleInput(true)}
                          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border hover:border-ts-purple/50 hover:bg-muted/30 text-xs text-muted-foreground hover:text-foreground transition-all group">
                          <Plus className="w-3.5 h-3.5 group-hover:text-ts-purple" />
                          Add module
                        </button>
                      )
                    ) : (
                      <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); handleCreateModule() }}>
                        <Input autoFocus placeholder={`Module ${modules.length + 1} title (optional)`}
                          value={newModuleTitle} onChange={e => setNewModuleTitle(e.target.value)}
                          className="h-8 text-sm rounded-lg flex-1" />
                        <Button type="submit" size="sm" className="h-8 text-xs rounded-lg text-white px-4" style={{ background: "var(--ts-purple)" }}>
                          Create
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs rounded-lg px-3"
                          onClick={() => { setShowNewModuleInput(false); setNewModuleTitle("") }}>
                          Cancel
                        </Button>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Delete module confirmation dialog — warns if certificates are attached */}
      {moduleDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div role="alertdialog" aria-modal="true" aria-labelledby="module-delete-heading" className="bg-background rounded-[16px] shadow-xl w-full max-w-sm p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p id="module-delete-heading" className="text-sm font-bold text-foreground">Delete "{moduleDeleteConfirm.title}"?</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This will permanently delete the module and all its files. This cannot be undone.
                </p>
                {moduleDeleteConfirm.certificateCount === null ? (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking for issued certificates…
                  </p>
                ) : moduleDeleteConfirm.certificateCount > 0 ? (
                  <p className="text-xs mt-2 px-2.5 py-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <span className="font-semibold">{moduleDeleteConfirm.certificateCount} student{moduleDeleteConfirm.certificateCount !== 1 ? "s" : ""}</span> {moduleDeleteConfirm.certificateCount !== 1 ? "have" : "has"} earned a certificate for this module. Their certificates will stay valid, but will be marked as belonging to a removed module.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="text-xs rounded-[20px]"
                onClick={() => setModuleDeleteConfirm(null)} disabled={moduleDeleteLoading}>
                Cancel
              </Button>
              <Button size="sm" className="text-xs rounded-[20px] text-white border-0 bg-destructive hover:bg-destructive/90"
                disabled={moduleDeleteLoading || moduleDeleteConfirm.certificateCount === null}
                onClick={handleConfirmDeleteModule}>
                {moduleDeleteLoading ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Deleting…</> : "Delete module"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for Excel/CSV link bulk upload */}
      <input ref={linkExcelRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={handleLinkExcelUpload} />

      {/* Hidden file input for module uploads */}
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.pptx,.ppt,.mp4,.webm,.jpg,.jpeg,.png,.webp,.gif"
        className="hidden"
        onChange={e => {
          const moduleId = fileInputRef.current?.dataset.moduleid ?? ""
          if (e.target.files && moduleId) {
            const lessonClass2 = ttClasses.find(c => c.id === lessonClassId)
            void lessonClass2 // used for context
            const handler = async () => {
              const arr = Array.from(e.target.files!).slice(0, 10)
              setUploadingModuleId(moduleId)
              const res = await uploadFiles(moduleId, arr)
              setUploadingModuleId(null)
              if ("error" in res) { setModulesError(res.error); return }
              setModulesError("")
              setModules(m => m.map(mod => mod._id === moduleId
                ? { ...mod, items: [...mod.items, ...res.items] }
                : mod
              ))
            }
            handler()
          }
          e.target.value = ""
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          LESSON PLAYER VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "lesson-player" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setView("lessons")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          </div>
          <div className="rounded-[12px] p-4 bg-muted border relative overflow-hidden">
            <p className="text-xs font-medium text-muted-foreground">Lesson scripts — coming soon</p>
            <p className="text-[11px] text-muted-foreground mt-1">Bilingual teaching scripts synced to your lesson modules will appear here.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-[20px] text-xs text-white border-0" style={{ background: "var(--gradient-stat-blue)" }} onClick={() => { setView("quizzes"); setShowQuizCreator(true) }}>Push quiz to class</Button>
            <Button size="sm" variant="outline" className="rounded-[20px] text-xs border-ts-purple-light text-ts-purple" onClick={() => setView("ai")}>Ask AI assistant</Button>
            <Button size="sm" variant="outline" className="rounded-[20px] text-xs" disabled={pdfLoading} onClick={handleDownloadPdf}>
              {pdfLoading ? "Generating…" : "Download activity PDF"}
            </Button>
            <Button size="sm" className="rounded-[20px] text-xs text-white border-0" style={{ background: periodDone ? "var(--ts-green)" : "var(--gradient-stat-green)" }} onClick={() => setPeriodDone(true)} disabled={periodDone}>
              {periodDone ? "✓ Period complete" : "Mark period complete"}
            </Button>
          </div>
          {pdfMsg && <p className="text-xs" style={{ color: "var(--ts-blue)" }}>{pdfMsg}</p>}
          <div className="glass-card rounded-[12px] p-4 border-0 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-blue)" }} />
            <p className="text-xs font-medium text-foreground mb-2">Add a note (optional)</p>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="e.g. Students struggled with the variable naming activity. Spend more time next class." className="w-full text-xs p-2 rounded-[8px] resize-none h-16 bg-background focus:outline-none focus:ring-1 focus:ring-primary border" />
            {noteSaved && <p className="text-xs mt-1 text-ts-green">Note saved.</p>}
            <Button size="sm" className="rounded-[20px] text-xs mt-2 text-white border-0" style={{ background: "var(--gradient-stat-blue)" }} onClick={() => { setNoteSaved(true); setTimeout(() => setNoteSaved(false), 3000) }}>Save note</Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TIMETABLE VIEW (teacher — editable)
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "timetable" && (
        <TeacherTimetableView
          ttClasses={ttClasses}
          setTtClasses={setTtClasses}
          ttClassId={ttClassId}
          setTtClassId={setTtClassId}
          ttSlots={ttSlots}
          setTtSlots={setTtSlots}
          ttPeriodTimes={ttPeriodTimes}
          setTtPeriodTimes={setTtPeriodTimes}
          ttSaving={ttSaving}
          setTtSaving={setTtSaving}
          ttMsg={ttMsg}
          setTtMsg={setTtMsg}
          ttLoading={ttLoading}
          setTtLoading={setTtLoading}
          ttUpdatedBy={ttUpdatedBy}
          setTtUpdatedBy={setTtUpdatedBy}
          ttUpdatedAt={ttUpdatedAt}
          setTtUpdatedAt={setTtUpdatedAt}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ATTENDANCE VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "attendance" && <TeacherAttendancePanel ttClasses={ttClasses} />}

      {/* ═══════════════════════════════════════════════════════════════════════
          QUIZZES VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "quizzes" && <TeacherQuizzesPanel ttClasses={ttClasses} setView={v => setView(v as View)} />}

      {/* ═══════════════════════════════════════════════════════════════════════
          PROBLEM STATEMENTS VIEW (Live Code)
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "problem-statements" && <TeacherLiveCodingPanel ttClasses={ttClasses} />}

      {/* ═══════════════════════════════════════════════════════════════════════
          STUDENTS VIEW — enhanced with course tracking
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "students" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-medium text-foreground">Students</h1>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 rounded-[20px] text-xs" onClick={() => { setShowBulkModal(true); setBulkRows([]); setBulkResults([]); setBulkClassId("") }}>
                <Upload className="w-3.5 h-3.5" /> Bulk import
              </Button>
              <Button size="sm" className="gap-1 rounded-[20px] text-xs bg-ts-blue text-white" onClick={() => { setShowStudentModal(true); setStudentError(""); setStudentResult(null) }}>
                <Plus className="w-3.5 h-3.5" /> Add student
              </Button>
            </div>
          </div>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search students..." className="pl-8 h-8 text-sm" value={searchStudents} onChange={e => setSearchStudents(e.target.value)} />
          </div>

          {/* Course tracking table */}
          {loadingStudents ? (
            <div className="text-center py-10 text-xs text-muted-foreground">Loading...</div>
          ) : (
            <div className="skillio-card overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h3 className="text-sm font-semibold text-foreground">Course Tracking</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Course progress for all students</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="border-b">
                      {["Student", "Username", "Course Progress", "Attendance", ""].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(filteredStudents.length > 0 ? filteredStudents : []).map((s) => {
                      const p = studentProgress[s.id]
                      return (
                        <tr key={s.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <StudentAvatar name={s.name} size={28} photoUrl={s.profile_photo_url} />
                              <p className="text-xs font-medium text-foreground">{s.name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{s.username ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            {progressLoading ? (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${p?.course ?? 0}%`, background: "linear-gradient(to right,#534AB7,#7970D6)" }} />
                                </div>
                                <span className="text-xs text-foreground">{p?.course ?? 0}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {progressLoading ? (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            ) : p?.attendance === null || p?.attendance === undefined ? (
                              <span className="text-[10px] text-muted-foreground">No data</span>
                            ) : (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                p.attendance >= 75 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : p.attendance >= 50 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                              }`}>{p.attendance}%</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => setConfirmRemove({ id: s.id, name: s.name })} className="text-muted-foreground hover:text-ts-red transition-colors p-1" title="Remove student" aria-label={`Remove student ${s.name}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredStudents.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">No students yet. Click "Add student" or "Bulk import".</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CERTIFICATES VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "certificates" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-base font-medium text-foreground">Certificates</h1>
            {/* Issue Custom Certificate button — visible when a class is selected */}
            {certClassId && certTab === "certs" && (
              <Button size="sm" className="text-xs rounded-[20px] text-white border-0 gap-1.5"
                style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}
                onClick={() => { setCertIssueOpen(true); setCertIssueError("") }}>
                <Plus className="w-3.5 h-3.5" />Issue Special Certificate
              </Button>
            )}
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div className="flex gap-1 p-1 rounded-[10px] bg-muted/40 border w-fit">
            {([["certs", "📋 Certificates"], ["settings", "⚙️ Template Settings"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setCertTab(key)}
                className="text-xs font-semibold px-3 py-1.5 rounded-[8px] transition-all cursor-pointer"
                style={certTab === key
                  ? { background: "linear-gradient(135deg,#534AB7,#7970D6)", color: "white" }
                  : { background: "transparent", color: "var(--muted-foreground)" }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── TAB: Template Settings ────────────────────────────────────── */}
          {certTab === "settings" && (
            <div className="skillio-card border p-4 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">School Name</label>
                  <Input className="h-9 text-sm" placeholder="e.g. Delhi Public School" value={certTemplate.school_name} onChange={e => setCertTemplate(t => ({ ...t, school_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">School Logo</label>
                  {certTemplate.logo_base64 ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={`data:${certTemplate.logo_mime ?? "image/png"};base64,${certTemplate.logo_base64}`}
                        className="w-14 h-14 rounded-lg border border-border object-contain bg-muted/20 flex-shrink-0"
                        alt="School logo preview"
                      />
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-1.5 h-7 rounded-md border border-input bg-background px-2.5 text-xs cursor-pointer hover:bg-muted/30 transition-colors w-fit">
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={certLogoUploading} />
                          {certLogoUploading
                            ? <><Loader2 className="w-3 h-3 animate-spin" /><span className="text-muted-foreground">Uploading…</span></>
                            : <><Upload className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground">Change logo</span></>}
                        </label>
                        <button
                          className="flex items-center gap-1.5 h-7 rounded-md border border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/5 transition-colors w-fit disabled:opacity-50"
                          onClick={handleLogoRemove}
                          disabled={certLogoRemoving}
                          type="button"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{certLogoRemoving ? "Removing…" : "Remove logo"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm cursor-pointer hover:bg-muted/30 transition-colors">
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={certLogoUploading} />
                      {certLogoUploading
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="text-xs text-muted-foreground">Uploading…</span></>
                        : <><Upload className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Upload logo (PNG/JPG)</span></>}
                    </label>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Footer Left (Teacher Name)</label>
                  <Input className="h-9 text-sm" placeholder="Class Teacher" value={certTemplate.footer_left} onChange={e => setCertTemplate(t => ({ ...t, footer_left: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Footer Right (Principal)</label>
                  <Input className="h-9 text-sm" placeholder="School Principal" value={certTemplate.footer_right} onChange={e => setCertTemplate(t => ({ ...t, footer_right: e.target.value }))} />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="text-xs rounded-[20px] text-white border-0" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}
                  onClick={handleSaveCertTemplate} disabled={certTmplSaving}>
                  {certTmplSaving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Saving…</> : certTmplSaved ? "✓ Saved!" : "Save Settings"}
                </Button>
                <Button size="sm" variant="outline" className="text-xs rounded-[20px]"
                  onClick={() => previewCertPDF({ school_name: certTemplate.school_name, description: certTemplate.description, footer_left: certTemplate.footer_left, footer_right: certTemplate.footer_right, accent_color: certTemplate.accent_color })}>
                  Preview PDF ↗
                </Button>
              </div>
            </div>
          )}

          {/* ── TAB: Certificates ─────────────────────────────────────────── */}
          {certTab === "certs" && (
            <>
              {/* Class picker */}
              {ttClasses.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {[...ttClasses].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section)).map(cls => (
                    <button key={cls.id}
                      onClick={() => loadCertClass(cls.id)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer"
                      style={certClassId === cls.id
                        ? { background: "linear-gradient(135deg,#534AB7,#7970D6)", color: "white", borderColor: "transparent" }
                        : { background: "transparent", color: "var(--muted-foreground)", borderColor: "var(--border)" }}>
                      {cls.name || `Grade ${cls.grade}-${cls.section}`}
                    </button>
                  ))}
                </div>
              )}

              {!certClassId && (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                  <p className="text-2xl">🏆</p>
                  <p className="text-sm font-semibold text-foreground">Select a class to view certificates</p>
                  <p className="text-xs text-muted-foreground">Choose a class above, then view, download, or issue certificates.</p>
                </div>
              )}

              {certClassId && (certModulesLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  {/* ── Special / Custom Certificates ───────────────────── */}
                  {certCustomCerts.length > 0 && (
                    <div className="skillio-card overflow-hidden">
                      {/* Header row */}
                      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b gap-2 flex-wrap">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            className="rounded cursor-pointer"
                            checked={certBulkIds.size === certCustomCerts.length && certCustomCerts.length > 0}
                            onChange={e => setCertBulkIds(e.target.checked ? new Set(certCustomCerts.map(c => c._id)) : new Set())}
                          />
                          <div>
                            <p className="text-xs font-bold text-foreground">Special Awards</p>
                            <p className="text-[11px] text-muted-foreground">{certCustomCerts.length} custom certificate{certCustomCerts.length !== 1 ? "s" : ""} issued</p>
                          </div>
                        </div>
                        {certBulkIds.size > 0 && !certBulkConfirm && (
                          <Button size="sm" className="text-xs rounded-[20px] gap-1 h-7 text-white border-0 bg-destructive hover:bg-destructive/90"
                            onClick={() => setCertBulkConfirm(true)}>
                            <Trash2 className="w-3 h-3" />Delete {certBulkIds.size} selected
                          </Button>
                        )}
                      </div>

                      {/* Inline confirmation banner */}
                      {certBulkConfirm && (
                        <div className="flex items-center justify-between px-4 py-2.5 bg-destructive/5 border-b border-destructive/20 gap-2 flex-wrap">
                          <p className="text-xs text-destructive font-medium">
                            Delete {certBulkIds.size} certificate{certBulkIds.size !== 1 ? "s" : ""}? This cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-xs rounded-[20px] h-7"
                              disabled={certBulkDeleting}
                              onClick={() => { setCertBulkConfirm(false) }}>
                              Cancel
                            </Button>
                            <Button size="sm" className="text-xs rounded-[20px] h-7 text-white border-0 bg-destructive hover:bg-destructive/90"
                              disabled={certBulkDeleting}
                              onClick={handleBulkDeleteCerts}>
                              {certBulkDeleting ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Deleting…</> : "Confirm Delete"}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Certificate rows */}
                      <div className="divide-y divide-border">
                        {certCustomCerts.map(cert => (
                          <div key={cert._id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                className="rounded cursor-pointer flex-shrink-0"
                                checked={certBulkIds.has(cert._id)}
                                onChange={e => setCertBulkIds(prev => {
                                  const next = new Set(prev)
                                  e.target.checked ? next.add(cert._id) : next.delete(cert._id)
                                  return next
                                })}
                              />
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}>
                                {cert.student_name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{cert.student_name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{cert.custom_title}{cert.custom_reason ? ` — ${cert.custom_reason}` : ""}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button size="sm" variant="outline" className="text-xs rounded-[20px] gap-1 h-7"
                                onClick={() => viewCertPDF(cert._id)}>
                                <Eye className="w-3 h-3" />View
                              </Button>
                              <Button size="sm" variant="outline" className="text-xs rounded-[20px] gap-1 h-7"
                                onClick={() => downloadCertPDF(cert._id, cert.student_name)}>
                                <Download className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-xs rounded-[20px] gap-1 h-7 text-destructive hover:text-destructive border-destructive/30"
                                disabled={certRevoking === cert._id}
                                onClick={() => handleRevokeCert(cert._id)}>
                                {certRevoking === cert._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Module Certificates ──────────────────────────────── */}
                  {certModules.length === 0 && certCustomCerts.length === 0 && certRemovedModules.length === 0 ? (
                    <div className="text-center py-10 text-xs text-muted-foreground">No modules or certificates in this class yet.</div>
                  ) : (() => {
                    const certifiedModules = certModules.filter(mod => mod.certificates.length > 0)
                    const emptyModules     = certModules.filter(mod => mod.certificates.length === 0)
                    return (
                      <>
                        {/* Modules with certificates — full detail card */}
                        {certifiedModules.map(mod => (
                          <div key={mod.module_id} className="skillio-card overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate">{mod.module_title}</p>
                                <p className="text-[11px] text-muted-foreground">{mod.subject} · {mod.certificates.length} certificate{mod.certificates.length !== 1 ? "s" : ""} issued</p>
                              </div>
                              <Button size="sm" variant="outline" className="text-xs rounded-[20px] gap-1 flex-shrink-0"
                                disabled={certBulkLoading === mod.module_id}
                                onClick={() => handleBulkDownload(mod.module_id)}>
                                {certBulkLoading === mod.module_id
                                  ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</>
                                  : <><Download className="w-3 h-3" />All ({mod.certificates.length}) ZIP</>}
                              </Button>
                            </div>

                            {/* Compact two-column grid — shows 2 students per row for easy scanning */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:gap-px sm:bg-border">
                              {mod.certificates.map(cert => (
                                <div key={cert._id} className="flex items-center justify-between px-3 py-2 gap-2 bg-background sm:border-b sm:border-border">
                                  {/* Student info */}
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                      style={{ background: `linear-gradient(135deg,${certTemplate.accent_color},${certTemplate.accent_color}bb)` }}>
                                      {cert.student_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-foreground truncate leading-tight">{cert.student_name}</p>
                                      <p className="text-[10px] text-muted-foreground leading-tight">{new Date(cert.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                                    </div>
                                  </div>
                                  {/* Action icons */}
                                  <div className="flex items-center gap-0.5 flex-shrink-0">
                                    <button title="View certificate" aria-label={`View certificate for ${cert.student_name}`}
                                      className="min-w-[44px] min-h-[44px] rounded-[6px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                      onClick={() => viewCertPDF(cert._id)}>
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <button title="Download PDF" aria-label={`Download certificate PDF for ${cert.student_name}`}
                                      className="min-w-[44px] min-h-[44px] rounded-[6px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                      onClick={() => downloadCertPDF(cert._id, cert.student_name)}>
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                    <button title="Delete certificate" aria-label={`Delete certificate for ${cert.student_name}`}
                                      disabled={certModuleDeleting === cert._id}
                                      className="min-w-[44px] min-h-[44px] rounded-[6px] flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-40"
                                      onClick={() => setCertDeleteConfirm({ certId: cert._id, studentName: cert.student_name, moduleTitle: mod.module_title })}>
                                      {certModuleDeleting === cert._id
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* Modules with zero certificates — collapsed by default */}
                        {emptyModules.length > 0 && (
                          <div className="skillio-card overflow-hidden">
                            <button
                              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                              onClick={() => setCertShowEmpty(v => !v)}
                              aria-expanded={certShowEmpty}
                            >
                              <span className="text-xs font-semibold text-muted-foreground">
                                {emptyModules.length} module{emptyModules.length !== 1 ? "s" : ""} with no certificates yet
                              </span>
                              {certShowEmpty ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                            {certShowEmpty && (
                              <div className="divide-y divide-border">
                                {emptyModules.map(mod => (
                                  <div key={mod.module_id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-foreground truncate">{mod.module_title}</p>
                                      <p className="text-[10px] text-muted-foreground">{mod.subject}</p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">No certificates yet</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Certificates whose module was deleted — collapsed by default */}
                        {certRemovedModules.length > 0 && (
                          <div className="skillio-card overflow-hidden border-amber-500/30">
                            <button
                              className="w-full flex items-center justify-between px-4 py-3 bg-amber-500/5 hover:bg-amber-500/10 transition-colors cursor-pointer"
                              onClick={() => setCertShowRemoved(v => !v)}
                              aria-expanded={certShowRemoved}
                            >
                              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                {certRemovedModules.reduce((sum, g) => sum + g.certificates.length, 0)} certificate{certRemovedModules.reduce((sum, g) => sum + g.certificates.length, 0) !== 1 ? "s" : ""} from deleted modules
                              </span>
                              {certShowRemoved ? <ChevronUp className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />}
                            </button>
                            {certShowRemoved && (
                              <div className="divide-y divide-border">
                                {certRemovedModules.map(group => (
                                  <div key={group.module_title + group.subject} className="px-4 py-2.5">
                                    <p className="text-xs font-medium text-foreground">{group.module_title} <span className="text-[10px] text-muted-foreground font-normal">· {group.subject} · module removed</span></p>
                                    <div className="mt-1.5 flex flex-col gap-1">
                                      {group.certificates.map(cert => (
                                        <div key={cert._id} className="flex items-center justify-between gap-2">
                                          <span className="text-[11px] text-muted-foreground truncate">{cert.student_name}</span>
                                          <div className="flex items-center gap-0.5 flex-shrink-0">
                                            <button title="View certificate" aria-label={`View certificate for ${cert.student_name}`}
                                              className="min-w-[36px] min-h-[36px] rounded-[6px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                              onClick={() => viewCertPDF(cert._id)}>
                                              <Eye className="w-3.5 h-3.5" />
                                            </button>
                                            <button title="Download PDF" aria-label={`Download certificate PDF for ${cert.student_name}`}
                                              className="min-w-[36px] min-h-[36px] rounded-[6px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                              onClick={() => downloadCertPDF(cert._id, cert.student_name)}>
                                              <Download className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()}

                  {/* ── Delete module cert confirmation dialog ────────────── */}
                  {certDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                      <div role="alertdialog" aria-modal="true" aria-labelledby="cert-delete-heading" className="bg-background rounded-[16px] shadow-xl w-full max-w-sm p-5 flex flex-col gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </div>
                          <div>
                            <p id="cert-delete-heading" className="text-sm font-bold text-foreground">Delete certificate?</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              This will remove <span className="font-semibold text-foreground">{certDeleteConfirm.studentName}</span>'s certificate for <span className="font-semibold text-foreground">"{certDeleteConfirm.moduleTitle}"</span>.
                              They will be able to re-claim it by completing the module again.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" className="text-xs rounded-[20px]"
                            onClick={() => setCertDeleteConfirm(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" className="text-xs rounded-[20px] text-white border-0 bg-destructive hover:bg-destructive/90"
                            disabled={!!certModuleDeleting}
                            onClick={handleDeleteModuleCert}>
                            {certModuleDeleting ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Deleting…</> : "Delete"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ))}
            </>
          )}

          {/* ── Issue Custom Certificate Modal ────────────────────────────── */}
          {certIssueOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div role="dialog" aria-modal="true" aria-labelledby="cert-issue-heading" className="bg-background rounded-[16px] shadow-xl w-full max-w-md flex flex-col gap-4 p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <p id="cert-issue-heading" className="text-sm font-bold text-foreground">Issue Special Certificate</p>
                  <button onClick={() => { setCertIssueOpen(false); setCertIssueTemplate(null) }} className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Template selector */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Certificate Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: "course_completion",     icon: "🎓", label: "Course Completion"     },
                        { key: "academic_excellence",   icon: "⭐", label: "Academic Excellence"   },
                        { key: "outstanding_achievement", icon: "🏆", label: "Outstanding Achievement" },
                      ] as const).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setCertIssueTemplate(opt.key)
                            setCertIssueTitle(opt.label)
                          }}
                          className="flex flex-col items-center gap-1 p-2.5 rounded-[10px] border text-center transition-all cursor-pointer"
                          style={certIssueTemplate === opt.key
                            ? { background: "linear-gradient(135deg,#534AB7,#7970D6)", borderColor: "#534AB7", color: "white" }
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
                    <Input className="h-9 text-sm" placeholder="e.g. Best Science Project" value={certIssueTitle} onChange={e => setCertIssueTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Reason (optional)</label>
                    <Input className="h-9 text-sm" placeholder="e.g. for outstanding science fair participation" value={certIssueReason} onChange={e => setCertIssueReason(e.target.value)} />
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
                      <div className="border rounded-[8px] divide-y divide-border max-h-48 overflow-y-auto">
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
                  <Button size="sm" variant="outline" className="text-xs rounded-[20px]" onClick={() => { setCertIssueOpen(false); setCertIssueTemplate(null) }}>Cancel</Button>
                  <Button size="sm" className="text-xs rounded-[20px] text-white border-0 gap-1"
                    style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}
                    disabled={!certIssueTitle.trim() || certSelectedIds.size === 0 || certIssueLoading}
                    onClick={handleIssueCerts}>
                    {certIssueLoading ? <><Loader2 className="w-3 h-3 animate-spin" />Issuing…</> : `Issue to ${certSelectedIds.size || 0} student${certSelectedIds.size !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          AI ASSISTANT VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "ai" && (
        <div className="flex flex-col gap-4 h-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-medium text-ts-purple">AI Lesson Assistant</h1>
              <p className="text-xs text-muted-foreground">Powered by Claude{myClass ? ` · ${myClass.label}` : ""}</p>
            </div>
          </div>
          <div className="glass-card rounded-[12px] flex flex-col border-0 relative overflow-hidden" style={{ minHeight: 400 }}>
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-purple)" }} />
            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 max-h-64 md:max-h-80">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-[12px] p-3 text-xs leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-ts-blue text-white" : "bg-ts-purple-light text-ts-purple-dark"}`}>{msg.text}</div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-ts-purple-light text-ts-purple-dark rounded-[12px] px-4 py-3 flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-ts-purple animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-ts-purple animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-ts-purple animate-bounce" />
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {QUICK_ACTIONS.map(action => (
                  <button key={action} onClick={() => sendChat(action)} className="text-[11px] px-2 py-1 rounded-[20px] transition-colors hover:opacity-80 bg-ts-purple-light text-ts-purple-dark border">{action}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()} placeholder="Ask anything about this lesson..." className="flex-1 h-8 text-xs rounded-[8px] px-3 bg-background focus:outline-none focus:ring-1 focus:ring-ts-purple border" />
                <Button size="sm" className="rounded-[8px] h-8 w-8 text-white border-0" style={{ background: "var(--gradient-stat-purple)" }} onClick={() => sendChat()} disabled={aiLoading} aria-label="Send message"><Send className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SUNDAY SYNC VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "sunday-sync" && (
        <div className="flex flex-col gap-4 max-w-lg">
          <h1 className="text-base font-medium text-foreground">Sunday Night Sync</h1>
          <p className="text-xs text-muted-foreground">Get a WhatsApp message every Sunday at 7:00 PM with Monday's lesson summary — so you're never caught off guard.</p>
          <div className="glass-card rounded-[12px] p-4 border-0 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-blue)" }} />
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-foreground">Enable Sunday Night Sync</span>
              <button onClick={() => setSyncEnabled(!syncEnabled)} className={`w-10 h-5 rounded-full transition-colors relative ${syncEnabled ? "bg-ts-blue" : "bg-muted"} border`}>
                <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform" style={{ left: syncEnabled ? "calc(100% - 18px)" : "2px" }} />
              </button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">WhatsApp number</label>
              <input defaultValue={user?.phone ?? ""} placeholder="+91 98765 00000" className="w-full h-8 text-sm rounded-[8px] px-3 bg-background focus:outline-none border" />
            </div>
          </div>
          <div className="glass-card rounded-[12px] p-4 border-0 bg-ts-amber-light relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-amber)" }} />
            <p className="text-xs font-medium mb-2 text-ts-amber-dark">Preview — what you'll receive this Sunday</p>
            <div className="bg-card rounded-[8px] p-3 border border-border">
              <p className="text-xs leading-relaxed text-foreground">
                Good evening {firstName}! Monday's CS lesson is ready.<br />
                {myClass?.label ?? "Your class"} · Period 3 — Variables explained<br /><br />
                Your 2-minute script:<br />
                "Good morning everyone! Today we are going to learn about variables. Before I explain, tell me — do any of you have a piggy bank at home? [Pause for hands]..."<br /><br />
                Open full lesson: teachscript.in/lesson/3<br />
                Reply STOP to unsubscribe.
              </p>
            </div>
          </div>
          <div className="glass-card rounded-[12px] p-4 border-0 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-green)" }} />
            <p className="text-xs font-medium text-foreground mb-2">Message history</p>
            <p className="text-xs text-muted-foreground">No messages sent yet. Enable Sunday Night Sync above to start receiving weekly lesson previews.</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          NOTIFICATIONS VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "notifications" && !tNotifHistoryLoaded && (() => {
        // Load sent notification history when entering the notifications view
        getTeacherSentNotifications().then(res => {
          setTNotifHistoryLoaded(true)
          if (!("error" in res)) setTNotifHistory(res.notifications)
        })
        return null
      })()}

      {view === "notifications" && (() => {
        const TNOTIF_TYPES: Array<{ value: NotifType; label: string; emoji: string; color: string; desc: string }> = [
          { value: "announcement", label: "Announcement", emoji: "📢", color: "#534AB7", desc: "General info, class updates" },
          { value: "reminder",     label: "Reminder",     emoji: "⏰", color: "#f59e0b", desc: "Homework, test reminders" },
          { value: "achievement",  label: "Achievement",  emoji: "🏆", color: "#10b981", desc: "Praise and class awards" },
          { value: "alert",        label: "Alert",        emoji: "🚨", color: "#EF4444", desc: "Urgent notice" },
          { value: "event",        label: "Event",        emoji: "📅", color: "#378ADD", desc: "Upcoming class events" },
        ]
        const sortedClasses = [...ttClasses].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
        const selectedTypeConf = TNOTIF_TYPES.find(t => t.value === tNotifForm.type)

        async function handleClassChange(classId: string) {
          setTNotifForm(f => ({ ...f, classId, selectedStudentIds: [] }))
          setTNotifStudentSearch("")
          if (!classId) { setTNotifClassStudents([]); return }
          setTNotifStudentsLoading(true)
          const res = await getClassStudents(classId)
          setTNotifStudentsLoading(false)
          if (!("error" in res)) setTNotifClassStudents(res.students as unknown as DbStudent[])
        }

        async function handleSendTeacherNotif() {
          if (!tNotifForm.title.trim() || !tNotifForm.message.trim()) {
            setTNotifError("Title and message are required."); return
          }
          setTNotifSending(true); setTNotifError(""); setTNotifMsg("")
          const scheduledAt = tNotifForm.scheduleDate
            ? `${tNotifForm.scheduleDate}T${tNotifForm.scheduleTime || "09:00"}:00`
            : undefined
          const res = await sendTeacherNotification({
            type: tNotifForm.type, title: tNotifForm.title, message: tNotifForm.message,
            class_id: tNotifForm.classId || undefined,
            student_ids: tNotifForm.selectedStudentIds.length > 0 ? tNotifForm.selectedStudentIds : undefined,
            scheduled_at: scheduledAt,
          })
          setTNotifSending(false)
          if ("error" in res) { setTNotifError(res.error); return }
          setTNotifMsg(scheduledAt
            ? `Scheduled for ${new Date(scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} at ${tNotifForm.scheduleTime}!`
            : "Notification sent!")
          setTNotifForm(f => ({ ...f, title: "", message: "", selectedStudentIds: [], scheduleDate: "", scheduleTime: "09:00" }))
          // Refresh sent history
          getTeacherSentNotifications().then(res => { if (!("error" in res)) setTNotifHistory(res.notifications) })
          setTimeout(() => setTNotifMsg(""), 4000)
        }

        const filteredNotifStudents = tNotifClassStudents.filter(s =>
          s.name.toLowerCase().includes(tNotifStudentSearch.toLowerCase())
        )
        const allSelected = tNotifClassStudents.length > 0 && tNotifClassStudents.every(s => tNotifForm.selectedStudentIds.includes(s.id))

        const selectedClass = sortedClasses.find(c => c.id === tNotifForm.classId)
        const targetLabel = tNotifForm.selectedStudentIds.length > 0
          ? `${tNotifForm.selectedStudentIds.length} student${tNotifForm.selectedStudentIds.length !== 1 ? "s" : ""}`
          : selectedClass
            ? `Class ${selectedClass.grade}${selectedClass.section} (all)`
            : "All my students"

        return (
          <div className="flex flex-col gap-5 w-full">
            <div>
              <h1 className="text-base font-semibold text-foreground">Notifications</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Send announcements and reminders to your class students.</p>
            </div>

            {/* Two-column: composer left, preview right */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start w-full">

              {/* LEFT — Composer */}
              <div className="skillio-card p-5 flex flex-col gap-5">
                {/* Type */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Type</label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {TNOTIF_TYPES.map(t => (
                      <button key={t.value} type="button"
                        onClick={() => setTNotifForm(f => ({ ...f, type: t.value }))}
                        className={[
                          "flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all",
                          tNotifForm.type === t.value
                            ? "border-transparent text-white shadow-md"
                            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                        ].join(" ")}
                        style={tNotifForm.type === t.value ? { background: t.color } : {}}>
                        <span className="text-2xl leading-none">{t.emoji}</span>
                        <span className="text-[10px] font-bold leading-tight text-center break-words w-full">{t.label}</span>
                      </button>
                    ))}
                  </div>
                  {selectedTypeConf && <p className="text-[11px] text-muted-foreground mt-1.5">{selectedTypeConf.desc}</p>}
                </div>

                {/* Send To — Class dropdown + student list */}
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Class dropdown */}
                    <div>
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Class</label>
                      {ttClasses.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No classes assigned yet.</p>
                      ) : (
                        <select
                          value={tNotifForm.classId}
                          onChange={e => handleClassChange(e.target.value)}
                          className="w-full h-10 text-sm rounded-lg px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground">
                          <option value="">All my classes</option>
                          {sortedClasses.map(c => (
                            <option key={c.id} value={c.id}>
                              Class {c.grade}{c.section}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Student count badge */}
                    {tNotifForm.classId && (
                      <div className="flex flex-col justify-end">
                        <p className="text-[11px] text-muted-foreground mb-1.5">
                          {tNotifStudentsLoading
                            ? "Loading students…"
                            : tNotifForm.selectedStudentIds.length > 0
                              ? <span className="text-primary font-semibold">{tNotifForm.selectedStudentIds.length} student{tNotifForm.selectedStudentIds.length !== 1 ? "s" : ""} selected</span>
                              : `${tNotifClassStudents.length} student${tNotifClassStudents.length !== 1 ? "s" : ""} in class (all)`
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Student list — shown when a class is selected */}
                  {tNotifForm.classId && !tNotifStudentsLoading && tNotifClassStudents.length > 0 && (
                    <div className="rounded-xl border border-border overflow-hidden">
                      {/* Search + select all */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
                        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input
                          value={tNotifStudentSearch}
                          onChange={e => setTNotifStudentSearch(e.target.value)}
                          placeholder="Search students…"
                          className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
                        />
                        <button type="button"
                          onClick={() => setTNotifForm(f => ({
                            ...f,
                            selectedStudentIds: allSelected ? [] : tNotifClassStudents.map(s => s.id),
                          }))}
                          className="text-[11px] font-semibold text-primary hover:opacity-80 whitespace-nowrap">
                          {allSelected ? "Deselect all" : "Select all"}
                        </button>
                      </div>

                      {/* Student rows */}
                      <div className="max-h-48 overflow-y-auto">
                        {filteredNotifStudents.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No students match</p>
                        ) : filteredNotifStudents.map(s => {
                          const checked = tNotifForm.selectedStudentIds.includes(s.id)
                          return (
                            <label key={s.id}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors border-b border-border/50 last:border-0">
                              <input type="checkbox" checked={checked}
                                onChange={() => setTNotifForm(f => ({
                                  ...f,
                                  selectedStudentIds: checked
                                    ? f.selectedStudentIds.filter(id => id !== s.id)
                                    : [...f.selectedStudentIds, s.id],
                                }))}
                                className="w-4 h-4 rounded border-border accent-primary" />
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}>
                                {s.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-xs text-foreground flex-1 truncate">{s.name}</span>
                              {checked && <span className="text-[10px] text-primary font-semibold">✓</span>}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {tNotifForm.classId && tNotifStudentsLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading students…
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Title *</label>
                  <input value={tNotifForm.title}
                    onChange={e => setTNotifForm(f => ({ ...f, title: e.target.value.slice(0, 80) }))}
                    placeholder="e.g. Assignment due tomorrow"
                    className="w-full h-9 text-sm rounded-lg px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{tNotifForm.title.length}/80</p>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Message *</label>
                  <textarea value={tNotifForm.message}
                    onChange={e => setTNotifForm(f => ({ ...f, message: e.target.value.slice(0, 300) }))}
                    placeholder="Write your message here…"
                    rows={4}
                    className="w-full text-sm rounded-lg px-3 py-2.5 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{tNotifForm.message.length}/300</p>
                </div>

                {/* Send now OR schedule */}
                <div className="rounded-xl border border-border bg-muted/20 p-4 flex flex-col gap-3">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">When to send</p>

                  {/* Toggle */}
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setTNotifForm(f => ({ ...f, scheduleDate: "" }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${!tNotifForm.scheduleDate ? "text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                      style={!tNotifForm.scheduleDate ? { background: selectedTypeConf?.color ?? "#534AB7" } : {}}>
                      🚀 Send now
                    </button>
                    <button type="button"
                      onClick={() => setTNotifForm(f => ({ ...f, scheduleDate: new Date().toISOString().slice(0, 10) }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tNotifForm.scheduleDate ? "text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                      style={tNotifForm.scheduleDate ? { background: selectedTypeConf?.color ?? "#534AB7" } : {}}>
                      📅 Schedule
                    </button>
                  </div>

                  {/* Date + Time pickers — shown only when Schedule is selected */}
                  {tNotifForm.scheduleDate && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Date</label>
                        <DatePicker value={tNotifForm.scheduleDate} onChange={d => setTNotifForm(f => ({ ...f, scheduleDate: d }))} min={new Date().toISOString().slice(0, 10)} placeholder="Pick a date" />
                      </div>
                      <div className="w-28">
                        <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Time</label>
                        <input type="time"
                          value={tNotifForm.scheduleTime}
                          onChange={e => setTNotifForm(f => ({ ...f, scheduleTime: e.target.value }))}
                          className="w-full h-9 text-sm rounded-lg px-3 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary" />
                      </div>
                    </div>
                  )}

                  {tNotifForm.scheduleDate && (
                    <p className="text-[11px] text-ts-blue">
                      Will be sent on {new Date(`${tNotifForm.scheduleDate}T${tNotifForm.scheduleTime}`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} at {tNotifForm.scheduleTime}
                    </p>
                  )}

                  {/* Send button */}
                  <Button onClick={handleSendTeacherNotif} disabled={tNotifSending || !tNotifForm.title || !tNotifForm.message}
                    className="h-10 px-6 rounded-xl text-sm font-bold text-white gap-2 w-full"
                    style={{ background: selectedTypeConf?.color ?? "#534AB7" }}>
                    {tNotifSending
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> {tNotifForm.scheduleDate ? "Scheduling…" : "Sending…"}</>
                      : <><Send className="w-4 h-4" />
                          {tNotifForm.scheduleDate ? "Schedule notification" :
                            tNotifForm.selectedStudentIds.length > 0
                              ? `Send to ${tNotifForm.selectedStudentIds.length} student${tNotifForm.selectedStudentIds.length !== 1 ? "s" : ""}`
                              : "Send to Students"}
                        </>}
                  </Button>
                  {tNotifMsg   && <span className="text-sm text-green-600 font-semibold flex items-center gap-1"><Check className="w-4 h-4" />{tNotifMsg}</span>}
                  {tNotifError && <span className="text-sm text-red-500 font-semibold">{tNotifError}</span>}
                </div>
              </div>

              {/* RIGHT — Sent History + Live preview */}
              <div className="flex flex-col gap-5">

              {/* Sent History — last 10 */}
              <div className="skillio-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Sent (last 10)</p>
                  <button onClick={() => {
                    setTNotifHistoryLoaded(false)
                    getTeacherSentNotifications().then(res => { setTNotifHistoryLoaded(true); if (!("error" in res)) setTNotifHistory(res.notifications) })
                  }} className="text-[11px] text-primary font-semibold hover:opacity-80">Refresh</button>
                </div>
                {tNotifHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4">
                    <span className="text-2xl">📭</span>
                    <p className="text-xs font-semibold text-foreground">No notifications sent yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-64 overflow-y-auto">
                    {tNotifHistory.map(n => {
                      const TNOTIF_ICONS: Record<string, string> = { announcement: "📢", reminder: "⏰", achievement: "🏆", alert: "🚨", event: "📅" }
                      const TNOTIF_COLORS: Record<string, string> = { announcement: "#534AB7", reminder: "#EF9F27", achievement: "#10b981", alert: "#EF4444", event: "#378ADD" }
                      const color = TNOTIF_COLORS[n.type] ?? "#534AB7"
                      return (
                        <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5" style={{ background: `${color}18` }}>
                            {TNOTIF_ICONS[n.type] ?? "📢"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{n.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{n.message}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">→ {n.target_label}</span>
                              {n.scheduled_at && (
                                <span className="text-[10px] text-ts-blue">📅 {new Date(n.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              if (!confirm("Delete this notification? This cannot be undone.")) return
                              const res = await deleteTeacherNotification(n.id)
                              if (!("error" in res)) {
                                setTNotifHistory(prev => prev.filter(x => x.id !== n.id))
                              }
                            }}
                            className="shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors p-1.5 rounded-lg"
                            aria-label="Delete notification"
                            title="Delete notification">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Live preview (always shown) */}
              <div className="skillio-card p-5 flex flex-col gap-4">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Live Preview</p>
                <div className="rounded-xl border border-dashed border-border p-4 bg-muted/20">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: `${selectedTypeConf?.color ?? "#534AB7"}18` }}>
                      {selectedTypeConf?.emoji ?? "📢"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground">{tNotifForm.title || <span className="text-muted-foreground/50 font-normal">Your title…</span>}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{tNotifForm.message || <span className="opacity-50">Your message…</span>}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${selectedTypeConf?.color ?? "#534AB7"}15`, color: selectedTypeConf?.color ?? "#534AB7" }}>
                          {selectedTypeConf?.label ?? "Announcement"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">→ {targetLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground text-center">How students see it in their bell panel</p>

                {/* Quick tips */}
                <div className="mt-1 rounded-xl bg-muted/30 p-4 flex flex-col gap-2.5">
                  <p className="text-[11px] font-bold text-foreground">Tips for effective notifications</p>
                  {[
                    { emoji: "📢", tip: "Keep titles under 8 words for clarity" },
                    { emoji: "⏰", tip: "Send reminders 24h before deadlines" },
                    { emoji: "🎯", tip: "Target specific classes for relevance" },
                    { emoji: "🏆", tip: "Celebrate achievements to motivate students" },
                  ].map(({ emoji, tip }) => (
                    <div key={tip} className="flex items-start gap-2">
                      <span className="text-base leading-none mt-0.5">{emoji}</span>
                      <span className="text-[11px] text-muted-foreground leading-relaxed">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              </div> {/* end RIGHT column wrapper */}
            </div>
          </div>
        )
      })()}

      {/* ═══════════════════════════════════════════════════════════════════════
          HOMEWORK VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "homework" && <TeacherHomeworkPanel initialClassId={teacherClassId} />}

      {/* ═══════════════════════════════════════════════════════════════════════
          SETTINGS VIEW
      ════════════════════════════════════════════════════════════════════════ */}
      {view === "settings" && (
        <div className="flex flex-col gap-4 max-w-md">
          <h1 className="text-base font-medium text-foreground">Settings</h1>
          <div className="glass-card rounded-[12px] p-5 border-0 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-sidebar-teacher)" }} />
            <h3 className="text-sm font-medium mb-4">Profile</h3>
            <form onSubmit={handleSaveSettings} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Full name</label>
                <Input className="h-9 text-sm rounded-[8px]" value={teacherSettingsForm.name} onChange={e => setTeacherSettingsForm(f => ({ ...f, name: e.target.value }))} placeholder="Your full name" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Phone number</label>
                <Input className="h-9 text-sm rounded-[8px]" value={teacherSettingsForm.phone} onChange={e => setTeacherSettingsForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <Input className="h-9 text-sm rounded-[8px] opacity-60" value={teacherSettingsForm.email} disabled />
                <p className="text-[11px] text-muted-foreground mt-0.5">Email cannot be changed. Contact your admin.</p>
              </div>
              {settingsMsg && <p className={`text-xs ${settingsMsg.startsWith("Error") ? "text-ts-red" : "text-ts-green"}`}>{settingsMsg}</p>}
              <Button type="submit" disabled={settingsSaving} className="rounded-[20px] text-xs w-fit mt-1 text-white border-0" style={{ background: "var(--gradient-stat-blue)" }}>
                {settingsSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Saving…</> : "Save settings"}
              </Button>
            </form>
          </div>

          {/* Data Deletion Request */}
          <div className="bg-card rounded-xl p-5 border border-red-200 dark:border-red-900">
            <h3 className="text-sm font-semibold mb-1 text-red-600 dark:text-red-400">Request Data Deletion</h3>
            <p className="text-xs text-muted-foreground mb-4">Under the DPDP Act 2023, you have the right to request deletion of your personal data. Your school admin will review and process the request.</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Reason (optional)</label>
                <textarea value={tDeletionReason} onChange={e => setTDeletionReason(e.target.value)}
                  placeholder="Why do you want your data deleted?"
                  className="w-full h-20 text-sm rounded-[10px] px-3 py-2 bg-background border border-border focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                  maxLength={500} />
              </div>
              {tDeletionErr && <p className="text-xs text-red-500">{tDeletionErr}</p>}
              {tDeletionMsg && <p className="text-xs text-emerald-600">{tDeletionMsg}</p>}
              <Button type="button" variant="outline" disabled={tDeletionLoading}
                onClick={async () => {
                  setTDeletionLoading(true); setTDeletionErr(""); setTDeletionMsg("")
                  const res = await requestDataDeletion(tDeletionReason)
                  setTDeletionLoading(false)
                  if ("error" in res) { setTDeletionErr(res.error); return }
                  setTDeletionMsg("Your data deletion request has been submitted. Your school admin will review it shortly.")
                  setTDeletionReason("")
                }}
                className="w-fit text-xs rounded-[20px] border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50">
                {tDeletionLoading ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5"/>Submitting…</> : "Submit Deletion Request"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════════════ */}

      {/* Class code modal */}
      {/* Add Student Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="add-student-heading" className="bg-background rounded-[16px] shadow-xl w-full max-w-md relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-blue)" }} />
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 id="add-student-heading" className="text-sm font-medium text-foreground">Add student</h2>
              <button onClick={() => { setShowStudentModal(false); setStudentResult(null) }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {studentResult ? (
              <div className="px-5 pb-5 space-y-4">
                <div className="p-4 rounded-[10px] bg-ts-green-light space-y-2">
                  <p className="text-sm font-medium text-foreground">Student created!</p>
                  <p className="text-xs text-muted-foreground">Share these credentials with the student.</p>
                  <div className="bg-background rounded-[8px] p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Username</span>
                      <span className="text-xs font-mono font-medium text-foreground">{studentResult.username}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Temp password</span>
                      <span className="text-xs font-mono font-medium text-foreground">{studentResult.temp_password}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-[20px] text-xs bg-ts-blue text-white flex-1" onClick={() => { setStudentResult(null); setStudentError("") }}>Add another</Button>
                  <Button size="sm" variant="outline" className="rounded-[20px] text-xs" onClick={() => { setShowStudentModal(false); setStudentResult(null) }}>Done</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddStudent} className="px-5 pb-5 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Full name *</Label>
                  <Input className="h-9 text-sm" placeholder="Arjun Reddy" required value={studentForm.name} onChange={e => setStudentForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Roll number *</Label>
                    <Input className="h-9 text-sm" placeholder="6B01" required value={studentForm.roll_no} onChange={e => setStudentForm(f => ({ ...f, roll_no: e.target.value }))} />
                  </div>
                  {teacherClasses.length > 1 && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Class</Label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" style={{ colorScheme: "light dark" }} value={studentForm.class_id} onChange={e => setStudentForm(f => ({ ...f, class_id: e.target.value }))}>
                        {teacherClasses.map(c => <option key={c.id} value={c.id}>Class {c.grade}{c.section}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Email (optional)</Label>
                  <Input className="h-9 text-sm" type="email" placeholder="arjun@gmail.com" value={studentForm.email} onChange={e => setStudentForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                {studentError && <p className="text-xs text-ts-red">{studentError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" className="rounded-[20px] text-xs bg-ts-blue text-white flex-1" disabled={studentLoading}>{studentLoading ? "Creating..." : "Create account"}</Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-[20px] text-xs" onClick={() => setShowStudentModal(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="bulk-import-heading" className="bg-background rounded-[16px] shadow-xl w-full max-w-lg relative overflow-hidden max-h-[90vh] flex flex-col">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-purple)" }} />
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <h2 id="bulk-import-heading" className="text-sm font-medium text-foreground">Bulk import students</h2>
              <button onClick={() => setShowBulkModal(false)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 pb-5 overflow-y-auto space-y-4">
              <p className="text-xs text-muted-foreground">CSV columns: <span className="font-mono">Name, Roll No, Email (optional), Phone (optional)</span></p>
              <div className="grid grid-cols-2 gap-3">
                {teacherClasses.length > 1 && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Class *</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" style={{ colorScheme: "light dark" }} value={bulkClassId} onChange={e => setBulkClassId(e.target.value)}>
                      <option value="">Select class</option>
                      {teacherClasses.map(c => <option key={c.id} value={c.id}>Class {c.grade}{c.section}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">CSV file *</Label>
                  <input type="file" accept=".csv" ref={csvRef} onChange={handleCSVFile} className="hidden" />
                  <Button type="button" size="sm" variant="outline" className="w-full h-9 rounded-[8px] text-xs gap-1.5" onClick={() => csvRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" />
                    {bulkRows.length > 0 ? `${bulkRows.length} rows` : "Choose file"}
                  </Button>
                </div>
              </div>
              {bulkRows.length > 0 && bulkResults.length === 0 && (
                <div className="border rounded-[8px] overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs min-w-[280px]">
                    <thead><tr className="bg-muted border-b"><th className="text-left text-muted-foreground px-3 py-2">Name</th><th className="text-left text-muted-foreground px-3 py-2">Roll No</th></tr></thead>
                    <tbody>
                      {bulkRows.slice(0, 6).map((r, i) => <tr key={i} className="border-b"><td className="px-3 py-1.5 text-foreground">{r.name}</td><td className="px-3 py-1.5 font-mono text-foreground">{r.roll_no}</td></tr>)}
                      {bulkRows.length > 6 && <tr><td colSpan={2} className="px-3 py-1.5 text-muted-foreground text-center">...and {bulkRows.length - 6} more</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              {bulkResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">{bulkResults.filter(r => !r.error).length}/{bulkResults.length} created</p>
                  <div className="border rounded-[8px] overflow-hidden overflow-x-auto max-h-48">
                    <table className="w-full text-xs min-w-[360px]">
                      <thead className="sticky top-0 bg-muted"><tr className="border-b"><th className="text-left text-muted-foreground px-3 py-2">Name</th><th className="text-left text-muted-foreground px-3 py-2">Username</th><th className="text-left text-muted-foreground px-3 py-2">Password</th><th className="text-left text-muted-foreground px-3 py-2">Status</th></tr></thead>
                      <tbody>
                        {bulkResults.map((r, i) => <tr key={i} className="border-b"><td className="px-3 py-1.5 text-foreground">{r.name}</td><td className="px-3 py-1.5 font-mono">{r.username}</td><td className="px-3 py-1.5 font-mono">{r.temp_password || "—"}</td><td className="px-3 py-1.5">{r.error ? <span className="text-ts-red">{r.error}</span> : <span className="text-ts-green">OK</span>}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {bulkResults.length === 0
                  ? <Button size="sm" className="rounded-[20px] text-xs bg-ts-purple text-white flex-1" disabled={!bulkRows.length || bulkLoading} onClick={handleBulkImport}>{bulkLoading ? "Importing..." : `Import ${bulkRows.length} students`}</Button>
                  : <Button size="sm" className="rounded-[20px] text-xs bg-ts-blue text-white flex-1" onClick={() => { setBulkRows([]); setBulkResults([]); if (csvRef.current) csvRef.current.value = "" }}>Import another batch</Button>
                }
                <Button size="sm" variant="outline" className="rounded-[20px] text-xs" onClick={() => setShowBulkModal(false)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Remove Dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-remove-heading" className="bg-background rounded-[16px] shadow-xl w-full max-w-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-ts-red" />
            <div className="px-5 pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-ts-red-light"><Trash2 className="w-4 h-4 text-ts-red" /></div>
                <div>
                  <p id="confirm-remove-heading" className="text-sm font-medium text-foreground">Remove student?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{confirmRemove.name}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">This will permanently delete their account. This cannot be undone.</p>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-[20px] text-xs bg-ts-red text-white flex-1" disabled={removeLoading} onClick={handleRemoveStudent}>{removeLoading ? "Removing..." : "Yes, remove"}</Button>
                <Button size="sm" variant="outline" className="rounded-[20px] text-xs flex-1" onClick={() => setConfirmRemove(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Push-to-class success toast ── */}
      {pushedToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-5 py-3 rounded-2xl text-white text-sm font-semibold page-enter"
          style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", boxShadow: "0 8px 32px rgba(22,163,74,0.45)", whiteSpace: "nowrap" }}>
          <span className="text-lg leading-none">✅</span>
          {pushedToast}
        </div>
      )}
      {/* ═══════════════════════════════════════════════════════════════════════
          FILE / LINK VIEWER OVERLAY
      ════════════════════════════════════════════════════════════════════════ */}
      {viewerItem && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
            <button onClick={() => setViewerItem(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-sm font-semibold text-foreground truncate flex-1">{viewerItem.label}</span>
            {viewerItem.type === "link" && viewerItem.link_url && (
              <a href={viewerItem.link_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-ts-blue hover:underline shrink-0">
                <ExternalLink className="w-3.5 h-3.5" /> Open original
              </a>
            )}
          </div>

          {/* Viewer body — right-click disabled to prevent easy file extraction */}
          <div className="flex-1 overflow-hidden" onContextMenu={e => e.preventDefault()}>
            {(() => {
              const ft = viewerItem.file_type ?? ""

              // All file items use pre-fetched blob URLs (auth token never in URL)
              if (viewerItem.type === "file") {
                if (viewerBlobLoading) return (
                  <div className="flex items-center justify-center h-full gap-3 text-muted-foreground text-sm">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading file…
                  </div>
                )
                if (!viewerBlobUrl) return (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Failed to load file.</div>
                )

                if (["jpg","jpeg","png","webp","gif"].includes(ft)) {
                  return (
                    <div className="flex items-center justify-center h-full p-4 bg-muted/30">
                      <img src={viewerBlobUrl} alt={viewerItem.label} className="max-h-full max-w-full object-contain rounded-xl shadow-lg" />
                    </div>
                  )
                }

                if (["mp4","webm"].includes(ft)) {
                  return (
                    <div className="flex items-center justify-center h-full bg-black">
                      <video src={viewerBlobUrl} controls className="max-h-full max-w-full" />
                    </div>
                  )
                }

                if (needsDownloadFallback(viewerItem)) {
                  return (
                    <div className="flex items-center justify-center h-full bg-muted/20">
                      <div className="flex flex-col items-center gap-5 p-8 rounded-2xl bg-card border border-border shadow-sm max-w-sm text-center">
                        <span className="text-5xl">📊</span>
                        <div>
                          <p className="text-base font-semibold text-foreground">{viewerItem.label}</p>
                          <p className="text-xs text-muted-foreground mt-1">PPTX · PDF preview not yet generated</p>
                        </div>
                        <a
                          href={viewerBlobUrl}
                          download={viewerItem.file_name ?? viewerItem.label}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                          style={{ background: "var(--ts-blue)" }}
                        >
                          Download to open
                        </a>
                        <p className="text-[11px] text-muted-foreground">PDF preview is generated automatically when LibreOffice is installed on the server</p>
                      </div>
                    </div>
                  )
                }

                // PDF / PPTX-with-PDF / DOCX / other viewable files
                return (
                  <iframe src={viewerBlobUrl} title={viewerItem.label} className="w-full h-full border-0" />
                )
              }

              // Link items — Google Drive, YouTube, external URLs
              const url = getViewerUrl(viewerItem)
              if (!url) return (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Cannot preview this file type.
                </div>
              )

              // Google URLs — iframe fills height first, width follows 16:9 ratio.
              // This keeps navigation arrows always in view on both mobile and laptop.
              if (viewerItem.type === "link" && viewerItem.link_url && isGoogleUrl(viewerItem.link_url)) {
                const googleEmbedUrl = driveEmbedUrl(viewerItem.link_url)
                const isSlides = viewerItem.link_url.includes("presentation")
                return (
                  <div className="flex items-center justify-center h-full w-full" style={{ background: "#111" }}>
                    <iframe
                      src={googleEmbedUrl}
                      title={viewerItem.label}
                      style={{
                        height: "100%",
                        aspectRatio: isSlides ? "16/9" : undefined,
                        width: isSlides ? undefined : "100%",
                        maxWidth: "100%",
                        border: "none",
                        display: "block",
                      }}
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  </div>
                )
              }

              // YouTube, other external links → iframe
              return (
                <iframe
                  src={url}
                  title={viewerItem.label}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                />
              )
            })()}
          </div>
        </div>,
        document.body
      )}

      {view === "marks" && <TeacherMarksPanel initialClassId={teacherClassId} />}

    </DashboardLayout>
  )
}
