// ─────────────────────────────────────────────────────────────────────────────
// pages/StudentDashboard.tsx — All student views in one component.
// Views: dashboard | lessons | timetable | quizzes | quiz-attempt | quiz-result
//         | certificates | attendance | challenges | settings | teachers
// Each view is lazy-loaded on first open. The section and the selected subject live in the URL
// (/student/dashboard/<section>[/<subject>] — see lib/studentRoutes.ts) so Refresh, Back and
// bookmarks work; the quiz player and quiz results are in-progress screens kept in state.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { withXlsx } from "@/lib/excel"
import { createPortal } from "react-dom"
import { DashboardLayout } from "@/components/DashboardLayout"
import { DashboardNotFound } from "@/components/DashboardNotFound"
import { ProgressBar } from "@/components/ProgressBar"
import {
  LayoutDashboard, BookOpen, ClipboardList, Award, Calendar, Settings,
  ChevronLeft, ChevronRight, Loader2, Download, Eye,
  TrendingUp, Clock, ArrowRight, Zap, Code, Play, RotateCcw, Save, X, ExternalLink,
  Phone, Users, Copy, Check, FileSpreadsheet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/AuthContext"
import { getMyClass, updateProfile, getStudentTimetable } from "@/lib/userApi"
import {
  getStudentDashboard, getStudentQuests, getClassmates,
  getMyQuizzes, submitQuizAttempt, getMyQuizAttempts,
  getActiveChallenges, submitChallenge,
  getMyCertificates, isRevoked, downloadStudentCertPDF, viewStudentCertPDF_student,
  getMyTeachers, getMyAttendance, getAttendanceRange,
  type DashboardSummary, type Quiz, type QuizAttemptResult,
  type QuizHistory, type StudentCertificate, type StudentQuest, type MyTeacher,
  type AttendanceSummary, type AttendancePeriodSummary,
} from "@/lib/studentApi"
import { SubjectIcon, getSubjectMeta } from "./TeacherDashboard"
import { TimetableDisplayView } from "@/components/TimetableDisplayView"
import { DatePicker } from "@/components/ui/date-picker"
import {
  getModules, getViewerUrl, driveEmbedUrl, fetchAsBlobUrl, slideConversionState, isStreamedVideo,
  type LessonModule, type ModuleItem,
} from "@/lib/moduleApi"
import { requestDataDeletion } from "@/lib/dpdpApi"
import { SkeletonList } from "@/components/SkeletonCard"
import { StudentHomeworkPanel } from "@/components/student/StudentHomeworkPanel"
import { StudentLessonsItemsPanel } from "@/components/student/StudentLessonsItemsPanel"
import { StudentMarksPanel } from "@/components/student/StudentMarksPanel"
import { findSubjectBySlug, slugForSubject } from "@/lib/dashboardRoutes"
import { parseStudentPath, studentPath } from "@/lib/studentRoutes"
import {
  attendanceBasisLabel, formatCountedDate, istTodayYmd, isAttendanceCacheUsable,
} from "@/lib/attendanceBasis"
import { UserPhoto } from "@/components/UserPhoto"
import { LessonVideo } from "@/components/LessonVideo"

// ── Static data ───────────────────────────────────────────────────────────────

// INSTRUCTOR removed — real teacher name comes from API (myClass.teacher_name)

const LANGUAGES = [
  { id: "javascript", label: "JavaScript", icon: "🟨", ext: "js",   template: "// JavaScript — try console.log()\nfunction greet(name) {\n  return `Hello, ${name}! 🎉`;\n}\n\nconsole.log(greet(\"World\"));\nconsole.log(\"Result:\", 2 + 2 * 5);" },
  { id: "python",     label: "Python",     icon: "🐍", ext: "py",   template: "# Python — write your code here\ndef greet(name):\n    return f'Hello, {name}! 🎉'\n\nprint(greet('World'))\nprint('Sum:', 2 + 2 * 5)" },
  { id: "html",       label: "HTML",       icon: "🌐", ext: "html", template: "<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; background: #f0f4ff; padding: 20px; }\n    h1 { color: #534AB7; }\n    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }\n  </style>\n</head>\n<body>\n  <div class=\"card\">\n    <h1>Hello, TeachScript! 🎓</h1>\n    <p>Start building amazing things...</p>\n    <button onclick=\"alert('Hello!')\">Click me!</button>\n  </div>\n</body>\n</html>" },
]

const NAV_ITEMS = [
  { label: "Dashboard",     path: "/student/dashboard",    icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "Lessons",       path: "/student/lessons",      icon: <BookOpen className="w-4 h-4" /> },
  { label: "Timetable",     path: "/student/timetable",    icon: <TrendingUp className="w-4 h-4" /> },
  { label: "Quizzes",       path: "/student/quizzes",      icon: <ClipboardList className="w-4 h-4" /> },
  { label: "Certificates",  path: "/student/certificates", icon: <Award className="w-4 h-4" /> },
  { label: "My attendance", path: "/student/attendance",   icon: <Calendar className="w-4 h-4" /> },
  { label: "Homework",      path: "/student/homework",     icon: <ClipboardList className="w-4 h-4" /> },
  { label: "My Marks",      path: "/student/marks",        icon: <FileSpreadsheet className="w-4 h-4" /> },
  { label: "Live Code",     path: "/student/live-code",    icon: <Code className="w-4 h-4" /> },
  { label: "Teachers",      path: "/student/teachers",     icon: <Users className="w-4 h-4" /> },
  { label: "Settings",      path: "/student/settings",     icon: <Settings className="w-4 h-4" /> },
]








type View = "dashboard" | "lessons" | "quiz" | "quiz-results" | "quizzes" | "certificates" | "attendance" | "settings" | "live-coding" | "timetable" | "teachers" | "marks" | "homework"

// Browser-tab title per section ("Homework – TeachScript").
const SECTION_TITLES: Record<View, string> = {
  "dashboard": "Dashboard", "lessons": "Lessons", "quiz": "Quiz", "quiz-results": "Quiz results",
  "quizzes": "Quizzes", "certificates": "Certificates", "attendance": "My attendance",
  "settings": "Settings", "live-coding": "Live Code", "timetable": "Timetable",
  "teachers": "Teachers", "marks": "My Marks", "homework": "Homework",
}

// English wording of the attendance screens' empty states, kept in one place so Hindi can be added later.
// The "counted from" caption itself comes from lib/attendanceBasis.ts.
const ATTENDANCE_TEXT = {
  notRecorded:       "Not recorded",
  notCountedYet:     "Not counted yet",
  noSheetsSince:     (date: string) => `No attendance recorded since ${date}`,
  beforeCountedFrom: "Before the counted-from date",
  noRecordsForDate:  "No attendance recorded for this date.",
  noRecordsInPeriod: "No attendance recorded in this period.",
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

// The caption under an attendance figure, built only from the server's `counted_from` and
// `counted_class_label` (the browser never works the date out). Empty while nothing has loaded.
function attendanceBasisLine(
  source: { counted_from?: string | null; counted_class_label?: string | null } | null | undefined
): string {
  if (!source) return ""
  return attendanceBasisLabel({
    countedFrom: source.counted_from ?? null,
    className:   source.counted_class_label ?? null,
    todayYmd:    istTodayYmd(),
  })
}

function downloadAttendanceXLSX(userName: string, month: string, records: Array<{ date: string; period: number; subject: string; status: string }>) {
  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  const [ty, tm, td] = todayISO.split("-")
  const generatedOn = `${td}-${tm}-${ty}`

  const dataRows = records.map((r, i) => {
    const [y, mo, d] = r.date.split("-")
    const displayDate = `${d}-${mo}-${y}`
    const weekday = new Date(`${r.date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long" })
    return [i + 1, displayDate, weekday, `Period ${r.period}`, r.subject, r.status]
  })

  const aoa = [
    [`Attendance Report — ${userName}`],
    [`Month: ${month}   |   Generated: ${generatedOn}`],
    [],
    ["#", "Date", "Day", "Period", "Subject", "Status"],
    ...dataRows,
  ]

  // The Excel library is loaded only now, when the student asks for the sheet
  withXlsx("my-attendance", XLSX => {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 4 }, { wch: 13 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 10 }]
    ws["!freeze"] = { xSplit: 0, ySplit: 4 }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Attendance")

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    const blob = new Blob([buf], { type: "application/octet-stream" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${userName.replace(/\s+/g, "_")}_Attendance_${month.replace(/\s+/g, "_")}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  })
}

// ── 3D Student Illustration — chibi school boy / girl PNG ────────────────────
function StudentIllustration({ gender }: { gender?: "male" | "female" | null }) {
  const src = gender === "female" ? "/student-girl-3d.webp" : "/student-boy.webp"
  return (
    <img
      src={src}
      alt=""
      className="w-28 h-28 sm:w-44 sm:h-44 flex-shrink-0 object-contain"
      style={{ animation: "float 4s ease-in-out infinite", filter: "drop-shadow(0 12px 28px rgba(83,74,183,0.22))" }}
    />
  )
}
// ── Circle progress ring ──────────────────────────────────────────────────────
function CircleProgress({ value, size = 96, strokeWidth = 9 }: { value: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const [offset, setOffset] = useState(circ)
  const id = `ring-${size}-${value}`
  useEffect(() => { const t = setTimeout(() => setOffset(circ - (value / 100) * circ), 150); return () => clearTimeout(t) }, [value, circ])
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#534AB7"/>
          <stop offset="100%" stopColor="#378ADD"/>
        </linearGradient>
      </defs>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--muted)" strokeWidth={strokeWidth}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="ring-transition"/>
    </svg>
  )
}

// ── Emoji activity indicator ──────────────────────────────────────────────────
function fmtMins(m: number): string {
  if (m <= 0) return ""
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ""}`.trim()
}

function ActivityEmoji({ minutes, max, day, isToday }: { minutes: number; max: number; day: string; isToday: boolean }) {
  // max = school_day_minutes (first period start → last period end from timetable)
  // pct = how much of the school day the student was active in the app
  const pct     = max > 0 ? Math.min(100, Math.round((minutes / max) * 100)) : 0
  const isFull  = pct >= 100                   // 100% — full school day
  const isGood  = pct >= 50 && !isFull         // 50–99%
  const isLow   = pct > 0 && pct < 25          // 1–24%
  const isMid   = pct >= 25 && pct < 50        // 25–49%
  const isEmpty = minutes === 0
  const [popped, setPopped] = useState(false)
  useEffect(() => { const t = setTimeout(() => setPopped(true), 80 + Math.random() * 160); return () => clearTimeout(t) }, [])

  type Cfg = { emoji: string; color: string; bg: string; anim: string; delay?: string }
  const cfg: Cfg = isEmpty
    ? { emoji: "😴", color: "var(--muted-foreground)", bg: "var(--muted)",           anim: "float 4.5s ease-in-out infinite" }
    : isFull
    ? { emoji: "🤩", color: "#16a34a", bg: "rgba(22,163,74,0.13)",     anim: "emojiBounce 0.75s ease-in-out infinite", delay: "0s" }
    : isGood
    ? { emoji: "😊", color: "#EF9F27", bg: "rgba(239,159,39,0.11)",    anim: "float 3s ease-in-out infinite" }
    : isMid
    ? { emoji: "😐", color: "#378ADD", bg: "rgba(55,138,221,0.11)",    anim: "float 4s ease-in-out infinite" }
    : { emoji: "😤", color: "#dc2626", bg: "rgba(220,38,38,0.11)",     anim: "emojiShake 0.55s ease-in-out infinite" }

  return (
    <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
      <span className="text-[9px] font-black tabular-nums" style={{ color: cfg.color, minHeight: 11, lineHeight: 1 }}>
        {!isEmpty ? fmtMins(minutes) : ""}
      </span>
      <div className="w-full rounded-2xl flex items-center justify-center relative overflow-hidden"
        style={{ height: 54, background: cfg.bg, border: `1.5px solid ${cfg.color}28`,
          boxShadow: isFull ? "0 0 14px rgba(22,163,74,0.22)" : isLow ? "0 0 10px rgba(220,38,38,0.15)" : "none" }}>
        <span className="text-[26px] select-none leading-none"
          style={{ display: "inline-block", animation: cfg.anim,
            opacity: isEmpty ? 0.45 : 1,
            filter: isEmpty ? "grayscale(0.4)" : "none",
            animationDelay: cfg.delay,
            ...(popped ? {} : { animation: "emojiPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }) }}>
          {cfg.emoji}
        </span>
        {isFull  && <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: "radial-gradient(circle at 50% 0%,rgba(74,222,128,0.18),transparent 70%)" }}/>}
        {isLow   && <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ background: "radial-gradient(circle at 50% 100%,rgba(220,38,38,0.14),transparent 70%)" }}/>}
      </div>
      <span className="text-[10px] font-bold mt-0.5 truncate w-full text-center"
        style={{ color: isFull ? "#16a34a" : isLow ? "#dc2626" : isToday ? "#534AB7" : "var(--muted-foreground)" }}>
        {day?.slice(0, 3) ?? ""}
      </span>
    </div>
  )
}

// ── View wrapper ──────────────────────────────────────────────────────────────
function ViewWrapper({ id, children }: { id: string; children: React.ReactNode }) {
  return <div key={id}>{children}</div>
}

// ── Types for pushed problems from teacher ────────────────────────────────────
interface PushedProblem {
  id: number; title: string; difficulty: string; language: string
  description: string; constraints: string; expectedOutput: string; deadline: string
  sent: boolean; students: number; _deadlineRaw?: string | null
}

// ── Live coding view ──────────────────────────────────────────────────────────
function LiveCodingView({ onBack, userName }: { onBack: () => void; userName: string }) {
  const [langId,     setLangId]     = useState("javascript")
  const [code,       setCode]       = useState(LANGUAGES[0].template)
  const [output,     setOutput]     = useState("")
  const [htmlOut,    setHtmlOut]    = useState("")
  const [running,    setRunning]    = useState(false)
  const [saved,      setSaved]      = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // ── Teacher challenges — load from backend, fall back to localStorage ────
  const [challenges,        setChallenges]        = useState<PushedProblem[]>([])
  const [activeChallengeId, setActiveChallengeId] = useState<string | number | null>(null)
  const [submitDone,        setSubmitDone]        = useState<Set<string | number>>(new Set())

  const [challengesLoading, setChallengesLoading] = useState(true)
  const [submitError,       setSubmitError]       = useState("")
  const [submitting,        setSubmitting]        = useState(false)
  const submittedCodeRef = useRef<Record<string | number, string>>({})

  useEffect(() => {
    // Load challenges from backend only — no localStorage fallback
    // localStorage was the old system; backend is now the single source of truth
    setChallengesLoading(true)
    getActiveChallenges().then(res => {
      setChallengesLoading(false)
      if ("error" in res) return
      const mapped: PushedProblem[] = res.challenges.map((c, i) => ({
        id:             i + 1000,
        title:          c.title,
        difficulty:     c.difficulty,
        language:       c.language,
        description:    c.description,
        constraints:    c.constraints,
        expectedOutput: c.expected_output,
        deadline:       c.deadline
          ? new Date(c.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "No deadline",
        _deadlineRaw:   c.deadline ?? null,
        sent: true, students: 0,
        _backendId: c._id,
      } as PushedProblem & { _backendId: string }))
      setChallenges(mapped)
      // Pre-mark already submitted challenges
      res.challenges.forEach((c, i) => {
        if (c.submitted) setSubmitDone(prev => new Set([...prev, i + 1000]))
      })
    }).catch(() => setChallengesLoading(false))
  }, [])


  const lang = LANGUAGES.find(l => l.id === langId)!
  const lines = code.split("\n").length
  const activeChallenge = challenges.find(c => c.id === activeChallengeId) ?? null

  const LANG_MAP: Record<string, string> = {
    "JavaScript": "javascript", "Python": "python", "HTML": "html",
  }

  const loadChallenge = (challenge: PushedProblem) => {
    const targetId = LANG_MAP[challenge.language] ?? "javascript"
    const targetLang = LANGUAGES.find(l => l.id === targetId)!
    setLangId(targetId)
    setActiveChallengeId(challenge.id)
    setOutput(""); setHtmlOut("")
    const cp = targetId === "python" ? "#" : "//"
    setCode(`${cp} Write your solution here\n`)
  }

  const submitSolution = async () => {
    if (!activeChallengeId) return
    const challenge = challenges.find(c => c.id === activeChallengeId) as (PushedProblem & { _backendId?: string }) | undefined
    if (!challenge) return
    setSubmitError("")
    setSubmitting(true)
    if (challenge._backendId) {
      const res = await submitChallenge(challenge._backendId, code, langId)
      setSubmitting(false)
      if ("error" in res) {
        setSubmitError(res.error ?? "Submission failed. Please try again.")
        return
      }
    } else {
      setSubmitting(false)
    }
    submittedCodeRef.current[activeChallengeId] = code
    setSubmitDone(prev => new Set([...prev, activeChallengeId]))
  }

  const switchLang = (id: string) => {
    setLangId(id); setCode(LANGUAGES.find(l => l.id === id)!.template); setOutput(""); setHtmlOut("")
    setActiveChallengeId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault()
      const el = e.currentTarget
      const s = el.selectionStart, end = el.selectionEnd
      setCode(code.slice(0, s) + "  " + code.slice(end))
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2 })
    }
  }

  const run = async () => {
    setRunning(true)
    setOutput("")
    setHtmlOut("")

    if (lang.id === "html") {
      setHtmlOut(code)
      setRunning(false)
      return
    }

    // Python — execute on the backend
    if (lang.id === "python") {
      try {
        const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
        const res = await fetch(`${BACKEND}/api/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code, language: "python" }),
        })
        const data = await res.json() as { output?: string; error?: string; stderr?: string }
        if (data.error) {
          setOutput("❌ " + data.error)
        } else {
          setOutput((data.output ?? "(no output)") + (data.stderr ? `\n⚠️ ${data.stderr}` : ""))
        }
      } catch {
        setOutput("❌ Could not reach backend — make sure the server is running")
      }
      setRunning(false)
      return
    }

    // JavaScript — runs in a Web Worker (separate thread) so infinite loops can be
    // killed with worker.terminate() without freezing the parent page.
    // Same-origin iframes share the JS thread, so an iframe timeout is unreliable.
    const workerSrc = `
      self.onmessage = function(e) {
        const userCode = e.data;
        const logs = [];
        const _con = {
          log:   (...a) => logs.push(a.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" ")),
          error: (...a) => logs.push("\\u274C " + a.join(" ")),
          warn:  (...a) => logs.push("\\u26A0\\uFE0F " + a.join(" ")),
        };
        try {
          (new Function("console", userCode))(_con);
          self.postMessage({ logs, error: null });
        } catch(e) {
          self.postMessage({ logs: logs, error: e.message });
        }
      };
    `
    const blob   = new Blob([workerSrc], { type: "application/javascript" })
    const blobUrl = URL.createObjectURL(blob)
    const worker  = new Worker(blobUrl)

    const cleanup = (msg: string | null) => {
      worker.terminate()
      URL.revokeObjectURL(blobUrl)
      if (msg !== null) setOutput(msg)
      setRunning(false)
    }

    const timeout = setTimeout(() => cleanup("⏱️ Execution timed out (5s)"), 5000)

    worker.onmessage = (e: MessageEvent<{ logs: string[]; error: string | null }>) => {
      clearTimeout(timeout)
      if (e.data.error) {
        cleanup("❌ " + e.data.error)
      } else {
        cleanup(e.data.logs?.join("\n") || "(no output)")
      }
    }
    worker.onerror = (e) => {
      clearTimeout(timeout)
      cleanup("❌ " + (e.message ?? "Runtime error"))
    }

    worker.postMessage(code)
  }

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  const reset = () => { setCode(lang.template); setOutput(""); setHtmlOut("") }

  return (
    <ViewWrapper id="live-coding">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5"/> Back
          </button>
          <h1 className="text-base font-black text-foreground flex items-center gap-2">
            <Code className="w-4 h-4" style={{ color: "#534AB7" }}/> Live Code Editor
          </h1>
        </div>

        {/* ── Teacher Challenges Panel ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-base leading-none">🎯</span>
            <h3 className="text-sm font-black text-foreground">Teacher Challenges</h3>
            {challengesLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            {!challengesLoading && challenges.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(83,74,183,0.1)", color: "#534AB7" }}>
                {challenges.length} assigned
              </span>
            )}
          </div>

          {challengesLoading && (
            <div className="skillio-card p-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading challenges…</p>
            </div>
          )}

          {!challengesLoading && challenges.length === 0 && (
            <div className="skillio-card p-8 flex flex-col items-center justify-center gap-2 text-center">
              <span className="text-3xl leading-none">📭</span>
              <p className="text-sm font-bold text-foreground">No challenges yet</p>
              <p className="text-xs text-muted-foreground">Your teacher hasn't assigned any challenges. Check back later.</p>
            </div>
          )}

          {!challengesLoading && challenges.length > 0 && (
            <div className="flex flex-col gap-3">
              {challenges.map(c => {
                const done   = submitDone.has(c.id)
                const active = activeChallengeId === c.id
                const diffColor = c.difficulty === "Easy" ? "#16a34a" : c.difficulty === "Medium" ? "#d97706" : "#dc2626"
                const diffBg    = c.difficulty === "Easy" ? "rgba(22,163,74,0.12)" : c.difficulty === "Medium" ? "rgba(217,119,6,0.12)" : "rgba(220,38,38,0.12)"
                return (
                  <div key={c.id} className="skillio-card overflow-hidden transition-all duration-200"
                    style={active ? { border: "1.5px solid rgba(83,74,183,0.5)", boxShadow: "0 0 0 4px rgba(83,74,183,0.07)" } : {}}>
                    <div className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl leading-none"
                        style={{ background: done ? "rgba(22,163,74,0.12)" : active ? "rgba(83,74,183,0.12)" : "var(--muted)" }}>
                        {done ? "✅" : c.difficulty === "Easy" ? "🟢" : c.difficulty === "Medium" ? "🟡" : "🔴"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-foreground leading-tight mb-1.5 truncate">{c.title}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: diffBg, color: diffColor }}>{c.difficulty}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{c.language}</span>
                          <span className="text-[10px] text-muted-foreground">Due {c.deadline}</span>
                        </div>
                      </div>
                      {done ? (
                        <div className="flex items-center gap-1.5 flex-shrink-0 rounded-full overflow-hidden" style={{ border: "1px solid rgba(22,163,74,0.3)", background: "rgba(22,163,74,0.08)" }}>
                          <span className="text-[11px] font-bold pl-3 pr-2 py-1.5" style={{ color: "#16a34a" }}>✓ Submitted</span>
                          {(!c._deadlineRaw || new Date(c._deadlineRaw) > new Date()) && (
                            <>
                              <div className="w-px h-4" style={{ background: "rgba(22,163,74,0.3)" }} />
                              <button
                                onClick={() => {
                                  setSubmitDone(prev => { const n = new Set(prev); n.delete(c.id); return n })
                                  setSubmitError("")
                                  const saved = submittedCodeRef.current[c.id]
                                  if (saved) {
                                    setActiveChallengeId(c.id)
                                    setLangId(LANG_MAP[c.language] ?? "javascript")
                                    setCode(saved)
                                    setOutput(""); setHtmlOut("")
                                  } else {
                                    loadChallenge(c)
                                  }
                                }}
                                className="cursor-pointer text-[11px] font-bold pr-3 pl-2 py-1.5 hover:opacity-70 transition-opacity"
                                style={{ color: "#16a34a" }}>
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => loadChallenge(c)}
                          className="cursor-pointer flex-shrink-0 text-xs font-bold px-4 py-1.5 rounded-full text-white transition-all hover:opacity-90 active:scale-95"
                          style={{ background: active ? "linear-gradient(135deg,#534AB7,#7970D6)" : "linear-gradient(135deg,#534AB7,#378ADD)" }}>
                          {active ? "● Active" : "Start →"}
                        </button>
                      )}
                    </div>
                    {active && (
                      <div className="px-4 pb-4 pt-0 grid sm:grid-cols-3 gap-3">
                        {c.description && (
                          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(83,74,183,0.07)", border: "1px solid rgba(83,74,183,0.15)" }}>
                            <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: "#534AB7" }}>📋 Problem</p>
                            <p className="text-xs text-foreground leading-relaxed">{c.description}</p>
                          </div>
                        )}
                        {c.constraints && (
                          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(239,159,39,0.07)", border: "1px solid rgba(239,159,39,0.2)" }}>
                            <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: "#EF9F27" }}>⚙️ Constraints</p>
                            <p className="text-xs text-foreground leading-relaxed">{c.constraints}</p>
                          </div>
                        )}
                        {c.expectedOutput && (
                          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.2)" }}>
                            <p className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: "#16a34a" }}>✅ Expected Output</p>
                            <code className="text-xs font-mono block" style={{ color: "#16a34a" }}>{c.expectedOutput}</code>
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

        {/* Language selector */}
        <div className="flex gap-2 flex-wrap">
          {LANGUAGES.map(l => (
            <button
              key={l.id}
              onClick={() => switchLang(l.id)}
              className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${langId === l.id ? "text-white shadow-lg scale-105" : "text-muted-foreground hover:text-foreground"}`}
              style={langId === l.id ? { background: "linear-gradient(135deg,#534AB7,#378ADD)" } : { background: "var(--muted)" }}
            >
              <span>{l.icon}</span> {l.label}
            </button>
          ))}
        </div>

        {/* Editor card */}
        <div className="skillio-card overflow-hidden" style={{ border: "1px solid rgba(83,74,183,0.2)" }}>
          {/* Title bar */}
          <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#13111f", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-400 cursor-pointer hover:opacity-80" onClick={onBack}/>
              <span className="w-3 h-3 rounded-full bg-yellow-400 cursor-pointer hover:opacity-80" onClick={reset}/>
              <span className="w-3 h-3 rounded-full bg-green-400 cursor-pointer hover:opacity-80" onClick={run}/>
            </div>
            <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
              {lang.icon} main.{lang.ext}
            </span>
            <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>{lines} ln</span>
          </div>

          {/* Editor body */}
          <div className="flex" style={{ background: "#1a1628" }}>
            {/* Line numbers */}
            <div className="select-none py-3 px-2 text-right flex-shrink-0" style={{ minWidth: 44, background: "#15121e", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
              {Array.from({ length: lines }, (_, i) => (
                <div key={i} className="font-mono text-xs leading-6" style={{ color: "rgba(255,255,255,0.18)" }}>
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Textarea */}
            <textarea
              ref={taRef}
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="flex-1 py-3 px-4 font-mono text-xs leading-6 resize-none focus:outline-none"
              style={{ background: "#1a1628", color: "#e2dff8", minHeight: 220, caretColor: "#7970D6" }}
              rows={Math.max(12, lines + 2)}
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={run}
            disabled={running}
            className="cursor-pointer rounded-full text-xs text-white border-0 font-bold px-5 flex items-center gap-1.5"
            style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)" }}
          >
            {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Running…</> : <><Play className="w-3.5 h-3.5 fill-white"/> Run Code</>}
          </Button>
          <Button variant="outline" className="cursor-pointer rounded-full text-xs font-semibold flex items-center gap-1.5" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5"/> Reset
          </Button>
          <Button variant="outline" className="cursor-pointer rounded-full text-xs font-semibold flex items-center gap-1.5" onClick={save}>
            <Save className="w-3.5 h-3.5"/> {saved ? "✓ Saved!" : "Save"}
          </Button>
          {activeChallenge && !submitDone.has(activeChallenge.id) && (
            <Button
              onClick={submitSolution}
              disabled={submitting}
              className="cursor-pointer rounded-full text-xs text-white font-bold px-4 flex items-center gap-1.5 border-0"
              style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)", boxShadow: "0 4px 16px rgba(83,74,183,0.35)" }}
            >
              {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Submitting…</> : <>🚀 Submit Solution</>}
            </Button>
          )}
          {activeChallenge && submitDone.has(activeChallenge.id) && (
            <span className="rounded-full text-xs font-bold px-4 py-1.5 flex items-center gap-1.5"
              style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)" }}>
              ✅ Solution Submitted!
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground font-mono">{code.length} chars · {lines} lines</span>
        </div>
        {submitError && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold" style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)" }}>
            ❌ {submitError}
          </div>
        )}

        {/* Output */}
        {(output || htmlOut) && (
          <div className="skillio-card overflow-hidden" style={{ border: output.startsWith("❌") ? "1px solid rgba(220,38,38,0.3)" : "1px solid rgba(83,74,183,0.15)" }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-foreground">Output</span>
                {!output.startsWith("❌") && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a" }}>● Done</span>
                )}
              </div>
              <button className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={() => { setOutput(""); setHtmlOut("") }} aria-label="Clear output">
                <X className="w-3.5 h-3.5"/>
              </button>
            </div>
            {htmlOut ? (
              <iframe
                srcDoc={htmlOut}
                sandbox="allow-scripts"
                title="HTML preview"
                className="w-full border-0 bg-white"
                style={{ height: 240 }}
              />
            ) : (
              <pre className="font-mono text-xs p-4 leading-relaxed overflow-x-auto whitespace-pre-wrap"
                style={{ color: output.startsWith("❌") ? "#ef4444" : "var(--foreground)", maxHeight: 240, overflowY: "auto" }}>
                {output}
              </pre>
            )}
          </div>
        )}
      </div>
    </ViewWrapper>
  )
}

function isGoogleUrl(url: string): boolean {
  return (
    url.includes("drive.google.com") ||
    url.includes("docs.google.com") ||
    url.includes("slides.google.com") ||
    url.includes("sheets.google.com") ||
    url.includes("forms.google.com")
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function StudentDashboard() {
  const { user, signOutDueToSessionExpired } = useAuth()
  const [dashError, setDashError] = useState("")
  const location = useLocation()
  const navigate = useNavigate()
  const route = parseStudentPath(location.pathname)
  // The quiz player and quiz results are in-progress screens, deliberately kept out of the URL.
  const [inProgressView, setInProgressView] = useState<"quiz" | "quiz-results" | null>(null)
  const urlView: View = route.kind === "section" ? route.section : "dashboard"
  const view: View = inProgressView ?? urlView
  // Leaving the page with Back/Forward (or any URL change) also leaves an in-progress screen.
  useEffect(() => { setInProgressView(null) }, [location.pathname])
  const [myClass, setMyClass] = useState<{ id: string; grade: number; section: string; label: string; teacher_name?: string | null; subject_teachers?: Array<{ teacher_id: string | null; teacher_name: string | null; subject: string }> } | null>(null)

  useEffect(() => {
    getMyClass().then(res => { if (!("error" in res) && res.class) setMyClass(res.class) })
  }, [user?.id])

  useEffect(() => {
    if (user) setSettingsForm(f => ({ ...f, name: user.name ?? "", language: user.preferred_language ?? "english" }))
  }, [user?.id])

  type StudentAttRec = { date: string; period: number; subject: string; status: string }
  const [myAttendance,  setMyAttendance]  = useState<StudentAttRec[]>([])
  const [attLoaded,     setAttLoaded]     = useState(false)
  const [attSummary,    setAttSummary]    = useState<AttendanceSummary | null>(null)
  // Where the server counted the figures from (null until the attendance response has arrived)
  const [attBasis,      setAttBasis]      = useState<{ counted_from: string | null; counted_class_label: string | null } | null>(null)
  const [rangeFrom,     setRangeFrom]     = useState("")
  const [rangeTo,       setRangeTo]       = useState("")
  const [rangeResult,   setRangeResult]   = useState<AttendancePeriodSummary | null>(null)
  const [rangeLoading,  setRangeLoading]  = useState(false)
  const [rangeQueried,  setRangeQueried]  = useState(false)

  const [teachers,        setTeachers]        = useState<MyTeacher[]>([])
  const [teachersLoading, setTeachersLoading] = useState(false)
  const [teachersLoaded,  setTeachersLoaded]  = useState(false)
  const [copiedId,        setCopiedId]        = useState<string | null>(null)

  useEffect(() => {
    if (view !== "attendance" || attLoaded) return
    getMyAttendance().then(res => {
      setAttLoaded(true)
      if ("error" in res) return
      setAttSummary(res.summary)
      setMyAttendance(res.records)
      setAttBasis({ counted_from: res.counted_from ?? null, counted_class_label: res.counted_class_label ?? null })
    })
  }, [view, attLoaded])

  // Lazy-load teachers when the Teachers view is first opened
  useEffect(() => {
    if (view !== "teachers" || teachersLoaded) return
    setTeachersLoading(true)
    getMyTeachers().then(res => {
      setTeachersLoading(false)
      setTeachersLoaded(true)
      if ("error" in res) return
      setTeachers(res.teachers)
    })
  }, [view, teachersLoaded])

  // timetable (read-only)
  type TTSlot = { day: string; period: number; subject: string; teacher_id: string | null; teacher_name: string | null; start_time: string; end_time: string }
  const [ttSlots, setTtSlots] = useState<TTSlot[]>([])
  const [ttSubjects, setTtSubjects] = useState<string[]>([])
  const [ttUpdatedBy, setTtUpdatedBy] = useState<string | null>(null)
  const [ttUpdatedAt, setTtUpdatedAt] = useState<string | null>(null)
  const [ttLoading, setTtLoading] = useState(false)
  const [ttLoaded, setTtLoaded] = useState(false)
  const [ttFailed, setTtFailed] = useState(false)

  useEffect(() => {
    if ((view !== "timetable" && view !== "lessons") || ttLoaded || ttLoading) return
    setTtLoading(true)
    getStudentTimetable().then(res => {
      setTtLoading(false)
      setTtLoaded(true)
      if ("error" in res) { setTtFailed(true); return }
      setTtFailed(false)
      setTtSlots(res.timetable)
      setTtSubjects(res.subjects)
      setTtUpdatedBy(res.timetable_updated_by_name)
      setTtUpdatedAt(res.timetable_updated_at)
    })
  }, [view, ttLoaded, ttLoading])

  // ── Real data state (must be declared before the useEffects that use them) ──
  const [dashSummary,    setDashSummary]    = useState<DashboardSummary | null>(null)
  const [dashLoading,    setDashLoading]    = useState(true)
  const [realQuests,      setRealQuests]      = useState<StudentQuest[]>([])
  const [questsLoading,   setQuestsLoading]   = useState(true)
  const [realClassmates,  setRealClassmates]  = useState<{ _id: string; name: string; points: number; initials: string }[]>([])
  const [realQuizzes,    setRealQuizzes]    = useState<Quiz[]>([])
  const [quizzesLoading, setQuizzesLoading] = useState(false)
  const [quizzesLoaded,  setQuizzesLoaded]  = useState(false)
  const [activeQuiz,     setActiveQuiz]     = useState<Quiz | null>(null)
  const [quizAttemptResult, setQuizAttemptResult] = useState<QuizAttemptResult | null>(null)
  const [quizHistory,    setQuizHistory]    = useState<QuizHistory[]>([])
  const [submittingQuiz, setSubmittingQuiz] = useState(false)
  const [realCerts,      setRealCerts]      = useState<StudentCertificate[]>([])
  const [certsLoading,   setCertsLoading]   = useState(false)
  const [certsLoaded,    setCertsLoaded]    = useState(false)
  const [certsError,     setCertsError]     = useState(false)

  // The dashboard summary is only fetched for the screens that show it — the Dashboard
  // itself and the Lessons subject grid (per-subject progress) — and at most once every
  // 2 minutes. Other sections never trigger it. Mark Done updates the numbers locally.
  const DASH_FRESH_MS = 2 * 60_000
  const dashFetchedAtRef = useRef(0)
  const extrasFetchedAtRef = useRef(0)
  const needsDashSummary = view === "dashboard" || view === "lessons"

  // Refresh the dashboard summary — called when a screen that shows it opens, on Retry, and after clock in/out
  function refreshDashboard() {
    if (!user?.id) return
    const cacheKey = `ts_dash_v2_${user.id}`
    dashFetchedAtRef.current = Date.now()
    getStudentDashboard().then(res => {
      setDashLoading(false)
      if (!("error" in res)) {
        setDashError("")
        setDashSummary(res)
        try { localStorage.setItem(cacheKey, JSON.stringify({ data: res, ts: Date.now() })) } catch { /* ignore */ }
        return
      }
      dashFetchedAtRef.current = 0 // a failed load must not count as fresh
      // A 401 here means the session died server-side (idle revocation on another
      // tab, token_version bump, etc.) without this tab's own idle timer firing —
      // sign out properly with an explanation rather than leaving stale/empty data
      // on screen looking like the student's progress vanished.
      const status = (res as { status?: number }).status
      if (status === 401) { signOutDueToSessionExpired(); return }
      setDashError("We couldn't load your dashboard. Please check your connection and try again.")
    })
  }

  // Quests and the classmates leaderboard are only shown on the Dashboard screen
  useEffect(() => {
    if (!user?.id || view !== "dashboard") return
    if (extrasFetchedAtRef.current && Date.now() - extrasFetchedAtRef.current < DASH_FRESH_MS) return
    extrasFetchedAtRef.current = Date.now()
    getStudentQuests().then(res => {
      setQuestsLoading(false)
      if (!("error" in res)) setRealQuests(res.quests)
    })
    getClassmates().then(res => {
      if (!("error" in res)) setRealClassmates(res.classmates)
    })
  }, [user?.id, view])

  // Fetch the dashboard summary when a screen that shows it is opened
  useEffect(() => {
    if (!user?.id || !needsDashSummary) return
    if (dashFetchedAtRef.current && Date.now() - dashFetchedAtRef.current < DASH_FRESH_MS) return

    // Step 1: Load from localStorage cache immediately (feels instant)
    const cacheKey    = `ts_dash_v2_${user.id}` // v2 = includes day + school_day_minutes
    const cacheTTL    = 5 * 60 * 1000 // 5 minutes
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: DashboardSummary; ts: number }
        // Validate cache has the new format (weekly_activity items must have `day`
        // field, and days_recorded must be present). A cache saved before a field
        // was added would otherwise render as a false "0" until the background
        // refresh overwrites it a moment later — skip it instead and show the
        // loading state until fresh data arrives. A copy saved before attendance was
        // counted from the class's year start carries the old, wrong figure
        // (isAttendanceCacheUsable), so it is skipped too.
        const isValid = Array.isArray(data.weekly_activity) &&
          (data.weekly_activity.length === 0 || "day" in data.weekly_activity[0]) &&
          "days_recorded" in data &&
          isAttendanceCacheUsable(data)
        if (isValid && Date.now() - ts < cacheTTL) {
          setDashSummary(data)
          setDashLoading(false) // show cached data instantly, no spinner
        }
      }
    } catch { /* ignore */ }

    // Step 2: Fetch fresh data in background (silently updates)
    refreshDashboard()
  }, [user?.id, needsDashSummary])

  // Fetch quizzes + history when navigating to quizzes view
  useEffect(() => {
    if (view !== "quizzes" || quizzesLoaded) return
    setQuizzesLoading(true)
    Promise.all([getMyQuizzes(), getMyQuizAttempts()]).then(([qRes, hRes]) => {
      setQuizzesLoading(false)
      setQuizzesLoaded(true)
      if (!("error" in qRes)) setRealQuizzes(qRes.quizzes)
      if (!("error" in hRes)) setQuizHistory(hRes.history)
    })
  }, [view, quizzesLoaded])

  // Fetch certificates when navigating to certificates view (once per visit to the page)
  useEffect(() => {
    if (view !== "certificates" || certsLoaded) return
    setCertsLoading(true)
    getMyCertificates().then(cRes => {
      setCertsLoading(false)
      setCertsLoaded(true)
      if ("error" in cRes) { setCertsError(true); return }
      setRealCerts(cRes.certificates)
    })
  }, [view, certsLoaded])

  const [quizAnswer,        setQuizAnswer]        = useState<(number | null)[]>(Array(5).fill(null))
  const [quizQuestion,      setQuizQuestion]      = useState(0)
  const [quizSubmitted,     setQuizSubmitted]     = useState(false)
  const [attendanceMonth,   setAttendanceMonth]   = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selectedAttDate,  setSelectedAttDate]   = useState(() => new Date().toLocaleDateString("en-CA"))
  const [settingsForm,      setSettingsForm]      = useState({ name: "", language: "english", whatsapp: "" })
  const [settingsSaved,     setSettingsSaved]     = useState(false)
  const [settingsSaving,    setSettingsSaving]    = useState(false)
  const [settingsError,     setSettingsError]     = useState("")
  const [deletionReason,    setDeletionReason]    = useState("")
  const [deletionLoading,   setDeletionLoading]   = useState(false)
  const [deletionMsg,       setDeletionMsg]       = useState("")
  const [deletionErr,       setDeletionErr]       = useState("")
  const [selectedWeekDate,  setSelectedWeekDate]  = useState<Date | null>(null)
  const [expandedEvent,     setExpandedEvent]     = useState<{ title: string; message: string; type: string; color: string; icon: string; scheduled_at?: string } | null>(null)
  const [weekAnchor,        setWeekAnchor]        = useState(() => new Date())
  const [showEventCalendar, setShowEventCalendar] = useState(false)
  const [eventCalMonth,     setEventCalMonth]     = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })

  // The selected subject comes from the URL (/lessons/<subject-slug>). Subject names are free text from
  // the timetable (plus any subject that already has lessons), so the slug is matched against that list.
  // While the list is still loading the slug is "pending" (shown as loading). It only becomes "not found"
  // once loading finished successfully; if the timetable request failed we cannot tell, so we offer a retry.
  const lessonSubjectNames = Array.from(new Set([...ttSubjects, ...(dashSummary?.module_progress ?? []).map(p => p.subject)]))
  const lessonsSlug = route.kind === "section" && route.section === "lessons" ? route.subjectSlug : null
  const lessonSubject = lessonsSlug ? findSubjectBySlug(lessonsSlug, lessonSubjectNames) : null
  const subjectsSettled = ttLoaded && !ttLoading && !dashLoading
  const subjectUnresolved = lessonsSlug !== null && lessonSubject === null
  const subjectPending = subjectUnresolved && !subjectsSettled
  const subjectLoadFailed = subjectUnresolved && subjectsSettled && ttFailed
  const subjectNotFound = subjectUnresolved && subjectsSettled && !ttFailed
  const retrySubjects = () => { setTtFailed(false); setTtLoaded(false) }

  // ── module system (student view) ─────────────────────────────────────────────
  const [sModules, setSModules] = useState<LessonModule[]>([])
  const [sModulesLoading, setSModulesLoading] = useState(false)
  const [sModulesKey, setSModulesKey] = useState("")
  const [sViewedIds, setSViewedIds] = useState<string[]>([])
  const [sViewerItem, setSViewerItem] = useState<ModuleItem | null>(null)
  const [sViewerBlobUrl, setSViewerBlobUrl] = useState<string | null>(null)
  const [sViewerBlobLoading, setSViewerBlobLoading] = useState(false)
  // Bumped by the viewer's "Try again" button to load the same file again
  const [sViewerRetry, setSViewerRetry] = useState(0)
  // True only after the file really failed to load (drives the "Try again" message)
  const [sViewerFailed, setSViewerFailed] = useState(false)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [itemSearchQuery, setItemSearchQuery] = useState("")
  const [itemStatusFilter, setItemStatusFilter] = useState<"all" | "viewed" | "remaining">("all")
  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null)

  // Load modules when student drills into a subject
  useEffect(() => {
    if (!lessonSubject || !myClass?.id) return
    const key = `${myClass.id}::${lessonSubject}`
    if (key === sModulesKey) return
    // A slow answer for a subject the student has already left must not overwrite the current one
    // (easy to trigger now that Back/Forward move between subjects).
    let cancelled = false
    setSModulesLoading(true)
    setSModules([])
    setSelectedModuleId(null)
    setItemSearchQuery("")
    setItemStatusFilter("all")
    getModules(myClass.id, lessonSubject).then(res => {
      if (cancelled) return
      setSModulesLoading(false)
      if ("error" in res) return
      setSModules(res.modules)
      setSViewedIds(res.viewedItemIds)
      setSModulesKey(key)
    })
    return () => { cancelled = true }
  }, [lessonSubject, myClass?.id])

  // "Check again" on a lesson that is still being prepared: re-read this subject's lessons once
  // (no polling) and show the PDF if it is ready now. Module selection and filters are kept.
  const [slideChecking, setSlideChecking] = useState(false)
  async function recheckSlideConversion(item: ModuleItem) {
    if (!lessonSubject || !myClass?.id) return
    setSlideChecking(true)
    const res = await getModules(myClass.id, lessonSubject)
    setSlideChecking(false)
    if ("error" in res) return
    setSModules(res.modules)
    setSViewedIds(res.viewedItemIds)
    const fresh = res.modules.flatMap(m => m.items).find(i => i._id === item._id)
    if (fresh) setSViewerItem(fresh)
  }

  // Leaving a subject (or opening a different link) clears the per-subject lesson state.
  useEffect(() => {
    if (lessonSubject) return
    setSModules([]); setSModulesKey(""); setSelectedModuleId(null)
    setSModulesLoading(false)
    setItemSearchQuery(""); setItemStatusFilter("all")
  }, [lessonSubject])

  // Auto-select the first module once modules load (matches design: a module
  // is always selected so the right panel is never empty on first entry)
  useEffect(() => {
    if (sModules.length === 0) { setSelectedModuleId(null); return }
    if (!selectedModuleId || !sModules.some(m => m._id === selectedModuleId)) {
      setSelectedModuleId(sModules[0]._id)
    }
  }, [sModules, selectedModuleId])

  // Files load as blob URLs (the login token never appears in a URL); videos get a short
  // reusable stream link so they play in parts instead of downloading whole first
  useEffect(() => {
    if (!sViewerItem) {
      if (sViewerBlobUrl) { URL.revokeObjectURL(sViewerBlobUrl); setSViewerBlobUrl(null) }
      return
    }
    if (sViewerItem.type !== "file") { setSViewerBlobUrl(null); return }
    // Lesson videos are played in parts by <LessonVideo>, which gets its own stream link
    if (isStreamedVideo(sViewerItem)) { setSViewerBlobUrl(null); setSViewerBlobLoading(false); return }
    // A slide deck that is still being prepared has nothing to show — don't download it
    const slideState = slideConversionState(sViewerItem)
    if (slideState && slideState !== "ready") { setSViewerBlobUrl(null); setSViewerBlobLoading(false); return }

    let cancelled = false
    let created: string | null = null
    setSViewerBlobLoading(true)
    setSViewerFailed(false)
    setSViewerBlobUrl(null)
    fetchAsBlobUrl(getViewerUrl(sViewerItem)).then(url => {
      if (cancelled) { URL.revokeObjectURL(url); return }
      created = url
      setSViewerBlobUrl(url)
    }).catch(() => { if (!cancelled) setSViewerFailed(true) }).finally(() => { if (!cancelled) setSViewerBlobLoading(false) })
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created) }
  }, [sViewerItem, sViewerRetry])


  const daysInMonth = new Date(attendanceMonth.getFullYear(), attendanceMonth.getMonth() + 1, 0).getDate()
  const firstDay    = new Date(attendanceMonth.getFullYear(), attendanceMonth.getMonth(), 1).getDay()

  // derive day-level status from real attendance: if any period absent → amber/red, all present → green
  const dayStatusMap: Record<string, "present" | "absent" | "late"> = {}
  for (const r of myAttendance) {
    const prev = dayStatusMap[r.date]
    if (r.status === "absent") dayStatusMap[r.date] = "absent"
    else if (r.status === "late" && prev !== "absent") dayStatusMap[r.date] = "late"
    else if (!prev) dayStatusMap[r.date] = "present"
  }
  const dateString = (day: number) => {
    const y = attendanceMonth.getFullYear()
    const m = String(attendanceMonth.getMonth() + 1).padStart(2, "0")
    const d = String(day).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  // Convert YYYY-MM-DD (internal storage) → DD-MM-YYYY (display format)
  const fmtDate = (iso: string) => {
    if (!iso) return ""
    const [y, m, d] = iso.split("-")
    return `${d}-${m}-${y}`
  }

  // Date range shown beside each chip label, and the text shown when a chip has no sheets.
  // Computed once per render, IST-aware. The server counts nothing before `counted_from`, so each
  // window starts at the later of its own start and that date (the browser only compares the two
  // dates; it never works `counted_from` out). `This Year` shows "All recorded sheets" when the
  // server counted every sheet (counted_from null), and nothing until the server has answered.
  const chipInfo = (() => {
    const todayISO  = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    const todayDisp = fmtDate(todayISO)

    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
    const dow    = nowIST.getDay()
    nowIST.setDate(nowIST.getDate() - (dow === 0 ? 6 : dow - 1))
    const weekStartISO  = nowIST.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    const monthStartISO = `${todayISO.slice(0, 7)}-01`

    const nowIST2      = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
    const yearNum      = nowIST2.getMonth() >= 5 ? nowIST2.getFullYear() : nowIST2.getFullYear() - 1
    const yearStartISO = `${yearNum}-06-01`

    const countedFrom   = attBasis?.counted_from ?? null
    const notCountedYet = countedFrom !== null && countedFrom > todayISO
    const laterOf       = (windowStart: string) => (countedFrom !== null && countedFrom > windowStart ? countedFrom : windowStart)

    const windowInfo = (windowStart: string) => {
      const start = laterOf(windowStart)
      return {
        range: notCountedYet ? "" : `${fmtDate(start)} → ${todayDisp}`,
        empty: notCountedYet
          ? ATTENDANCE_TEXT.notCountedYet
          : countedFrom === null ? ATTENDANCE_TEXT.notRecorded : ATTENDANCE_TEXT.noSheetsSince(formatCountedDate(start)),
      }
    }

    const yearInfo = windowInfo(yearStartISO)
    return {
      today:      { range: todayDisp, empty: notCountedYet ? ATTENDANCE_TEXT.notCountedYet : ATTENDANCE_TEXT.notRecorded },
      this_week:  windowInfo(weekStartISO),
      this_month: windowInfo(monthStartISO),
      this_year:  {
        range: attBasis === null ? "" : countedFrom === null ? attendanceBasisLine(attBasis) : yearInfo.range,
        empty: yearInfo.empty,
      },
    } as const
  })()

  // Captions: under the Attendance tile of the dashboard and at the top of My Attendance
  const dashBasisText = dashLoading ? "" : attendanceBasisLine(dashSummary)
  const attBasisText  = attendanceBasisLine(attBasis)

  // Empty-state wording for the calendar day and the custom range (true for dates before the counted-from date)
  const countedFromYmd    = attBasis?.counted_from ?? null
  const selectedDateEmpty = !attLoaded
    ? "Loading…"
    : countedFromYmd !== null && selectedAttDate < countedFromYmd
      ? ATTENDANCE_TEXT.beforeCountedFrom
      : ATTENDANCE_TEXT.noRecordsForDate
  const rangeEmpty = countedFromYmd !== null && rangeTo !== "" && rangeTo < countedFromYmd
    ? ATTENDANCE_TEXT.beforeCountedFrom
    : ATTENDANCE_TEXT.noRecordsInPeriod

  const currentAttendanceDate = (day: number) => dayStatusMap[dateString(day)] ?? null

  // Records for the selected calendar date — used in the period detail panel
  const selectedDateRecords = myAttendance.filter(r => r.date === selectedAttDate).sort((a, b) => a.period - b.period)


  // Use real quiz questions if an active quiz is selected, else fall back to static sample
  const activeQuizQuestions = activeQuiz?.questions ?? []
  // Use server-verified score from attempt result if available, else fall back to local calculation
  const quizScore = quizAttemptResult
    ? quizAttemptResult.attempt.score
    : quizAnswer.filter((a, i) => a === activeQuizQuestions[i]?.correct_index).length

  // Real activity data from API, fall back to static while loading
  const TARGET_MINS    = 60                // fallback school_day_minutes if timetable not set
  const realActivity   = dashSummary?.weekly_activity ?? null
  // Backend sends Mon–Sun in correct order with school_day_minutes from timetable
  const activityData   = realActivity
    ? realActivity.map(d => ({
        day: d.day,                          // "Mon","Tue",... already sorted correctly
        minutes: d.minutes,
        school_day_minutes: d.school_day_minutes > 0 ? d.school_day_minutes : TARGET_MINS,
      }))
    : []
  const totalMins      = activityData.reduce((s, d) => s + d.minutes, 0)

  // Real overall progress from API
  const realProgress   = dashSummary?.module_progress ?? null
  const overallProgress = realProgress && realProgress.length > 0
    ? Math.round(realProgress.reduce((s, p) => s + (p.total > 0 ? (p.completed / p.total) * 100 : 0), 0) / realProgress.length)
    : 0
  const todayDay        = new Date().toLocaleDateString("en-US", { weekday: "short" })

  // Week dates — centered on weekAnchor (defaults to today, navigable via arrows/calendar)
  const today = new Date()
  const weekDays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const startOfWeek = new Date(weekAnchor); startOfWeek.setDate(weekAnchor.getDate() - weekAnchor.getDay())
  const weekDates = weekDays.map((d, i) => {
    const dt = new Date(startOfWeek); dt.setDate(startOfWeek.getDate() + i)
    return { day: d, date: dt.getDate(), fullDate: dt, isToday: dt.toDateString() === today.toDateString() }
  })
  const isCurrentRealWeek = weekDates.some(w => w.isToday)
  const weekRangeLabel = `${startOfWeek.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${weekDates[6].fullDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`

  const VIEW_MAP: Record<string, View> = {
    "Dashboard": "dashboard", "Lessons": "lessons", "Timetable": "timetable",
    "Quizzes": "quizzes", "Homework": "homework", "Certificates": "certificates", "My attendance": "attendance",
    "Live Code": "live-coding", "Teachers": "teachers", "Settings": "settings",
    "My Marks": "marks",
  }
  // Sections change the URL; the quiz player and quiz results are in-progress screens kept in state.
  const pathForView = (v: Exclude<View, "quiz" | "quiz-results">) => studentPath(v === "dashboard" ? "overview" : v)
  const nav = (v: View) => {
    if (v === "quiz" || v === "quiz-results") { setInProgressView(v); return }
    setInProgressView(null)
    const target = pathForView(v)
    navigate(target, { replace: location.pathname === target })
  }
  const openSubject = (subject: string) => navigate(studentPath("lessons", slugForSubject(subject, lessonSubjectNames)))

  const navItemsWithClick = NAV_ITEMS.map(item => ({
    ...item,
    path: `#${VIEW_MAP[item.label] ?? "dashboard"}`,
    onClick: () => {
      const target = VIEW_MAP[item.label]
      if (!target || target === "quiz" || target === "quiz-results") return
      // Compare addresses, not views: inside a subject or on a not-found page the view equals the
      // clicked item but the address does not, and a click there must still take the student to the section.
      if (inProgressView || pathForView(target) !== location.pathname) nav(target)
    },
  }))

  useEffect(() => {
    let title = SECTION_TITLES[view]
    if (route.kind === "unknown") title = "Page not found"
    else if (subjectNotFound) title = "Subject not found"
    else if (view === "lessons" && lessonSubject) title = `${lessonSubject} – Lessons`
    const previousTitle = document.title
    document.title = `${title} – TeachScript`
    return () => { document.title = previousTitle }
  }, [view, lessonSubject, route.kind, subjectNotFound])

  // ── Live coding view shortcut ─────────────────────────────────────────────
  if (view === "live-coding") {
    return (
      <DashboardLayout
        role="student" userName={user?.name ?? "Student"}
        userSubtitle={myClass ? myClass.label : "Student"}
        userEmail={user?.email ?? ""}
        activeView="live-coding" moveFocusOnViewChange navItems={navItemsWithClick}
        instructor={myClass?.teacher_name ? { name: myClass.teacher_name, subject: myClass.label, initials: myClass.teacher_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() } : undefined}
        classmates={realClassmates}
        onSettingsClick={() => nav("settings")}
        studentPoints={dashSummary?.points_total ?? null}
        studentAttendance={dashSummary?.attendance_rate ?? null}
        onClockIn={refreshDashboard} onClockOut={refreshDashboard}
      >
        <LiveCodingView onBack={() => nav("dashboard")} userName={user?.name ?? "Student"}/>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout
      role="student" userName={user?.name ?? "Student"}
      userSubtitle={myClass ? myClass.label : "Student"}
      userEmail={user?.email ?? ""}
      activeView={route.kind === "unknown" ? "" : view} moveFocusOnViewChange navItems={navItemsWithClick}
      instructor={myClass?.teacher_name ? { name: myClass.teacher_name, subject: myClass.label, initials: myClass.teacher_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() } : undefined}
      classmates={realClassmates}
      onSettingsClick={() => nav("settings")}
      studentPoints={dashSummary?.points_total ?? null}
      studentAttendance={dashSummary?.attendance_rate ?? null}
      onClockIn={refreshDashboard} onClockOut={refreshDashboard}
    >
      {/* ── UNKNOWN ADDRESS ────────────────────────────────────────────────── */}
      {route.kind === "unknown" && (
        <DashboardNotFound
          title="We can't find that page"
          message="The link may be out of date. You can go back to your dashboard and pick a section from the menu."
          actionLabel="Back to Dashboard"
          onAction={() => nav("dashboard")}
        />
      )}

      {/* ── DASHBOARD ──────────────────────────────────────────────────────── */}
      {view === "dashboard" && route.kind !== "unknown" && (
        <ViewWrapper id="dashboard">
          <div className="flex flex-col xl:flex-row gap-5">

            {/* Main content */}
            <div className="flex-1 flex flex-col gap-5 min-w-0">

              {dashError && (
                <div role="alert" aria-live="assertive" className="flex items-center justify-between gap-3 px-4 py-3 rounded-[14px]" style={{ background: "rgba(226,75,74,0.08)", border: "1px solid rgba(226,75,74,0.2)" }}>
                  <p className="text-xs" style={{ color: "#8A2E2C" }}>
                    ⚠️ {dashError}
                    <span className="block text-[10px] mt-0.5 opacity-80">The numbers below are from your last visit and may not be up to date.</span>
                  </p>
                  <Button
                    onClick={() => { setDashLoading(true); refreshDashboard() }}
                    className="cursor-pointer rounded-full px-4 h-10 text-xs font-semibold flex-shrink-0"
                    style={{ background: "#E24B4A", color: "white" }}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5"/> Retry
                  </Button>
                </div>
              )}

              {/* Hero banner */}
              <div className="relative rounded-[22px] overflow-hidden" style={{ background: "var(--gradient-student-hero)", minHeight: 165 }}>
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle, rgba(83,74,183,0.3) 1px, transparent 1px)", backgroundSize: "20px 20px" }}/>
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-15" style={{ background: "radial-gradient(circle,#534AB7,transparent)" }}/>
                <div className="absolute -bottom-8 right-32 w-24 h-24 rounded-full opacity-10" style={{ background: "radial-gradient(circle,#378ADD,transparent)" }}/>
                <div className="relative z-10 flex items-center justify-between px-6 py-5 gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{ color: "var(--ts-purple-dark, #534AB7)" }}>Welcome back 👋</p>
                    <h1 className="text-xl md:text-2xl font-black mb-1.5 leading-tight" style={{ color: "var(--foreground)" }}>
                      Unlock Your Full<br/>
                      <span style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                        Potential Today!
                      </span>
                    </h1>
                    <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                      {myClass ? myClass.label : "Complete lessons to unlock your potential"}
                    </p>
                    <Button
                      className="cursor-pointer rounded-full px-5 py-2.5 h-auto text-sm font-bold text-white border-0 shadow-lg"
                      style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
                      onClick={() => nav("lessons")}
                    >
                      Continue Learning <ArrowRight className="w-3.5 h-3.5 ml-1.5"/>
                    </Button>
                  </div>
                  <StudentIllustration gender={user?.gender}/>
                </div>
              </div>

              {/* Stat tiles — real data from API */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "Lessons",
                    value: dashLoading ? "—" : `${dashSummary?.modules_completed ?? 0}/${dashSummary?.modules_total ?? 0}`,
                    sub: "Items viewed",
                    icon: "✅", bg: "rgba(99,153,34,0.1)", accent: "#639922", delay: "0ms",
                  },
                  {
                    label: "Points Earned",
                    value: dashLoading ? "—" : String(dashSummary?.points_total ?? 0),
                    sub: `/ 100 points`,
                    icon: "🏆", bg: "rgba(239,159,39,0.1)", accent: "#EF9F27", delay: "60ms",
                  },
                  {
                    label: "Avg Quiz",
                    value: dashLoading ? "—" : (dashSummary?.quizzes_taken ?? 0) > 0 ? `${dashSummary!.avg_quiz_score}%` : "—",
                    sub: dashLoading ? "" : `${dashSummary?.quizzes_taken ?? 0} quiz${(dashSummary?.quizzes_taken ?? 0) !== 1 ? "zes" : ""} taken`,
                    icon: "🎯", bg: "rgba(55,138,221,0.1)", accent: "#378ADD", delay: "120ms",
                    onClick: () => nav("quizzes"),
                  },
                  {
                    label: "Attendance",
                    value: dashLoading ? "—" : `${dashSummary?.attendance_rate ?? 0}%`,
                    sub: dashLoading ? "" : `${dashSummary?.days_present ?? 0}/${dashSummary?.days_total ?? 0} periods · ${dashSummary?.days_recorded ?? 0} day${(dashSummary?.days_recorded ?? 0) !== 1 ? "s" : ""}`,
                    note: dashBasisText,
                    icon: "📅", bg: "rgba(83,74,183,0.1)", accent: "#534AB7", delay: "180ms",
                    onClick: () => nav("attendance"),
                  },
                ].map(s => (
                  <div
                    key={s.label}
                    onClick={s.onClick}
                    role={s.onClick ? "button" : undefined}
                    tabIndex={s.onClick ? 0 : undefined}
                    aria-label={s.onClick ? `${s.label}: ${s.value}. View details` : undefined}
                    onKeyDown={s.onClick ? (e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); s.onClick!() } }) : undefined}
                    className={`skillio-card p-4 transition-transform relative ${s.onClick ? "cursor-pointer hover:scale-[1.02] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" : "cursor-default"}`}
                    style={{ animationDelay: s.delay, ...(s.onClick ? { outlineColor: s.accent } : {}) }}
                  >
                    {s.onClick && (
                      <ChevronRight className="w-3.5 h-3.5 absolute top-4 right-4 opacity-40" style={{ color: s.accent }}/>
                    )}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: s.bg }}>
                      {s.icon}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">{s.label}</p>
                    <p className="text-xl font-black" style={{ color: s.accent }}>
                      {dashLoading ? <span className="animate-pulse text-muted-foreground text-sm">Loading…</span> : s.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{s.sub}</p>
                    {s.note ? <p className="text-[10px] text-muted-foreground mt-0.5">{s.note}</p> : null}
                  </div>
                ))}
              </div>

              {/* Progress + Activity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ── Overall Progress ── */}
                <div className="skillio-card p-5" style={{ animationDelay: "80ms" }}>
                  <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: "#534AB7" }}/> Overall Progress
                  </h3>
                  {dashLoading ? (
                    /* Skeleton loader */
                    <div className="flex items-center gap-5">
                      <div className="w-24 h-24 rounded-full bg-muted animate-pulse flex-shrink-0" />
                      <div className="flex-1 space-y-3">
                        {[70, 50, 90, 40].map((w, i) => (
                          <div key={i} className="animate-pulse">
                            <div className="flex justify-between mb-1">
                              <div className="h-2.5 bg-muted rounded" style={{ width: `${w}%` }} />
                              <div className="h-2.5 bg-muted rounded w-8" />
                            </div>
                            <div className="h-1.5 bg-muted rounded-full" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : realProgress && realProgress.length > 0 ? (
                    <div className="flex items-center gap-5">
                      <div className="relative flex-shrink-0">
                        <CircleProgress value={overallProgress} size={96} strokeWidth={9}/>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-black text-foreground">{overallProgress}%</span>
                          <span className="text-[9px] text-muted-foreground font-medium">Progress</span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        {realProgress.map(p => {
                          const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0
                          const color = pct === 100 ? "#639922" : "#534AB7"
                          return (
                            <div key={p.subject}>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="text-foreground/80 font-medium truncate pr-2">{p.subject}</span>
                                <span className="text-muted-foreground flex-shrink-0 font-semibold">{pct}%</span>
                              </div>
                              <ProgressBar value={pct} color={color} height="5px"/>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Empty state */
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <span className="text-3xl">📚</span>
                      <p className="text-sm font-semibold text-foreground">No lessons yet</p>
                      <p className="text-xs text-muted-foreground">Your teacher will add lesson modules soon</p>
                    </div>
                  )}
                  <Button
                    className="cursor-pointer rounded-full text-xs w-full mt-4 text-white border-0 font-bold"
                    style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
                    onClick={() => nav("lessons")}
                  >
                    View All Lessons →
                  </Button>
                </div>

                {/* ── Daily Activity ── */}
                <div className="skillio-card p-5" style={{ animationDelay: "140ms" }}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4 text-ts-blue"/> Daily Activity
                    </h3>
                    {!dashLoading && totalMins > 0 && (
                      <span className="text-[11px] text-muted-foreground font-semibold">{Math.floor(totalMins/60)}h {totalMins%60}m total</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">Minutes learning per day this week</p>
                  {dashLoading ? (
                    /* Skeleton loader */
                    <div className="flex items-stretch gap-1.5">
                      {["M","T","W","T","F","S","S"].map((_d, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 animate-pulse">
                          <div className="w-8 h-8 rounded-full bg-muted" />
                          <div className="h-2 bg-muted rounded w-5" />
                        </div>
                      ))}
                    </div>
                  ) : activityData.length > 0 && totalMins > 0 ? (
                    <>
                      <div className="flex items-stretch gap-1.5">
                        {activityData.map(d => (
                          <ActivityEmoji key={d.day} minutes={d.minutes} max={d.school_day_minutes} day={d.day} isToday={d.day === todayDay}/>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50 flex-wrap">
                        <div className="flex items-center gap-1.5"><span className="text-sm leading-none">🤩</span><span className="text-[10px] text-muted-foreground">100%</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-sm leading-none">😊</span><span className="text-[10px] text-muted-foreground">≥50%</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-sm leading-none">😐</span><span className="text-[10px] text-muted-foreground">≥25%</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-sm leading-none">😤</span><span className="text-[10px] text-muted-foreground">&lt;25%</span></div>
                        {(dashSummary?.streak_days ?? 0) > 1 && (
                          <div className="flex items-center gap-1.5"><span className="flame-bounce text-sm">🔥</span><span className="text-[11px] font-semibold text-ts-amber">{dashSummary!.streak_days}-day streak!</span></div>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Empty state */
                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                      <span className="text-3xl">⏱️</span>
                      <p className="text-sm font-semibold text-foreground">No activity this week</p>
                      <p className="text-xs text-muted-foreground">Clock in to start tracking your learning time</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Continue Learning — real data from API */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground">Continue Learning</h3>
                  <button className="cursor-pointer text-xs font-semibold text-ts-purple hover:underline" onClick={() => nav("lessons")}>View All →</button>
                </div>
                {dashSummary?.continue_learning && dashSummary.continue_learning.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {dashSummary.continue_learning.map((mod, i) => {
                      const pct  = mod.total > 0 ? Math.round((mod.completed / mod.total) * 100) : 0
                      const meta = getSubjectMeta(mod.subject)
                      const gradients = ["var(--gradient-lesson-card-1)", "var(--gradient-lesson-card-2)", "var(--gradient-lesson-card-3)"]
                      return (
                        <div key={mod.module_id} className="skillio-card lesson-card-lift overflow-hidden cursor-pointer"
                          onClick={() => openSubject(mod.subject)}>
                          <div className="h-24 flex items-center justify-center relative overflow-hidden" style={{ background: gradients[i % 3] }}>
                            <span className={meta.iconColor}>
                              <SubjectIcon name={mod.subject} size={40} />
                            </span>
                            <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-bold bg-ts-purple-light text-ts-purple-dark">In Progress</span>
                          </div>
                          <div className="p-3">
                            <p className="text-[11px] text-muted-foreground mb-0.5">{mod.subject}</p>
                            <p className="text-xs font-bold text-foreground mb-2 leading-tight">{mod.module_title}</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#534AB7,#378ADD)" }}/>
                              </div>
                              <span className="text-[10px] text-muted-foreground font-semibold flex-shrink-0">{pct}%</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : dashLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                  </div>
                ) : (
                  <div className="skillio-card p-5 text-center">
                    <p className="text-sm font-semibold text-foreground mb-1">No lessons in progress</p>
                    <p className="text-xs text-muted-foreground mb-3">Start a lesson from the Lessons tab</p>
                    <Button size="sm" className="rounded-full text-xs text-white border-0" style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }} onClick={() => nav("lessons")}>
                      Go to Lessons →
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right panel ── */}
            <div className="xl:w-72 flex flex-col gap-4 flex-shrink-0">

              {/* Events */}
              <div className="skillio-card p-4 relative" style={{ animationDelay: "100ms" }}>
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => { setEventCalMonth(new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), 1)); setShowEventCalendar(v => !v) }}
                    className="cursor-pointer text-sm font-bold text-foreground flex items-center gap-2 hover:opacity-75 transition-opacity"
                    aria-label="Pick a date"
                  >
                    <Calendar className="w-4 h-4 text-ts-amber"/> Events
                  </button>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d); setSelectedWeekDate(null) }}
                      className="cursor-pointer p-1 rounded-md hover:bg-accent transition-colors"
                      aria-label="Previous week"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground"/>
                    </button>
                    <span className="text-[10px] text-muted-foreground font-semibold px-0.5 whitespace-nowrap">
                      {isCurrentRealWeek ? "This week" : weekRangeLabel}
                    </span>
                    <button
                      onClick={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d); setSelectedWeekDate(null) }}
                      className="cursor-pointer p-1 rounded-md hover:bg-accent transition-colors"
                      aria-label="Next week"
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground"/>
                    </button>
                  </div>
                </div>

                {/* Clickable week strip */}
                <div className="flex items-center gap-1 mb-4">
                  {weekDates.map(w => {
                    const isSelected = selectedWeekDate?.toDateString() === w.fullDate.toDateString()
                    return (
                      <button
                        key={w.fullDate.toISOString()}
                        onClick={() => setSelectedWeekDate(isSelected ? null : w.fullDate)}
                        className="cursor-pointer flex-1 flex flex-col items-center py-1.5 rounded-[10px] transition-all"
                        style={
                          w.isToday && !isSelected
                            ? { background: "linear-gradient(135deg,#534AB7,#378ADD)" }
                            : isSelected
                            ? { background: "rgba(83,74,183,0.15)", border: "1px solid rgba(83,74,183,0.3)" }
                            : { background: "transparent" }
                        }
                      >
                        <span className={`text-[10px] font-bold ${w.isToday && !isSelected ? "text-white" : "text-muted-foreground"}`}>{w.day[0]}</span>
                        <span className={`text-[11px] font-black mt-0.5 ${w.isToday && !isSelected ? "text-white" : isSelected ? "text-ts-purple" : "text-foreground"}`}>{w.date}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Calendar date-picker popover — same pattern as My Attendance calendar */}
                {showEventCalendar && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEventCalendar(false)} />
                    <div
                      className="absolute z-50 top-12 right-0 rounded-2xl p-4 shadow-xl"
                      style={{ width: 280, background: "var(--card)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <button
                          className="cursor-pointer p-1.5 rounded-full hover:bg-accent transition-colors"
                          onClick={() => setEventCalMonth(new Date(eventCalMonth.getFullYear(), eventCalMonth.getMonth() - 1, 1))}
                          aria-label="Previous month"
                        >
                          <ChevronLeft className="w-4 h-4 text-muted-foreground"/>
                        </button>
                        <p className="text-xs font-black">
                          {eventCalMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                        </p>
                        <button
                          className="cursor-pointer p-1.5 rounded-full hover:bg-accent transition-colors"
                          onClick={() => setEventCalMonth(new Date(eventCalMonth.getFullYear(), eventCalMonth.getMonth() + 1, 1))}
                          aria-label="Next month"
                        >
                          <ChevronRight className="w-4 h-4 text-muted-foreground"/>
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
                        {["S","M","T","W","T","F","S"].map((d, i) => (
                          <p key={i} className="text-[9px] font-black text-muted-foreground">{d}</p>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {(() => {
                          const dim   = new Date(eventCalMonth.getFullYear(), eventCalMonth.getMonth() + 1, 0).getDate()
                          const fDay  = new Date(eventCalMonth.getFullYear(), eventCalMonth.getMonth(), 1).getDay()
                          return [
                            ...Array(fDay).fill(null).map((_, i) => <div key={`e-${i}`}/>),
                            ...Array(dim).fill(null).map((_, i) => {
                              const day  = i + 1
                              const dt   = new Date(eventCalMonth.getFullYear(), eventCalMonth.getMonth(), day)
                              const isToday    = dt.toDateString() === today.toDateString()
                              const isSelected = selectedWeekDate?.toDateString() === dt.toDateString()
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => { setWeekAnchor(dt); setSelectedWeekDate(dt); setShowEventCalendar(false) }}
                                  className="flex items-center justify-center py-1.5 rounded-[8px] transition-all hover:scale-105 cursor-pointer"
                                  style={{
                                    background: isSelected ? "#534AB7" : "transparent",
                                    outline: isToday && !isSelected ? "1.5px solid #534AB7" : "none",
                                  }}
                                >
                                  <p className="text-[11px] font-semibold" style={{ color: isSelected ? "#fff" : "var(--foreground)" }}>{day}</p>
                                </button>
                              )
                            }),
                          ]
                        })()}
                      </div>
                    </div>
                  </>
                )}

                {/* Event list — real notifications, filtered by selected date */}
                <div className="space-y-1.5">
                  {(() => {
                    const allEvents = dashSummary?.upcoming_events ?? []
                    const typeColors: Record<string, string> = { announcement: "#534AB7", reminder: "#EF9F27", achievement: "#10b981", alert: "#EF4444", event: "#378ADD" }
                    const typeIcons: Record<string, string>  = { announcement: "📢", reminder: "⏰", achievement: "🏆", alert: "🚨", event: "📅" }

                    // Default to today's date when nothing on the week strip is explicitly selected —
                    // without this, the list showed every notification ever posted (including past/future-dated ones)
                    const activeDate = selectedWeekDate ?? today
                    const filtered = allEvents.filter(evt => {
                      const d = new Date(evt.created_at)
                      return d.toDateString() === activeDate.toDateString()
                    })

                    if (filtered.length === 0) {
                      return (
                        <div className="flex flex-col items-center gap-2 py-6 text-center">
                          <span className="text-2xl">📭</span>
                          <p className="text-xs font-semibold text-foreground">
                            {selectedWeekDate ? "No events on this day" : "No announcements yet"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {selectedWeekDate ? "Try another day" : "Your teacher hasn't posted anything yet"}
                          </p>
                        </div>
                      )
                    }

                    return filtered.map((evt, i) => {
                      const color = typeColors[evt.type] ?? "#534AB7"
                      return (
                        <button
                          key={i}
                          onClick={() => setExpandedEvent({ title: evt.title, message: evt.message, type: evt.type, color, icon: typeIcons[evt.type] ?? "📢", scheduled_at: evt.created_at })}
                          className="cursor-pointer w-full flex items-center gap-2.5 p-2.5 rounded-[10px] bg-accent/30 hover:bg-accent/50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: `${color}18` }}>
                            {typeIcons[evt.type] ?? "📢"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-foreground leading-tight truncate">{evt.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{evt.message}</p>
                            <p className="text-[10px] text-ts-blue mt-0.5">
                              📅 {new Date(evt.created_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                            </p>
                          </div>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Daily Quest — real data from API */}
              <div className="skillio-card p-4" style={{ animationDelay: "160ms" }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-ts-amber"/> Quests
                  </h3>
                  <span className="text-[11px] font-black" style={{ color: "#F59E0B" }}>{dashSummary?.points_total ?? 0} pts total</span>
                </div>
                {questsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading quests…
                  </div>
                ) : (
                  <div className="space-y-3">
                    {realQuests.map(q => (
                      <div key={q.id}>
                        <div className={`flex items-start gap-2.5 mb-1.5 ${q.done ? "opacity-70" : ""}`}>
                          <span className="text-lg flex-shrink-0 mt-0.5">{q.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <p className={`text-xs font-semibold leading-tight ${q.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {q.label}
                              </p>
                              <span className="text-[10px] font-black text-ts-amber flex-shrink-0">+{q.points}</span>
                            </div>
                            {q.done ? (
                              <span className="text-[10px] font-bold text-green-600">✓ Completed!</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{q.progress}/{q.total} · {q.resets === "daily" ? "Resets daily" : q.resets === "weekly" ? "Resets weekly" : "Ongoing"}</span>
                            )}
                          </div>
                        </div>
                        <div className="pl-8">
                          <div className="quest-bar">
                            <div className="quest-bar-fill" style={{ width: `${q.total > 0 ? (q.progress / q.total) * 100 : 0}%` }}/>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Instructor inline (hidden on xl — shown in sidebar) */}
              {myClass?.teacher_name && (
                <div className="xl:hidden skillio-card p-4" style={{ animationDelay: "220ms" }}>
                  <p className="text-[10px] font-black tracking-widest uppercase text-muted-foreground/60 mb-3">Your Instructor</p>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-black text-white shadow-md" style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}>
                      {myClass.teacher_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{myClass.teacher_name}</p>
                      <p className="text-xs text-muted-foreground">CT &amp; AI · {myClass.label}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ViewWrapper>
      )}

      {/* ── LESSONS ──────────────────────────────────────────────────────────── */}
      {view === "lessons" && (() => {
        // Use timetable subjects; fall back to subjects that actually have modules
        const progressSubjects = (dashSummary?.module_progress ?? []).map(p => p.subject)
        const subjects = ttSubjects.length ? ttSubjects : progressSubjects

        // Per-subject progress from real API data
        const progressBySubject = new Map(
          (dashSummary?.module_progress ?? []).map(p => [p.subject, p])
        )

        // Real item counts for the drilled-in subject header
        const totalItemCount     = sModules.reduce((sum, m) => sum + m.items.length, 0)
        const completedItemCount = sModules.reduce((sum, m) =>
          sum + m.items.filter(i => sViewedIds.includes(i._id)).length, 0
        )

        // A link to a subject that is not in this class (or an outdated link) gets a friendly message;
        // while the subject list is still loading we show a loading state instead of guessing.
        if (subjectNotFound) {
          return (
            <ViewWrapper id="lessons">
              <DashboardNotFound
                title="We can't find that subject"
                message="That subject isn't in your class, or the link is out of date."
                actionLabel="Back to Lessons"
                onAction={() => nav("lessons")}
              />
            </ViewWrapper>
          )
        }
        if (subjectLoadFailed) {
          return (
            <ViewWrapper id="lessons">
              <div role="alert" className="skillio-card flex flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="text-sm text-foreground">We couldn't load your subjects. Check your connection and try again.</p>
                <Button type="button" onClick={retrySubjects} className="cursor-pointer rounded-full px-5">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Retry
                </Button>
              </div>
            </ViewWrapper>
          )
        }
        if (subjectPending) {
          return (
            <ViewWrapper id="lessons">
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-10 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading lessons…
              </div>
            </ViewWrapper>
          )
        }

        return (
          <ViewWrapper id="lessons">
            <div className="flex flex-col gap-4">
              {/* Class info header — shown when on the subject grid (not drilled into a subject) */}
              {!lessonSubject && myClass && (
                <div className="skillio-card p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
                      style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}>
                      {myClass.label.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground truncate">{myClass.label} — CT &amp; AI</p>
                      {myClass.teacher_name && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">Teacher: {myClass.teacher_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">Progress</p>
                    <p className="text-sm font-black" style={{ color: "#534AB7" }}>{overallProgress}%</p>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="flex items-center gap-3">
                {lessonSubject && (
                  <button onClick={() => nav("lessons")}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                    <ChevronLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                    Subjects
                  </button>
                )}
                <h1 className="text-base font-black text-foreground">
                  {lessonSubject ? lessonSubject : "My Subjects"}
                </h1>
                {lessonSubject && (
                  <span className="text-xs text-muted-foreground ml-auto">{completedItemCount}/{totalItemCount} completed</span>
                )}
              </div>

              {/* Subject grid */}
              {!lessonSubject && (
                ttLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-10 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading subjects…
                  </div>
                ) : subjects.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    No subjects assigned yet. Ask your teacher to set up the timetable.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
                    {subjects.map((subj, idx) => {
                      const meta  = getSubjectMeta(subj)
                      const prog  = progressBySubject.get(subj)
                      const total = prog?.total ?? 0
                      const done  = prog?.completed ?? 0
                      const pct   = total > 0 ? Math.round((done / total) * 100) : 0
                      return (
                        <button key={idx}
                          onClick={() => openSubject(subj)}
                          className={[
                            "group flex flex-col items-start gap-3 p-4 rounded-2xl border bg-card skillio-card",
                            "hover:shadow-md hover:-translate-y-0.5 transition-all duration-200",
                            "ring-2 ring-transparent",
                            meta.ringColor,
                          ].join(" ")}>
                          <div className={[
                            "w-12 h-12 rounded-xl flex items-center justify-center",
                            `bg-gradient-to-br ${meta.gradient} shadow-sm`,
                          ].join(" ")}>
                            <span className="text-white"><SubjectIcon name={subj} size={22} /></span>
                          </div>
                          <div className="w-full text-left">
                            <p className="text-sm font-bold text-foreground leading-tight group-hover:text-primary transition-colors">{subj}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {total === 0 ? "No lessons yet" : `${total} lesson item${total === 1 ? "" : "s"}`}
                            </p>
                          </div>
                          <div className="w-full">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] text-muted-foreground">{done}/{total} done</span>
                              <span className="text-[10px] font-bold text-foreground">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: "linear-gradient(90deg,#534AB7,#378ADD)" }} />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              )}

              {/* Module list + item panel for selected subject */}
              {lessonSubject && (
                <StudentLessonsItemsPanel
                  lessonSubject={lessonSubject}
                  sModules={sModules}
                  sModulesLoading={sModulesLoading || !myClass?.id}
                  sViewedIds={sViewedIds}
                  setSViewedIds={setSViewedIds}
                  selectedModuleId={selectedModuleId}
                  setSelectedModuleId={setSelectedModuleId}
                  itemSearchQuery={itemSearchQuery}
                  setItemSearchQuery={setItemSearchQuery}
                  itemStatusFilter={itemStatusFilter}
                  setItemStatusFilter={setItemStatusFilter}
                  markingDoneId={markingDoneId}
                  setMarkingDoneId={setMarkingDoneId}
                  setSViewerItem={setSViewerItem}
                  setDashSummary={setDashSummary}
                />
              )}
            </div>
          </ViewWrapper>
        )
      })()}


      {/* ── QUIZ ─────────────────────────────────────────────────────────────── */}
      {view === "quiz" && !quizSubmitted && !activeQuiz && (
        <ViewWrapper id="quiz">
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <p className="text-3xl">📋</p>
            <p className="text-sm font-semibold text-foreground">No quiz selected</p>
            <p className="text-xs text-muted-foreground">Please pick a quiz from the list first.</p>
            <button onClick={() => nav("quizzes")} className="text-xs font-semibold text-ts-purple hover:underline">← Back to Quizzes</button>
          </div>
        </ViewWrapper>
      )}

      {view === "quiz" && !quizSubmitted && activeQuiz && (
        <ViewWrapper id="quiz">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <button onClick={() => { setActiveQuiz(null); nav("quizzes") }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><ChevronLeft className="w-3.5 h-3.5"/>Quizzes</button>
            </div>
            <h1 className="text-base font-black text-foreground">{activeQuiz.title}</h1>
            <div className="skillio-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 font-medium">
                <span>Question {quizQuestion+1} of {activeQuizQuestions.length}</span>
                <span>{Math.round(((quizQuestion+1)/activeQuizQuestions.length)*100)}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-muted">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((quizQuestion+1)/activeQuizQuestions.length)*100}%`, background: "linear-gradient(90deg,#534AB7,#378ADD)" }}/>
              </div>
            </div>
            <div className="skillio-card p-5">
              <p className="text-sm font-bold text-foreground mb-4">{activeQuizQuestions[quizQuestion]?.text}</p>
              <div className="flex flex-col gap-2">
                {activeQuizQuestions[quizQuestion]?.options.map((opt, i) => (
                  <button key={i}
                    onClick={() => { const a = [...quizAnswer]; a[quizQuestion] = i; setQuizAnswer(a) }}
                    className={`cursor-pointer text-left text-sm p-3.5 rounded-[12px] border-2 transition-all font-medium ${quizAnswer[quizQuestion] === i ? "text-white border-transparent scale-[1.01]" : "text-foreground hover:border-ts-purple/40 border-border"}`}
                    style={quizAnswer[quizQuestion] === i ? { background: "linear-gradient(135deg,#534AB7,#378ADD)" } : {}}
                  >{opt}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              {quizQuestion < activeQuizQuestions.length-1 ? (
                <Button disabled={quizAnswer[quizQuestion]===null} onClick={() => setQuizQuestion(q => q+1)}
                  className="cursor-pointer rounded-full text-xs text-white border-0 font-bold px-6" style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}>
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1"/>
                </Button>
              ) : (
                <Button
                  disabled={quizAnswer[quizQuestion]===null || submittingQuiz}
                  onClick={async () => {
                    if (activeQuiz) {
                      setSubmittingQuiz(true)
                      const res = await submitQuizAttempt(activeQuiz._id, quizAnswer.map(a => a ?? -1))
                      setSubmittingQuiz(false)
                      if (!("error" in res)) {
                        setQuizAttemptResult(res)
                        // Quiz average and points changed — the next Dashboard visit reloads them
                        dashFetchedAtRef.current = 0
                        extrasFetchedAtRef.current = 0
                        setQuizHistory(prev => [{
                          _id: res.attempt._id, quiz_title: activeQuiz.title,
                          score: res.attempt.score, total: res.attempt.total,
                          percentage: res.attempt.percentage, submitted_at: res.attempt.submitted_at,
                        }, ...prev])
                        // Update attempt_count + best_score on the quiz card
                        setRealQuizzes(prev => prev.map(q => {
                          if (q._id !== activeQuiz._id) return q
                          const newCount = (q.attempt_count ?? 0) + 1
                          const newBest  = Math.max(q.best_score ?? 0, res.attempt.percentage)
                          return { ...q, attempt_count: newCount, best_score: newBest }
                        }))
                      }
                    }
                    setQuizSubmitted(true)
                  }}
                  className="cursor-pointer rounded-full text-xs text-white border-0 font-bold px-6" style={{ background: "linear-gradient(135deg,#639922,#378ADD)" }}>
                  {submittingQuiz ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5"/>Submitting…</> : "Submit Quiz ✓"}
                </Button>
              )}
            </div>
          </div>
        </ViewWrapper>
      )}

      {/* ── QUIZ RESULTS ─────────────────────────────────────────────────────── */}
      {view === "quiz" && quizSubmitted && (
        <ViewWrapper id="quiz-results">
          <div className="flex flex-col gap-4">
            <h1 className="text-base font-black text-foreground">Results — {activeQuiz?.title ?? "Quiz"}</h1>
            <div className="skillio-card p-6 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[16px]"
                style={{ background: quizScore>=Math.ceil(activeQuizQuestions.length*0.8) ? "var(--gradient-stat-green)" : quizScore>=Math.ceil(activeQuizQuestions.length*0.6) ? "var(--gradient-stat-amber)" : "var(--gradient-stat-red)" }}/>
              <div className="text-5xl mb-3">{quizScore===activeQuizQuestions.length?"🏆":quizScore>=Math.ceil(activeQuizQuestions.length*0.8)?"🎉":quizScore>=Math.ceil(activeQuizQuestions.length*0.6)?"👍":"📚"}</div>
              <p className="text-4xl font-black mb-1" style={{ background: quizScore>=Math.ceil(activeQuizQuestions.length*0.8) ? "var(--gradient-stat-green)" : quizScore>=Math.ceil(activeQuizQuestions.length*0.6) ? "var(--gradient-stat-amber)" : "var(--gradient-stat-red)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
                {quizScore}/{activeQuizQuestions.length}
              </p>
              <p className="text-sm text-muted-foreground">You scored {activeQuizQuestions.length > 0 ? Math.round(quizScore/activeQuizQuestions.length*100) : 0}%</p>
            </div>
            <div className="flex flex-col gap-3">
              {activeQuizQuestions.map((q, i) => {
                // Use per_question.was_correct from server (correct_answers not returned to client)
                const correct = quizAttemptResult ? quizAttemptResult.per_question[i]?.was_correct : quizAnswer[i] === q.correct_index
                const explanation = quizAttemptResult?.explanations[i] ?? q.explanation
                return (
                  <div key={i} className="skillio-card p-4 relative overflow-hidden" style={{ animationDelay: `${i*60}ms` }}>
                    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[16px]" style={{ background: correct ? "var(--gradient-stat-green)" : "var(--gradient-stat-red)" }}/>
                    <p className="text-xs font-bold text-foreground mb-2">{q.text}</p>
                    <div className="flex flex-col gap-1 mb-2">
                      {q.options.map((opt, j) => (
                        <p key={j} className={`text-xs px-2.5 py-1.5 rounded-[8px] ${j===quizAnswer[i]&&correct?"bg-ts-green-light text-ts-green-dark font-semibold":j===quizAnswer[i]&&!correct?"bg-ts-red-light text-ts-red":"text-muted-foreground"}`}>
                          {j===quizAnswer[i]&&correct&&"✓ "}{j===quizAnswer[i]&&!correct&&"✗ "}{opt}
                        </p>
                      ))}
                    </div>
                    {explanation && <p className="text-[11px] text-muted-foreground italic">{explanation}</p>}
                  </div>
                )
              })}
            </div>
            <Button variant="outline" className="cursor-pointer rounded-full text-xs w-fit font-semibold"
              onClick={() => { setQuizSubmitted(false); setActiveQuiz(null); nav("quizzes") }}>
              ← Back to Quizzes
            </Button>
          </div>
        </ViewWrapper>
      )}

      {/* ── QUIZZES ──────────────────────────────────────────────────────────── */}
      {view === "quizzes" && (
        <ViewWrapper id="quizzes">
          <div className="flex flex-col gap-5">
            <h1 className="text-base font-black text-foreground">Quizzes</h1>

            {/* Available quizzes */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Available Quizzes</h2>
              {quizzesLoading ? (
                <SkeletonList count={3} lines={2} />
              ) : realQuizzes.length === 0 ? (
                <div className="skillio-card p-8 text-center">
                  <p className="text-2xl mb-2">📋</p>
                  <p className="text-sm font-semibold text-foreground">No quizzes yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Your teacher hasn't published any quizzes yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {realQuizzes.map(quiz => {
                    const now          = new Date()
                    const deadlineDate = quiz.deadline ? new Date(quiz.deadline) : null
                    const isPastDeadline = deadlineDate ? now > deadlineDate : false
                    const attUsed      = quiz.attempt_count ?? 0
                    const maxAtt       = quiz.max_attempts ?? 10
                    const attLeft      = maxAtt - attUsed
                    const canAttempt   = !isPastDeadline && attLeft > 0

                    // Deadline countdown label
                    let deadlineChip: ReactNode = null
                    if (deadlineDate) {
                      const diffMs   = deadlineDate.getTime() - now.getTime()
                      const diffH    = diffMs / 3600000
                      if (isPastDeadline) {
                        deadlineChip = <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-semibold">Closed</span>
                      } else if (diffH < 1) {
                        deadlineChip = <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold animate-pulse">⏰ {Math.ceil(diffMs/60000)}m left</span>
                      } else if (diffH < 24) {
                        deadlineChip = <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold">⏰ {Math.floor(diffH)}h left</span>
                      } else {
                        deadlineChip = <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Closes {deadlineDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      }
                    }

                    return (
                    <div key={quiz._id} className="skillio-card p-4 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: "rgba(83,74,183,0.1)" }}>📝</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{quiz.title}</p>
                          <p className="text-[11px] text-muted-foreground">{quiz.questions.length} question{quiz.questions.length !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Attempt counter pill */}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${attLeft === 0 ? "bg-red-50 text-red-500" : attLeft <= 3 ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                            {attUsed}/{maxAtt} attempts
                          </span>
                          {/* Best score if attempted */}
                          {attUsed > 0 && quiz.best_score != null && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-ts-green-light text-ts-green-dark font-semibold">Best {quiz.best_score}%</span>
                          )}
                          {deadlineChip}
                        </div>
                        {canAttempt ? (
                          <Button size="sm" className="rounded-full text-xs text-white border-0 flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
                            onClick={() => {
                              const questions = quiz.shuffle_on_retry && attUsed > 0
                                ? [...quiz.questions].sort(() => Math.random() - 0.5)
                                : quiz.questions
                              setActiveQuiz({ ...quiz, questions })
                              setQuizAnswer(Array(questions.length).fill(null))
                              setQuizQuestion(0)
                              setQuizSubmitted(false)
                              setQuizAttemptResult(null)
                              nav("quiz")
                            }}>
                            {attUsed > 0 ? "Re-attempt →" : "Start →"}
                          </Button>
                        ) : (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {isPastDeadline ? "Closed" : "No attempts left"}
                          </span>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quiz history */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Quiz History</h2>
              {quizHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No attempts yet.</p>
              ) : (
                <div className="skillio-card overflow-hidden overflow-x-auto">
                  <table className="w-full min-w-[400px]">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {["#","Quiz","Score","Percentage","Date"].map(h => (
                          <th key={h} className="text-left text-xs font-bold text-muted-foreground px-4 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {quizHistory.map((q, i) => (
                        <tr key={q._id} className="hover:bg-accent/30 transition-colors" style={{ borderBottom: i < quizHistory.length-1 ? "1px solid var(--border)" : "none" }}>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-semibold">{i+1}</td>
                          <td className="px-4 py-3 text-xs font-bold text-foreground">{q.quiz_title}</td>
                          <td className="px-4 py-3 text-xs text-foreground font-semibold">{q.score}/{q.total}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${q.percentage===100?"bg-ts-green-light text-ts-green-dark":"bg-ts-purple-light text-ts-purple-dark"}`}>{q.percentage}%</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(q.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </ViewWrapper>
      )}

      {/* ── CERTIFICATES ─────────────────────────────────────────────────────── */}
      {view === "certificates" && (
        <ViewWrapper id="certificates">
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-base font-black text-foreground">Certificates</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Your teacher issues a certificate when you complete a subject.</p>
            </div>
            {certsLoading ? (
              <SkeletonList count={4} lines={2} showAvatar />
            ) : certsError ? (
              <div className="skillio-card p-6 text-center" role="alert">
                <p className="text-sm font-semibold text-foreground">We couldn't load your certificates.</p>
                <Button size="sm" variant="outline" className="mt-3 rounded-full text-xs" onClick={() => { setCertsError(false); setCertsLoaded(false) }}>
                  Try again
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {realCerts.map(cert => {
                  const isCustom  = cert.type === "custom"
                  const revoked   = isRevoked(cert)
                  const titleText = isCustom ? cert.custom_title : cert.module_title
                  const subText   = isCustom ? cert.custom_reason : `${cert.class_label} · ${cert.subject}`
                  const gradient  = revoked
                    ? "linear-gradient(135deg,#9CA3AF,#6B7280)"
                    : isCustom
                    ? "linear-gradient(135deg,#F59E0B,#D97706)"
                    : "linear-gradient(135deg,#534AB7,#378ADD)"
                  const borderColor = revoked ? "var(--border)" : isCustom ? "rgba(245,158,11,0.35)" : "rgba(83,74,183,0.3)"
                  if (revoked) return (
                    <div key={cert._id} className="skillio-card p-6 flex flex-col gap-3 relative overflow-hidden" style={{ border: `2px solid ${borderColor}` }}>
                      <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[16px]" style={{ background: gradient }}/>
                      <span className="inline-block w-fit text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Revoked</span>
                      <div>
                        <p className="text-xs font-bold text-foreground mb-1 line-through decoration-muted-foreground/60">{titleText}</p>
                        <p className="text-xs text-muted-foreground">
                          {subText}{cert.revoked_at ? ` · Revoked on ${new Date(cert.revoked_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                        </p>
                        {cert.revoke_reason && <p className="text-xs text-muted-foreground mt-1">Reason: {cert.revoke_reason}</p>}
                      </div>
                    </div>
                  )
                  return (
                    <div key={cert._id} className="skillio-card p-6 flex flex-col gap-4 relative overflow-hidden animate-purple-glow" style={{ border: `2px solid ${borderColor}` }}>
                      <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[16px]" style={{ background: gradient }}/>
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center text-3xl shadow-lg" style={{ background: isCustom ? "rgba(245,158,11,0.12)" : "linear-gradient(135deg,rgba(83,74,183,0.15),rgba(55,138,221,0.15))" }}>
                          {isCustom ? "🌟" : "🏆"}
                        </div>
                        <div>
                          {isCustom && (
                            <span className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-1 text-white" style={{ background: gradient }}>Special Award</span>
                          )}
                          {!isCustom && <p className="text-[11px] font-black text-ts-purple uppercase tracking-widest mb-0.5">Earned</p>}
                          <p className="text-sm font-black text-foreground">{cert.student_name}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground mb-1">{titleText}</p>
                        <p className="text-xs text-muted-foreground">{subText} · {new Date(cert.issued_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button className="cursor-pointer rounded-full text-xs w-fit font-bold text-white border-0 flex items-center gap-2"
                          style={{ background: gradient }}
                          onClick={() => viewStudentCertPDF_student(cert._id)}>
                          <Eye className="w-3.5 h-3.5"/> View
                        </Button>
                        <Button variant="outline" className="cursor-pointer rounded-full text-xs w-fit font-bold flex items-center gap-2"
                          onClick={() => downloadStudentCertPDF(cert._id, cert.student_name)}>
                          <Download className="w-3.5 h-3.5"/> Download
                        </Button>
                      </div>
                    </div>
                  )
                })}

                {realCerts.length === 0 && (
                  <div className="sm:col-span-2 skillio-card p-8 text-center">
                    <p className="text-2xl mb-2">🎓</p>
                    <p className="text-sm font-semibold text-foreground">No certificates yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Finish every lesson in a subject — your teacher will then issue your certificate.</p>
                    <Button size="sm" className="mt-4 rounded-full text-xs text-white border-0" style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }} onClick={() => nav("lessons")}>
                      Start Learning →
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ViewWrapper>
      )}

      {/* ── ATTENDANCE ───────────────────────────────────────────────────────── */}
      {view === "attendance" && (
        <ViewWrapper id="attendance">
          <div className="flex flex-col gap-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-base font-black text-foreground">My Attendance</h1>
              <Button
                className="cursor-pointer rounded-full text-xs font-bold text-white border-0 flex items-center gap-2"
                style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
                onClick={() => downloadAttendanceXLSX(
                  user?.name ?? "Student",
                  attendanceMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
                  myAttendance
                )}
              >
                <Download className="w-3.5 h-3.5"/> Download Sheet
              </Button>
            </div>

            {/* Where the figures below are counted from (from the server) */}
            {attBasisText && (
              <p className="text-xs text-muted-foreground -mt-2">{attBasisText}</p>
            )}

            {/* ── Time-range summary chips ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  { label: "Today",      key: "today"      as const },
                  { label: "This Week",  key: "this_week"  as const },
                  { label: "This Month", key: "this_month" as const },
                  { label: "This Year",  key: "this_year"  as const },
                ] as const
              ).map(({ label, key }) => {
                const slot      = attSummary?.[key]
                const rateColor = !slot?.recorded
                  ? "var(--muted-foreground)"
                  : slot.rate >= 90 ? "#639922"
                  : slot.rate >= 75 ? "#EF9F27"
                  : "#E24B4A"
                return (
                  <div key={key} className="skillio-card p-4 flex flex-col gap-1">
                    <div>
                      <p className="text-xs font-black text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{chipInfo[key].range}</p>
                    </div>
                    {!attLoaded ? (
                      <div className="h-7 w-14 bg-muted animate-pulse rounded-md mt-1" />
                    ) : !slot?.recorded ? (
                      <p className="text-xs font-semibold text-muted-foreground mt-1">{chipInfo[key].empty}</p>
                    ) : (
                      <>
                        <p className="text-2xl font-black leading-none mt-0.5" style={{ color: rateColor }}>{slot.rate}%</p>
                        <p className="text-[10px] text-muted-foreground">
                          {slot.present}P · {slot.late}L · {slot.absent}A &nbsp;/&nbsp; {slot.total} periods
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Custom Date Range ── */}
            <div className="skillio-card p-4">
              <p className="text-xs font-black text-foreground mb-3">Custom Date Range</p>
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">From</label>
                  <DatePicker
                    value={rangeFrom}
                    max={new Date().toLocaleDateString("en-CA")}
                    placeholder="Pick start date"
                    onChange={d => { setRangeFrom(d); setRangeQueried(false) }}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">To</label>
                  <DatePicker
                    value={rangeTo}
                    max={new Date().toLocaleDateString("en-CA")}
                    placeholder="Pick end date"
                    onChange={d => { setRangeTo(d); setRangeQueried(false) }}
                  />
                </div>
                <Button
                  disabled={!rangeFrom || !rangeTo || rangeLoading}
                  className="cursor-pointer rounded-full text-xs font-bold text-white border-0 h-9 px-6 flex-shrink-0 disabled:opacity-50"
                  style={{ background: rangeFrom && rangeTo ? "linear-gradient(135deg,#534AB7,#378ADD)" : undefined }}
                  onClick={async () => {
                    setRangeLoading(true)
                    setRangeQueried(false)
                    const res = await getAttendanceRange(rangeFrom, rangeTo)
                    setRangeLoading(false)
                    setRangeQueried(true)
                    if ("error" in res) { setRangeResult(null); return }
                    setRangeResult(res.result)
                  }}
                >
                  {rangeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Check"}
                </Button>
              </div>

              {rangeQueried && (
                <div className="mt-3 rounded-[10px] p-3" style={{ background: "rgba(83,74,183,0.06)" }}>
                  {!rangeResult?.recorded ? (
                    <p className="text-xs text-muted-foreground">{rangeEmpty}</p>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                          {fmtDate(rangeFrom)} → {fmtDate(rangeTo)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {rangeResult.present}P · {rangeResult.late}L · {rangeResult.absent}A
                          &nbsp;/&nbsp;{rangeResult.total} periods
                        </p>
                      </div>
                      <p
                        className="text-3xl font-black flex-shrink-0"
                        style={{
                          color: rangeResult.rate >= 90 ? "#639922"
                               : rangeResult.rate >= 75 ? "#EF9F27"
                               : "#E24B4A"
                        }}
                      >
                        {rangeResult.rate}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Calendar ── */}
            <div className="skillio-card p-5">
              <div className="flex items-center justify-between mb-5">
                <button
                  className="cursor-pointer p-1.5 rounded-full hover:bg-accent transition-colors"
                  onClick={() => setAttendanceMonth(new Date(attendanceMonth.getFullYear(), attendanceMonth.getMonth() - 1, 1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-5 h-5 text-muted-foreground"/>
                </button>
                <p className="text-sm font-black">
                  {attendanceMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                </p>
                <button
                  className="cursor-pointer p-1.5 rounded-full hover:bg-accent transition-colors"
                  onClick={() => setAttendanceMonth(new Date(attendanceMonth.getFullYear(), attendanceMonth.getMonth() + 1, 1))}
                  aria-label="Next month"
                >
                  <ChevronRight className="w-5 h-5 text-muted-foreground"/>
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <p key={d} className="text-[10px] font-black text-muted-foreground">{d}</p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`}/>)}
                {Array(daysInMonth).fill(null).map((_, i) => {
                  const day        = i + 1
                  const iso        = dateString(day)
                  const status     = currentAttendanceDate(day)
                  const isSelected = iso === selectedAttDate
                  const isToday    = iso === new Date().toLocaleDateString("en-CA")
                  const bg = isSelected
                    ? "#534AB7"
                    : status === "present" ? "rgba(99,153,34,0.12)"
                    : status === "absent"  ? "rgba(226,75,74,0.12)"
                    : status === "late"    ? "rgba(239,159,39,0.12)"
                    : ""
                  const dot = status === "present" ? "#639922"
                    : status === "absent" ? "#E24B4A"
                    : status === "late"   ? "#EF9F27"
                    : ""
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedAttDate(iso)}
                      className="flex flex-col items-center py-1.5 rounded-[8px] transition-all hover:scale-105 cursor-pointer"
                      style={{ background: bg, outline: isToday && !isSelected ? "1.5px solid #534AB7" : "none" }}
                    >
                      <p className="text-xs font-semibold" style={{ color: isSelected ? "#fff" : "var(--foreground)" }}>{day}</p>
                      {dot && !isSelected && <div className="w-1.5 h-1.5 rounded-full mt-0.5" style={{ background: dot }}/>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap">
              {[{ l: "Present", c: "#639922" }, { l: "Absent", c: "#E24B4A" }, { l: "Late", c: "#EF9F27" }].map(l => (
                <div key={l.l} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: l.c }}/>
                  <span className="text-xs text-muted-foreground font-semibold">{l.l}</span>
                </div>
              ))}
            </div>

            {/* ── Period-wise detail for selected date ── */}
            <div className="skillio-card p-4">
              <p className="text-xs font-black text-foreground mb-3">
                Periods on&nbsp;
                {new Date(`${selectedAttDate}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long" })}
                &nbsp;·&nbsp;{fmtDate(selectedAttDate)}
              </p>
              {selectedDateRecords.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {selectedDateEmpty}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedDateRecords.map(r => {
                    const color = r.status === "present" ? "#639922" : r.status === "absent" ? "#E24B4A" : "#EF9F27"
                    const bg    = r.status === "present" ? "rgba(99,153,34,0.10)" : r.status === "absent" ? "rgba(226,75,74,0.10)" : "rgba(239,159,39,0.10)"
                    return (
                      <div key={r.period} className="flex items-center justify-between rounded-[8px] px-3 py-2" style={{ background: bg }}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-muted-foreground w-6">P{r.period}</span>
                          <span className="text-xs font-semibold text-foreground">{r.subject || "—"}</span>
                        </div>
                        <span className="text-xs font-bold capitalize" style={{ color }}>{r.status}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        </ViewWrapper>
      )}

      {/* ── TIMETABLE (read-only) ──────────────────────────────────────────────── */}
      {view === "timetable" && (
        <ViewWrapper id="timetable">
          <div className="flex flex-col gap-4">
            <h1 className="text-base font-black text-foreground">Timetable</h1>
            {ttLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading timetable…</div>
            ) : ttSlots.length === 0 && ttLoaded ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <TrendingUp className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No timetable set yet</p>
                <p className="text-xs mt-1">Your teacher hasn't published a timetable yet.</p>
              </div>
            ) : (
              <TimetableDisplayView
                slots={ttSlots}
                subjects={ttSubjects}
                updatedByName={ttUpdatedBy}
                updatedAt={ttUpdatedAt}
              />
            )}
          </div>
        </ViewWrapper>
      )}

      {/* ── SETTINGS ─────────────────────────────────────────────────────────── */}
      {/* ════════════════════════ TEACHERS VIEW ════════════════════════════════ */}
      {view === "teachers" && (
        <ViewWrapper id="teachers">
          <div className="flex flex-col gap-4">
            <h1 className="text-base font-bold text-foreground">My Teachers</h1>

            {teachersLoading && (
              <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading teachers…
              </div>
            )}

            {!teachersLoading && teachers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <span className="text-4xl">👨‍🏫</span>
                <p className="text-sm font-semibold text-foreground">No teachers assigned yet</p>
                <p className="text-xs text-muted-foreground">Your class teachers will appear here once they are assigned.</p>
              </div>
            )}

            {!teachersLoading && teachers.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {teachers.map(teacher => {
                  const initials = teacher.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
                  return (
                    <div key={teacher.id}
                      className="skillio-card p-5 flex items-start gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(83,74,183,0.12)]">
                      {/* Avatar */}
                      <UserPhoto
                        path={teacher.photo_url}
                        className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-border"
                        fallback={
                          <div
                            className="w-14 h-14 rounded-full flex items-center justify-center text-base font-black text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}
                          >
                            {initials}
                          </div>
                        }
                      />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{teacher.name}</p>

                        {/* Subject badges */}
                        {teacher.subjects.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {teacher.subjects.map(sub => (
                              <span key={sub}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                {sub}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Phone */}
                        <div className="flex items-center gap-1.5 mt-3">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          {teacher.phone ? (
                            <>
                              <a
                                href={`tel:${teacher.phone}`}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                {teacher.phone}
                              </a>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(teacher.phone!)
                                  setCopiedId(teacher.id)
                                  setTimeout(() => setCopiedId(null), 2000)
                                }}
                                title="Copy number"
                                aria-label={copiedId === teacher.id ? "Copied!" : "Copy phone number"}
                                className="ml-0.5 flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors cursor-pointer"
                                style={copiedId === teacher.id
                                  ? { background: "#dcfce7", color: "#16a34a" }
                                  : { background: "transparent", color: "var(--muted-foreground)" }}
                              >
                                {copiedId === teacher.id
                                  ? <><Check className="w-3 h-3" />Copied!</>
                                  : <Copy className="w-3 h-3" />
                                }
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not available</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </ViewWrapper>
      )}

      {view === "settings" && (
        <ViewWrapper id="settings">
          <div className="flex flex-col gap-4 max-w-md">
            <h1 className="text-base font-black text-foreground">Settings</h1>
            <div className="skillio-card p-6">
              <h3 className="text-sm font-black mb-5">Profile</h3>
              <form className="flex flex-col gap-4"
                onSubmit={async e => {
                  e.preventDefault(); setSettingsSaving(true); setSettingsError(""); setSettingsSaved(false)
                  const res = await updateProfile({ name: settingsForm.name, preferred_language: settingsForm.language as "english"|"hindi" })
                  setSettingsSaving(false)
                  if ("error" in res) { setSettingsError("Failed to save settings."); return }
                  setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 3000)
                }}>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-bold">Display name</label>
                  <Input value={settingsForm.name} onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} className="h-10 text-sm rounded-[10px]" placeholder="Your name"/>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-bold">Language</label>
                  <select value={settingsForm.language} onChange={e => setSettingsForm(f => ({ ...f, language: e.target.value }))}
                    className="cursor-pointer w-full h-10 text-sm rounded-[10px] px-3 bg-background border border-border focus:outline-none focus:ring-2 focus:ring-ts-purple">
                    <option value="english">English</option>
                    <option value="hindi">हिंदी (Hindi)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-bold">Username</label>
                  <Input className="h-10 text-sm rounded-[10px] opacity-60 font-mono" value={user?.username ?? "—"} disabled/>
                  <p className="text-[11px] text-muted-foreground mt-1">Contact your teacher to change.</p>
                </div>
                {settingsError && <p className="text-xs font-semibold" style={{ color: "#E24B4A" }}>{settingsError}</p>}
                {settingsSaved && <p className="text-xs font-semibold" style={{ color: "#639922" }}>✓ Settings saved!</p>}
                <Button type="submit" disabled={settingsSaving} className="cursor-pointer rounded-full text-xs w-fit text-white border-0 font-bold px-6" style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}>
                  {settingsSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5"/>Saving…</> : "Save settings"}
                </Button>
              </form>
            </div>

            {/* Data Deletion Request — DPDP Act 2023 */}
            <div className="skillio-card p-6 border border-red-200 dark:border-red-900">
              <h3 className="text-sm font-black mb-1 text-red-600 dark:text-red-400">Request Data Deletion</h3>
              <p className="text-xs text-muted-foreground mb-4">Under the DPDP Act 2023, you have the right to request deletion of your personal data. Your school admin will review and process the request.</p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block font-bold">Reason (optional)</label>
                  <textarea value={deletionReason} onChange={e => setDeletionReason(e.target.value)}
                    placeholder="Why do you want your data deleted?"
                    className="w-full h-20 text-sm rounded-[10px] px-3 py-2 bg-background border border-border focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    maxLength={500} />
                </div>
                {deletionErr && <p className="text-xs text-red-500">{deletionErr}</p>}
                {deletionMsg && <p className="text-xs text-emerald-600">{deletionMsg}</p>}
                <Button
                  type="button"
                  disabled={deletionLoading}
                  onClick={async () => {
                    setDeletionLoading(true); setDeletionErr(""); setDeletionMsg("")
                    const res = await requestDataDeletion(deletionReason)
                    setDeletionLoading(false)
                    if ("error" in res) { setDeletionErr(res.error); return }
                    setDeletionMsg("Your data deletion request has been submitted. Your school admin will review it shortly.")
                    setDeletionReason("")
                  }}
                  className="w-fit text-xs rounded-full border border-red-300 bg-transparent text-red-600 hover:bg-red-50 dark:hover:bg-red-950 font-bold px-5 disabled:opacity-50"
                  variant="outline"
                >
                  {deletionLoading ? <><Loader2 className="w-3 h-3 animate-spin mr-1.5"/>Submitting…</> : "Submit Deletion Request"}
                </Button>
              </div>
            </div>
          </div>
        </ViewWrapper>
      )}

      {/* ── EVENT / NOTIFICATION DETAIL MODAL ───────────────────────────────── */}
      {expandedEvent && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          style={{ animation: "modalBackdropIn 0.18s ease-out" }}
          onClick={() => setExpandedEvent(null)}
        >
          <div
            className="w-full max-w-sm rounded-[20px] overflow-hidden bg-card border border-border shadow-2xl"
            style={{ animation: "modalPopIn 0.22s cubic-bezier(0.16,1,0.3,1)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="relative px-5 pt-5 pb-4" style={{ background: `${expandedEvent.color}12` }}>
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: expandedEvent.color }} />
              <button
                onClick={() => setExpandedEvent(null)}
                className="cursor-pointer absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl mb-3 shadow-sm"
                style={{ background: expandedEvent.color }}
              >
                {expandedEvent.icon}
              </div>
              <h3 className="text-base font-bold text-foreground leading-snug pr-8">{expandedEvent.title}</h3>
              {expandedEvent.scheduled_at && (
                <p className="text-[11px] font-semibold mt-1.5" style={{ color: expandedEvent.color }}>
                  📅 {new Date(expandedEvent.scheduled_at).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              )}
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{expandedEvent.message}</p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── FILE / LINK VIEWER OVERLAY (student) ────────────────────────────── */}
      {sViewerItem && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
            <button onClick={() => setSViewerItem(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-sm font-semibold text-foreground truncate flex-1">{sViewerItem.label}</span>
            {sViewerItem.type === "link" && sViewerItem.link_url && (
              <a href={sViewerItem.link_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-ts-blue hover:underline shrink-0">
                <ExternalLink className="w-3.5 h-3.5" /> Open original
              </a>
            )}
          </div>
          <div className="flex-1 overflow-hidden" onContextMenu={e => e.preventDefault()}>
            {(() => {
              const ft = sViewerItem.file_type ?? ""

              // All file items use pre-fetched blob URLs (auth token never in URL)
              if (sViewerItem.type === "file") {
                const slideState = slideConversionState(sViewerItem)
                if (slideState === "converting" || slideState === "failed") return (
                  <div className="flex items-center justify-center h-full bg-muted/20 p-4">
                    <div role="status" className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border shadow-sm max-w-sm text-center">
                      <span className="text-5xl" aria-hidden="true">📊</span>
                      <div>
                        <p className="text-base font-semibold text-foreground">{sViewerItem.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {slideState === "converting"
                            ? "This lesson is being prepared. Please check back in a few minutes."
                            : "This lesson isn't ready to view yet. Please ask your teacher."}
                        </p>
                      </div>
                      {slideState === "converting" && (
                        <Button size="sm" className="text-xs rounded-full" disabled={slideChecking} onClick={() => recheckSlideConversion(sViewerItem)}>
                          {slideChecking ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Checking…</> : "Check again"}
                        </Button>
                      )}
                    </div>
                  </div>
                )
                if (isStreamedVideo(sViewerItem)) return <LessonVideo key={sViewerItem._id} item={sViewerItem} />
                if (sViewerBlobLoading || (!sViewerBlobUrl && !sViewerFailed)) return (
                  <div role="status" className="flex items-center justify-center h-full gap-3 text-muted-foreground text-sm">
                    <span className="animate-spin text-lg">⏳</span> Loading file…
                  </div>
                )
                if (sViewerFailed || !sViewerBlobUrl) return (
                  <div role="alert" className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-sm">
                    <p>This file could not be loaded. Please check your connection and try again.</p>
                    <Button size="sm" variant="outline" onClick={() => setSViewerRetry(n => n + 1)}>Try again</Button>
                  </div>
                )

                if (["jpg","jpeg","png","webp","gif"].includes(ft)) {
                  return (
                    <div className="flex items-center justify-center h-full p-4 bg-muted/30">
                      <img src={sViewerBlobUrl} alt={sViewerItem.label} className="max-h-full max-w-full object-contain rounded-xl shadow-lg" />
                    </div>
                  )
                }

                // PDF / PPTX-with-PDF / DOCX / other viewable files
                return <iframe src={sViewerBlobUrl} title={sViewerItem.label} className="w-full h-full border-0" />
              }

              // Link items — Google Drive, YouTube, external URLs
              const url = getViewerUrl(sViewerItem)
              if (!url) return (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Cannot preview this file type.
                </div>
              )

              // Google URLs — fill height first, width follows 16:9 so arrows stay in view
              if (sViewerItem.type === "link" && sViewerItem.link_url && isGoogleUrl(sViewerItem.link_url)) {
                const googleEmbedUrl = driveEmbedUrl(sViewerItem.link_url)
                const isSlides = sViewerItem.link_url.includes("presentation")
                return (
                  <div className="flex items-center justify-center h-full w-full" style={{ background: "#111" }}>
                    <iframe
                      src={googleEmbedUrl}
                      title={sViewerItem.label}
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

              // YouTube, other links → iframe
              return (
                <iframe src={url} title={sViewerItem.label} className="w-full h-full border-0"
                  allow="autoplay; fullscreen"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" />
              )
            })()}
          </div>
        </div>,
        document.body
      )}

      {view === "marks" && <StudentMarksPanel />}
      {view === "homework" && <StudentHomeworkPanel />}

    </DashboardLayout>
  )
}

