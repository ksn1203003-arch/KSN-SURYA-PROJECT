import { useState, useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAYS   = ["SUN","MON","TUE","WED","THU","FRI","SAT"]

interface DatePickerProps {
  value: string           // YYYY-MM-DD  or  YYYY-MM-DDTHH:MM (when withTime)
  onChange: (date: string) => void
  min?: string            // YYYY-MM-DD
  max?: string            // YYYY-MM-DD
  placeholder?: string
  className?: string
  withTime?: boolean      // show hour + minute selectors below the calendar
}

function parseDate(val: string): Date | null {
  if (!val) return null
  // Accept both YYYY-MM-DD and YYYY-MM-DDTHH:MM
  const d = new Date(val.length === 10 ? val + "T00:00:00" : val)
  return isNaN(d.getTime()) ? null : d
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function toYMDHM(d: Date, h: number, m: number): string {
  return `${toYMD(d)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function extractTime(val: string): { h: number; m: number } {
  if (val.length > 10 && val.includes("T")) {
    const parts = val.split("T")[1].split(":")
    return { h: parseInt(parts[0]) || 0, m: parseInt(parts[1]) || 0 }
  }
  return { h: 23, m: 59 } // default to end of day for deadlines
}

export function DatePicker({ value, onChange, min, max, placeholder = "Select date", className = "", withTime = false }: DatePickerProps) {
  const selected = parseDate(value)
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const minDate  = parseDate(min ?? "")
  const maxDate  = parseDate(max ?? "")

  const initTime = extractTime(value)
  const [open,      setOpen]      = useState(false)
  const [month,     setMonth]     = useState(() => selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1))
  const [pending,   setPending]   = useState<Date | null>(selected)
  const [hour,      setHour]      = useState(initTime.h)
  const [minute,    setMinute]    = useState(initTime.m)
  const ref = useRef<HTMLDivElement>(null)

  // Sync internal state when value prop changes externally
  useEffect(() => {
    const d = parseDate(value)
    setPending(d)
    if (d) setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    const t = extractTime(value)
    setHour(t.h)
    setMinute(t.m)
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  // Build calendar grid
  function buildGrid(): Array<{ date: Date; currentMonth: boolean }> {
    const firstDay    = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const daysInPrev  = new Date(month.getFullYear(), month.getMonth(), 0).getDate()
    const cells: Array<{ date: Date; currentMonth: boolean }> = []

    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(month.getFullYear(), month.getMonth() - 1, daysInPrev - i), currentMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(month.getFullYear(), month.getMonth(), d), currentMonth: true })
    }
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(month.getFullYear(), month.getMonth() + 1, d), currentMonth: false })
    }
    return cells
  }

  function prevMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)) }
  function nextMonth() { setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)) }

  function isDisabled(d: Date) {
    if (minDate && d.getTime() < minDate.getTime()) return true
    if (maxDate && d.getTime() > maxDate.getTime()) return true
    return false
  }

  function confirm() {
    if (pending) {
      onChange(withTime ? toYMDHM(pending, hour, minute) : toYMD(pending))
    }
    setOpen(false)
  }

  function cancel() {
    setPending(parseDate(value))
    const t = extractTime(value)
    setHour(t.h); setMinute(t.m)
    setOpen(false)
  }

  // Display label
  const displayLabel = selected
    ? withTime
      ? selected.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) +
        ` · ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      : selected.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : placeholder

  const years   = Array.from({ length: 10 }, (_, i) => today.getFullYear() - 2 + i)
  const hours   = Array.from({ length: 24 }, (_, i) => i)
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59]

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-9 flex items-center justify-between rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>{displayLabel}</span>
        <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Calendar popup */}
      {open && (
        <div className="absolute z-50 mt-1 left-0 min-w-[280px] rounded-2xl shadow-xl border border-border bg-card p-4"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>

          {/* Month + Year selectors */}
          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <select
              value={month.getMonth()}
              onChange={e => setMonth(m => new Date(m.getFullYear(), +e.target.value, 1))}
              className="flex-1 h-8 rounded-lg border border-input bg-muted px-2 text-xs font-semibold text-foreground focus:outline-none"
              style={{ colorScheme: "light dark" }}
            >
              {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
            </select>
            <select
              value={month.getFullYear()}
              onChange={e => setMonth(m => new Date(+e.target.value, m.getMonth(), 1))}
              className="w-20 h-8 rounded-lg border border-input bg-muted px-2 text-xs font-semibold text-foreground focus:outline-none"
              style={{ colorScheme: "light dark" }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {buildGrid().map(({ date, currentMonth }, i) => {
              const isToday  = toYMD(date) === toYMD(today)
              const isSel    = pending ? toYMD(date) === toYMD(pending) : false
              const disabled = isDisabled(date)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setPending(date)}
                  className={[
                    "mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                    isSel    ? "bg-[#378ADD] text-white font-bold" :
                    isToday  ? "border border-[#378ADD] text-[#378ADD]" :
                    currentMonth ? "hover:bg-muted text-foreground" : "text-muted-foreground/40",
                    disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer",
                  ].join(" ")}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          {/* ── Time selector (only when withTime=true) ──────────────────────── */}
          {withTime && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Time</p>
              <div className="flex items-center gap-2">
                <select
                  value={hour}
                  onChange={e => setHour(+e.target.value)}
                  className="flex-1 h-9 rounded-lg border border-input bg-muted px-2 text-sm font-semibold text-foreground focus:outline-none text-center"
                  style={{ colorScheme: "light dark" }}
                >
                  {hours.map(h => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")} {h < 12 ? "AM" : "PM"} ({h === 0 ? "12AM" : h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`})
                    </option>
                  ))}
                </select>
                <span className="text-sm font-bold text-muted-foreground">:</span>
                <select
                  value={minute}
                  onChange={e => setMinute(+e.target.value)}
                  className="w-20 h-9 rounded-lg border border-input bg-muted px-2 text-sm font-semibold text-foreground focus:outline-none text-center"
                  style={{ colorScheme: "light dark" }}
                >
                  {minutes.map(m => (
                    <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                  ))}
                </select>
              </div>
              {pending && (
                <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                  {pending.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  {" at "}
                  <span className="font-semibold text-foreground">
                    {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Confirm / Cancel */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              {pending
                ? pending.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                : "No date selected"}
            </span>
            <div className="flex gap-3">
              <button type="button" onClick={cancel} className="text-sm text-muted-foreground hover:text-foreground font-medium transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirm} disabled={!pending}
                className="text-sm font-bold text-[#378ADD] hover:opacity-80 transition-opacity disabled:opacity-40">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
