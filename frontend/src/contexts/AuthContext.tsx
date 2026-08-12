// ─────────────────────────────────────────────────────────────────────────────
// contexts/AuthContext.tsx — Global authentication state provider.
// Fetches the current user from GET /api/auth/me on mount, manages a 15-minute
// idle timeout with a 60-second warning, and broadcasts logout across tabs via
// BroadcastChannel("ts-auth").
// Exports: AuthProvider, useAuth()
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react"
import { getCurrentUser, signOut as authSignOut, type UserProfile } from "@/lib/auth"

const BC_CHANNEL = "ts-auth"
const bc = typeof window !== "undefined" && "BroadcastChannel" in window
  ? new BroadcastChannel(BC_CHANNEL)
  : null

// localStorage key used as a cross-tab logout signal for browsers that do not
// support BroadcastChannel (Safari <15.4, iOS WKWebView). Writing to this key
// triggers the storage event in all other tabs in the same origin.
const LS_LOGOUT_SIGNAL = "ts_logout_signal"

// ── Idle timeout configuration ─────────────────────────────────────────────
const IDLE_TIMEOUT_MS  = 15 * 60 * 1000  // 15 minutes
const WARN_BEFORE_MS   = 60 * 1000        // show warning 60 s before logout

// sessionStorage key that holds the absolute ms timestamp when the session
// should expire. Written on every activity event so it survives browser
// tab-freeze (Edge Sleeping Tabs, Chrome Memory Saver) and bfcache restores.
// sessionStorage is scoped to the tab and cleared when the tab is closed —
// no cross-tab leakage, no stale deadline on a fresh open.
const LOGOUT_DEADLINE_KEY = "ts_logout_at"

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const

