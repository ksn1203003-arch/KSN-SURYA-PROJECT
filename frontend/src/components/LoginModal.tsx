// ─────────────────────────────────────────────────────────────────────────────
// components/LoginModal.tsx — Overlay login modal for quick sign-in.
// Shown when the public site's "Login" button is clicked without navigating
// away from the landing page. Supports student, teacher, and admin login.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { X, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn, signOut } from "@/lib/auth"
import { useAuth } from "@/contexts/AuthContext"

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  defaultRole?: "student" | "teacher" | "admin"
}

type Step = "login" | "forgot-email" | "forgot-reset"

export function LoginModal({ isOpen, onClose, defaultRole = "teacher" }: LoginModalProps) {
  const navigate = useNavigate()
  const { setUserFromLogin } = useAuth()
  const [role, setRole] = useState<"student" | "teacher" | "admin">(defaultRole)
  const [step, setStep] = useState<Step>("login")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState("")

  const [form, setForm] = useState({ identifier: "", password: "" })
  const [forgotIdentifier, setForgotIdentifier] = useState("")

  // Sync role when parent changes defaultRole (e.g. clicking Student vs Teacher button)
  useEffect(() => {
    setRole(defaultRole)
    setErrors({})
    setApiError("")
    setStep("login")
  }, [defaultRole])

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  if (!isOpen) return null

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.identifier.trim()) errs.identifier = "Phone, email or username is required"
    if (!form.password.trim()) errs.password = "Password is required"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setApiError("")
    try {
      const { user: profile, error, isFallback } = await signIn(form.identifier, form.password)
      if (error || !profile) {
        setApiError(error ?? "Login failed. Please try again.")
        return
      }
      // Only enforce tab-role match when we have a confirmed backend profile.
      if (!isFallback) {
        const allowedRoles: Record<string, string[]> = {
          student: ["student"],
          teacher: ["teacher"],
          admin: ["admin", "super_admin"],
        }
        if (!allowedRoles[role].includes(profile.role)) {
          signOut()
          const correctTab = profile.role === "student" ? "Student" : profile.role === "teacher" ? "Teacher" : "Admin"
          setApiError(`This is a ${profile.role} account. Please use the "${correctTab}" tab to sign in.`)
          return
        }
      }
      // Push user into AuthContext so RequireAuth sees them immediately
      setUserFromLogin(profile)
      onClose()
      // Use confirmed role from backend; if fallback, trust the selected tab
      const effectiveRole = isFallback ? role : profile.role
      if (effectiveRole === "student") navigate("/student/dashboard")
      else if (effectiveRole === "teacher") navigate("/teacher/dashboard")
      else navigate("/admin/dashboard")
    } catch (err) {
      setApiError("Connection error. Please check your internet and try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotIdentifier.trim() || !forgotIdentifier.includes("@")) {
      setErrors({ forgotEmail: "Enter a valid email address" })
      return
    }
    setLoading(true)
    setApiError("")
    try {
      const res = await fetch(`${BACKEND}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotIdentifier.trim() }),
      })
      if (!res.ok) {
        const d = await res.json()
        setApiError(d.error ?? "Something went wrong")
        return
      }
      setStep("forgot-reset")
      setErrors({})
    } catch {
      setApiError("Could not connect to server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const roleColors: Record<string, string> = {
    student: "#534AB7",
    teacher: "#378ADD",
    admin: "#639922",
  }

  const roleLabels: Record<string, string> = {
    student: "Student — Enter your class and roll number details",
    teacher: "Teacher — Enter your school login credentials",
    admin: "Admin — Enter your school admin credentials",
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-[16px] w-full max-w-[380px] p-6 z-10" style={{ border: "0.5px solid var(--border)" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>

        {step === "login" && (
          <>
            <h2 className="text-base font-medium text-foreground mb-1">Sign in to TeachScript</h2>

            {/* Role tabs */}
            <div className="flex gap-1 mb-4 p-1 rounded-[20px] w-fit" style={{ backgroundColor: "var(--muted)" }}>
              {(["student", "teacher", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="text-xs px-3 py-1 rounded-[20px] transition-all capitalize"
                  style={{
                    backgroundColor: role === r ? (r === "student" ? "var(--ts-purple)" : r === "teacher" ? "var(--ts-blue)" : "var(--ts-green)") : "transparent",
                    color: role === r ? "white" : "var(--muted-foreground)",
                    fontWeight: role === r ? "500" : "400",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mb-4">{roleLabels[role]}</p>

            {apiError && (
              <div className="mb-3 px-3 py-2 rounded-[8px] text-xs" style={{ color: "var(--ts-red)", border: "0.5px solid var(--ts-red)" }}>
                {apiError}
              </div>
            )}

            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="modal-identifier" className="text-xs mb-1">Phone number, email or username</Label>
                <Input
                  id="modal-identifier"
                  value={form.identifier}
                  onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                  placeholder="Enter phone, email or username"
                  className="h-8 text-sm"
                  aria-invalid={!!errors.identifier}
                  autoComplete="username"
                />
                {errors.identifier && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.identifier}</p>}
              </div>
              <div>
                <Label htmlFor="modal-password" className="text-xs mb-1">Password</Label>
                <div className="relative">
                  <Input
                    id="modal-password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Enter your password"
                    className="h-8 text-sm pr-8"
                    aria-invalid={!!errors.password}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.password}</p>}
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-8 text-sm rounded-[20px] mt-1"
                style={{ backgroundColor: roleColors[role], color: "white" }}
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <div className="mt-3 flex flex-col gap-1">
              <button onClick={() => { setStep("forgot-email"); setApiError("") }} className="text-xs text-center" style={{ color: "var(--ts-blue)" }}>
                Forgot password?
              </button>
              <p className="text-xs text-muted-foreground text-center">
                New school?{" "}
                <a href="/signup" className="underline" style={{ color: "var(--ts-blue)" }}>Request access</a>
              </p>
            </div>
          </>
        )}

        {step === "forgot-email" && (
          <>
            <h2 className="text-base font-medium text-foreground mb-1">Reset your password</h2>
            <p className="text-xs text-muted-foreground mb-4">Enter your email. We'll send you a reset link.</p>
            {apiError && (
              <div className="mb-3 px-3 py-2 rounded-[8px] text-xs" style={{ color: "var(--ts-red)", border: "0.5px solid var(--ts-red)" }}>
                {apiError}
              </div>
            )}
            <form onSubmit={handleSendOtp} className="flex flex-col gap-3">
              <div>
                <Label htmlFor="modal-forgot" className="text-xs mb-1">Email address</Label>
                <Input
                  id="modal-forgot"
                  type="email"
                  value={forgotIdentifier}
                  onChange={e => setForgotIdentifier(e.target.value)}
                  placeholder="Enter your email"
                  className="h-8 text-sm"
                />
                {errors.forgotEmail && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.forgotEmail}</p>}
              </div>
              <Button type="submit" disabled={loading} className="w-full h-8 text-sm rounded-[20px]" style={{ backgroundColor: "var(--ts-blue)", color: "white" }}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <button type="button" onClick={() => setStep("login")} className="text-xs text-center text-muted-foreground hover:text-foreground">Back to sign in</button>
            </form>
          </>
        )}

        {step === "forgot-reset" && (
          <>
            <h2 className="text-base font-medium text-foreground mb-1">Check your email</h2>
            <p className="text-xs text-muted-foreground mb-4">
              A password reset link has been sent to <strong>{forgotIdentifier}</strong>. Click the link to set a new password, then sign in.
            </p>
            <Button
              onClick={() => { setStep("login"); setApiError(""); setForgotIdentifier("") }}
              className="w-full h-8 text-sm rounded-[20px]"
              style={{ backgroundColor: "var(--ts-blue)", color: "white" }}
            >
              Back to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
