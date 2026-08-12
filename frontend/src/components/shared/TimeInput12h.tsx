import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronDown } from "lucide-react"

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

const TIME_OPTIONS: Array<{ value: string; label: string }> = (() => {
  const opts: Array<{ value: string; label: string }> = [{ value: "", label: "— Time —" }]
  for (let h = 6; h <= 21; h++) {
    for (let m = 0; m < 60; m += 10) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      const ampm  = h >= 12 ? "PM" : "AM"
      const h12   = h === 0 ? 12 : h > 12 ? h - 12 : h
      opts.push({ value, label: `${h12}:${String(m).padStart(2, "0")} ${ampm}` })
    }
  }
  return opts
})()

function parseTyped(raw: string): string {
  const s = raw.trim()
  const match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return ""
  let h = parseInt(match[1], 10)
  const min = match[2]
  const ap  = match[3].toUpperCase()
  if (h < 1 || h > 12 || parseInt(min) > 59) return ""
  if (ap === "AM" && h === 12) h = 0
  else if (ap === "PM" && h !== 12) h += 12
  return `${String(h).padStart(2, "0")}:${min}`
}

export { TIME_OPTIONS, to12h, parseTyped }

export function TimeInput12h({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const displayLabel = value ? (TIME_OPTIONS.find(o => o.value === value)?.label ?? to12h(value)) : ""
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState("")
  const [pos, setPos]     = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)

  const filtered = draft
    ? TIME_OPTIONS.filter(o => o.value !== "" && o.label.toLowerCase().includes(draft.toLowerCase()))
    : TIME_OPTIONS.filter(o => o.value !== "")

  function openDropdown() {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX, width: Math.max(r.width, 110) })
    }
    setDraft("")
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 20)
  }

  function pick(v: string) { onChange(v); setOpen(false); setDraft("") }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const parsed = parseTyped(draft)
      if (parsed) { pick(parsed); return }
      if (filtered.length > 0) { pick(filtered[0].value); return }
    }
    if (e.key === "Escape") { setOpen(false); setDraft("") }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={openDropdown}
        style={{
          height: "30px", width: "100%", borderRadius: "6px",
          border: open ? "1.5px solid #534AB7" : "1px solid var(--border)",
          background: value ? "rgba(83,74,183,0.08)" : "var(--background)",
          color: value ? "var(--foreground)" : "var(--muted-foreground)",
          fontSize: "12px", fontWeight: value ? 700 : 400,
          padding: "0 8px", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "4px", whiteSpace: "nowrap", outline: "none",
        }}
      >
        <span>{displayLabel || "— Time —"}</span>
        <ChevronDown style={{ width: 11, height: 11, flexShrink: 0, color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onMouseDown={() => { setOpen(false); setDraft("") }} />
          <div style={{
            position: "absolute", top: pos.top, left: pos.left, width: pos.width,
            zIndex: 9999, background: "var(--popover, var(--card))",
            border: "1px solid var(--border)", borderRadius: "0.5rem",
            boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "5px 6px", borderBottom: "1px solid var(--border)" }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search or type e.g. 1:05 PM"
                style={{
                  width: "100%", height: "26px", borderRadius: "5px",
                  border: "1px solid var(--border)", background: "var(--background)",
                  color: "var(--foreground)", fontSize: "11px", padding: "0 8px", outline: "none",
                }}
              />
            </div>
            <div style={{ maxHeight: "180px", overflowY: "auto", padding: "3px 0" }}>
              {filtered.length === 0 ? (
                <div style={{ padding: "8px 12px", fontSize: "11px", color: "var(--muted-foreground)", fontStyle: "italic" }}>
                  Press Enter to use &ldquo;{draft}&rdquo;
                </div>
              ) : filtered.map(opt => (
                <div key={opt.value}
                  onMouseDown={e => { e.stopPropagation(); pick(opt.value) }}
                  style={{
                    padding: "5px 12px", fontSize: "11px", cursor: "pointer", fontWeight: 500,
                    color: value === opt.value ? "#534AB7" : "var(--foreground)",
                    background: value === opt.value ? "rgba(83,74,183,0.12)" : "transparent",
                  }}
                  onMouseEnter={e => { if (value !== opt.value) e.currentTarget.style.background = "var(--muted)" }}
                  onMouseLeave={e => { e.currentTarget.style.background = value === opt.value ? "rgba(83,74,183,0.12)" : "transparent" }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
