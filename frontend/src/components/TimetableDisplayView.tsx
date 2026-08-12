// ─────────────────────────────────────────────────────────────────────────────
// components/TimetableDisplayView.tsx — Rich timetable grid component.
// Day×Period grid with "Happening Now" panel, subject legend/filters, weekly-load
// arc charts, Week/Day toggle, today highlight, and live agenda view.
// Used by the Teacher, Student, and Admin timetable views.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, Fragment } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TimetableSlot {
  day: string
  period: number
  subject: string
  teacher_name?: string | null
  start_time: string
  end_time: string
}

export interface TimetableDisplayViewProps {
  slots: TimetableSlot[]
  subjects: string[]
  updatedByName?: string | null
  updatedAt?: string | null
  className?: string
}

// ─── Constants (match the app's timetable) ────────────────────────────────────
const DAYS_FULL  = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const PERIODS    = [1, 2, 3, 4, 5, 6, 7, 8]

// Standard fallback period times (used when a slot has no explicit time)
const STD_TIMES: Record<number, { st: string; en: string }> = {
  1: { st: "08:00", en: "08:40" }, 2: { st: "08:40", en: "09:20" },
  3: { st: "09:30", en: "10:10" }, 4: { st: "10:10", en: "10:50" },
  5: { st: "11:10", en: "11:50" }, 6: { st: "11:50", en: "12:30" },
  7: { st: "13:05", en: "13:45" }, 8: { st: "13:45", en: "14:25" },
}

// App subject palette — identical to TeacherDashboard's TT_SUBJECT_COLORS
const SUBJECT_COLORS: Record<string, string> = {
  "CT & AI": "#534AB7", "Maths": "#378ADD", "Science": "#639922", "English": "#E2625A",
  "Social Studies": "#EF9F27", "Hindi": "#9D59C7", "Telugu": "#0EA5E9", "EVS": "#1FA04C",
}
const FALLBACK_PALETTE = ["#534AB7", "#378ADD", "#639922", "#E2625A", "#EF9F27", "#9D59C7", "#0EA5E9", "#1FA04C"]
const ACCENT = "#534AB7"  // app's timetable accent (period badges etc.)

interface ColorSet { base: string; bg: string; bgStrong: string; bd: string; glow: string }
function subjColors(sub: string, all: string[]): ColorSet {
  let base = SUBJECT_COLORS[sub]
  if (!base) {
    const i = all.indexOf(sub)
    base = FALLBACK_PALETTE[(i < 0 ? 0 : i) % FALLBACK_PALETTE.length]
  }
  return { base, bg: base + "14", bgStrong: base + "20", bd: base + "55", glow: base + "33" }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toMin = (t: string) => (+t.slice(0, 2)) * 60 + (+t.slice(3, 5))

function to12h(val: string): string {
  if (!val) return "—"
  const [h, m] = val.split(":")
  let hh = parseInt(h, 10)
  const ampm = hh >= 12 ? "PM" : "AM"
  if (hh === 0) hh = 12; else if (hh > 12) hh -= 12
  return `${hh}:${m} ${ampm}`
}

function todayColIndex() {
  const map: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }
  return map[new Date().getDay()] ?? -1
}

// Theme tokens — all reference the app's CSS variables so light/dark "just works"
const T = {
  card:    "var(--card)",
  border:  "var(--border)",
  muted:   "var(--muted)",
  ink:     "var(--foreground)",
  sub:     "var(--muted-foreground)",
}
const CARD_SHADOW = "0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)"

// Injected keyframes (scoped names) + responsive collapse
const ANIM_CSS = `
@keyframes ttdv-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
@keyframes ttdv-ntag  { 0%,100%{opacity:1} 50%{opacity:.5} }
@keyframes ttdv-in    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
.ttdv-pulse { animation: ttdv-pulse 1.8s ease-in-out infinite }
.ttdv-ntag  { animation: ttdv-ntag  1.8s ease-in-out infinite }
.ttdv-cell  { animation: ttdv-in .3s cubic-bezier(.2,.8,.2,1) both }
.ttdv-layout  { display: flex; gap: 16px; align-items: stretch; }
.ttdv-sidebar { width: 270px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }
.ttdv-main    { flex: 1 1 0%; min-width: 0; }
@media (max-width: 900px) {
  .ttdv-layout  { flex-direction: column; align-items: stretch; }
  .ttdv-sidebar { width: auto; flex-direction: row; flex-wrap: wrap; }
  .ttdv-sidebar > * { flex: 1 1 240px; }
  .ttdv-arc-wrap { justify-content: flex-start !important; }
}
`

