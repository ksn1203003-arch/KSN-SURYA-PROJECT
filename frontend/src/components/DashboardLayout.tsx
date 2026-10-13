// ─────────────────────────────────────────────────────────────────────────────
// components/DashboardLayout.tsx — Shared shell for all three dashboards.
// Renders a collapsible sidebar on desktop and a bottom nav bar on mobile.
// Handles profile photo upload, notifications bell, and teacher clock-in/out.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Menu, X, LogOut, Bell, Search, Mail, BookOpen, Star, CheckCheck, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { useAuth } from "@/contexts/AuthContext"
import { uploadAvatar, getClockStatus, clockIn, clockOut, getMyNotifications, markNotificationRead, markAllNotificationsRead, type AppNotification } from "@/lib/userApi"
import { pingActivity, studentClockOut } from "@/lib/studentApi"

interface NavItem {
  label: string
  path: string
  icon: ReactNode
  onClick?: () => void
}

interface DashboardLayoutProps {
  role: "student" | "teacher" | "admin" | "parent"
  userName: string
  userSubtitle?: string
  userEmail?: string
  navItems: NavItem[]
  activeView?: string
  // When true, keyboard focus moves to the main content area whenever activeView changes
  // (not on first load), so screen-reader and keyboard users are told the section changed.
  moveFocusOnViewChange?: boolean
  children: ReactNode
  instructor?: { name: string; subject: string; initials: string }
  classmates?: { name: string; points: number; initials: string }[]
  onSettingsClick?: () => void
  studentPoints?: number | null
  studentAttendance?: number | null
  onClockIn?: () => void
  onClockOut?: () => void
}

const ROLE_CONFIG = {
  student: {
    style:          "light" as const,
    accentColor:    "#534AB7",
    accentBg:       "rgba(83,74,183,0.10)",
    hoverBg:        "rgba(83,74,183,0.06)",
    avatarGradient: "linear-gradient(135deg,#534AB7,#378ADD)",
    logoGradient:   "linear-gradient(135deg,#534AB7,#378ADD)",
    topBarAccent:   "#534AB7",
  },
  teacher: {
    style:          "light" as const,
    accentColor:    "#534AB7",
    accentBg:       "rgba(83,74,183,0.10)",
    hoverBg:        "rgba(83,74,183,0.06)",
    avatarGradient: "linear-gradient(135deg,#534AB7,#378ADD)",
    logoGradient:   "linear-gradient(135deg,#534AB7,#378ADD)",
    topBarAccent:   "#534AB7",
  },
  admin: {
    style:          "light" as const,
    accentColor:    "#534AB7",
    accentBg:       "rgba(83,74,183,0.10)",
    hoverBg:        "rgba(83,74,183,0.06)",
    avatarGradient: "linear-gradient(135deg,#534AB7,#378ADD)",
    logoGradient:   "linear-gradient(135deg,#534AB7,#378ADD)",
    topBarAccent:   "#534AB7",
  },
  parent: {
    style:          "light" as const,
    accentColor:    "#378ADD",
    accentBg:       "rgba(55,138,221,0.10)",
    hoverBg:        "rgba(55,138,221,0.06)",
    avatarGradient: "linear-gradient(135deg,#378ADD,#534AB7)",
    logoGradient:   "linear-gradient(135deg,#378ADD,#534AB7)",
    topBarAccent:   "#378ADD",
  },
}

const NAV_SECTIONS: Record<string, Array<{ label: string; items: string[] }>> = {
  student: [
    { label: "Overview",   items: ["Dashboard", "Lessons", "Timetable"] },
    { label: "Activities", items: ["Quizzes", "Homework", "Certificates", "My attendance", "My Marks", "Live Code"] },
    { label: "School",     items: ["Teachers"] },
    { label: "Account",    items: ["Settings"] },
  ],
  teacher: [
    { label: "Overview",   items: ["Dashboard", "Lessons", "Timetable", "Live Code"] },
    { label: "Management", items: ["Attendance", "Students", "Quizzes", "Homework", "Marks", "Certificates"] },
    { label: "Communicate", items: ["AI assistant", "Notifications"] },
    { label: "Account",    items: ["Settings"] },
  ],
  admin: [
    { label: "School",     items: ["Overview", "Classes", "Timetable"] },
    { label: "People",     items: ["Teachers", "Students", "Parents"] },
    { label: "Manage",     items: ["Marks", "Certificates", "Reports", "Data Requests"] },
    { label: "Communicate", items: ["Notifications"] },
    { label: "Account",    items: ["Settings"] },
  ],
  parent: [
    { label: "Child",      items: ["Overview", "Lessons", "Marks", "Attendance", "Certificates"] },
  ],
}

