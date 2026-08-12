// ─────────────────────────────────────────────────────────────────────────────
// pages/SetPasswordPage.tsx — Password creation/reset page (/set-password).
// Used both for first-time password setup (invited teachers/students) and
// for resetting via the forgot-password email link (token in query string).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Eye, EyeOff } from "lucide-react"
import { resetPassword, changePassword } from "@/lib/auth"
import { useAuth } from "@/contexts/AuthContext"
import zxcvbn from "zxcvbn"

type PageState = "form" | "done" | "invalid"

export function SetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, refreshUser } = useAuth()

  const token   = searchParams.get("token") ?? ""
  const email   = searchParams.get("email") ?? ""
  const isForced = searchParams.get("forced") === "1"

  const [pageState, setPageState] = useState<PageState>(
    isForced || (token && email) ? "form" : "invalid"
  )
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // If forced mode but user is not authenticated, redirect to login
  useEffect(() => {
    if (isForced && !user && pageState === "form") {
      navigate("/login", { replace: true })
    }
  }, [isForced, user, pageState, navigate])

  const strengthScore = password.length >= 1 ? zxcvbn(password).score : -1
  const strengthLabels = ["Very weak", "Weak", "Fair", "Good", "Strong"]
  const strengthColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError("Password must be at least 8 characters"); return }
    if (password.length > 128) { setError("Password must be under 128 characters"); return }
    if (strengthScore < 2) { setError("Password is too simple. Try mixing letters, numbers, and symbols."); return }
    if (password !== confirm) { setError("Passwords don't match"); return }

    setSubmitting(true)
    setError("")

    if (isForced) {
      const { error: changeError } = await changePassword(password)
      setSubmitting(false)
      if (changeError) { setError(changeError); return }
      await refreshUser()
      setPageState("done")
      const role = user?.role
      setTimeout(() => {
        if (role === "admin" || role === "super_admin") navigate("/admin/dashboard")
        else if (role === "teacher") navigate("/teacher/dashboard")
        else navigate("/student/dashboard")
      }, 2000)
      return
    }

    const { error: resetError } = await resetPassword(token, email, password)
    setSubmitting(false)

    if (resetError) {
      setError(resetError)
      return
    }

    setPageState("done")
    setTimeout(() => navigate("/login"), 2000)
  }

  if (pageState === "invalid") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-card rounded-[12px] p-6 text-center" style={{ border: "0.5px solid var(--border)" }}>
          <h1 className="text-lg font-medium text-foreground mb-2">Link expired or invalid</h1>
          <p className="text-sm text-muted-foreground mb-4">This link has expired. Please request a new one using Forgot Password.</p>
          <Link to="/login" className="text-sm" style={{ color: "var(--ts-blue)" }}>← Back to sign in</Link>
        </div>
      </div>
    )
  }

  if (pageState === "done") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-card rounded-[12px] p-6 text-center" style={{ border: "0.5px solid var(--border)" }}>
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--ts-green)" }} />
          <h1 className="text-lg font-medium text-foreground mb-2">Password set!</h1>
          <p className="text-sm text-muted-foreground">
            {isForced ? "Taking you to your dashboard..." : "You can now sign in with your new password."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center hover:opacity-80 transition-opacity">
          <div className="w-6 h-6 rounded-[6px] flex items-center justify-center" style={{ background: "var(--ts-blue)" }}>
            <span className="text-white font-bold text-xs">T</span>
          </div>
          <span className="text-base font-medium text-foreground">TeachScript</span>
        </Link>

        <div className="bg-card rounded-[12px] p-6" style={{ border: "0.5px solid var(--border)" }}>
          <h1 className="text-lg font-medium text-foreground mb-1">Set your password</h1>
          <p className="text-xs text-muted-foreground mb-5">Choose a strong password. Minimum 8 characters.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label htmlFor="sp-pass" className="text-xs mb-1">New password</Label>
              <div className="relative">
                <Input
                  id="sp-pass"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError("") }}
                  placeholder="Minimum 8 characters"
                  className="h-9 text-sm pr-9"
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-1.5">
                  <div className="flex gap-0.5">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="h-1 flex-1 rounded-full transition-all"
                        style={{ background: i <= strengthScore ? strengthColors[strengthScore] : "var(--border)" }} />
                    ))}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: strengthScore >= 0 ? strengthColors[strengthScore] : "var(--muted-foreground)" }}>
                    {strengthScore >= 0 ? strengthLabels[strengthScore] : ""}
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="sp-confirm" className="text-xs mb-1">Confirm password</Label>
              <Input
                id="sp-confirm"
                type="password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError("") }}
                placeholder="Re-enter your password"
                className="h-9 text-sm"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-[20px] text-sm text-white"
              style={{ background: "var(--ts-blue)" }}
            >
              {submitting ? "Setting password..." : "Set password & sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
