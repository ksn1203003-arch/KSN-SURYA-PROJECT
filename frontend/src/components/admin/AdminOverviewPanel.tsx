import { useState, useEffect } from "react"
import { DatePicker } from "@/components/ui/date-picker"
import { SkeletonList } from "@/components/SkeletonCard"
import { Button } from "@/components/ui/button"
import {
  Users, GraduationCap, BookOpen, UserCheck, Plus, ChevronDown, ChevronUp,
  TrendingUp, Activity, Zap, AlertCircle, Info, Star,
} from "lucide-react"
import { Spinner, AnimatedCounter, MiniRing, DonutChart, StudentAvatar } from "./adminComponents"
import { clsLabel, CLASS_COLORS } from "./adminShared"
import type { SchoolData, Stats, ClassRow, TeacherRow, StudentRow, TeacherSessionSummary } from "./adminTypes"
import type { StudentAttendanceToday } from "@/lib/userApi"
import { AlertTriangle, Bell, CheckCircle, RotateCcw } from "lucide-react"

interface AdminOverviewPanelProps {
  school: SchoolData | null
  stats: Stats
  loadingSchool: boolean
  user: { name?: string } | null
  classes: ClassRow[]
  loadingClasses: boolean
  teachers: TeacherRow[]
  loadingTeachers: boolean
  students: StudentRow[]
  loadingStudents: boolean
  teacherSessions: TeacherSessionSummary[]
  loadingSessions: boolean
  studentAttendance: Map<string, StudentAttendanceToday>
  sessionPeriod: "today" | "week" | "month" | "custom"
  setSessionPeriod: (p: "today" | "week" | "month" | "custom") => void
  sessionFrom: string
  setSessionFrom: (s: string) => void
  sessionTo: string
  setSessionTo: (s: string) => void
  alertFilter: "all" | "warning" | "info"
  setAlertFilter: (f: "all" | "warning" | "info") => void
  alertsRefreshing: boolean
  setAlertsRefreshing: (b: boolean) => void
  expandedTile: string | null
  setExpandedTile: (t: string | null) => void
  loadTeacherSessions: (period?: "today" | "week" | "month" | "custom", from?: string, to?: string) => Promise<void>
  loadStudentAttendance: () => Promise<void>
  loadTeachers: () => Promise<void>
  loadClasses: () => Promise<void>
  loadStudents: () => Promise<void>
  setView: (v: string) => void
  setShowAddClass: (b: boolean) => void
  setShowTeacherModal: (b: boolean) => void
  setShowStudentModal: (b: boolean) => void
}