const CLASSMATE_COLORS = ["#534AB7","#378ADD","#E2625A","#EF9F27","#639922","#9D59C7"]

// The 5 nav items shown in the mobile bottom navigation bar per role
const MOBILE_NAV_ITEMS: Record<string, string[]> = {
  student:  ["Dashboard", "Lessons", "Quizzes", "Live Code", "Settings"],
  teacher:  ["Dashboard", "Lessons", "Attendance", "Students", "AI assistant"],
  admin:    ["Overview", "Classes", "Teachers", "Students", "Settings"],
  parent:   ["Overview", "Lessons", "Marks", "Attendance", "Certificates"],
}

// Compress image to ≤200px and JPEG @0.82 quality — keeps localStorage usage tiny
function compressAvatar(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 200
      const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1)
      const w = Math.round(img.naturalWidth  * scale)
      const h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement("canvas")
      canvas.width = w; canvas.height = h
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(blobUrl)
      resolve(canvas.toDataURL("image/jpeg", 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve("") }
    img.src = blobUrl
  })
}

// Notification type → emoji icon
const NOTIF_ICONS: Record<string, string> = {
  announcement: "📢", reminder: "⏰", achievement: "🏆", alert: "🚨", event: "📅",
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 2)   return "Just now"
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return "Yesterday"
  return `${days} days ago`
}

// A redirect (e.g. a wrong-role link) can pass a short message through the router's location state.
function readNotice(state: unknown): string | null {
  if (typeof state !== "object" || state === null || !("notice" in state)) return null
  const { notice } = state as { notice: unknown }
  return typeof notice === "string" && notice.length > 0 ? notice : null
}

