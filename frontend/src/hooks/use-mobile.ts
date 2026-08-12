// ─────────────────────────────────────────────────────────────────────────────
// hooks/use-mobile.ts — React hook that returns true when viewport is < 768 px.
// Used by DashboardLayout to switch between sidebar (desktop) and bottom nav (mobile).
// Exports: useIsMobile()
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
