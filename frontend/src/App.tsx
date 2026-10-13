// ─────────────────────────────────────────────────────────────────────────────
// App.tsx — Root router and auth guard for the entire frontend.
// Public routes: /, /login, /signup, /pricing, /for-schools, /for-teachers,
//   /forgot-password, /set-password, /legal/:type.
// Protected routes: /student/dashboard, /teacher/dashboard, /admin/dashboard.
// RequireAuth checks role and redirects to /login if unauthenticated.
// ─────────────────────────────────────────────────────────────────────────────
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useEffect, useState, lazy, Suspense } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { LogOut, Clock } from "lucide-react"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { HomePage } from "@/pages/HomePage"
import { PricingPage } from "@/pages/PricingPage"
import { SignupPage } from "@/pages/SignupPage"
import { LoginPage } from "@/pages/LoginPage"
import { ForSchoolsPage } from "@/pages/ForSchoolsPage"
import { ForTeachersPage } from "@/pages/ForTeachersPage"
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage"
import { SetPasswordPage } from "@/pages/SetPasswordPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { LegalPage } from "@/pages/LegalPage"
import { PWAUpdateBanner } from "@/components/PWAUpdateBanner"
import { DASHBOARD_ROLES, dashboardPathForRole, WRONG_ROLE_NOTICE } from "@/lib/dashboardRoutes"

// Lazy-load the dashboard files — each is only fetched when the user navigates
// to that role's route, reducing initial bundle size significantly.
const StudentDashboard = lazy(() =>
  import("@/pages/StudentDashboard").then(m => ({ default: m.StudentDashboard }))
)
const TeacherDashboard = lazy(() =>
  import("@/pages/TeacherDashboard").then(m => ({ default: m.TeacherDashboard }))
)
const AdminDashboard = lazy(() =>
  import("@/pages/AdminDashboard").then(m => ({ default: m.AdminDashboard }))
)
const ParentDashboard = lazy(() =>
  import("@/pages/ParentDashboard").then(m => ({ default: m.ParentDashboard }))
)
function DashboardFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}

function IdleWarningBanner() {
  const { idleWarning, resetIdleTimer, signOut } = useAuth()
  const [countdown, setCountdown] = useState(60)

  // Start a 60-second visual countdown whenever the warning appears
  useEffect(() => {
    if (!idleWarning) { setCountdown(60); return }
    setCountdown(60)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [idleWarning])

  if (!idleWarning) return null

  return (
    // Full-screen overlay — blocks all interaction with page behind it
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl border border-border w-full max-w-sm mx-4 p-6 flex flex-col items-center gap-5 text-center">

        {/* Icon + countdown ring */}
        <div className="relative flex items-center justify-center w-16 h-16">
          <svg className="absolute inset-0 w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
              className="text-muted/30" strokeWidth="4"/>
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
              className="text-orange-500" strokeWidth="4"
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - countdown / 60)}`}
              style={{ transition: "stroke-dashoffset 1s linear" }}
              strokeLinecap="round"/>
          </svg>
          <Clock className="w-6 h-6 text-orange-500" />
        </div>

        {/* Text */}
        <div>
          <p className="text-base font-bold text-foreground">Still there?</p>
          <p className="text-sm text-muted-foreground mt-1">
            You'll be logged out in{" "}
            <span className="font-bold text-orange-500">{countdown}s</span>{" "}
            due to inactivity.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 w-full">
          <button
            onClick={resetIdleTimer}
            className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 transition-colors cursor-pointer"
          >
            Stay logged in
          </button>
          <button
            onClick={signOut}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[10px] text-sm font-semibold border border-border text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />Log out
          </button>
        </div>
      </div>
    </div>
  )
}

function RequireAuth({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  // A signed-in user who opens another role's dashboard goes to their own dashboard with a short notice
  // (shown by DashboardLayout) — never a blank page or an error.
  if (!roles.includes(user.role)) {
    return <Navigate to={dashboardPathForRole(user.role)} replace state={{ notice: WRONG_ROLE_NOTICE }} />
  }
  if (user.must_change_password) {
    return <Navigate to={`/set-password?forced=1&redirect=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}

function ScrollManager() {
  const { hash, pathname } = useLocation()
  useEffect(() => {
    if (hash) {
      const id = hash.slice(1)
      const tryScroll = (attempts = 0) => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: "smooth" })
        } else if (attempts < 10) {
          setTimeout(() => tryScroll(attempts + 1), 50)
        }
      }
      tryScroll()
    } else {
      window.scrollTo(0, 0)
    }
  }, [hash, pathname])
  return null
}

function AppRoutes() {
  return (
    <Suspense fallback={<DashboardFallback />}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/for-schools" element={<ForSchoolsPage />} />
      <Route path="/for-teachers" element={<ForTeachersPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/legal/:type" element={<LegalPage />} />
      <Route
        path="/student/dashboard/*"
        element={
          <RequireAuth roles={[...DASHBOARD_ROLES.student]}>
            <StudentDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/teacher/dashboard"
        element={
          <RequireAuth roles={[...DASHBOARD_ROLES.teacher]}>
            <TeacherDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <RequireAuth roles={[...DASHBOARD_ROLES.admin]}>
            <AdminDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/parent/dashboard"
        element={
          <RequireAuth roles={[...DASHBOARD_ROLES.parent]}>
            <ParentDashboard />
          </RequireAuth>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="teachscript-theme">
        <AuthProvider>
          <BrowserRouter>
            <ScrollManager />
            <AppRoutes />
            <IdleWarningBanner />
            <PWAUpdateBanner />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
