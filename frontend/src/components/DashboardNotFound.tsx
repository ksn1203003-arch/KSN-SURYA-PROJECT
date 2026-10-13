// ─────────────────────────────────────────────────────────────────────────────
// components/DashboardNotFound.tsx — Friendly in-dashboard "not found" state.
// Shown inside the dashboard shell (sidebar and bottom nav stay visible) when a link points
// at a section or subject that does not exist, so a bad or outdated link never shows a blank page.
// The heading takes focus when this appears so screen readers announce what happened.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react"
import { Compass } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DashboardNotFoundProps {
  title: string
  message: string
  actionLabel: string
  onAction: () => void
}

export function DashboardNotFound({ title, message, actionLabel, onAction }: DashboardNotFoundProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }) }, [])

  return (
    <div className="skillio-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 ref={headingRef} tabIndex={-1} className="text-base font-black text-foreground outline-none">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button type="button" onClick={onAction} className="mt-2 cursor-pointer rounded-full px-5">
        {actionLabel}
      </Button>
    </div>
  )
}