interface AuthContextValue {
  user:             UserProfile | null
  loading:          boolean
  idleWarning:      boolean
  signOut:          () => Promise<void>
  refreshUser:      () => Promise<void>
  setUserFromLogin: (u: UserProfile) => void
  resetIdleTimer:   () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,        setUser]        = useState<UserProfile | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [idleWarning, setIdleWarning] = useState(false)

  const loginSetRef    = useRef(false)
  const warnTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleWarningRef = useRef(false)

  const clearTimers = () => {
    if (warnTimerRef.current)   { clearTimeout(warnTimerRef.current);   warnTimerRef.current   = null }
    if (logoutTimerRef.current) { clearTimeout(logoutTimerRef.current); logoutTimerRef.current = null }
  }

  const handleSignOut = useCallback(async (fromBroadcast = false) => {
    clearTimers()
    idleWarningRef.current = false
    setIdleWarning(false)
    sessionStorage.removeItem(LOGOUT_DEADLINE_KEY)
    await authSignOut().catch(() => {})
    loginSetRef.current = false
    // Clear all user-specific localStorage keys so PII does not persist after logout.
    // Keys: avatar (profile photo data URI), clock state (clock-in/out timestamp).
    // Theme preference (teachscript-theme) is intentionally kept — it is not PII.
    try {
      const keysToRemove = Object.keys(localStorage).filter(k =>
        k.startsWith("ts_avatar_") || k.startsWith("ts_clock_") ||
        k.startsWith("teachscript_avatar_") || k.startsWith("ts_dash_v2_")
      )
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch { /* ignore — storage may be unavailable in private browsing */ }
    setUser(null)
    // Notify other open tabs unless this sign-out was triggered by a broadcast message.
    // Two-channel strategy for maximum browser compatibility:
    //   1. BroadcastChannel — Chrome, Firefox, Edge, Safari ≥15.4
    //   2. localStorage storage event — Safari <15.4, iOS WKWebView, all browsers as fallback
    if (!fromBroadcast) {
      bc?.postMessage("logout")
      try {
        localStorage.setItem(LS_LOGOUT_SIGNAL, String(Date.now()))
        // Remove immediately so future storage events on this key are always fresh writes
        localStorage.removeItem(LS_LOGOUT_SIGNAL)
      } catch { /* storage unavailable in private browsing */ }
    }
  }, [])

  // Called on every user activity and from the "Stay logged in" button.
  // Writes an absolute deadline to sessionStorage so the correct expiry
  // is available even if JS execution was frozen by the browser.
  const resetIdleTimer = useCallback(() => {
    clearTimers()
    idleWarningRef.current = false
    setIdleWarning(false)
    sessionStorage.setItem(LOGOUT_DEADLINE_KEY, String(Date.now() + IDLE_TIMEOUT_MS))

    warnTimerRef.current = setTimeout(() => {
      idleWarningRef.current = true
      setIdleWarning(true)
      logoutTimerRef.current = setTimeout(() => handleSignOut(), WARN_BEFORE_MS)
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS)
  }, [handleSignOut])

  // Checks the persisted deadline and acts on it.
  // Used by all three wake-detection events (visibilitychange, pageshow, focus).
  const checkDeadlineAndAct = useCallback(() => {
    const raw = sessionStorage.getItem(LOGOUT_DEADLINE_KEY)
    if (!raw) return
    const deadline = parseInt(raw, 10)
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      handleSignOut()
    } else if (remaining <= WARN_BEFORE_MS && !idleWarningRef.current) {
      clearTimers()
      idleWarningRef.current = true
      setIdleWarning(true)
      logoutTimerRef.current = setTimeout(() => handleSignOut(), remaining)
    }
  }, [handleSignOut])

  useEffect(() => {
    if (!user) {
      clearTimers()
      setIdleWarning(false)
      sessionStorage.removeItem(LOGOUT_DEADLINE_KEY)
      return
    }

    resetIdleTimer()

    const onActivity = () => {
      if (idleWarningRef.current) return
      resetIdleTimer()
    }
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }))

    // visibilitychange — laptop wake, tab switch back (Chrome, Firefox, Safari)
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      checkDeadlineAndAct()
    }

    // pageshow — bfcache and frozen-tab restore (Edge Sleeping Tabs, Chrome Memory Saver).
    // This is the W3C-spec event guaranteed to fire when a frozen tab is unfrozen,
    // even when visibilitychange does not fire.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) checkDeadlineAndAct()
    }

    // focus — tab brought to foreground from OS task-switcher or after a
    // long background period where neither visibilitychange nor pageshow fired
    const onFocus = () => {
      if (!idleWarningRef.current) checkDeadlineAndAct()
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pageshow", onPageShow)
    window.addEventListener("focus", onFocus)

    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity))
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("pageshow", onPageShow)
      window.removeEventListener("focus", onFocus)
    }
  }, [user, resetIdleTimer, checkDeadlineAndAct])

  useEffect(() => {
    if (loginSetRef.current) { setLoading(false); return }
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // Cross-tab logout — BroadcastChannel path (Chrome, Firefox, Edge, Safari ≥15.4)
  useEffect(() => {
    if (!bc) return
    const onMessage = (e: MessageEvent) => {
      if (e.data === "logout") handleSignOut(true)
    }
    bc.addEventListener("message", onMessage)
    return () => bc.removeEventListener("message", onMessage)
  }, [handleSignOut])

  // Cross-tab logout — localStorage storage event fallback (Safari <15.4, iOS WKWebView)
  // The storage event fires in every tab of the same origin EXCEPT the one that wrote it,
  // which is exactly the behaviour we need for cross-tab notification.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_LOGOUT_SIGNAL && e.newValue !== null) {
        handleSignOut(true)
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [handleSignOut])

  const refreshUser = async () => {
    const profile = await getCurrentUser()
    setUser(profile)
  }

  const setUserFromLogin = (u: UserProfile) => {
    loginSetRef.current = true
    setUser(u)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, idleWarning,
      signOut: handleSignOut, refreshUser, setUserFromLogin, resetIdleTimer,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
