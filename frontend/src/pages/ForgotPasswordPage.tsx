// ─────────────────────────────────────────────────────────────────────────────
// pages/ForgotPasswordPage.tsx — Password reset request page (/forgot-password).
// Sends a reset-link email via POST /api/auth/forgot-password. The link in the
// email routes the user to /set-password to enter a new password.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, ArrowLeft } from "lucide-react"

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [apiError, setApiError] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !email.includes("@")) {
      setEmailError("Enter a valid email address")
      return
    }
    setEmailError("")
    setApiError("")
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        const d = await res.json()
        setApiError(d.error ?? "Something went wrong. Please try again.")
        return
      }
      setSent(true)
    } catch {
      setApiError("Could not connect to server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center hover:opacity-80 transition-opacity">
          <div className="w-6 h-6 rounded-full" style={{ background: "var(--ts-blue)" }} />
          <span className="text-base font-medium text-foreground">TeachScript</span>
        </Link>

        {!sent ? (
          <div className="bg-card rounded-[12px] p-6" style={{ border: "0.5px solid var(--border)" }}>
            <h1 className="text-lg font-medium text-foreground mb-1">Reset your password</h1>
            <p className="text-xs text-muted-foreground mb-5">Enter your email. We'll send you a reset link.</p>

            {apiError && (
              <div className="mb-3 px-3 py-2 rounded-[8px] text-xs text-destructive" style={{ border: "0.5px solid var(--ts-red)" }}>
                {apiError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label htmlFor="fp-email" className="text-xs mb-1">Email address</Label>
                <Input
                  id="fp-email"
                  type="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setEmailError("") }}
                  className="h-9 text-sm"
                />
                {emailError && <p className="text-xs mt-1 text-destructive">{emailError}</p>}
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full rounded-[20px] text-sm text-white"
                style={{ background: "var(--ts-blue)" }}
              >
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
              >
                <ArrowLeft className="w-3 h-3" /> Back to home
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-card rounded-[12px] p-8 text-center" style={{ border: "0.5px solid var(--border)" }}>
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--ts-green)" }} />
            <h1 className="text-lg font-medium text-foreground mb-2">Check your email</h1>
            <p className="text-sm text-muted-foreground mb-1">
              If <strong>{email}</strong> has an account, a reset link has been sent.
            </p>
            <p className="text-xs text-muted-foreground mb-6">Click the link in the email to set a new password. It expires in 1 hour.</p>
            <Button
              className="rounded-[20px] text-sm w-full text-white"
              style={{ background: "var(--ts-blue)" }}
              onClick={() => navigate("/")}
            >
              Back to home
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
