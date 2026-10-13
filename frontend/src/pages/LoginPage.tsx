// ─────────────────────────────────────────────────────────────────────────────
// pages/LoginPage.tsx — Role-tabbed login page (/login).
// Three tabs: Student (username/phone), Teacher (email), Admin (email).
// On success sets auth context and redirects to the correct dashboard.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/AuthContext"
import { signIn, signOut, sendPasswordResetOTP, verifyOTP, sendSmsOtp, verifySmsOtp } from "@/lib/auth"
import { dashboardPathForRole, getSafeRedirectPath } from "@/lib/dashboardRoutes"

type Step = "login" | "forgot-email" | "forgot-reset" | "otp" | "sms-send" | "sms-verify"
type Role = "student" | "teacher" | "admin" | "parent"

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, setUserFromLogin } = useAuth()

  const ALL_ROLES: Role[] = ["student", "teacher", "admin", "parent"]
  const paramRole = searchParams.get("role") as Role
  const defaultRole: Role = ALL_ROLES.includes(paramRole) ? paramRole : "teacher"
  const [role, setRole] = useState<Role>(defaultRole)
  const [step, setStep] = useState<Step>("login")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [signoutNotice, setSignoutNotice] = useState("")
  const [form, setForm] = useState({ identifier: "", password: "" })
  const [forgotIdentifier, setForgotIdentifier] = useState("")
  const [otpSession, setOtpSession] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""])
  const [resendCountdown, setResendCountdown] = useState(0)
  const [smsPhone, setSmsPhone] = useState("")
  const [smsOtpSession, setSmsOtpSession] = useState("")
  const [maskedPhone, setMaskedPhone] = useState("")
  const [smsOtpCode, setSmsOtpCode] = useState(["", "", "", "", "", ""])
  const [smsResendCountdown, setSmsResendCountdown] = useState(0)

  // Where to go once signed in: the ?redirect= deep link if it is a dashboard path this role may
  // open (whole-segment allowlist, see getSafeRedirectPath), otherwise the user's own dashboard.
  const postLoginPath = (role: string) =>
    getSafeRedirectPath(searchParams.get("redirect"), role) ?? dashboardPathForRole(role)

  // Redirect if already authenticated — honour ?redirect= param if present and safe
  useEffect(() => {
    if (!user) return
    navigate(getSafeRedirectPath(searchParams.get("redirect"), user.role) ?? dashboardPathForRole(user.role), { replace: true })
  }, [user, navigate, searchParams])

  // One-time explanation when the user lands here because their session was ended
  // by the app itself (15-min idle timeout, or a stale session detected on another
  // tab/fetch) rather than something they did — read once, then cleared, so it
  // never reappears on a later, unrelated visit to this page.
  useEffect(() => {
    try {
      const reason = sessionStorage.getItem("ts_signout_reason")
      if (reason === "idle") {
        setSignoutNotice("You were signed out after 15 minutes of inactivity. Please sign in again.")
      } else if (reason === "session-expired") {
        setSignoutNotice("Your session has expired. Please sign in again.")
      }
      if (reason) sessionStorage.removeItem("ts_signout_reason")
    } catch { /* sessionStorage unavailable — skip the notice, not worth failing login over */ }
  }, [])

  // Auto-dismiss error after 10 seconds
  useEffect(() => {
    if (!apiError) return
    const t = setTimeout(() => setApiError(""), 10_000)
    return () => clearTimeout(t)
  }, [apiError])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.identifier.trim()) errs.identifier = "Phone, email or username is required"
    else if (form.identifier.length > 254) errs.identifier = "Identifier is too long"
    if (!form.password.trim()) errs.password = "Password is required"
    else if (form.password.length > 128) errs.password = "Password must be under 128 characters"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setApiError("")
    try {
      const res = await signIn(form.identifier, form.password)
      if (res.otpRequired) {
        setOtpSession(res.otpSession ?? "")
        setMaskedEmail(res.maskedEmail ?? "")
        setOtpCode(["", "", "", "", "", ""])
        setResendCountdown(30)
        setStep("otp")
        return
      }
      const { user: profile, error, isFallback } = res
      if (error || !profile) {
        setApiError(error ?? "Login failed. Please try again.")
        return
      }
      // Only enforce tab-role match when backend returned a confirmed profile.
      // isFallback=true → backend was unreachable; JWT role defaults may be wrong.
      if (!isFallback) {
        const allowedRoles: Record<Role, string[]> = {
          student: ["student"],
          teacher: ["teacher"],
          admin:   ["admin", "super_admin"],
          parent:  ["parent"],
        }
        if (!allowedRoles[role].includes(profile.role)) {
          signOut()
          const correctTab = profile.role === "student" ? "Student"
            : profile.role === "teacher" ? "Teacher"
            : profile.role === "parent" ? "Parent"
            : "Admin"
          setApiError(`This is a ${profile.role} account. Please use the "${correctTab}" tab to sign in.`)
          return
        }
      }
      // Push user into AuthContext so RequireAuth sees them immediately
      setUserFromLogin(profile)
      // Navigate: use confirmed role from backend; if fallback, trust the selected tab
      const dest = isFallback ? role : profile.role
      navigate(postLoginPath(dest))
    } catch {
      setApiError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otpCode.join("")
    if (code.length < 6) { setApiError("Please enter the 6-digit code"); return }
    setLoading(true)
    setApiError("")
    try {
      const { user: profile, error } = await verifyOTP(otpSession, code)
      if (error || !profile) { setApiError(error ?? "Invalid code. Please try again."); return }
      setUserFromLogin(profile)
      navigate(postLoginPath(profile.role))
    } catch {
      setApiError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleResendOTP = async () => {
    if (resendCountdown > 0) return
    setLoading(true); setApiError("")
    try {
      const res = await signIn(form.identifier, form.password)
      if (res.otpRequired) {
        setOtpSession(res.otpSession ?? "")
        setOtpCode(["", "", "", "", "", ""])
        setResendCountdown(30)
      } else {
        setApiError("Could not resend code. Please go back and sign in again.")
      }
    } catch { setApiError("Could not resend code. Please try again.") }
    finally { setLoading(false) }
  }

  // SMS resend countdown
  useEffect(() => {
    if (smsResendCountdown <= 0) return
    const t = setTimeout(() => setSmsResendCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [smsResendCountdown])

  const handleSendSmsOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!smsPhone.trim()) { setApiError("Phone number is required"); return }
    setLoading(true); setApiError("")
    try {
      const res = await sendSmsOtp(smsPhone.trim())
      if (res.error) { setApiError(res.error); return }
      setSmsOtpSession(res.otpSession ?? "")
      setMaskedPhone(res.maskedPhone ?? `****${smsPhone.trim().slice(-4)}`)
      setSmsOtpCode(["", "", "", "", "", ""])
      setSmsResendCountdown(30)
      setStep("sms-verify")
    } catch {
      setApiError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifySmsOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = smsOtpCode.join("")
    if (code.length < 6) { setApiError("Please enter the 6-digit code"); return }
    setLoading(true); setApiError("")
    try {
      const { user: profile, error } = await verifySmsOtp(smsOtpSession, code)
      if (error || !profile) { setApiError(error ?? "Invalid code. Please try again."); return }
      setUserFromLogin(profile)
      navigate(postLoginPath(profile.role))
    } catch {
      setApiError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleResendSmsOtp = async () => {
    if (smsResendCountdown > 0) return
    setLoading(true); setApiError("")
    try {
      const res = await sendSmsOtp(smsPhone.trim())
      if (res.error) { setApiError(res.error); return }
      setSmsOtpSession(res.otpSession ?? "")
      setSmsOtpCode(["", "", "", "", "", ""])
      setSmsResendCountdown(30)
    } catch { setApiError("Could not resend code. Please try again.") }
    finally { setLoading(false) }
  }

  const handleSendForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotIdentifier.trim()) { setErrors({ forgot: "Email or phone is required" }); return }
    setLoading(true)
    setApiError("")
    const { error } = await sendPasswordResetOTP(forgotIdentifier)
    setLoading(false)
    if (error) { setApiError(error); return }
    setStep("forgot-reset")
    setErrors({})
  }

  const handleGoToDashboard = () => navigate("/")

  const roleColors: Record<Role, string> = {
    student: "#534AB7",
    teacher: "#378ADD",
    admin:   "#639922",
    parent:  "#B7534A",
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(83,74,183,0.04) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle,#534AB7,transparent)", transform: "translate(30%, -30%)" }} />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle,#378ADD,transparent)", transform: "translate(-30%, 30%)" }} />

      <div className="w-full max-w-[400px] relative z-10">
        {/* Back to home */}
        <Link to="/" className="flex items-center justify-center gap-1.5 mb-5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
          <span className="group-hover:-translate-x-0.5 transition-transform">←</span> Back to home
        </Link>

        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-7 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shadow-md" style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}>
            🎓
          </div>
          <span className="text-xl font-black tracking-tight text-foreground">TeachScript</span>
        </Link>

        <div className="bg-card rounded-2xl p-6 shadow-sm" style={{ border: "1px solid var(--border)" }}>
          {step === "login" && (
            <>
              <h1 className="text-base font-bold text-foreground mb-0.5">Welcome back</h1>
              <p className="text-xs text-muted-foreground mb-4">Sign in to your TeachScript account</p>

              {signoutNotice && (
                <div role="status" aria-live="polite" className="mb-4 px-3 py-2.5 rounded-xl text-xs leading-relaxed" style={{ background: "rgba(55,138,221,0.08)", color: "#378ADD", border: "1px solid rgba(55,138,221,0.2)" }}>
                  🔒 {signoutNotice}
                </div>
              )}

              {/* Role tabs */}
              <div className="flex gap-1 mb-5 p-1 rounded-xl bg-muted">
                {(["student", "teacher", "admin", "parent"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className="flex-1 text-xs py-1.5 rounded-lg transition-all capitalize font-medium"
                    style={{
                      backgroundColor: role === r ? roleColors[r] : "transparent",
                      color: role === r ? "white" : "var(--muted-foreground)",
                      boxShadow: role === r ? "0 1px 4px rgba(0,0,0,0.15)" : "none",
                    }}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>

              {apiError && (
                <div className="mb-4 px-3 py-2.5 rounded-xl text-xs leading-relaxed" style={{ background: "rgba(226,75,74,0.08)", color: "#E24B4A", border: "1px solid rgba(226,75,74,0.2)" }}>
                  {apiError}
                </div>
              )}

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="identifier" className="text-xs font-medium">Phone number, email or username</Label>
                  <Input
                    id="identifier"
                    value={form.identifier}
                    onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                    placeholder="Enter phone, email or username"
                    className="h-10 text-sm"
                    aria-invalid={!!errors.identifier}
                    autoComplete="username"
                  />
                  {errors.identifier && <p className="text-xs" style={{ color: "#E24B4A" }}>{errors.identifier}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Enter your password"
                      className="h-10 text-sm pr-10"
                      aria-invalid={!!errors.password}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs" style={{ color: "#E24B4A" }}>{errors.password}</p>}
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 text-sm font-semibold rounded-xl mt-1 border-0"
                  style={{ backgroundColor: roleColors[role], color: "white" }}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>

              <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-border">
                <button onClick={() => { setStep("forgot-email"); setApiError("") }} className="text-xs text-center font-medium hover:underline" style={{ color: "#378ADD" }}>
                  Forgot password?
                </button>
                <button
                  onClick={() => { setSmsPhone(""); setApiError(""); setStep("sms-send") }}
                  className="text-xs text-center font-medium hover:underline"
                  style={{ color: "#9D59C7" }}
                >
                  Sign in with phone OTP instead
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  New school?{" "}
                  <a href="/signup" className="font-medium hover:underline" style={{ color: "#534AB7" }}>Request access</a>
                </p>
                <p className="text-[11px] text-muted-foreground text-center">
                  By signing in you accept our{" "}
                  <a href="/legal/privacy" className="underline hover:text-foreground">Privacy Policy</a>
                  {" "}(DPDP Act 2023)
                </p>
              </div>
            </>
          )}

          {step === "forgot-email" && (
            <>
              <h1 className="text-base font-bold text-foreground mb-0.5">Reset password</h1>
              <p className="text-xs text-muted-foreground mb-5">Enter your email and we'll send you a reset link.</p>
              {apiError && (
                <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={{ background: "rgba(226,75,74,0.08)", color: "#E24B4A", border: "1px solid rgba(226,75,74,0.2)" }}>
                  {apiError}
                </div>
              )}
              <form onSubmit={handleSendForgotOtp} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium">Email address</Label>
                  <Input
                    value={forgotIdentifier}
                    onChange={e => setForgotIdentifier(e.target.value)}
                    placeholder="Enter your email"
                    className="h-10 text-sm"
                    type="email"
                  />
                  {errors.forgot && <p className="text-xs" style={{ color: "#E24B4A" }}>{errors.forgot}</p>}
                </div>
                <Button type="submit" disabled={loading} className="w-full h-10 text-sm font-semibold rounded-xl border-0" style={{ backgroundColor: "#378ADD", color: "white" }}>
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
                <button type="button" onClick={() => setStep("login")} className="text-xs text-center text-muted-foreground hover:text-foreground transition-colors">← Back to sign in</button>
              </form>
            </>
          )}

          {step === "otp" && (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl mx-auto mb-4" style={{ background: "rgba(83,74,183,0.1)" }}>🔐</div>
              <h1 className="text-base font-bold text-foreground text-center mb-1">Check your email</h1>
              <p className="text-xs text-muted-foreground text-center mb-5">
                We sent a 6-digit code to <strong className="text-foreground">{maskedEmail}</strong>
              </p>

              {apiError && (
                <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={{ background: "rgba(226,75,74,0.08)", color: "#E24B4A", border: "1px solid rgba(226,75,74,0.2)" }}>
                  {apiError}
                </div>
              )}

              <form onSubmit={handleVerifyOTP} className="flex flex-col gap-5">
                <div>
                  <Label className="text-xs font-medium block mb-2 text-center">Enter verification code</Label>
                  <div className="flex gap-2 justify-center">
                    {otpCode.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 1)
                          const next = [...otpCode]
                          next[i] = val
                          setOtpCode(next)
                          if (val && i < 5) {
                            document.getElementById(`otp-${i + 1}`)?.focus()
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === "Backspace" && !otpCode[i] && i > 0) {
                            document.getElementById(`otp-${i - 1}`)?.focus()
                          }
                        }}
                        onPaste={e => {
                          const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
                          if (pasted.length) {
                            e.preventDefault()
                            const next = Array(6).fill("").map((_, idx) => pasted[idx] ?? "")
                            setOtpCode(next)
                            document.getElementById(`otp-${Math.min(pasted.length - 1, 5)}`)?.focus()
                          }
                        }}
                        className="w-10 h-12 rounded-xl border text-center text-lg font-bold focus:outline-none focus:ring-2 bg-background"
                        style={{
                          borderColor: digit ? "#534AB7" : "var(--border)",
                          boxShadow: digit ? "0 0 0 2px rgba(83,74,183,0.15)" : undefined,
                        }}
                        aria-label={`Digit ${i + 1} of 6`}
                      />
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading || otpCode.join("").length < 6}
                  className="w-full h-10 text-sm font-semibold rounded-xl border-0"
                  style={{ backgroundColor: "#534AB7", color: "white" }}
                >
                  {loading ? "Verifying…" : "Verify code"}
                </Button>
              </form>

              <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-border">
                <button
                  onClick={handleResendOTP}
                  disabled={resendCountdown > 0 || loading}
                  className="text-xs text-center font-medium disabled:opacity-50"
                  style={{ color: resendCountdown > 0 ? "var(--muted-foreground)" : "#378ADD" }}
                >
                  {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : "Resend code"}
                </button>
                <button
                  onClick={() => { setStep("login"); setApiError(""); setOtpCode(["", "", "", "", "", ""]) }}
                  className="text-xs text-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          )}

          {step === "sms-send" && (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl mx-auto mb-4" style={{ background: "rgba(157,89,199,0.1)" }}>📱</div>
              <h1 className="text-base font-bold text-foreground text-center mb-1">Sign in with OTP</h1>
              <p className="text-xs text-muted-foreground text-center mb-5">
                Enter your phone number. We'll send a 6-digit code.
              </p>
              {apiError && (
                <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={{ background: "rgba(226,75,74,0.08)", color: "#E24B4A", border: "1px solid rgba(226,75,74,0.2)" }}>
                  {apiError}
                </div>
              )}
              <form onSubmit={handleSendSmsOtp} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium">Phone number</Label>
                  <Input
                    value={smsPhone}
                    onChange={e => setSmsPhone(e.target.value)}
                    placeholder="Enter your phone number"
                    className="h-10 text-sm"
                    type="tel"
                    autoComplete="tel"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loading || !smsPhone.trim()}
                  className="w-full h-10 text-sm font-semibold rounded-xl border-0"
                  style={{ backgroundColor: "#9D59C7", color: "white" }}
                >
                  {loading ? "Sending…" : "Send OTP"}
                </Button>
              </form>
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => { setStep("login"); setApiError("") }}
                  className="text-xs text-center text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          )}

          {step === "sms-verify" && (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl mx-auto mb-4" style={{ background: "rgba(157,89,199,0.1)" }}>📱</div>
              <h1 className="text-base font-bold text-foreground text-center mb-1">Enter your code</h1>
              <p className="text-xs text-muted-foreground text-center mb-5">
                We sent a 6-digit code to <strong className="text-foreground">{maskedPhone}</strong>
              </p>
              {apiError && (
                <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={{ background: "rgba(226,75,74,0.08)", color: "#E24B4A", border: "1px solid rgba(226,75,74,0.2)" }}>
                  {apiError}
                </div>
              )}
              <form onSubmit={handleVerifySmsOtp} className="flex flex-col gap-5">
                <div>
                  <Label className="text-xs font-medium block mb-2 text-center">Enter verification code</Label>
                  <div className="flex gap-2 justify-center">
                    {smsOtpCode.map((digit, i) => (
                      <input
                        key={i}
                        id={`sms-otp-${i}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 1)
                          const next = [...smsOtpCode]; next[i] = val; setSmsOtpCode(next)
                          if (val && i < 5) document.getElementById(`sms-otp-${i + 1}`)?.focus()
                        }}
                        onKeyDown={e => {
                          if (e.key === "Backspace" && !smsOtpCode[i] && i > 0)
                            document.getElementById(`sms-otp-${i - 1}`)?.focus()
                        }}
                        onPaste={e => {
                          const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
                          if (pasted.length) {
                            e.preventDefault()
                            const next = Array(6).fill("").map((_, idx) => pasted[idx] ?? "")
                            setSmsOtpCode(next)
                            document.getElementById(`sms-otp-${Math.min(pasted.length - 1, 5)}`)?.focus()
                          }
                        }}
                        className="w-10 h-12 rounded-xl border text-center text-lg font-bold focus:outline-none focus:ring-2 bg-background"
                        style={{
                          borderColor: digit ? "#9D59C7" : "var(--border)",
                          boxShadow: digit ? "0 0 0 2px rgba(157,89,199,0.15)" : undefined,
                        }}
                        aria-label={`Digit ${i + 1} of 6`}
                      />
                    ))}
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading || smsOtpCode.join("").length < 6}
                  className="w-full h-10 text-sm font-semibold rounded-xl border-0"
                  style={{ backgroundColor: "#9D59C7", color: "white" }}
                >
                  {loading ? "Verifying…" : "Verify code"}
                </Button>
              </form>
              <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-border">
                <button
                  onClick={handleResendSmsOtp}
                  disabled={smsResendCountdown > 0 || loading}
                  className="text-xs text-center font-medium disabled:opacity-50"
                  style={{ color: smsResendCountdown > 0 ? "var(--muted-foreground)" : "#9D59C7" }}
                >
                  {smsResendCountdown > 0 ? `Resend code in ${smsResendCountdown}s` : "Resend code"}
                </button>
                <button
                  onClick={() => { setStep("sms-send"); setApiError(""); setSmsOtpCode(["", "", "", "", "", ""]) }}
                  className="text-xs text-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Change phone number
                </button>
              </div>
            </>
          )}

          {step === "forgot-reset" && (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl text-2xl mx-auto mb-4" style={{ background: "rgba(31,160,76,0.1)" }}>✅</div>
              <h1 className="text-base font-bold text-foreground text-center mb-1">Check your email</h1>
              <p className="text-xs text-muted-foreground text-center mb-5">
                A reset link was sent to <strong className="text-foreground">{forgotIdentifier}</strong>
              </p>
              {successMsg && (
                <div className="mb-4 px-3 py-2.5 rounded-xl text-xs text-center" style={{ background: "rgba(31,160,76,0.08)", color: "#1FA04C", border: "1px solid rgba(31,160,76,0.2)" }}>
                  {successMsg}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button onClick={async () => {
                  const { error } = await sendPasswordResetOTP(forgotIdentifier) as { error?: string }
                  if (error) { setApiError(error); return }
                  setSuccessMsg("Reset email resent!")
                }} variant="outline" className="w-full h-10 text-sm rounded-xl">
                  Resend email
                </Button>
                <Button onClick={handleGoToDashboard} className="w-full h-10 text-sm font-semibold rounded-xl border-0" style={{ backgroundColor: "#378ADD", color: "white" }}>
                  Back to home
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
