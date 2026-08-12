import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import * as XLSX from "xlsx"
import { Loader2, Copy, CheckCircle, ChevronDown } from "lucide-react"
import type { BulkResult, BulkTeacherResult } from "./adminTypes"

export function Modal({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
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

export function Stat({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
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

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">{icon}</div>
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">{body}</p>
      {action}
    </div>
  )
}

export function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
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

export function Spinner() {
  return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
}

export function downloadExcel(rows: Record<string, string>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Credentials")
  XLSX.writeFile(wb, filename)
}

export function downloadStudentCredential(name: string, username: string, password: string) {
  downloadExcel([{ "Student Name": name, "Username": username, "Temp Password": password }], `${username}_credentials.xlsx`)
}

export function downloadTeacherCredential(name: string, email: string, password: string) {
  downloadExcel([{ "Teacher Name": name, "Email": email, "Temp Password": password }], `${name.replace(/\s+/g, "_")}_credentials.xlsx`)
}

export function downloadBulkStudentCredentials(results: BulkResult[]) {
  const rows = results.filter(r => !r.error).map(r => ({ "Student Name": r.name, "Username": r.username, "Temp Password": r.temp_password }))
  downloadExcel(rows, "student_credentials.xlsx")
}

export function downloadBulkTeacherCredentials(results: BulkTeacherResult[]) {
  const rows = results.filter(r => !r.error).map(r => ({ "Teacher Name": r.name, "Email": r.email, "Temp Password": r.temp_password }))
  downloadExcel(rows, "teacher_credentials.xlsx")
}

export function SingleSelectDropdown({ options, value, onChange, placeholder = "Select…" }: {
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

export function MultiSelectDropdown({ options, selected, onChange, placeholder = "Select…", disabled = false }: {
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

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
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

export function MiniRing({ value, color, size = 52 }: { value: number; color: string; size?: number }) {
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

export function DonutChart({ total, maleCount, femaleCount, otherCount = 0 }: { total: number; maleCount: number; femaleCount: number; otherCount?: number }) {
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
export function StudentAvatar({ name, color, size = 28, photoUrl }: { name: string; color?: string; size?: number; photoUrl?: string | null }) {
  const photo = photoUrl ?? (() => {
    try { return localStorage.getItem(`teachscript_avatar_${name.replace(/\s+/g, "_")}`) }
    catch { return null }
  })()
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const bg = color ? `linear-gradient(135deg,${color},${color}bb)` : "linear-gradient(135deg,#534AB7,#7970D6)"
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, background: photo ? "transparent" : bg }}
    >
      {photo
        ? <img src={photo} alt={name} className="w-full h-full object-cover" />
        : <span className="text-white font-bold" style={{ fontSize: size * 0.36 }}>{initials}</span>
      }
    </div>
  )
}