// Period times derived from slots (falls back to standard)
function periodTimes(slots: TimetableSlot[]) {
  return PERIODS.map(p => {
    const withTime = slots.find(s => s.period === p && s.start_time)
    const st = withTime?.start_time || STD_TIMES[p].st
    const en = withTime?.end_time   || STD_TIMES[p].en
    return { period: p, st, en }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function TimetableDisplayView({
  slots, subjects, updatedByName, updatedAt, className = "",
}: TimetableDisplayViewProps) {

  const tcol = todayColIndex()

  const [view,    setView]    = useState<"week" | "day">("week")
  const [selDay,  setSelDay]  = useState(tcol >= 0 ? tcol : 0)
  const [cmin,    setCmin]    = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
  const [clock,   setClock]   = useState("")
  const [today,   setToday]   = useState("")
  const [visible, setVisible] = useState<Set<string>>(new Set<string>())

  const allSubjects = subjects.length ? subjects : [...new Set(slots.map(s => s.subject))]
  const rows = periodTimes(slots)

  useEffect(() => { setVisible(new Set(allSubjects)) }, [allSubjects.join(",")])  // eslint-disable-line

  useEffect(() => {
    function tick() {
      const d = new Date()
      setCmin(d.getHours() * 60 + d.getMinutes())
      setClock(d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }))
      setToday(d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }))
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])

  // Which row index is "now" (based on actual slot times for today, else standard)
  const nowRow = (() => {
    if (tcol < 0) return -1
    for (const r of rows) {
      if (cmin >= toMin(r.st) && cmin < toMin(r.en)) return r.period - 1
    }
    return -1
  })()

  const nowSlot = nowRow >= 0
    ? slots.find(s => s.day === DAYS_FULL[tcol] && s.period === nowRow + 1)
    : undefined
  const nowR     = nowRow >= 0 ? rows[nowRow] : null
  const nowPct   = nowR ? Math.min(100, Math.max(0, (cmin - toMin(nowR.st)) / (toMin(nowR.en) - toMin(nowR.st)) * 100)) : 0
  const nowLeft  = nowR ? Math.max(0, toMin(nowR.en) - cmin) : 0
  const nowColor = nowSlot ? subjColors(nowSlot.subject, allSubjects) : null

  const counts = allSubjects.reduce<Record<string, number>>((acc, s) => {
    acc[s] = slots.filter(sl => sl.subject === s).length; return acc
  }, {})
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  function toggleSub(sub: string) {
    setVisible(v => { const n = new Set(v); n.has(sub) ? n.delete(sub) : n.add(sub); return n })
  }

  return (
    <div className={className} style={{ color: T.ink }}>
      <style>{ANIM_CSS}</style>

      {/* Header — spans the full width so the sidebar and board start on the same line */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontWeight: 700, fontSize: "20px", letterSpacing: "-.01em", lineHeight: 1.2, color: T.ink, margin: 0 }}>
            {view === "week" ? "This Week" : DAYS_FULL[selDay]}
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums" }}>{today}</span>
          <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums" }}>{clock}</span>
        </div>

        <div style={{ display: "flex", background: T.muted, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "3px", gap: "2px", flexShrink: 0 }}>
          {(["week", "day"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 16px", borderRadius: "8px", fontWeight: 600, fontSize: "12.5px",
                background: view === v ? T.card : "transparent",
                color: view === v ? T.ink : T.sub,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                boxShadow: view === v ? "0 1px 3px rgba(0,0,0,.1)" : "none",
                transition: ".18s",
              }}
            >
              {v === "week" ? "Week" : "Day"}
            </button>
          ))}
        </div>
      </div>

      <div className="ttdv-layout">

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="ttdv-sidebar">
          <NowCard nowSlot={nowSlot ?? null} nowPct={nowPct} nowLeft={nowLeft} nowColor={nowColor} nowPeriodLabel={nowR ? `P${nowR.period}` : "—"} />
          <LegendCard allSubjects={allSubjects} counts={counts} visible={visible} onToggle={toggleSub} getColor={(s) => subjColors(s, allSubjects)} />
          <ArcsCard allSubjects={allSubjects} counts={counts} total={total} getColor={(s) => subjColors(s, allSubjects)} />
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <main className="ttdv-main">

          {view === "week" ? (
            <WeekBoard slots={slots} rows={rows} visible={visible} todayCol={tcol} nowRow={nowRow} getColor={(s) => subjColors(s, allSubjects)} />
          ) : (
            <DayAgenda slots={slots} rows={rows} visible={visible} selDay={selDay} setSelDay={setSelDay} todayCol={tcol} nowRow={nowRow} getColor={(s) => subjColors(s, allSubjects)} />
          )}

        </main>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NOW Card
