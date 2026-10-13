import { useState, useEffect, useRef } from "react"
import { withXlsx } from "@/lib/excel"
import { Loader2, Calendar, TrendingUp, Download, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import {
  saveAttendance, getAttendance, getClassStudents,
  getClassAttendanceStats, getClassAttendanceRange, getTeacherClasses,
  type ClassAttStats, type ClassRangeStats, type AttSlot,
} from "@/lib/userApi"
import { attendanceBasisLabel, formatCountedDate, istTodayYmd } from "@/lib/attendanceBasis"

// Sentences for the "class not started yet" screens, kept in one place so Hindi can be added later.
const TEXT = {
  notStartedSuffix: " (attendance not set up)",
  startsOn: (label: string, date: string) =>
    `Attendance for ${label} starts on ${date}. You will be able to mark attendance from that day.`,
  checkedStillNotSet: "Checked just now. The date is still not set.",
  dateIsSet: "The date is set. You can mark attendance now.",
  dateIsSetFuture: (date: string) => `The date is set. Attendance for this class starts on ${date}.`,
  notStarted: (label: string) =>
    `Attendance for ${label} has not been switched on yet. Your school admin needs to set the date this class's school year starts. You will be able to mark attendance as soon as that is done. Nothing is lost: nothing has been marked.`,
  marksKept: "Your marks are kept on this screen. Saving will work once the date is set.",
  checkAgain: "Check again",
  checking: "Checking…",
  checkFailed: "Could not check right now. Please try again.",
  countedFrom: (date: string) => `Counted from ${date}`,
  allRecordedSheets: "All recorded sheets",
  noData: "No data",
  noAttendanceSince: (date: string) => `No attendance recorded since ${date}`,
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-06-01" → "1 Jun 2026", built from the parts so the device time zone never shifts the day */
function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  const month = m ? MONTH_SHORT[Number(m[2]) - 1] : undefined
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : ymd
}

function to12h(val: string): string {
  if (!val) return ""
  const [h, m] = val.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

type AttendanceRecord = { id: string; name: string; todayStatus: "present" | "absent" | "late" }

type TimetableSlot = {
  day: string; period: number; subject: string
  teacher_id: string | null; teacher_name: string | null
  start_time: string; end_time: string
}

type TeacherClass = {
  id: string; grade: number; section: string; name: string | null
  subjects: string[]; timetable: TimetableSlot[]
  timetable_updated_by_name: string | null; timetable_updated_at: string | null
  year_start?: string | null; has_start_date?: boolean
}

// What "Check again" learned about each class: newer than the list this panel was given
type StartInfo = { year_start: string | null; has_start_date: boolean }

interface Props {
  ttClasses: TeacherClass[]
}

export function TeacherAttendancePanel({ ttClasses }: Props) {
  const [attendanceDate,          setAttendanceDate]          = useState(() => new Date().toISOString().split("T")[0])
  const [attendanceClassId,       setAttendanceClassId]       = useState(() => ttClasses[0]?.id ?? "")
  const [attendancePeriod,        setAttendancePeriod]        = useState<number | "">("")
  const [attendanceRecords,       setAttendanceRecords]       = useState<AttendanceRecord[]>([])
  const [attendanceStudentsLoading, setAttendanceStudentsLoading] = useState(false)
  const [attendanceSaving,        setAttendanceSaving]        = useState(false)
  const [attendanceSavedMsg,      setAttendanceSavedMsg]      = useState("")
  const [attendanceError,         setAttendanceError]         = useState("")
  const [attMode,                 setAttMode]                 = useState<"mark" | "stats">("mark")
  const [attStatsClassId,         setAttStatsClassId]         = useState(() => ttClasses[0]?.id ?? "")
  const [attStats,                setAttStats]                = useState<ClassAttStats | null>(null)
  const [attStatsLoading,         setAttStatsLoading]         = useState(false)
  const [attStatsError,           setAttStatsError]           = useState("")
  const [attRangeFrom,            setAttRangeFrom]            = useState("")
  const [attRangeTo,              setAttRangeTo]              = useState("")
  const [attRangeResult,          setAttRangeResult]          = useState<ClassRangeStats | null>(null)
  const [attRangeLoading,         setAttRangeLoading]         = useState(false)
  const [attRangeError,           setAttRangeError]           = useState("")
  const [attRangeQueried,         setAttRangeQueried]         = useState(false)
  const [startInfoById,           setStartInfoById]           = useState<Record<string, StartInfo>>({})
  const [recheckLoading,          setRecheckLoading]          = useState(false)
  const [recheckMsg,              setRecheckMsg]              = useState("")
  const [saveBlockedNotSet,       setSaveBlockedNotSet]       = useState(false)
  const loadedKey    = useRef("")
  const recordsRef   = useRef<AttendanceRecord[]>([])

  const presentCount = attendanceRecords.filter(r => r.todayStatus === "present").length
  const absentCount  = attendanceRecords.filter(r => r.todayStatus === "absent").length
  const lateCount    = attendanceRecords.filter(r => r.todayStatus === "late").length

  const sortedAttClasses = [...ttClasses].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
  const attClass   = ttClasses.find(c => c.id === attendanceClassId)
  const today      = new Date().toLocaleDateString("en-US", { weekday: "long" })
  const periodSlot = attClass?.timetable.find(s => s.period === attendancePeriod && s.day === today)
  const TT_PERIODS_LIST = [1, 2, 3, 4, 5, 6, 7, 8]

  // The saved start date of a class: what "Check again" last learned, else what the class list said.
  // A class counts as started unless the server says it has no date.
  function startInfo(c: TeacherClass | undefined): StartInfo {
    if (!c) return { year_start: null, has_start_date: true }
    const fresh = startInfoById[c.id]
    if (fresh) return fresh
    return { year_start: c.year_start ?? null, has_start_date: c.has_start_date !== false }
  }
  function classText(c: TeacherClass): string {
    return `Class ${c.grade}${c.section}${c.name ? ` · ${c.name}` : ""}`
  }
  // One way to name a class in sentences: "Class 8B", or the class's own name when it has no class level
  function classLabel(c: TeacherClass): string {
    return c.grade > 0 ? `Class ${c.grade}${c.section}` : (c.name ?? c.section)
  }
  const todayIst        = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  const attStart        = startInfo(attClass)
  const classNotStarted = !!attClass && !attStart.has_start_date
  const classStart      = attStart.has_start_date ? attStart.year_start : null
  const classFuture     = !!classStart && classStart > todayIst
  const rowsHidden      = classNotStarted && attendanceRecords.length === 0
  recordsRef.current = attendanceRecords

  // A chosen date before the class's start date moves to the start date (never beyond today)
  useEffect(() => {
    if (!classStart) return
    const limit = classStart > todayIst ? todayIst : classStart
    setAttendanceDate(d => (d < classStart ? limit : d))
  }, [classStart, todayIst])

  useEffect(() => {
    if (!attendanceClassId || !attendancePeriod || classNotStarted || classFuture) return
    // The same class, period and date with marks on screen is never reloaded (it would wipe unsaved marks)
    const key = `${attendanceClassId}|${attendancePeriod}|${attendanceDate}`
    if (loadedKey.current === key && recordsRef.current.length > 0) return
    loadedKey.current = key
    setAttendanceStudentsLoading(true)
    setAttendanceRecords([])
    setAttendanceError("")

    getClassStudents(attendanceClassId).then(async stuRes => {
      setAttendanceStudentsLoading(false)
      if ("error" in stuRes) { setAttendanceError("Failed to load students"); return }
      const defaults: AttendanceRecord[] = stuRes.students.map(s => ({
        id: s.id, name: s.name, todayStatus: "present" as const,
      }))
      const attRes = await getAttendance(attendanceClassId, attendanceDate, attendancePeriod as number)
      if (!("error" in attRes) && attRes.attendance?.records?.length) {
        const saved = new Map(attRes.attendance.records.map(r => [r.student_id, r.status]))
        setAttendanceRecords(defaults.map(d => ({
          ...d, todayStatus: (saved.get(d.id) as "present" | "absent" | "late") ?? "present",
        })))
      } else {
        setAttendanceRecords(defaults)
      }
    })
  }, [attendanceClassId, attendancePeriod, attendanceDate, classNotStarted, classFuture])

  // "Check again": asks the server for a fresh class list (skipping the saved copy) and learns the dates from it
  async function handleCheckAgain() {
    setRecheckLoading(true); setRecheckMsg("")
    const res = await getTeacherClasses({ fresh: true })
    setRecheckLoading(false)
    if ("error" in res) { setRecheckMsg(TEXT.checkFailed); return }
    const next: Record<string, StartInfo> = {}
    for (const c of res.classes) next[c.id] = { year_start: c.year_start, has_start_date: c.has_start_date }
    setStartInfoById(next)
    const now = next[attendanceClassId]
    if (now?.has_start_date) {
      setSaveBlockedNotSet(false)
      setRecheckMsg(now.year_start && now.year_start > todayIst ? TEXT.dateIsSetFuture(formatYmd(now.year_start)) : TEXT.dateIsSet)
    } else {
      setRecheckMsg(TEXT.checkedStillNotSet)
    }
  }

  async function handleSaveAttendance() {
    if (!attendanceClassId || !attendancePeriod) { setAttendanceError("Select a class and period first."); return }
    if (!attendanceRecords.length) { setAttendanceError("No students to mark attendance for."); return }
    const slotSubject = attClass?.timetable.find(s => s.period === attendancePeriod && s.day === today)?.subject ?? ""
    setAttendanceSaving(true); setAttendanceError(""); setAttendanceSavedMsg("")
    const res = await saveAttendance({
      class_id: attendanceClassId, date: attendanceDate,
      period: attendancePeriod as number, subject: slotSubject,
      records: attendanceRecords.map(s => ({ student_id: s.id, student_name: s.name, status: s.todayStatus })),
    })
    setAttendanceSaving(false)
    if ("error" in res) {
      // The admin cleared the date meanwhile: keep the marks on screen and block Save until it is set again
      if (res.code === "start_date_not_set") { setSaveBlockedNotSet(true); return }
      setAttendanceError(res.error || "Failed to save")
      return
    }
    setAttendanceSavedMsg("Attendance saved!")
    setTimeout(() => setAttendanceSavedMsg(""), 3000)
  }

  function fmtD(iso: string) {
    if (!iso) return ""
    const [y, m, d] = iso.split("-")
    return `${d}-${m}-${y}`
  }

  function slotColor(slot: AttSlot) {
    if (!slot.recorded) return "var(--muted-foreground)"
    if (slot.rate >= 75) return "#639922"
    if (slot.rate >= 50) return "#EF9F27"
    return "#E24B4A"
  }

  // The date range printed on each stats card. "This Year" starts at the later of the school year start and the
  // date the server counted from; when the server counted every recorded sheet (null) it says so instead of a date.
  // An answer without the field at all (older server) keeps the plain year range.
  function buildChipRanges(countedFrom: string | null | undefined) {
    const todayISO       = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    const todayDisp      = fmtD(todayISO)
    const nowIST         = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
    const dow            = nowIST.getDay()
    nowIST.setDate(nowIST.getDate() - (dow === 0 ? 6 : dow - 1))
    const weekStartDisp  = fmtD(nowIST.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }))
    const monthStartDisp = fmtD(`${todayISO.slice(0, 7)}-01`)
    const nowIST2        = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
    const yearNum        = nowIST2.getMonth() >= 5 ? nowIST2.getFullYear() : nowIST2.getFullYear() - 1
    const yearStartYmd   = `${yearNum}-06-01`
    // Both sides are zero-padded YYYY-MM-DD, so a plain string comparison picks the later one
    const yearFromYmd    = typeof countedFrom === "string" && countedFrom > yearStartYmd ? countedFrom : yearStartYmd
    const thisYearRange  = countedFrom === null ? TEXT.allRecordedSheets : `${fmtD(yearFromYmd)} → ${todayDisp}`
    return {
      today:      todayDisp,
      this_week:  `${weekStartDisp} → ${todayDisp}`,
      this_month: `${monthStartDisp} → ${todayDisp}`,
      this_year:  thisYearRange,
    } as const
  }

  // What the open stats screens were counted from (computed here, not in the JSX)
  const chipRanges = buildChipRanges(attStats?.counted_from)
  const statsCountedFrom = attStats?.counted_from
  const statsBasisLine = attStats && statsCountedFrom !== undefined
    ? attendanceBasisLabel({ countedFrom: statsCountedFrom, className: attStats.counted_class_label, todayYmd: istTodayYmd() })
    : ""
  const statsNoDataText = statsCountedFrom
    ? TEXT.noAttendanceSince(formatCountedDate(statsCountedFrom))
    : TEXT.noData
  const rangeCountedFrom = attRangeResult?.counted_from
  const rangeBasisLine = attRangeResult && rangeCountedFrom !== undefined
    ? attendanceBasisLabel({ countedFrom: rangeCountedFrom, className: attRangeResult.counted_class_label, todayYmd: istTodayYmd() })
    : ""

  async function handleLoadRange() {
    if (!attStatsClassId || !attRangeFrom || !attRangeTo) return
    setAttRangeLoading(true); setAttRangeError(""); setAttRangeResult(null); setAttRangeQueried(false)
    const res = await getClassAttendanceRange(attStatsClassId, attRangeFrom, attRangeTo)
    setAttRangeLoading(false); setAttRangeQueried(true)
    if ("error" in res) { setAttRangeError(res.error); return }
    setAttRangeResult(res)
  }

  function downloadStatsXLSX() {
    if (!attStats) return
    const selectedClass = sortedAttClasses.find(c => c.id === attStatsClassId)
    const className    = selectedClass ? `Class ${selectedClass.grade}${selectedClass.section}` : "Class"
    const todayISO     = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    const [ty, tm, td] = todayISO.split("-")
    const generatedOn  = `${td}-${tm}-${ty}`

    const headers = [
      "#", "Student", "At Risk",
      "Today %", "Today Present", "Today Late", "Today Absent", "Today Periods",
      "This Week %", "Week Present", "Week Late", "Week Absent", "Week Periods",
      "This Month %", "Month Present", "Month Late", "Month Absent", "Month Periods",
      "This Year %", "Year Present", "Year Late", "Year Absent", "Year Periods",
    ]
    const dataRows = attStats.students.map((s, i) => [
      i + 1, s.name,
      s.this_year.recorded && s.this_year.rate < 75 ? "Yes" : "No",
      s.today.recorded      ? s.today.rate      : "",
      s.today.recorded      ? s.today.present   : "",
      s.today.recorded      ? s.today.late       : "",
      s.today.recorded      ? s.today.absent    : "",
      s.today.recorded      ? s.today.total      : "",
      s.this_week.recorded  ? s.this_week.rate  : "",
      s.this_week.recorded  ? s.this_week.present : "",
      s.this_week.recorded  ? s.this_week.late   : "",
      s.this_week.recorded  ? s.this_week.absent : "",
      s.this_week.recorded  ? s.this_week.total  : "",
      s.this_month.recorded ? s.this_month.rate : "",
      s.this_month.recorded ? s.this_month.present : "",
      s.this_month.recorded ? s.this_month.late  : "",
      s.this_month.recorded ? s.this_month.absent : "",
      s.this_month.recorded ? s.this_month.total  : "",
      s.this_year.recorded  ? s.this_year.rate  : "",
      s.this_year.recorded  ? s.this_year.present : "",
      s.this_year.recorded  ? s.this_year.late   : "",
      s.this_year.recorded  ? s.this_year.absent : "",
      s.this_year.recorded  ? s.this_year.total  : "",
    ])
    const aoa = [[`Attendance Report — ${className}`], [`Generated: ${generatedOn}`], [], headers, ...dataRows]
    // The Excel library is loaded only now, when the teacher asks for the sheet
    withXlsx("attendance-report", XLSX => {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [
      { wch: 4 }, { wch: 22 }, { wch: 8 },
      { wch: 9 }, { wch: 14 }, { wch: 11 }, { wch: 13 }, { wch: 14 },
      { wch: 10 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 13 },
      { wch: 11 }, { wch: 14 }, { wch: 12 }, { wch: 13 }, { wch: 14 },
      { wch: 10 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 13 },
    ]
    ws["!freeze"] = { xSplit: 0, ySplit: 4 }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Attendance")
    const buf  = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    const blob = new Blob([buf], { type: "application/octet-stream" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `Attendance_${className.replace(/\s+/g, "_")}_${todayISO}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
    })
  }

  // One notice for "this class has no start date yet" — used both before any students are shown and above Save
  const noticeNode = attClass && (classNotStarted || saveBlockedNotSet) ? (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex flex-col gap-1.5 text-xs">
          <p>{TEXT.notStarted(classLabel(attClass))}</p>
          {saveBlockedNotSet && <p className="font-medium">{TEXT.marksKept}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" disabled={recheckLoading} onClick={handleCheckAgain}>
          {recheckLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />{TEXT.checking}</> : TEXT.checkAgain}
        </Button>
      </div>
    </div>
  ) : null

  // A class whose school year has not begun yet: one card, no marking rows, no Save
  const futureNode = attClass && classFuture ? (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 p-4 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-xs">{TEXT.startsOn(classLabel(attClass), formatYmd(classStart ?? ""))}</p>
    </div>
  ) : null

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header + Toggle ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-base font-semibold text-foreground">Attendance</h1>
        <div className="flex items-center bg-muted rounded-full p-0.5 gap-0.5">
          {(["mark", "stats"] as const).map(m => (
            <button key={m} onClick={() => setAttMode(m)}
              className={`text-xs font-semibold px-4 py-1.5 rounded-full transition-colors capitalize ${
                attMode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {m === "mark" ? "Mark Attendance" : "View Stats"}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════ MARK MODE ════════════════════ */}
      {attMode === "mark" && (
        <>
          {/* Always on the page so screen readers announce the result of "Check again" (even after the card is gone) */}
          <div aria-live="polite"
            className={recheckMsg ? `text-xs px-1 ${recheckMsg === TEXT.checkFailed ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}` : "sr-only"}>
            {recheckMsg}
          </div>
          <div className="skillio-card p-4 flex flex-wrap gap-3 items-end">
            <div role="group" aria-labelledby="att-date-label" className="flex flex-col gap-1">
              <span id="att-date-label" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Date</span>
              <DatePicker
                value={attendanceDate}
                min={classStart ?? undefined}
                max={new Date().toISOString().slice(0, 10)}
                onChange={d => { setAttendanceDate(d); setAttendanceRecords([]); setAttendanceSavedMsg("") }}
                placeholder="Pick date"
                className="min-w-[150px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="att-class" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Class</label>
              <select id="att-class" value={attendanceClassId}
                onChange={e => {
                  setAttendanceClassId(e.target.value); setAttendancePeriod(""); setAttendanceRecords([]); setAttendanceSavedMsg("")
                  setSaveBlockedNotSet(false); setRecheckMsg(""); setAttendanceError("")
                }}
                className="h-8 text-xs rounded-lg px-3 bg-background border border-border focus:outline-none min-w-[120px]">
                <option value="">Select class…</option>
                {sortedAttClasses.map(c => (
                  <option key={c.id} value={c.id}>{startInfo(c).has_start_date ? classText(c) : `${classLabel(c)}${TEXT.notStartedSuffix}`}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="att-period" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Period</label>
              <select id="att-period" value={attendancePeriod}
                onChange={e => { setAttendancePeriod(e.target.value ? Number(e.target.value) : ""); setAttendanceRecords([]); setAttendanceSavedMsg("") }}
                disabled={!attendanceClassId || classNotStarted || classFuture}
                className="h-8 text-xs rounded-lg px-3 bg-background border border-border focus:outline-none min-w-[120px] disabled:opacity-50">
                <option value="">Select period…</option>
                {TT_PERIODS_LIST.map(p => {
                  const slot = attClass?.timetable.find(s => s.period === p && s.day === today)
                  return <option key={p} value={p}>P{p}{slot ? ` · ${slot.subject}` : ""}</option>
                })}
              </select>
            </div>
            {periodSlot && (
              <div className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium text-white" style={{ background: "#534AB7" }}>
                <span>{periodSlot.subject}</span>
                {periodSlot.teacher_name && <span className="opacity-80">· {periodSlot.teacher_name}</span>}
                {periodSlot.start_time && <span className="opacity-70">· {to12h(periodSlot.start_time)}–{to12h(periodSlot.end_time)}</span>}
              </div>
            )}
            {classStart && (
              <p className="basis-full text-[11px] text-muted-foreground">{TEXT.countedFrom(formatYmd(classStart))}</p>
            )}
          </div>

          {rowsHidden && noticeNode}
          {classFuture && futureNode}

          {(!attendanceClassId || !attendancePeriod) && !classNotStarted && !classFuture && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Calendar className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a class and period to take attendance</p>
            </div>
          )}
          {attendanceClassId && attendancePeriod && attendanceStudentsLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-10 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading students…
            </div>
          )}
          {attendanceClassId && attendancePeriod && !attendanceStudentsLoading && !classFuture && attendanceRecords.length > 0 && (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Total",   value: attendanceRecords.length, color: "#534AB7" },
                  { label: "Present", value: presentCount,             color: "#10b981" },
                  { label: "Absent",  value: absentCount,              color: "#ef4444" },
                  { label: "Late",    value: lateCount,                color: "#f59e0b" },
                ].map(s => (
                  <div key={s.label} className="skillio-card p-3 text-center">
                    <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 flex-wrap px-1">
                {[{ label: "Present", pct: "100%", color: "#10b981" }, { label: "Late", pct: "50%", color: "#f59e0b" }, { label: "Absent", pct: "0%", color: "#ef4444" }].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="text-[11px] text-muted-foreground">{l.label} = <span className="font-bold" style={{ color: l.color }}>{l.pct}</span></span>
                  </div>
                ))}
                <span className="text-[11px] text-muted-foreground italic">attendance rate weight</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-full text-xs h-7"
                  onClick={() => setAttendanceRecords(r => r.map(s => ({ ...s, todayStatus: "present" })))}>
                  Mark all present
                </Button>
                <Button size="sm" variant="outline" className="rounded-full text-xs h-7"
                  onClick={() => setAttendanceRecords(r => r.map(s => ({ ...s, todayStatus: "absent" })))}>
                  Mark all absent
                </Button>
              </div>
              <div className="bg-card rounded-xl overflow-hidden border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">#</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Student</th>
                      <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRecords.map((s, i) => (
                      <tr key={s.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground w-8">{i + 1}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                              style={{ background: s.todayStatus === "present" ? "#10b981" : s.todayStatus === "absent" ? "#ef4444" : "#f59e0b" }}>
                              {s.name[0].toUpperCase()}
                            </div>
                            {s.name}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            {(["present", "absent", "late"] as const).map(status => (
                              <button key={status}
                                onClick={() => setAttendanceRecords(r => r.map(st => st.id === s.id ? { ...st, todayStatus: status } : st))}
                                className={`text-[11px] px-2.5 py-1 rounded-full transition-colors capitalize font-medium ${
                                  s.todayStatus === status
                                    ? status === "present" ? "bg-emerald-500 text-white" : status === "absent" ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                                }`}>
                                {status}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {noticeNode}
              {attendanceError && <p role="alert" className="text-xs text-red-500">{attendanceError}</p>}
              {attendanceSavedMsg && <p className="text-xs text-emerald-600 font-medium">{attendanceSavedMsg}</p>}
              <Button className="rounded-full text-xs w-fit text-white border-0" style={{ background: "#534AB7" }}
                onClick={handleSaveAttendance} disabled={attendanceSaving || classNotStarted || classFuture || saveBlockedNotSet}>
                {attendanceSaving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Saving…</> : "Save Attendance"}
              </Button>
            </>
          )}
          {attendanceClassId && attendancePeriod && !attendanceStudentsLoading && attendanceRecords.length === 0 && !attendanceError && !classNotStarted && !classFuture && (
            <div className="text-center py-12 text-xs text-muted-foreground">No students found in this class.</div>
          )}
          {attendanceError && !attendanceStudentsLoading && attendanceRecords.length === 0 && (
            <p role="alert" className="text-xs text-red-500">{attendanceError}</p>
          )}
        </>
      )}

      {/* ════════════════════ STATS MODE ════════════════════ */}
      {attMode === "stats" && (
        <>
          <div className="skillio-card p-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Class</label>
              <select value={attStatsClassId}
                onChange={e => { setAttStatsClassId(e.target.value); setAttStats(null); setAttStatsError("") }}
                className="h-8 text-xs rounded-lg px-3 bg-background border border-border focus:outline-none min-w-[140px]">
                <option value="">Select class…</option>
                {sortedAttClasses.map(c => (
                  <option key={c.id} value={c.id}>Class {c.grade}{c.section}{c.name ? ` · ${c.name}` : ""}</option>
                ))}
              </select>
            </div>
            <Button size="sm" className="h-8 rounded-full text-xs text-white border-0" style={{ background: "#534AB7" }}
              disabled={!attStatsClassId || attStatsLoading}
              onClick={async () => {
                if (!attStatsClassId) return
                setAttStatsLoading(true); setAttStatsError(""); setAttStats(null)
                const res = await getClassAttendanceStats(attStatsClassId)
                setAttStatsLoading(false)
                if ("error" in res) { setAttStatsError(res.error); return }
                setAttStats(res)
              }}>
              {attStatsLoading ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Loading…</> : "Load Stats"}
            </Button>
            {attStats && (
              <Button size="sm" variant="outline" className="h-8 rounded-full text-xs gap-1.5" onClick={downloadStatsXLSX}>
                <Download className="w-3.5 h-3.5" /> Download Excel
              </Button>
            )}
          </div>

          {!attStatsClassId && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
              <TrendingUp className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">Select a class to view attendance stats</p>
            </div>
          )}
          {attStatsError && <p className="text-xs text-red-500 px-1">{attStatsError}</p>}

          {attStats && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { key: "today",      label: "Today" },
                  { key: "this_week",  label: "This Week" },
                  { key: "this_month", label: "This Month" },
                  { key: "this_year",  label: "This Year" },
                ] as const).map(({ key, label }) => {
                  const slot  = attStats.class_total[key]
                  const color = slotColor(slot)
                  return (
                    <div key={key} className="skillio-card p-3 flex flex-col gap-1">
                      <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{label} · Class Average</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{chipRanges[key]}</p>
                      {!slot.recorded ? (
                        <p className="text-xs text-muted-foreground italic">{statsNoDataText}</p>
                      ) : (
                        <>
                          <p className="text-2xl font-black leading-none" style={{ color }}>{slot.rate}%</p>
                          <p className="text-[10px] text-muted-foreground">{slot.present}P · {slot.late}L · {slot.absent}A / {slot.total} periods</p>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
              {statsBasisLine && <p className="text-[11px] text-muted-foreground px-1">{statsBasisLine}</p>}

              {(() => {
                const atRisk = attStats.students.filter(s => s.this_year.recorded && s.this_year.rate < 75)
                if (!atRisk.length) return null
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    {atRisk.length} student{atRisk.length > 1 ? "s" : ""} below 75% attendance this year — exam eligibility at risk
                  </div>
                )
              })()}

              <div className="skillio-card p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-foreground">Custom Date Range</p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">From</label>
                    <DatePicker value={attRangeFrom} max={new Date().toISOString().slice(0, 10)}
                      onChange={d => { setAttRangeFrom(d); setAttRangeResult(null); setAttRangeQueried(false); setAttRangeError("") }}
                      placeholder="Start date" className="min-w-[150px]" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">To</label>
                    <DatePicker value={attRangeTo} max={new Date().toISOString().slice(0, 10)}
                      onChange={d => { setAttRangeTo(d); setAttRangeResult(null); setAttRangeQueried(false); setAttRangeError("") }}
                      placeholder="End date" className="min-w-[150px]" />
                  </div>
                  <Button size="sm" className="h-8 rounded-full text-xs text-white border-0" style={{ background: "#534AB7" }}
                    disabled={!attRangeFrom || !attRangeTo || attRangeLoading} onClick={handleLoadRange}>
                    {attRangeLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Loading…</> : "Check"}
                  </Button>
                </div>
                {attRangeError && <p className="text-xs text-red-500">{attRangeError}</p>}
                {attRangeQueried && attRangeResult && (
                  <div className="flex flex-col gap-3 mt-1">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 w-fit">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Class avg</span>
                      {attRangeResult.class_total.recorded ? (
                        <span className="text-sm font-black" style={{ color: slotColor(attRangeResult.class_total) }}>
                          {attRangeResult.class_total.rate}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No records</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{attRangeResult.from} → {attRangeResult.to}</span>
                    </div>
                    {rangeBasisLine && <p className="text-[11px] text-muted-foreground px-1">{rangeBasisLine}</p>}
                    {attRangeResult.students.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No students in this class.</p>
                    ) : (
                      <div className="bg-card rounded-xl overflow-x-auto border">
                        <table className="w-full min-w-[400px]">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 w-8">#</th>
                              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Student</th>
                              <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3">Attendance %</th>
                              <th className="text-center text-xs font-semibold text-muted-foreground px-3 py-3">Present · Late · Absent</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attRangeResult.students.map((s, i) => {
                              const color = slotColor(s.slot)
                              return (
                                <tr key={s.student_id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                        style={{ background: s.slot.recorded && s.slot.rate < 75 ? "#E24B4A" : "#534AB7" }}>
                                        {s.name[0].toUpperCase()}
                                      </div>
                                      <span className="text-xs font-medium text-foreground">{s.name}</span>
                                      {s.slot.recorded && s.slot.rate < 75 && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">At Risk</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    {!s.slot.recorded ? (
                                      <span className="text-[11px] text-muted-foreground">—</span>
                                    ) : (
                                      <span className="text-sm font-black" style={{ color }}>{s.slot.rate}%</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-center text-[10px] text-muted-foreground">
                                    {s.slot.recorded ? `${s.slot.present}P · ${s.slot.late}L · ${s.slot.absent}A` : "—"}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
                {attRangeQueried && !attRangeResult && !attRangeError && !attRangeLoading && (
                  <p className="text-xs text-muted-foreground">No attendance records found for this range.</p>
                )}
              </div>

              {attStats.students.length === 0 ? (
                <p className="text-center py-12 text-xs text-muted-foreground">No students in this class.</p>
              ) : (
                <div className="bg-card rounded-xl overflow-x-auto border">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 w-8">#</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Student</th>
                        {(["today", "this_week", "this_month", "this_year"] as const).map(k => (
                          <th key={k} className="text-center text-xs font-semibold text-muted-foreground px-3 py-3 capitalize">
                            {k.replace("_", " ")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {attStats.students.map((s, i) => (
                        <tr key={s.student_id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                style={{ background: s.this_year.recorded && s.this_year.rate < 75 ? "#E24B4A" : "#534AB7" }}>
                                {s.name[0].toUpperCase()}
                              </div>
                              <span className="text-xs font-medium text-foreground">{s.name}</span>
                              {s.this_year.recorded && s.this_year.rate < 75 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">At Risk</span>
                              )}
                            </div>
                          </td>
                          {(["today", "this_week", "this_month", "this_year"] as const).map(k => {
                            const slot  = s[k]
                            const color = slotColor(slot)
                            return (
                              <td key={k} className="px-3 py-2.5 text-center">
                                {!slot.recorded ? (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                ) : (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="text-sm font-black" style={{ color }}>{slot.rate}%</span>
                                    <span className="text-[10px] text-muted-foreground">{slot.present}P · {slot.late}L · {slot.absent}A</span>
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