export function DashboardLayout({
  role, userName, userSubtitle = "", userEmail = "", navItems, activeView, moveFocusOnViewChange = false, children,
  instructor, classmates, onSettingsClick,
  studentPoints = null, studentAttendance = null,
  onClockIn, onClockOut,
}: DashboardLayoutProps) {
  const [mobileOpen,       setMobileOpen]       = useState(false)
  const [showProfile,      setShowProfile]       = useState(false)
  const [showNotifs,       setShowNotifs]        = useState(false)
  const [clockedIn,        setClockedIn]         = useState(false)
  const [clockLoading,     setClockLoading]      = useState(false)
  const [clockTime,        setClockTime]         = useState<string | null>(null)
  const [elapsed,          setElapsed]           = useState(0)
  const [notifications,    setNotifications]     = useState<AppNotification[]>([])
  const [notifsLoaded,     setNotifsLoaded]      = useState(false)
  const [expandedNotif,    setExpandedNotif]     = useState<string | null>(null)

  const navigate = useNavigate()
  const location = useLocation()
  const { signOut, user, refreshUser } = useAuth()

  // Focus moves to the main area when the section or the address changes (e.g. opening a subject),
  // never on first load, so keyboard and screen-reader users know the content changed.
  const mainRef = useRef<HTMLElement>(null)
  const pathname = location.pathname
  const viewKey = `${pathname}|${activeView ?? ""}`
  const previousViewKeyRef = useRef(viewKey)
  useEffect(() => {
    if (previousViewKeyRef.current === viewKey) return
    previousViewKeyRef.current = viewKey
    if (moveFocusOnViewChange) mainRef.current?.focus({ preventScroll: true })
  }, [viewKey, moveFocusOnViewChange])

  // A redirect's notice is shown once: it is copied into local state and removed from the history
  // entry straight away, so a Refresh or Back to this page does not repeat it. It stays until it is
  // dismissed or the user goes to another page.
  const [notice, setNotice] = useState<string | null>(null)
  const noticePathRef = useRef(pathname)
  // Declared before the effect below so that, when a new notice arrives together with a new address,
  // the new notice is the one that is kept.
  useEffect(() => {
    if (noticePathRef.current === pathname) return
    noticePathRef.current = pathname
    setNotice(null)
  }, [pathname])
  useEffect(() => {
    const incoming = readNotice(location.state)
    if (!incoming) return
    setNotice(incoming)
    navigate(pathname, { replace: true, state: null })
  }, [location.state, pathname, navigate])
  const dismissNotice = () => {
    setNotice(null)
    mainRef.current?.focus({ preventScroll: true })
  }

  // Verify clock state from backend on mount — never trust stale localStorage alone.
  // This prevents the timer running when the teacher hasn't explicitly clocked in.
  useEffect(() => {
    if (role === "student") return
    if (!user?.id) return
    getClockStatus().then(res => {
      if ("error" in res) return
      const key = `ts_clock_${user.id}`
      if (res.clocked_in && res.since) {
        const since = res.since
        setClockedIn(true)
        setClockTime(new Date(since).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }))
        setElapsed(Math.floor((Date.now() - new Date(since).getTime()) / 1000))
        try { localStorage.setItem(key, JSON.stringify({ clockedIn: true, since })) } catch { /* ignore */ }
      } else {
        // Not clocked in — clear any stale localStorage entry
        setClockedIn(false)
        setElapsed(0)
        setClockTime(null)
        try { localStorage.removeItem(key) } catch { /* ignore */ }
      }
    })
  }, [user?.id, role])

  // Live elapsed timer — recalculates from the actual clock-in time on every tick
  // so throttled background tabs catch up instantly when the user returns
  useEffect(() => {
    if (!clockedIn) return
    function tick() {
      try {
        const stored = localStorage.getItem(`ts_clock_${user?.id}`)
        if (stored) {
          const { since } = JSON.parse(stored) as { clockedIn: boolean; since: string }
          setElapsed(Math.floor((Date.now() - new Date(since).getTime()) / 1000))
        }
      } catch { /* ignore */ }
    }
    tick() // run immediately on mount / clock-in
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [clockedIn, user?.id])

  function formatElapsed(secs: number) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`
    return `${m}m ${s.toString().padStart(2, "0")}s`
  }

  async function handleClockIn() {
    setClockLoading(true)
    const since = new Date().toISOString()
    if (role === "student") {
      // Student clock in — records login for "Log in today" quest + streak tracking
      await pingActivity("login")
      setClockLoading(false)
    } else {
      const res = await clockIn()
      setClockLoading(false)
      if (res.error) return
    }
    setClockedIn(true)
    setElapsed(0)
    setClockTime(new Date(since).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }))
    try { localStorage.setItem(`ts_clock_${user?.id}`, JSON.stringify({ clockedIn: true, since })) } catch { /* ignore */ }
    onClockIn?.()
  }

  async function handleClockOut() {
    setClockLoading(true)
    if (role === "student") {
      const minutesSpent = Math.round(elapsed / 60)
      await studentClockOut(minutesSpent)
      setClockLoading(false)
    } else {
      const res = await clockOut()
      setClockLoading(false)
      if (res.error) return
    }
    setClockedIn(false)
    setElapsed(0)
    setClockTime(null)
    try { localStorage.removeItem(`ts_clock_${user?.id}`) } catch { /* ignore */ }
    onClockOut?.()
  }

  async function handleLogout() {
    // Students: auto clock-out on sign out so minutes are saved
    // Teachers: session stays open — it closes at midnight or when they manually clock out
    if (clockedIn && role === "student") await handleClockOut()
    await signOut()
    navigate("/", { replace: true })
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Key by user ID so photos never leak between accounts on the same device
  const avatarKey = user?.id ? `ts_avatar_${user.id}` : `ts_avatar_name_${userName.replace(/\s+/g, "_")}`

  // Lazy init — read user-ID-based key synchronously to avoid flash of initials on refresh
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (!user?.id) return null
    try { return localStorage.getItem(`ts_avatar_${user.id}`) }
    catch { return null }
  })

  // When user.id is available (after auth resolves), read the correct user-specific photo.
  // We intentionally ignore user.profile_photo_url here because it may return another
  // user's photo when switching accounts on the same device (backend caching / shared school record).
  useEffect(() => {
    if (!user?.id) return
    try {
      const stored = localStorage.getItem(`ts_avatar_${user.id}`)
      if (stored) setAvatarUrl(stored)
      else setAvatarUrl(null) // clear any photo from a previously logged-in user
    } catch { /* ignore */ }
  }, [user?.id])

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await compressAvatar(file)
    if (!url) return
    setAvatarUrl(url)
    try { localStorage.setItem(avatarKey, url) } catch { /* storage full */ }
    try { await uploadAvatar(url) } catch { /* offline — localStorage copy still works */ }
    await refreshUser()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // Load notifications when bell is opened for the first time
  useEffect(() => {
    if (!showNotifs) return // LOW-29: fetch fresh every time the bell is opened
    getMyNotifications().then(res => {
      setNotifsLoaded(true)
      if ("error" in res) return
      setNotifications(res.notifications)
    })
  }, [showNotifs])

  async function handleMarkRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    await markNotificationRead(id)
  }

  async function handleMarkAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await markAllNotificationsRead()
    setShowNotifs(false)
  }

  const initials = userName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const cfg = ROLE_CONFIG[role]
  const unreadCount = notifications.filter(n => !n.read).length

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return "Good morning"
    if (h < 17) return "Good afternoon"
    return "Good evening"
  })()

  const handleNavClick = (item: NavItem) => {
    item.onClick?.()
    setMobileOpen(false)
  }

  const closeAll = () => { setShowProfile(false); setShowNotifs(false) }

  const AvatarCircle = ({ size, className = "" }: { size: number; className?: string }) => (
    <div
      className={`rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: avatarUrl ? "transparent" : cfg.avatarGradient }}
    >
      {avatarUrl
        ? <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
        : <span className="text-white font-black" style={{ fontSize: size * 0.35 }}>{initials}</span>
      }
    </div>
  )

  // ── Sidebar content ──────────────────────────────────────────────────────────
  const LightSidebarContent = () => {
    const sections = NAV_SECTIONS[role] ?? NAV_SECTIONS.student
    return (
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Profile card at top of sidebar ── */}
        <div className="px-2.5 pt-3 pb-3">
          <div
            className="p-3 rounded-2xl flex items-center gap-2.5 shadow-sm"
            style={{ background: "rgba(83,74,183,0.08)", border: "1px solid rgba(83,74,183,0.14)" }}
          >
            {/* Avatar — click to change photo */}
            <div
              className="relative group cursor-pointer flex-shrink-0"
              onClick={() => fileInputRef.current?.click()}
              title="Change profile photo"
              role="button"
              aria-label="Change profile photo"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click() } }}
            >
              <AvatarCircle size={40} />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-[13px] leading-none">📷</span>
              </div>
            </div>
            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">{userName}</p>
              {userSubtitle && <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">{userSubtitle}</p>}
              <span
                className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
                style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Sectioned navigation */}
        <nav className="flex-1 px-2.5 py-2 overflow-y-auto space-y-3" aria-label="Main navigation">
          {sections.map(section => {
            const sectionItems = navItems.filter(i => section.items.includes(i.label))
            if (sectionItems.length === 0) return null
            return (
              <div key={section.label}>
                <p className="text-[9px] font-black tracking-[0.2em] uppercase text-muted-foreground/50 px-2.5 mb-1">
                  {section.label}
                </p>
                <div className="space-y-px">
                  {sectionItems.map(item => {
                    const isActive = activeView === item.path.replace("#", "")
                    return (
                      <button
                        key={item.label}
                        onClick={() => handleNavClick(item)}
                        aria-current={isActive ? "page" : undefined}
                        className={`cursor-pointer flex items-center gap-2.5 px-2.5 py-2 rounded-lg w-full text-left text-[12.5px] transition-all duration-150 ${isActive ? "nav-pill-active font-semibold" : "text-muted-foreground hover:text-foreground font-medium"}`}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = cfg.hoverBg }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent" }}
                      >
                        <span
                          className="flex-shrink-0 w-[18px] h-[18px] flex items-center justify-center"
                          style={{ color: isActive ? cfg.accentColor : "currentColor", opacity: isActive ? 1 : 0.7 }}
                        >
                          {item.icon}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{item.label}</span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.accentColor }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Instructor card */}
          {instructor && (
            <div>
              <p className="text-[10px] font-black tracking-[0.18em] uppercase text-muted-foreground/60 px-2 mb-1.5">Instructor</p>
              <div
                className="mx-1 p-3 rounded-[12px] cursor-default transition-all"
                style={{ background: "rgba(83,74,183,0.07)", border: "1px solid rgba(83,74,183,0.14)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm"
                    style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
                  >
                    {instructor.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate leading-tight">{instructor.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{instructor.subject}</p>
                  </div>
                  <Star className="w-3 h-3 flex-shrink-0" style={{ color: "#F59E0B" }} />
                </div>
              </div>
            </div>
          )}

          {/* Classmates */}
          {classmates && classmates.length > 0 && (
            <div>
              <p className="text-[10px] font-black tracking-[0.18em] uppercase text-muted-foreground/60 px-2 mb-1.5">Classmates</p>
              <div className="space-y-0.5">
                {classmates.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2.5 px-2 py-2 rounded-[10px] hover:bg-accent/50 transition-colors cursor-default">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                      style={{ background: CLASSMATE_COLORS[i % CLASSMATE_COLORS.length] }}
                    >
                      {c.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-foreground truncate leading-tight">{c.name}</p>
                    </div>
                    <span className="text-[10px] font-black flex-shrink-0" style={{ color: "#534AB7" }}>{c.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Sign out */}
        <div className="px-2.5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={handleLogout}
            className="cursor-pointer flex items-center gap-2.5 px-2.5 py-2 rounded-lg w-full text-[12px] font-medium text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all duration-150"
          >
            <LogOut className="w-[15px] h-[15px] flex-shrink-0 opacity-70" />
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const Logo = ({ className = "" }: { className?: string }) => (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shadow-sm flex-shrink-0" style={{ background: cfg.logoGradient }}>
        🎓
      </div>
      <span className="text-[13.5px] font-black tracking-tight" style={{ color: "var(--foreground)" }}>
        TeachScript
      </span>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--background)" }}>

      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      {/* No border lines at the sidebar/navbar junction (top-left corner) — a
          hard-edged vertical + horizontal border crossing there reads as a messy
          "+" seam. Separation comes from the background-color difference alone
          (--card vs --background), the same pattern Notion/Linear/Vercel use. */}
      <aside
        className="hidden md:flex flex-col w-[230px] flex-shrink-0 h-full relative overflow-hidden"
        style={{ background: "var(--card)" }}
      >
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center px-5" style={{ height: 56 }}>
            <Logo />
          </div>
          <LightSidebarContent />
        </div>
      </aside>

      {/* ── Mobile overlay sidebar ───────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} role="button" tabIndex={-1} aria-label="Close navigation menu" onKeyDown={e => e.key === "Escape" && setMobileOpen(false)} />
          <aside
            className="absolute left-0 top-0 h-full w-[230px] flex flex-col z-10 overflow-hidden"
            style={{ background: "var(--card)", boxShadow: "4px 0 24px rgba(0,0,0,0.15)" }}
            aria-label="Navigation menu"
          >
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between px-4 h-14" style={{ borderBottom: "1px solid var(--border)" }}>
                <Logo />
                <button className="cursor-pointer transition-colors text-muted-foreground hover:text-foreground w-11 h-11 rounded-lg hover:bg-accent flex items-center justify-center" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <LightSidebarContent />
            </div>
          </aside>
        </div>
      )}

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 md:px-5 flex-shrink-0 z-10 relative" style={{ background: "var(--card)", height: 56, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
          <button className="cursor-pointer md:hidden text-muted-foreground hover:text-foreground transition-colors w-11 h-11 -ml-2 rounded-lg hover:bg-accent flex items-center justify-center" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu" aria-expanded={mobileOpen}>
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden md:flex flex-1 max-w-[260px] items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/70 border border-border/50 text-muted-foreground text-xs hover:bg-muted transition-colors cursor-text">
            <Search className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
            <span className="opacity-60">Search…</span>
          </div>

          {/* Mobile: name + timer side by side */}
          <div className="md:hidden flex-1 min-w-0 flex items-center gap-2">
            <p className="text-xs font-bold text-foreground truncate">{userName}</p>
            {clockedIn && (
              <span className="text-[10px] font-mono tabular-nums flex-shrink-0" style={{ color: "#10b981" }}>
                🟢 {formatElapsed(elapsed)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <div className="hidden lg:block mr-1 text-right">
              <p className="text-[10px] text-muted-foreground/70 leading-none">{greeting} 👋</p>
              <p className="text-xs font-semibold text-foreground leading-tight mt-0.5 truncate max-w-[120px]">{userName}</p>
            </div>

            {/* Clock In / Clock Out — all roles, all screen sizes */}
            <div className="flex items-center gap-1.5">
              {clockedIn && (
                <div className="hidden md:flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 dot-pulse inline-block flex-shrink-0" />
                  <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
                </div>
              )}
              {/* Clock In / Clock Out — icon + text on all screen sizes */}
              <button
                onClick={clockedIn ? handleClockOut : handleClockIn}
                disabled={clockLoading}
                className="cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all duration-200 disabled:opacity-60"
                style={{
                  background: clockedIn ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                  color: clockedIn ? "#ef4444" : "#10b981",
                  border: `1px solid ${clockedIn ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}`,
                }}
                title={clockedIn
                  ? `${role === "student" ? "Learning" : "Clocked in"} since ${clockTime}`
                  : role === "student" ? "Clock in to start your learning session" : "Clock in to start tracking hours"}
              >
                <Timer className="w-3.5 h-3.5" />
                <span>{clockLoading ? "…" : clockedIn ? "Clock Out" : "Clock In"}</span>
              </button>
            </div>

            {/* Bell — min 44px touch target for WCAG 2.5.5 */}
            <button
              className="cursor-pointer relative w-11 h-11 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
              onClick={() => { setShowNotifs(p => !p); setShowProfile(false) }}
              title="Notifications"
              aria-label="Notifications"
              aria-expanded={showNotifs}
              aria-haspopup="listbox"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-black text-white flex items-center justify-center" style={{ background: "#EF4444" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <ModeToggle />

            {/* Avatar — min 44px touch target for WCAG 2.5.5 */}
            <button
              onClick={() => { setShowProfile(p => !p); setShowNotifs(false) }}
              className="cursor-pointer transition-opacity rounded-full flex-shrink-0 w-11 h-11 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
              title={userName}
              aria-label={`${userName} — account menu`}
              aria-expanded={showProfile}
              aria-haspopup="menu"
            >
              <div className="rounded-full overflow-hidden" style={{ width: 32, height: 32 }}>
                <AvatarCircle size={32} />
              </div>
            </button>
          </div>
        </header>

        {/* ── Notifications panel (fixed) ──────────────────────────────────── */}
        {showNotifs && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeAll} />
            <div
              className="fixed z-50 rounded-2xl overflow-hidden page-enter flex flex-col"
              style={{ top: 60, right: 16, width: "min(384px, calc(100vw - 32px))", maxHeight: "min(480px, calc(100vh - 80px))", boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)", background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-foreground">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#EF4444" }}>{unreadCount}</span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead}
                    className="cursor-pointer flex items-center gap-1 text-[11px] text-primary font-semibold hover:opacity-80 transition-opacity">
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1">
                {!notifsLoaded ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-xs">Loading…</span>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-2xl">🔔</div>
                    <p className="text-sm font-semibold text-foreground">You're all caught up!</p>
                    <p className="text-xs text-muted-foreground">No notifications yet.</p>
                  </div>
                ) : (
                  notifications.map((n, i) => {
                    const isExpanded = expandedNotif === n.id
                    const typeColor: Record<string, string> = {
                      announcement: "#534AB7", reminder: "#f59e0b",
                      achievement: "#10b981", alert: "#EF4444", event: "#378ADD",
                    }
                    const color = typeColor[n.type] ?? "#534AB7"
                    return (
                      <div key={n.id}
                        onClick={() => { setExpandedNotif(isExpanded ? null : n.id); if (!n.read) handleMarkRead(n.id) }}
                        className={[
                          "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                          n.read ? "hover:bg-accent/30" : "hover:bg-accent/50 bg-primary/[0.03]",
                        ].join(" ")}
                        style={{ borderBottom: i < notifications.length - 1 ? "1px solid var(--border)" : "none" }}
                      >
                        {/* Type icon with colored background */}
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 mt-0.5"
                          style={{ background: `${color}18` }}>
                          {NOTIF_ICONS[n.type] ?? "📢"}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs leading-tight ${n.read ? "font-medium text-foreground" : "font-bold text-foreground"}`}>
                              {n.title}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!n.read && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />}
                              <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                            </div>
                          </div>

                          {/* Preview line */}
                          {!isExpanded && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight line-clamp-1">{n.message}</p>
                          )}

                          {/* Expanded full message */}
                          {isExpanded && (
                            <div className="mt-1.5 space-y-1">
                              <p className="text-[11px] text-muted-foreground leading-relaxed">{n.message}</p>
                              <div className="flex items-center gap-2 flex-wrap mt-1">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{ background: `${color}18`, color }}>
                                  {n.type.charAt(0).toUpperCase() + n.type.slice(1)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">→ {n.target_label}</span>
                                <span className="text-[10px] text-muted-foreground">by {n.created_by_name}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="px-4 py-2.5 shrink-0 text-center" style={{ borderTop: "1px solid var(--border)" }}>
                  <button onClick={() => { setNotifsLoaded(false); getMyNotifications().then(r => { setNotifsLoaded(true); if (!("error" in r)) setNotifications(r.notifications) }) }}
                    className="text-[11px] text-primary font-semibold hover:opacity-80 transition-opacity">
                    Refresh
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Profile panel (fixed) ────────────────────────────────────────── */}
        {showProfile && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeAll} />
            <div
              className="fixed z-50 rounded-2xl p-4 page-enter"
              style={{ top: 60, right: 16, width: "min(264px, calc(100vw - 32px))", boxShadow: "0 8px 40px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)", background: "var(--card)", border: "1px solid var(--border)" }}
            >
              {/* Avatar + name */}
              <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
                {/* Avatar with upload overlay */}
                <div className="relative flex-shrink-0 w-14 h-14 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <AvatarCircle size={56} />
                  <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5">
                    <span className="text-white text-[18px] leading-none">📷</span>
                    <span className="text-white text-[9px] font-semibold leading-none">Change</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-foreground leading-tight truncate">{userName}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{userSubtitle}</p>
                  <span
                    className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2 mb-4">
                {userEmail && (
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{userEmail}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{userSubtitle || "Student"}</span>
                </div>
                {instructor && (
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <Star className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
                    <span>Instructor: {instructor.name}</span>
                  </div>
                )}
              </div>

              {/* Stats — only for student, and only once the dashboard summary has been loaded
                  (it is fetched by the Dashboard/Lessons screens, never just for this panel) */}
              {role === "student" && (studentPoints != null || studentAttendance != null) && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: "Points",     value: studentPoints     != null ? String(studentPoints)          : "—", color: "#F59E0B" },
                    { label: "Attendance", value: studentAttendance != null ? `${studentAttendance}%`        : "—", color: "#534AB7" },
                  ].map(s => (
                    <div key={s.label} className="rounded-[10px] p-2.5 text-center" style={{ background: "var(--muted)" }}>
                      <p className="text-base font-black" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  className="cursor-pointer w-full text-xs text-white font-bold py-2.5 rounded-full transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
                  onClick={() => { closeAll(); onSettingsClick?.() }}
                >
                  Edit Profile
                </button>
                <button
                  className="cursor-pointer w-full text-xs font-semibold py-2.5 rounded-full border transition-all hover:bg-red-50 dark:hover:bg-red-900/20"
                  style={{ color: "#E24B4A", borderColor: "rgba(226,75,74,0.25)" }}
                  onClick={() => { closeAll(); handleLogout() }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Scrollable content ─────────────────────────────────────────────── */}
        <main
          ref={mainRef}
          tabIndex={-1}
          aria-label="Main content"
          className={`flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 relative outline-none ${role === "student" ? "dashboard-bg-student" : ""}`}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "linear-gradient(rgba(83,74,183,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(83,74,183,0.025) 1px,transparent 1px)",
            backgroundSize: "40px 40px",
          }} />
          {/* The live region is always mounted so a notice that appears later is announced. */}
          <div role="status" aria-live="polite" className="relative z-10">
            {notice && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">
                <span>{notice}</span>
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 cursor-pointer"
                  aria-label="Dismiss notice"
                  onClick={dismissNotice}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="relative z-10">{children}</div>
        </main>

        {/* ── Mobile bottom navigation ─────────────────────────────────────── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 mobile-bottom-nav" aria-label="Mobile navigation">
          <div className="flex items-stretch h-14">
            {(MOBILE_NAV_ITEMS[role] ?? []).map(label => {
              const item = navItems.find(i => i.label === label)
              if (!item) return null
              const isActive = activeView === item.path.replace("#", "")
              return (
                <button
                  key={label}
                  onClick={() => handleNavClick(item)}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 px-1 transition-colors relative"
                  style={{ color: isActive ? "#534AB7" : "var(--muted-foreground)" }}
                >
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: "#534AB7" }} />
                  )}
                  <span className={`flex items-center justify-center transition-transform ${isActive ? "scale-110" : ""}`} style={{ width: 20, height: 20 }}>
                    {item.icon}
                  </span>
                  <span className="text-[9px] font-semibold leading-none truncate max-w-full px-0.5">
                    {label === "AI assistant" ? "AI" : label === "My attendance" ? "Attendance" : label}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarFile}
        />
      </div>
    </div>
  )
}