// ─────────────────────────────────────────────────────────────────────────────
function NowCard({ nowSlot, nowPct, nowLeft, nowColor, nowPeriodLabel }: {
  nowSlot: TimetableSlot | null
  nowPct: number
  nowLeft: number
  nowColor: ColorSet | null
  nowPeriodLabel: string
}) {
  const color = nowColor
  const base  = color ? color.base : ACCENT
  const R = 20, CIRC = 2 * Math.PI * R

  return (
    <div style={{
      background: color ? `linear-gradient(135deg, ${color.bgStrong}, ${T.card})` : T.card,
      border: `1px solid ${color ? color.bd : T.border}`,
      borderRadius: "16px", padding: "18px", boxShadow: CARD_SHADOW,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span className="ttdv-pulse" style={{ width: "7px", height: "7px", borderRadius: "50%", background: base, display: "inline-block" }} />
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: base }}>
            Happening Now
          </span>
        </div>

        <div style={{ position: "relative", width: "50px", height: "50px", flexShrink: 0 }}>
          <svg width="50" height="50" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="25" cy="25" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
            <circle cx="25" cy="25" r={R} fill="none" stroke={base} strokeWidth="4" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - nowPct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
            {nowPeriodLabel}
          </div>
        </div>
      </div>

      <div style={{ fontWeight: 700, fontSize: nowSlot ? "22px" : "18px", letterSpacing: "-.01em", lineHeight: 1.1, color: nowSlot ? base : T.sub }}>
        {nowSlot ? nowSlot.subject : "Free Period"}
      </div>

      <div style={{ fontSize: "12px", color: T.sub, marginTop: "6px" }}>
        {nowSlot
          ? `${nowSlot.teacher_name ? nowSlot.teacher_name + " · " : ""}${nowPeriodLabel} · ${nowLeft} min left`
          : "No class in session"}
      </div>

      <div style={{ height: "5px", borderRadius: "3px", background: "var(--muted)", marginTop: "12px", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: "3px", background: base, width: `${nowPct}%`, transition: "width .6s ease" }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Legend Card
// ─────────────────────────────────────────────────────────────────────────────
function LegendCard({ allSubjects, counts, visible, onToggle, getColor }: {
  allSubjects: string[]
  counts: Record<string, number>
  visible: Set<string>
  onToggle: (s: string) => void
  getColor: (s: string) => ColorSet
}) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "16px", boxShadow: CARD_SHADOW }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: T.sub, marginBottom: "12px" }}>
        Subjects
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "172px", overflowY: "auto", paddingRight: "2px" }}>
        {allSubjects.map(sub => {
          const c  = getColor(sub)
          const on = visible.has(sub)
          return (
            <button
              key={sub}
              onClick={() => onToggle(sub)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "8px 10px", borderRadius: "10px",
                border: `1px solid ${T.border}`,
                background: on ? "var(--muted)" : "transparent",
                cursor: "pointer", textAlign: "left", width: "100%",
                opacity: on ? 1 : .45, transition: "opacity .18s, background .18s",
                fontFamily: "inherit",
              }}
            >
              <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: c.base, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: "13px", flex: 1, color: T.ink }}>{sub}</span>
              <span style={{ fontSize: "11px", color: T.sub, fontVariantNumeric: "tabular-nums" }}>{counts[sub] ?? 0}</span>
              <span style={{
                width: "18px", height: "18px", borderRadius: "6px",
                border: on ? "none" : `1.5px solid ${T.border}`,
                background: on ? c.base : "transparent",
                display: "grid", placeItems: "center", flexShrink: 0, transition: ".18s",
              }}>
                {on && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
                    <path d="M5 12l4 4 10-11" />
                  </svg>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Arcs Card (weekly load)
// ─────────────────────────────────────────────────────────────────────────────
function ArcsCard({ allSubjects, counts, total, getColor }: {
  allSubjects: string[]
  counts: Record<string, number>
  total: number
  getColor: (s: string) => ColorSet
}) {
  const CIRC = 2 * Math.PI * 26
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "16px", boxShadow: CARD_SHADOW, flexGrow: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: T.sub, marginBottom: "14px" }}>
        Weekly Load
      </div>
      <div className="ttdv-arc-wrap" style={{ display: "flex", gap: "18px", flexWrap: "wrap", justifyContent: "space-around", alignContent: "center", alignItems: "center", flexGrow: 1 }}>
        {allSubjects.map(sub => {
          const c   = getColor(sub)
          const pct = total ? counts[sub] / total : 0
          return (
            <div key={sub} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", minWidth: "58px" }}>
              <div style={{ position: "relative", width: "58px", height: "58px" }}>
                <svg width="58" height="58" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="29" cy="29" r="26" fill="none" stroke="var(--muted)" strokeWidth="5" />
                  <circle cx="29" cy="29" r="26" fill="none" stroke={c.base} strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)} style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1) .1s" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                  {counts[sub] ?? 0}
                </div>
              </div>
              <span style={{ fontSize: "10px", fontWeight: 600, color: T.sub, textAlign: "center", maxWidth: "66px", lineHeight: 1.2 }}>
                {sub}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Week Board
// ─────────────────────────────────────────────────────────────────────────────
function WeekBoard({ slots, rows, visible, todayCol, nowRow, getColor }: {
  slots: TimetableSlot[]
  rows: Array<{ period: number; st: string; en: string }>
  visible: Set<string>
  todayCol: number
  nowRow: number
  getColor: (s: string) => ColorSet
}) {
  const boardRef    = useRef<HTMLDivElement>(null)
  const todayHdrRef = useRef<HTMLDivElement>(null)
  const [band, setBand] = useState({ left: 0, width: 0, show: false })

  useEffect(() => {
    function calc() {
      if (!boardRef.current || !todayHdrRef.current || todayCol < 0) { setBand(b => ({ ...b, show: false })); return }
      const br = boardRef.current.getBoundingClientRect()
      const hr = todayHdrRef.current.getBoundingClientRect()
      const p  = 3
      setBand({ left: hr.left - br.left - p, width: hr.width + p * 2, show: true })
    }
    calc(); setTimeout(calc, 50)
    window.addEventListener("resize", calc)
    return () => window.removeEventListener("resize", calc)
  }, [todayCol])

  const getSlot = (day: string, period: number) => slots.find(s => s.day === day && s.period === period)
  let animDelay = 0

  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "14px", overflowX: "auto", boxShadow: CARD_SHADOW }}>
      <div ref={boardRef} style={{ position: "relative", minWidth: "860px", display: "grid", gridTemplateColumns: "92px repeat(6, 1fr)", gap: "8px" }}>

        {/* Today band */}
        {band.show && (
          <div style={{
            position: "absolute", borderRadius: "12px", zIndex: 0, pointerEvents: "none", top: 0, bottom: 2,
            left: `${band.left}px`, width: `${band.width}px`,
            background: "rgba(83,74,183,0.06)", border: "1px solid rgba(83,74,183,0.18)",
            transition: "left .3s, width .3s",
          }} />
        )}

        {/* Corner */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "flex-end", paddingBottom: "10px", paddingLeft: "2px",
          fontSize: "10px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: T.sub }}>
          Period
        </div>

        {/* Day headers */}
        {DAYS_FULL.map((d, i) => (
          <div key={d} ref={i === todayCol ? todayHdrRef : undefined}
            style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
              gap: "4px", paddingBottom: "10px", fontSize: "11px", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
              color: i === todayCol ? T.ink : T.sub }}>
            <span>{d.slice(0, 3)}</span>
            {i === todayCol && (
              <span style={{ fontSize: "8px", fontWeight: 700, letterSpacing: ".06em", background: ACCENT, color: "#fff", padding: "2px 7px", borderRadius: "20px" }}>
                TODAY
              </span>
            )}
          </div>
        ))}

        {/* Period rows */}
        {rows.map((row, r) => {
          return (
            <Fragment key={`row-${r}`}>
              {/* Rail */}
              <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "4px 10px 4px 2px", borderRight: `1px solid ${T.border}` }}>
                <div style={{ fontWeight: 700, fontSize: "13px", color: T.ink }}>P{row.period}</div>
                <div style={{ fontSize: "10.5px", marginTop: "3px", lineHeight: 1.45, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: T.ink, fontWeight: 600 }}>{to12h(row.st)}</span><br />
                  <span style={{ color: T.sub }}>{to12h(row.en)}</span>
                </div>
              </div>

              {/* Day cells */}
              {DAYS_FULL.map((day, ci) => {
                const slot  = getSlot(day, row.period)
                const isOn  = slot ? visible.has(slot.subject) : true
                const color = slot && isOn ? getColor(slot.subject) : null
                const isNow = r === nowRow && ci === todayCol
                const delay = animDelay; animDelay += 12

                return (
                  <div key={`${day}-${r}`} className="ttdv-cell"
                    style={{
                      position: "relative", zIndex: 1,
                      border: `1px solid ${isNow && color ? color.base : T.border}`,
                      borderRadius: "11px", padding: "14px 11px 14px 14px", minHeight: "76px",
                      display: "flex", flexDirection: "column", justifyContent: "center", gap: "3px",
                      background: isNow && color ? color.bg : "transparent",
                      boxShadow: isNow && color ? `inset 0 0 0 2px ${color.base}` : undefined,
                      opacity: slot && !isOn ? .25 : 1,
                      filter:  slot && !isOn ? "grayscale(.5)" : undefined,
                      transition: "opacity .3s, filter .3s",
                      animationDelay: `${delay}ms`,
                    }}>
                    {color && <div style={{ position: "absolute", left: 0, top: "6px", bottom: "6px", width: "4px", borderRadius: "0 4px 4px 0", background: color.base }} />}
                    {isNow && color && (
                      <span className="ttdv-ntag" style={{ position: "absolute", top: "6px", right: "7px", zIndex: 2, fontSize: "7.5px", fontWeight: 700, letterSpacing: ".08em", color: "#fff", padding: "2px 6px", borderRadius: "20px", background: color.base }}>
                        NOW
                      </span>
                    )}
                    {slot ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "-.01em", lineHeight: 1.1, color: color ? color.base : T.ink }}>{slot.subject}</div>
                        {slot.teacher_name && <div style={{ fontSize: "10.5px", color: T.sub }}>{slot.teacher_name.split(" ").pop()}</div>}
                      </>
                    ) : (
                      <span style={{ fontSize: "12px", color: T.sub, opacity: .35 }}>—</span>
                    )}
                  </div>
                )
              })}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Day Agenda
