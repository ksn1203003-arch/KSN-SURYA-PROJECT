// ─────────────────────────────────────────────────────────────────────────────
// components/ProgressBar.tsx — Animated SVG progress ring / linear bar.
// Used on the student dashboard for module completion and attendance rate display.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react"

interface ProgressBarProps {
  value: number
  max?: number
  color?: string
  height?: string
  showLabel?: boolean
  className?: string
}

export function ProgressBar({ value, max = 100, color = "var(--ts-blue)", height = "6px", showLabel = false, className = "" }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100))
  const [width, setWidth] = useState(0)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      requestAnimationFrame(() => {
        setTimeout(() => setWidth(percent), 50)
      })
    }
  }, [percent])

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height, backgroundColor: "var(--muted)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && <span className="text-xs text-muted-foreground flex-shrink-0 w-8 text-right">{Math.round(percent)}%</span>}
    </div>
  )
}