export default function AdminOverviewPanel({
  school, stats, loadingSchool, user, classes, loadingClasses, teachers, loadingTeachers,
  students, loadingStudents, teacherSessions, loadingSessions, studentAttendance,
  sessionPeriod, setSessionPeriod, sessionFrom, setSessionFrom, sessionTo, setSessionTo,
  alertFilter, setAlertFilter, alertsRefreshing, setAlertsRefreshing,
  expandedTile, setExpandedTile, loadTeacherSessions, loadStudentAttendance,
  loadTeachers, loadClasses, loadStudents, setView, setShowAddClass, setShowTeacherModal, setShowStudentModal,
}: AdminOverviewPanelProps) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const greetEmoji = hour < 12 ? "🌅" : hour < 17 ? "☀️" : "🌙"
  const todayStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })

  const clsCompact = (c: { name?: string | null; grade: number; section: string }) =>
    c.name ?? (c.grade > 0 ? `${c.grade}${c.section}` : c.section)

  return (
    <div className="relative">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute w-96 h-96 rounded-full opacity-[0.04]" style={{ background: "radial-gradient(circle, #534AB7, transparent)", top: "-5%", right: "-5%", animation: "orbFloat1 18s ease-in-out infinite" }} />
        <div className="absolute w-72 h-72 rounded-full opacity-[0.035]" style={{ background: "radial-gradient(circle, #378ADD, transparent)", bottom: "10%", left: "-8%", animation: "orbFloat2 22s ease-in-out infinite" }} />
        <div className="absolute w-56 h-56 rounded-full opacity-[0.03]" style={{ background: "radial-gradient(circle, #639922, transparent)", top: "40%", right: "20%", animation: "orbFloat3 16s ease-in-out infinite 3s" }} />
      </div>

      <div className="relative space-y-5" style={{ zIndex: 1 }}>
        {loadingSchool ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
            <Spinner /> Loading school data…
          </div>
        ) : (
          <>
            {/* ── ROW 1: Welcome header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{greetEmoji}</span>
                  <h1 className="text-xl font-bold text-foreground">{greeting}, {user?.name?.split(" ")[0] ?? "Admin"}!</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {school?.name ?? "Your School"} &mdash; {school?.board} &middot; {school?.city}, {school?.state}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground font-medium">{todayStr}</span>
                <span className="text-xs px-3 py-1.5 rounded-full font-semibold text-white capitalize" style={{ background: "linear-gradient(135deg,#534AB7,#7B73E4)" }}>
                  {school?.subscription_plan ?? "Free"} plan
                </span>
              </div>
            </div>

            {/* ── ROW 2: Stat tiles ── */}
            {(() => {
              const onlineTeachers = teacherSessions.filter(t => t.is_online)

              const PREVIEW_LIMIT = { Classes: 3, Teachers: 3, Students: 3, "Online Now": 2 } as Record<string, number>

              const classPreview  = classes.length  === 0 ? "No classes yet"  : classes.map(c => clsCompact(c)).slice(0, PREVIEW_LIMIT.Classes).join(" · ")
              const teacherPreview = teachers.length === 0 ? "No teachers yet" : teachers.slice(0, 3).map(t => t.name.split(" ")[0]).join(", ")
              const studentPreview = students.length === 0 ? "No students yet" : students.slice(0, 3).map(s => s.name.split(" ")[0]).join(", ")
              const onlinePreview  = onlineTeachers.length === 0 ? "All offline" : onlineTeachers.slice(0, 2).map(t => t.name.split(" ")[0]).join(", ")

              const tiles = [
                {
                  key: "Classes", label: "Classes", value: stats.classes,
                  icon: <BookOpen className="w-5 h-5" />, gradient: "linear-gradient(135deg,#534AB7,#7B73E4)", bg: "rgba(83,74,183,0.08)", color: "#534AB7",
                  preview: classPreview, total: classes.length,
                  expandContent: (
                    <div className="space-y-1.5">
                      {classes.map((c, i) => (
                        <div key={c.id} className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-bold flex-shrink-0 max-w-[45%] truncate" style={{ color: CLASS_COLORS[i % CLASS_COLORS.length] }} title={clsCompact(c)}>{clsCompact(c)}</span>
                          <span className="text-[10px] text-muted-foreground flex-1 min-w-0 truncate">{c.teacher_name ?? c.teachers?.[0]?.teacher_name ?? "No teacher"}</span>
                          <span className="text-[10px] font-semibold text-foreground flex-shrink-0">{c.student_count}</span>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  key: "Teachers", label: "Teachers", value: stats.teachers,
                  icon: <Users className="w-5 h-5" />, gradient: "linear-gradient(135deg,#378ADD,#5BA3EE)", bg: "rgba(55,138,221,0.08)", color: "#378ADD",
                  preview: teacherPreview, total: teachers.length,
                  expandContent: (
                    <div className="space-y-1.5">
                      {teachers.map((t, i) => {
                        const session = teacherSessions.find(s => s.id === t.id)
                        const isOnline = session?.is_online ?? false
                        return (
                          <div key={t.id} className="flex items-center gap-2">
                            <div className="relative flex-shrink-0">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                                style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }}>
                                {t.name.charAt(0).toUpperCase()}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-card ${isOnline ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                            </div>
                            <span className="text-[10px] text-foreground flex-1 truncate font-medium">{t.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${isOnline ? "bg-green-500/15 text-green-500" : "bg-muted text-muted-foreground"}`}>
                              {isOnline ? "Online" : "Offline"}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ),
                },
                {
                  key: "Students", label: "Students", value: stats.students,
                  icon: <GraduationCap className="w-5 h-5" />, gradient: "linear-gradient(135deg,#EF9F27,#F7BC61)", bg: "rgba(239,159,39,0.08)", color: "#EF9F27",
                  preview: studentPreview, total: students.length,
                  expandContent: (
                    <div className="space-y-1.5">
                      {students.map((s, i) => {
                        const attStatus = studentAttendance.get(s.id) ?? "not_recorded"
                        const isPresent = (attStatus as unknown as StudentAttendanceToday)?.status === "present" || attStatus === "present"
                        const isLate    = (attStatus as unknown as StudentAttendanceToday)?.status === "late" || attStatus === "late"
                        const isAbsent  = (attStatus as unknown as StudentAttendanceToday)?.status === "absent" || attStatus === "absent"
                        const badgeClass = isPresent
                          ? "bg-green-500/15 text-green-500"
                          : isLate
                          ? "bg-amber-500/15 text-amber-500"
                          : isAbsent
                          ? "bg-red-500/15 text-red-500"
                          : "bg-muted text-muted-foreground"
                        const badgeLabel = isPresent ? "Present" : isLate ? "Late" : isAbsent ? "Absent" : "Not marked"
                        const dotColor   = isPresent ? "bg-green-500" : isLate ? "bg-amber-500" : isAbsent ? "bg-red-500" : "bg-muted-foreground/40"
                        return (
                          <div key={s.id} className="flex items-center gap-2">
                            <div className="relative flex-shrink-0">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                                style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }}>
                                {s.name.charAt(0).toUpperCase()}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-card ${dotColor}`} />
                            </div>
                            <span className="text-[10px] text-foreground flex-1 truncate font-medium">{s.name}</span>
                            <span className="text-[9px] text-muted-foreground mr-1 flex-shrink-0">{s.class_label ?? "—"}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${badgeClass}`}>
                              {badgeLabel}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ),
                },
                {
                  key: "Online Now", label: "Online Now", value: onlineTeachers.length,
                  icon: <UserCheck className="w-5 h-5" />, gradient: "linear-gradient(135deg,#639922,#82C62B)", bg: "rgba(99,153,34,0.08)", color: "#639922",
                  preview: onlinePreview, total: onlineTeachers.length,
                  expandContent: (
                    <div className="space-y-1.5">
                      {onlineTeachers.map((t, i) => (
                        <div key={t.id} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                            style={{ background: "#639922" }}>
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[10px] text-foreground flex-1 truncate font-medium">{t.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 bg-green-500/15 text-green-500">
                            Online
                          </span>
                        </div>
                      ))}
                    </div>
                  ),
                },
              ]

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start">
                  {tiles.map(stat => {
                    const isExpanded = expandedTile === stat.key
                    const hasMore = stat.total > PREVIEW_LIMIT[stat.key]
                    return (
                      <div
                        key={stat.key}
                        className="skillio-card p-4 relative overflow-hidden transition-all duration-300"
                      >
                        <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: stat.gradient }} />
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-2xl font-bold text-foreground">
                              <AnimatedCounter value={stat.value} suffix="" />
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                          </div>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: stat.bg, color: stat.color }}>
                            {stat.icon}
                          </div>
                        </div>

                        <div className="border-t border-border/50 pt-2">
                          {!isExpanded ? (
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[10px] text-muted-foreground leading-snug truncate flex-1">
                                {stat.preview}
                              </p>
                              {hasMore && (
                                <button
                                  onClick={() => setExpandedTile(stat.key)}
                                  className="text-[10px] font-semibold flex-shrink-0 ml-1 hover:underline"
                                  style={{ color: stat.color }}
                                >
                                  +{stat.total - PREVIEW_LIMIT[stat.key]} more ↓
                                </button>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="max-h-44 overflow-y-auto pr-0.5 space-y-0">
                                {stat.expandContent}
                              </div>
                              <button
                                onClick={() => setExpandedTile(null)}
                                className="mt-2 text-[10px] font-semibold w-full text-center hover:underline"
                                style={{ color: stat.color }}
                              >
                                ↑ Show less
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* ── ROW 3: Classes card grid + Gender donut ── */}
            <div className="grid lg:grid-cols-12 gap-4">
              {/* Classes compact grid */}
              <div className="skillio-card p-5 lg:col-span-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-foreground">Classes</h3>
                  <button onClick={() => setView("classes")} className="text-xs font-medium" style={{ color: "#534AB7" }}>See all →</button>
                </div>
                {loadingClasses ? (
                  <div className="flex justify-center py-6"><Spinner /></div>
                ) : classes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <BookOpen className="w-7 h-7 text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">No classes yet</p>
                    <button onClick={() => setView("classes")} className="mt-2 text-xs font-medium" style={{ color: "#534AB7" }}>Create a class →</button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {classes.slice(0, 8).map((cls, i) => {
                        const color = CLASS_COLORS[i % CLASS_COLORS.length]
                        const teacherFirst = (cls.teacher_name ?? cls.teachers?.[0]?.teacher_name ?? "").split(" ")[0] || "No teacher"
                        return (
                          <button
                            key={cls.id}
                            onClick={() => setView("classes")}
                            className="rounded-xl p-3 text-left transition-all duration-150 hover:scale-[1.03] hover:shadow-md border border-border"
                            style={{ background: `${color}10` }}
                          >
                            <p className="text-base font-black leading-tight line-clamp-2 break-words" style={{ color }} title={clsCompact(cls)}>{clsCompact(cls)}</p>
                            <p className="text-[10px] text-muted-foreground mt-1 truncate">{teacherFirst}</p>
                            <p className="text-[10px] font-semibold mt-1" style={{ color }}>
                              {cls.student_count} <span className="font-normal text-muted-foreground">students</span>
                            </p>
                          </button>
                        )
                      })}
                    </div>
                    {classes.length > 8 && (
                      <p className="text-[11px] text-muted-foreground text-center pt-2">+{classes.length - 8} more classes</p>
                    )}
                  </>
                )}
              </div>

              {/* Gender donut — real */}
              <div className="skillio-card p-5 lg:col-span-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Students</h3>
                    <p className="text-xs text-muted-foreground">Gender distribution</p>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <DonutChart
                    total={students.length}
                    maleCount={students.filter(s => s.gender === "male").length}
                    femaleCount={students.filter(s => s.gender === "female").length}
                    otherCount={students.filter(s => s.gender === "other").length}
                  />
                </div>
              </div>
            </div>

            {/* ── ROW 4: Students list + Teachers list ── */}
            <div className="grid lg:grid-cols-12 gap-4">
              {/* Students — real */}
              <div className="skillio-card p-5 lg:col-span-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" style={{ color: "#EF9F27" }} />
                    Students
                  </h3>
                  <button onClick={() => setView("students")} className="text-xs font-medium" style={{ color: "#534AB7" }}>See all →</button>
                </div>
                {loadingStudents ? (
                  <div className="flex justify-center py-6"><Spinner /></div>
                ) : students.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <GraduationCap className="w-7 h-7 text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground">No students yet</p>
                    <button onClick={() => setView("students")} className="mt-2 text-xs font-medium" style={{ color: "#534AB7" }}>Add students →</button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Name</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Class</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Username</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Gender</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Today</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.slice(0, 6).map((s, i) => {
                          const attData = studentAttendance.get(s.id)
                          const attStatus = attData?.status ?? "not_recorded"
                          const pct = attData && attData.total_count > 0
                            ? Math.round((attData.present_count / attData.total_count) * 100)
                            : 0
                          const attBadge =
                            attStatus === "present"
                              ? { label: attData!.total_count > 1 ? `Present ${pct}%` : "Present", cls: "bg-green-500/15 text-green-500" }
                            : attStatus === "absent"
                              ? { label: "Absent", cls: "bg-red-500/15 text-red-500" }
                            :   { label: "Not marked", cls: "bg-muted text-muted-foreground" }
                          return (
                          <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 px-2">
                              <div className="flex items-center gap-2">
                                <StudentAvatar name={s.name} color={CLASS_COLORS[i % CLASS_COLORS.length]} size={24} />
                                <span className="font-medium text-foreground truncate max-w-[120px]">{s.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-muted-foreground">{s.class_label ?? "—"}</td>
                            <td className="py-2.5 px-2 font-mono text-muted-foreground">{s.username ?? "—"}</td>
                            <td className="py-2.5 px-2 capitalize text-muted-foreground">{s.gender ?? "—"}</td>
                            <td className="py-2.5 px-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${attBadge.cls}`}>
                                {attBadge.label}
                              </span>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {students.length > 6 && (
                      <button onClick={() => setView("students")} className="mt-3 w-full text-center text-[11px] font-medium py-2 rounded-xl border border-border hover:bg-muted/50 transition-colors" style={{ color: "#534AB7" }}>
                        View all {students.length} students →
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* School Alerts — computed from real data */}
              <div className="skillio-card p-5 lg:col-span-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Bell className="w-4 h-4" style={{ color: "#EF9F27" }} />
                    School Alerts
                  </h3>
                  <button
                    onClick={async () => {
                      setAlertsRefreshing(true)
                      await Promise.all([
                        loadTeacherSessions("today"),
                        loadStudentAttendance(),
                        loadTeachers(),
                        loadClasses(),
                        loadStudents(),
                      ])
                      setAlertsRefreshing(false)
                    }}
                    disabled={alertsRefreshing}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                    title="Refresh alerts"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${alertsRefreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {(() => {
                  type AlertItem = { type: "warning" | "info" | "success"; msg: string }
                  const warnings: AlertItem[] = []
                  const notices: AlertItem[] = []

                  // — Classes with no teacher
                  const unassignedClasses = classes.filter(c => !c.teacher_id && (!c.teachers || c.teachers.length === 0))
                  if (unassignedClasses.length > 0)
                    warnings.push({ type: "warning", msg: `${unassignedClasses.length} class${unassignedClasses.length > 1 ? "es have" : " has"} no teacher assigned` })

                  // — Teachers not clocked in today (only check if sessions loaded)
                  if (!loadingSessions && teacherSessions.length > 0) {
                    const notClockedIn = teacherSessions.filter(t => !t.today)
                    if (notClockedIn.length > 0) {
                      const names = notClockedIn.slice(0, 2).map(t => t.name.split(" ")[0]).join(", ")
                      const extra = notClockedIn.length > 2 ? ` +${notClockedIn.length - 2} more` : ""
                      warnings.push({ type: "warning", msg: `${notClockedIn.length} teacher${notClockedIn.length > 1 ? "s haven't" : " hasn't"} clocked in today (${names}${extra})` })
                    }
                  }

                  // — High absenteeism today (guard: after 10am IST and attendance is loaded)
                  const istHour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours()
                  if (istHour >= 10 && students.length > 0 && studentAttendance.size > 0) {
                    const absentToday = [...studentAttendance.values()].filter(a => a.status === "absent").length
                    const pctAbsent = Math.round((absentToday / students.length) * 100)
                    if (pctAbsent >= 30)
                      warnings.push({ type: "warning", msg: `High absenteeism today — ${pctAbsent}% of students absent (${absentToday} students)` })
                  }

                  // — Classes with no students
                  const emptyClasses = classes.filter(c => c.student_count === 0)
                  if (emptyClasses.length > 0)
                    notices.push({ type: "info", msg: `${emptyClasses.length} class${emptyClasses.length > 1 ? "es have" : " has"} no students yet` })

                  // — Inactive teacher accounts
                  const inactiveTeachers = teachers.filter(t => !t.is_active)
                  if (inactiveTeachers.length > 0)
                    notices.push({ type: "info", msg: `${inactiveTeachers.length} teacher account${inactiveTeachers.length > 1 ? "s are" : " is"} clocked out` })

                  // — Teachers with no class assigned
                  if (teachers.length > 0) {
                    const unassignedTeachers = teachers.filter(t => t.subject_assignments.length === 0)
                    if (unassignedTeachers.length > 0)
                      notices.push({ type: "info", msg: `${unassignedTeachers.length} teacher${unassignedTeachers.length > 1 ? "s have" : " has"} no class assigned yet` })
                  }

                  // — Classes with no subjects
                  const noSubjectClasses = classes.filter(c => !c.subjects || c.subjects.length === 0)
                  if (noSubjectClasses.length > 0)
                    notices.push({ type: "info", msg: `${noSubjectClasses.length} class${noSubjectClasses.length > 1 ? "es have" : " has"} no subjects added` })

                  // — No attendance today (after 10am, teachers exist but nothing marked)
                  if (istHour >= 10 && students.length > 0 && studentAttendance.size === 0)
                    notices.push({ type: "info", msg: "No attendance marked today — remind teachers to take attendance" })

                  // — Onboarding notices
                  if (teachers.length === 0)
                    notices.push({ type: "info", msg: "No teachers invited yet — invite your first teacher" })
                  if (students.length === 0)
                    notices.push({ type: "info", msg: "No students added yet — add students to a class" })

                  const warnCount = warnings.length
                  const noticeCount = notices.length
                  const allAlerts = [...warnings, ...notices].slice(0, 7)

                  if (allAlerts.length === 0) {
                    return (
                      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-green-500/8 border border-green-500/20">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <p className="text-xs font-medium text-green-700 dark:text-green-400 leading-tight">All good — every class has a teacher, students, and subjects.</p>
                      </div>
                    )
                  }

                  const visibleAlerts = alertFilter === "all"
                    ? allAlerts
                    : allAlerts.filter(a => a.type === alertFilter)

                  return (
                    <div className="space-y-1">
                      {/* Filter chips — clickable, toggle active filter */}
                      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                        {warnCount > 0 && (
                          <button
                            onClick={() => setAlertFilter(alertFilter === "warning" ? "all" : "warning")}
                            className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-all ${
                              alertFilter === "warning"
                                ? "bg-amber-500 text-white border-amber-500"
                                : alertFilter === "info"
                                ? "bg-amber-500/10 text-amber-500/50 border-amber-500/20"
                                : "bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/25"
                            }`}
                          >
                            ⚠ {warnCount} warning{warnCount > 1 ? "s" : ""}
                          </button>
                        )}
                        {noticeCount > 0 && (
                          <button
                            onClick={() => setAlertFilter(alertFilter === "info" ? "all" : "info")}
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border transition-all ${
                              alertFilter === "info"
                                ? "bg-blue-500 text-white border-blue-500"
                                : alertFilter === "warning"
                                ? "bg-blue-500/10 text-blue-500/50 border-blue-500/20"
                                : "bg-blue-500/10 text-blue-600 border-blue-500/25 hover:bg-blue-500/20"
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-black leading-none select-none ${
                              alertFilter === "info" ? "bg-white/90 text-blue-600" : "bg-blue-500 text-white"
                            }`}>i</span>
                            {noticeCount} notice{noticeCount > 1 ? "s" : ""}
                          </button>
                        )}
                        {alertFilter !== "all" && (
                          <button
                            onClick={() => setAlertFilter("all")}
                            className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors ml-1"
                          >
                            Show all
                          </button>
                        )}
                      </div>

                      {/* Alert rows */}
                      {visibleAlerts.map((alert, i) => (
                        <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs ${
                          alert.type === "warning"
                            ? "bg-amber-500/8 text-amber-800 dark:text-amber-300"
                            : "bg-blue-500/6 text-blue-800 dark:text-blue-300"
                        }`}>
                          {alert.type === "warning"
                            ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                            : <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />}
                          <p className="font-medium leading-tight">{alert.msg}</p>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* ── ROW 5: Teachers list ── */}
            <div className="skillio-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" style={{ color: "#534AB7" }} />
                  Teachers
                </h3>
                <button onClick={() => setView("teachers")} className="text-xs font-medium" style={{ color: "#534AB7" }}>See all →</button>
              </div>
              {loadingTeachers ? (
                <div className="flex justify-center py-6"><Spinner /></div>
              ) : teachers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Users className="w-7 h-7 text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No teachers yet</p>
                  <button onClick={() => setView("teachers")} className="mt-2 text-xs font-medium" style={{ color: "#534AB7" }}>Invite a teacher →</button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {teachers.slice(0, 8).map((t, i) => {
                    const color = CLASS_COLORS[i % CLASS_COLORS.length]
                    const initials = t.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
                    const assignments = t.subject_assignments?.length > 0
                      ? t.subject_assignments.map((a: { class_label: string; subject: string }) => `${a.class_label} · ${a.subject}`).join(", ")
                      : t.class_label ?? "No class assigned"
                    const isOnline = teacherSessions.find(s => s.id === t.id)?.is_online ?? false
                    return (
                      <div key={t.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors cursor-default">
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                            style={{ background: `linear-gradient(135deg,${color},${color}cc)` }}>
                            {initials}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${isOnline ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{assignments}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isOnline ? "bg-green-500/15 text-green-500" : "bg-muted text-muted-foreground"}`}>
                            {isOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── ROW 6: Teacher Attendance & Working Hours ── */}
            <div className="skillio-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <UserCheck className="w-4 h-4" style={{ color: "#534AB7" }} />
                    Teacher Attendance &amp; Working Hours
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(() => {
                      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
                      const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      const todayFmt = fmt(istNow)
                      if (sessionPeriod === "today")
                        return `Clock-in/out tracking — today · ${todayFmt}`
                      if (sessionPeriod === "week")
                        return `Clock-in/out tracking — last 7 days · ${fmt(new Date(istNow.getTime() - 7 * 86400000))} – ${todayFmt}`
                      if (sessionPeriod === "month")
                        return `Clock-in/out tracking — last 30 days · ${fmt(new Date(istNow.getTime() - 30 * 86400000))} – ${todayFmt}`
                      if (sessionFrom && sessionTo)
                        return `Clock-in/out tracking · ${fmt(new Date(sessionFrom + "T00:00:00"))} – ${fmt(new Date(sessionTo + "T00:00:00"))}`
                      return "Clock-in/out tracking — custom range"
                    })()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (sessionPeriod === "custom") loadTeacherSessions("custom", sessionFrom, sessionTo)
                    else loadTeacherSessions(sessionPeriod)
                  }}
                  className="text-xs font-medium" style={{ color: "#534AB7" }}>Refresh</button>
              </div>

              {/* Period filter tabs */}
              <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
                {(["today", "week", "month", "custom"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => {
                      setSessionPeriod(p)
                      if (p !== "custom") loadTeacherSessions(p)
                    }}
                    className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
                      sessionPeriod === p
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
                  </button>
                ))}
              </div>

              {/* Date range label under tabs */}
              {(() => {
                const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
                const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                const todayFmt = fmt(istNow)
                const sevenAgo = fmt(new Date(istNow.getTime() - 7 * 86400000))
                const thirtyAgo = fmt(new Date(istNow.getTime() - 30 * 86400000))
                const label = sessionPeriod === "today" ? todayFmt
                  : sessionPeriod === "week" ? `${sevenAgo} – ${todayFmt}`
                  : sessionPeriod === "month" ? `${thirtyAgo} – ${todayFmt}`
                  : sessionFrom && sessionTo
                    ? `${fmt(new Date(sessionFrom + "T00:00:00"))} – ${fmt(new Date(sessionTo + "T00:00:00"))}`
                    : null
                return label ? (
                  <p className="text-[11px] text-muted-foreground mt-1.5 mb-3 pl-1">{label}</p>
                ) : <div className="mb-3" />
              })()}

              {/* Custom date range — DatePicker calendar popups */}
              {sessionPeriod === "custom" && (
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                    <span className="text-xs text-muted-foreground flex-shrink-0">From</span>
                    <DatePicker
                      value={sessionFrom}
                      onChange={setSessionFrom}
                      max={sessionTo || new Date().toLocaleDateString("en-CA")}
                      placeholder="Start date"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                    <span className="text-xs text-muted-foreground flex-shrink-0">To</span>
                    <DatePicker
                      value={sessionTo}
                      onChange={setSessionTo}
                      min={sessionFrom}
                      max={new Date().toLocaleDateString("en-CA")}
                      placeholder="End date"
                      className="flex-1"
                    />
                  </div>
                  <button
                    onClick={() => { if (sessionFrom && sessionTo) loadTeacherSessions("custom", sessionFrom, sessionTo) }}
                    disabled={!sessionFrom || !sessionTo}
                    className="h-9 px-4 text-xs font-semibold rounded-lg transition-all disabled:opacity-40 flex-shrink-0"
                    style={{ background: "#534AB7", color: "#fff" }}
                  >
                    Apply
                  </button>
                </div>
              )}

              {loadingSessions ? (
                <div className="flex justify-center py-6"><Spinner /></div>
              ) : teacherSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <UserCheck className="w-7 h-7 text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">No clock-in data yet. Data appears once teachers clock in.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Teacher</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Status</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Clock In</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Clock Out</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Duration</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">
                          {sessionPeriod === "today" ? "Today" : sessionPeriod === "week" ? "Days (7)" : sessionPeriod === "month" ? "Days (30)" : "Days Present"}
                        </th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Total Hours</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Attendance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherSessions.map((t, i) => {
                        const initials = t.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
                        const color = CLASS_COLORS[i % CLASS_COLORS.length]
                        const fmt = (d: string | null) => d
                          ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
                          : "—"
                        const durFmt = (mins: number) => {
                          if (!mins) return "—"
                          const h = Math.floor(mins / 60)
                          const m = mins % 60
                          return h > 0 ? `${h}h ${m}m` : `${m}m`
                        }
                        return (
                          <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: color }}>
                                  {initials}
                                </div>
                                <div>
                                  <p className="font-semibold text-foreground truncate max-w-[110px]">{t.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate max-w-[110px]">{t.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.is_online ? "bg-green-500 dot-pulse" : "bg-muted-foreground/30"}`} />
                                <span className={`font-medium ${t.is_online ? "text-green-600" : "text-muted-foreground"}`}>
                                  {t.is_online ? "Online" : "Offline"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              {t.today ? (
                                <span className="font-semibold text-green-600">{fmt(t.today.clock_in)}</span>
                              ) : <span className="text-muted-foreground">Not clocked in</span>}
                            </td>
                            <td className="py-3 px-3">
                              {t.today?.clock_out ? (
                                <span className="font-semibold text-red-500">{fmt(t.today.clock_out)}</span>
                              ) : t.today ? (
                                <span className="text-amber-500 font-medium">Still active</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-3 px-3 font-semibold text-foreground">
                              {t.today ? durFmt(t.today.duration_minutes) : "—"}
                            </td>
                            <td className="py-3 px-3 font-semibold text-foreground">{t.login_days} days</td>
                            <td className="py-3 px-3 font-semibold text-foreground">{t.total_hours}h</td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2 min-w-[90px]">
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${t.attendance_pct}%`,
                                      background: t.attendance_pct >= 75 ? "#22c55e" : t.attendance_pct >= 50 ? "#f59e0b" : "#ef4444",
                                    }}
                                  />
                                </div>
                                <span className={`font-bold flex-shrink-0 ${t.attendance_pct >= 75 ? "text-green-600" : t.attendance_pct >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                  {t.attendance_pct}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── ROW 7: Setup checklist (only if incomplete) ── */}
            {(stats.classes === 0 || stats.teachers === 0 || stats.students === 0) && (
              <div className="skillio-card p-5">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" style={{ color: "#534AB7" }} />
                  Set up your school
                </h3>
                <div className="space-y-2.5">
                  {[
                    { done: stats.classes > 0, label: "Create at least one class", action: () => setView("classes") },
                    { done: stats.teachers > 0, label: "Invite your first teacher", action: () => setView("teachers") },
                    { done: stats.students > 0, label: "Add students to a class", action: () => setView("students") },
                  ].map(step => (
                    <div key={step.label} className="flex items-center gap-3">
                      {step.done
                        ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                      }
                      <span className={`text-sm flex-1 ${step.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{step.label}</span>
                      {!step.done && (
                        <button onClick={step.action} className="text-xs font-medium" style={{ color: "var(--ts-blue)" }}>
                          Go →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ROW 8: Quick actions ── */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Add Class",
                  sublabel: "Create a new class",
                  icon: <Plus className="w-5 h-5" />,
                  action: () => { setView("classes"); setTimeout(() => setShowAddClass(true), 100) },
                  gradient: "linear-gradient(135deg,#534AB7,#7B73E4)",
                  glow: "rgba(83,74,183,0.35)",
                },
                {
                  label: "Invite Teacher",
                  sublabel: "Add a new teacher",
                  icon: <Users className="w-5 h-5" />,
                  action: () => { setView("teachers"); setTimeout(() => setShowTeacherModal(true), 100) },
                  gradient: "linear-gradient(135deg,#378ADD,#5BA3EE)",
                  glow: "rgba(55,138,221,0.35)",
                },
                {
                  label: "Add Students",
                  sublabel: "Enroll new students",
                  icon: <GraduationCap className="w-5 h-5" />,
                  action: () => { setView("students"); setTimeout(() => setShowStudentModal(true), 100) },
                  gradient: "linear-gradient(135deg,#EF9F27,#F7BC61)",
                  glow: "rgba(239,159,39,0.35)",
                },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={a.action}
                  className="flex flex-col items-center gap-1.5 px-4 py-4 rounded-xl text-white text-sm font-medium transition-all duration-300 hover:shadow-[0_0_24px_var(--glow)] hover:-translate-y-0.5"
                  style={{ background: a.gradient, ["--glow" as string]: a.glow } as React.CSSProperties}
                >
                  {a.icon}
                  <span className="font-semibold text-sm">{a.label}</span>
                  <span className="text-[10px] opacity-80 hidden sm:block">{a.sublabel}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