// ─────────────────────────────────────────────────────────────────────────────
function DayAgenda({ slots, rows, visible, selDay, setSelDay, todayCol, nowRow, getColor }: {
  slots: TimetableSlot[]
  rows: Array<{ period: number; st: string; en: string }>
  visible: Set<string>
  selDay: number
  setSelDay: (i: number) => void
  todayCol: number
  nowRow: number
  getColor: (s: string) => ColorSet
}) {
  return (
    <div>
      {/* Day pills */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
        {DAYS_FULL.map((d, i) => (
          <button key={d} onClick={() => setSelDay(i)}
            style={{
              padding: "7px 15px", borderRadius: "10px", border: `1px solid ${T.border}`,
              background: i === selDay ? "var(--muted)" : "transparent",
              fontWeight: 600, fontSize: "12.5px", color: i === selDay ? T.ink : T.sub,
              cursor: "pointer", fontFamily: "inherit", transition: ".18s",
            }}>
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: "16px", overflow: "hidden", boxShadow: CARD_SHADOW }}>
        {rows.map((row, r) => {
          const slot  = slots.find(s => s.day === DAYS_FULL[selDay] && s.period === row.period)
          const isOn  = slot ? visible.has(slot.subject) : true
          const color = slot && isOn ? getColor(slot.subject) : null
          const isNow = r === nowRow && selDay === todayCol

          return (
            <Fragment key={`agenda-${r}`}>
              <div style={{
                display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
                borderBottom: r < rows.length - 1 ? `1px solid ${T.border}` : "none",
                opacity: slot && !isOn ? .5 : 1, filter: slot && !isOn ? "grayscale(.5)" : "none", transition: "opacity .3s",
              }}>
                <span style={{ fontWeight: 700, fontSize: "12px", color: T.ink, width: "26px", flexShrink: 0 }}>P{row.period}</span>
                <span style={{ fontSize: "11.5px", width: "150px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: T.ink, fontWeight: 600 }}>{to12h(row.st)}</span>
                  <span style={{ color: T.sub }}> – {to12h(row.en)}</span>
                </span>
                <span style={{ width: "4px", alignSelf: "stretch", borderRadius: "3px", flexShrink: 0, background: color ? color.base : "var(--muted)" }} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontWeight: 600, fontSize: "15px", letterSpacing: "-.01em", color: color ? color.base : (slot ? T.ink : T.sub) }}>
                    {slot ? slot.subject : <span style={{ opacity: .5, fontWeight: 500 }}>Free</span>}
                  </span>
                  {slot?.teacher_name && <span style={{ fontSize: "11px", color: T.sub }}>{slot.teacher_name}</span>}
                </div>
                {isNow && color && (
                  <span className="ttdv-ntag" style={{ fontSize: "8px", fontWeight: 700, letterSpacing: ".08em", color: "#fff", padding: "2px 7px", borderRadius: "20px", background: color.base, flexShrink: 0 }}>NOW</span>
                )}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
