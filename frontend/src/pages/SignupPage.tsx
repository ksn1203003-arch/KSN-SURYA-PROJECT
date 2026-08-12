// ─────────────────────────────────────────────────────────────────────────────
// pages/SignupPage.tsx — School self-signup form (/signup).
// Collects school details and admin contact. On submit, creates a PendingSignup
// record that the super-admin approves via email link.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, ArrowLeft, Clock } from "lucide-react"

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Puducherry",
]

type Step = 1 | 2 | 3 | 4 | 5

interface FormData {
  schoolName: string
  board: string
  city: string
  state: string
  totalStudents: string
  adminName: string
  phone: string
  email: string
  grade: string
  section: string
  numStudents: string
  teacherName: string
  teacherPhone: string
  teacherEmail: string
  assignClass: string
}

export function SignupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState("")
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [consentGiven, setConsentGiven] = useState(false)
  const [form, setForm] = useState<FormData>({
    schoolName: "", board: "", city: "", state: "", totalStudents: "",
    adminName: "", phone: "", email: "",
    grade: "", section: "", numStudents: "",
    teacherName: "", teacherPhone: "", teacherEmail: "", assignClass: "",
  })

  const set = (key: keyof FormData, value: string) => {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: "" }))
  }

  const validateStep1 = () => {
    const e: typeof errors = {}
    if (!form.schoolName.trim()) e.schoolName = "School name is required"
    if (!form.board) e.board = "Please select a board"
    if (!form.city.trim()) e.city = "City is required"
    if (!form.state) e.state = "Please select a state"
    if (!form.totalStudents || isNaN(Number(form.totalStudents)) || Number(form.totalStudents) <= 0)
      e.totalStudents = "Enter a valid number (minimum 1)"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validateStep2 = () => {
    const e: typeof errors = {}
    if (!form.adminName.trim()) e.adminName = "Full name is required"
    if (!form.phone.trim() || !/^\d{10}$/.test(form.phone.replace(/\s/g, "")))
      e.phone = "Enter a valid 10-digit phone number"
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      e.email = "Enter a valid email address"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateStep1()) setStep(2)
  }

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateStep2()) return
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND}/api/signup/check-email?email=${encodeURIComponent(form.email)}`)
      const data = await res.json()
      if (!data.available) {
        setErrors(er => ({ ...er, email: data.reason }))
        return
      }
      setStep(3)
    } catch {
      setStep(3) // Don't block if the check itself fails
    } finally {
      setLoading(false)
    }
  }

  const handleStep3 = (e: React.FormEvent) => {
    e.preventDefault()
    const er: typeof errors = {}
    if (!form.grade) er.grade = "Select a grade"
    if (!form.section.trim()) er.section = "Section is required"
    if (!form.numStudents || isNaN(Number(form.numStudents))) er.numStudents = "Enter a valid number"
    setErrors(er)
    if (Object.keys(er).length === 0) setStep(4)
  }

  const handleStep4 = async (e: React.FormEvent) => {
    e.preventDefault()
    const er: typeof errors = {}
    if (!form.teacherName.trim()) er.teacherName = "Teacher name is required"
    if (!form.teacherPhone.trim()) er.teacherPhone = "Phone is required"
    if (!form.teacherEmail.trim() || !/\S+@\S+\.\S+/.test(form.teacherEmail)) er.teacherEmail = "Valid email required"
    setErrors(er)
    if (Object.keys(er).length > 0) return
    if (!consentGiven) {
      setApiError("Please accept the privacy policy and terms to continue.")
      return
    }
    await submitApplication()
  }

  const submitApplication = async () => {
    setLoading(true)
    setApiError("")
    try {
      const res = await fetch(`${BACKEND}/api/signup/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: {
            name: form.schoolName,
            board: form.board,
            city: form.city,
            state: form.state,
            totalStudents: form.totalStudents,
          },
          admin: {
            name: form.adminName,
            email: form.email,
            phone: form.phone,
          },
          firstClass: form.grade ? {
            grade: form.grade,
            section: form.section,
            numStudents: form.numStudents,
          } : null,
          firstTeacher: form.teacherName ? {
            name: form.teacherName,
            email: form.teacherEmail,
            phone: form.teacherPhone,
          } : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Something went wrong")
      setStep(5)
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : "Could not submit application. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* Header */}
      <div className="bg-card py-3 px-4 flex items-center justify-between relative overflow-hidden border-b">
        <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "var(--gradient-blue-green)" }} />
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-4 h-4 rounded-full" style={{ background: "var(--gradient-blue-green)" }} />
          <span className="text-sm font-medium">TeachScript</span>
        </Link>
        <Link to="/" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3 h-3" />
          Back to home
        </Link>
      </div>

      <div className="flex-1 flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-md">
          {/* Step indicator */}
          {step < 5 && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: step > s ? "var(--ts-green)" : step === s ? "var(--ts-blue)" : "var(--muted)",
                      color: step >= s ? "white" : "var(--ts-neutral)",
                    }}
                  >
                    {step > s ? <Check className="w-3 h-3" /> : s}
                  </div>
                  {s < 4 && <div className="w-8 h-px" style={{ backgroundColor: step > s ? "var(--ts-green)" : "var(--border)" }} />}
                </div>
              ))}
            </div>
          )}

          {/* Step 1 — School details */}
          {step === 1 && (
            <div className="glass-card rounded-[12px] p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-blue-green)" }} />
              <h2 className="text-base font-medium text-foreground mb-1">Tell us about your school</h2>
              <p className="text-xs text-muted-foreground mb-5">Step 1 of 4 — School details</p>
              <form onSubmit={handleStep1} className="flex flex-col gap-4">
                <div>
                  <Label className="text-xs mb-1">School name *</Label>
                  <Input value={form.schoolName} onChange={e => set("schoolName", e.target.value)} placeholder="e.g. Delhi Public School, Hyderabad" className="h-8 text-sm" aria-invalid={!!errors.schoolName} />
                  {errors.schoolName && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.schoolName}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1">Board *</Label>
                  <select value={form.board} onChange={e => set("board", e.target.value)} className="w-full h-8 text-sm rounded-[8px] px-3 bg-background border focus:outline-none focus:ring-1 focus:ring-primary" style={{ border: "0.5px solid var(--border)" }}>
                    <option value="">Select board</option>
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE</option>
                    <option value="State">State board</option>
                  </select>
                  {errors.board && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.board}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1">City *</Label>
                    <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="e.g. Hyderabad" className="h-8 text-sm" aria-invalid={!!errors.city} />
                    {errors.city && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.city}</p>}
                  </div>
                  <div>
                    <Label className="text-xs mb-1">State *</Label>
                    <select value={form.state} onChange={e => set("state", e.target.value)} className="w-full h-8 text-sm rounded-[8px] px-3 bg-background border focus:outline-none focus:ring-1 focus:ring-primary" style={{ border: "0.5px solid var(--border)" }}>
                      <option value="">Select state</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {errors.state && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.state}</p>}
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1">Total number of students *</Label>
                  <Input type="number" value={form.totalStudents} onChange={e => set("totalStudents", e.target.value)} placeholder="e.g. 420" className="h-8 text-sm" aria-invalid={!!errors.totalStudents} />
                  {errors.totalStudents && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.totalStudents}</p>}
                </div>
                <Button type="submit" className="w-full rounded-[20px] text-sm text-white border-0" style={{ background: "var(--gradient-blue-green)" }}>Continue</Button>
              </form>
            </div>
          )}

          {/* Step 2 — Admin contact */}
          {step === 2 && (
            <div className="glass-card rounded-[12px] p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-blue-green)" }} />
              <h2 className="text-base font-medium text-foreground mb-1">Your contact details</h2>
              <p className="text-xs text-muted-foreground mb-5">Step 2 of 4 — We'll reach out to set up your account</p>
              <form onSubmit={handleStep2} className="flex flex-col gap-4">
                <div>
                  <Label className="text-xs mb-1">Full name *</Label>
                  <Input value={form.adminName} onChange={e => set("adminName", e.target.value)} placeholder="e.g. Rekha Kapoor" className="h-8 text-sm" aria-invalid={!!errors.adminName} />
                  {errors.adminName && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.adminName}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1">Phone number *</Label>
                  <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="10-digit mobile number" className="h-8 text-sm" aria-invalid={!!errors.phone} />
                  {errors.phone && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.phone}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1">Email address *</Label>
                  <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="your@email.com" className="h-8 text-sm" aria-invalid={!!errors.email} />
                  {errors.email && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.email}</p>}
                </div>
                <Button type="submit" className="w-full rounded-[20px] text-sm text-white border-0" style={{ background: "var(--gradient-blue-green)" }}>Continue</Button>
                <button type="button" onClick={() => setStep(1)} className="text-xs text-muted-foreground hover:text-foreground text-center">Back</button>
              </form>
            </div>
          )}

          {/* Step 3 — First class */}
          {step === 3 && (
            <div className="glass-card rounded-[12px] p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-blue-green)" }} />
              <h2 className="text-base font-medium text-foreground mb-1">Add your first class</h2>
              <p className="text-xs text-muted-foreground mb-5">Step 3 of 4 — Class setup</p>
              <form onSubmit={handleStep3} className="flex flex-col gap-4">
                <div>
                  <Label className="text-xs mb-1">Class grade *</Label>
                  <select value={form.grade} onChange={e => set("grade", e.target.value)} className="w-full h-8 text-sm rounded-[8px] px-3 bg-background focus:outline-none focus:ring-1 focus:ring-primary" style={{ border: "0.5px solid var(--border)" }}>
                    <option value="">Select grade</option>
                    {[3, 4, 5, 6, 7, 8].map(g => <option key={g} value={g}>Class {g}</option>)}
                  </select>
                  {errors.grade && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.grade}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1">Section *</Label>
                  <Input value={form.section} onChange={e => set("section", e.target.value)} placeholder="e.g. A, B, C" className="h-8 text-sm" aria-invalid={!!errors.section} />
                  {errors.section && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.section}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1">Number of students *</Label>
                  <Input type="number" value={form.numStudents} onChange={e => set("numStudents", e.target.value)} placeholder="e.g. 35" className="h-8 text-sm" aria-invalid={!!errors.numStudents} />
                  {errors.numStudents && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.numStudents}</p>}
                </div>
                <Button type="submit" className="w-full rounded-[20px] text-sm text-white border-0" style={{ background: "var(--gradient-blue-green)" }}>Add class</Button>
                <div className="flex justify-between">
                  <button type="button" onClick={() => setStep(2)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                  <button type="button" onClick={() => setStep(4)} className="text-xs text-muted-foreground hover:text-foreground">Skip for now</button>
                </div>
              </form>
            </div>
          )}

          {/* Step 4 — First teacher */}
          {step === 4 && (
            <div className="glass-card rounded-[12px] p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-blue-green)" }} />
              <h2 className="text-base font-medium text-foreground mb-1">Add your first teacher</h2>
              <p className="text-xs text-muted-foreground mb-5">Step 4 of 4 — Invite a teacher</p>
              {apiError && (
                <div className="mb-3 px-3 py-2 rounded-[8px] text-xs" style={{ color: "var(--ts-red)", border: "0.5px solid var(--ts-red)" }}>
                  {apiError}
                </div>
              )}
              <form onSubmit={handleStep4} className="flex flex-col gap-4">
                <div>
                  <Label className="text-xs mb-1">Teacher full name *</Label>
                  <Input value={form.teacherName} onChange={e => set("teacherName", e.target.value)} placeholder="e.g. Priya Sharma" className="h-8 text-sm" aria-invalid={!!errors.teacherName} />
                  {errors.teacherName && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.teacherName}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1">Phone number *</Label>
                  <Input value={form.teacherPhone} onChange={e => set("teacherPhone", e.target.value)} placeholder="10-digit mobile number" className="h-8 text-sm" aria-invalid={!!errors.teacherPhone} />
                  {errors.teacherPhone && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.teacherPhone}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1">Email address *</Label>
                  <Input type="email" value={form.teacherEmail} onChange={e => set("teacherEmail", e.target.value)} placeholder="teacher@school.com" className="h-8 text-sm" aria-invalid={!!errors.teacherEmail} />
                  {errors.teacherEmail && <p className="text-xs mt-1" style={{ color: "var(--ts-red)" }}>{errors.teacherEmail}</p>}
                </div>
                <div>
                  <Label className="text-xs mb-1">Assign to class</Label>
                  <select value={form.assignClass} onChange={e => set("assignClass", e.target.value)} className="w-full h-8 text-sm rounded-[8px] px-3 bg-background focus:outline-none focus:ring-1 focus:ring-primary" style={{ border: "0.5px solid var(--border)" }}>
                    <option value="">Select class (optional)</option>
                    {form.grade && <option value={`Class ${form.grade}${form.section}`}>Class {form.grade}{form.section}</option>}
                  </select>
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={consentGiven} onChange={e => { setConsentGiven(e.target.checked); setApiError("") }}
                    className="mt-0.5 w-4 h-4 accent-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    I agree to TeachScript's{" "}
                    <a href="/legal/privacy" target="_blank" className="underline hover:text-foreground">Privacy Policy</a>
                    {" "}and{" "}
                    <a href="/legal/terms" target="_blank" className="underline hover:text-foreground">Terms of Service</a>.
                    I understand that student data is processed as per the DPDP Act 2023.
                  </span>
                </label>
                <Button type="submit" disabled={loading || !consentGiven} className="w-full rounded-[20px] text-sm text-white border-0 disabled:opacity-60" style={{ background: "var(--gradient-blue-green)" }}>
                  {loading ? "Submitting application..." : "Submit application"}
                </Button>
                <div className="flex justify-between">
                  <button type="button" onClick={() => setStep(3)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                  <button type="button" disabled={loading} onClick={submitApplication} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
                    {loading ? "Submitting..." : "Skip & submit"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step 5 — Application received */}
          {step === 5 && (
            <div className="glass-card rounded-[12px] p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-green)" }} />
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "var(--ts-blue-light)" }}>
                <Clock className="w-7 h-7" style={{ color: "var(--ts-blue)" }} />
              </div>
              <h2 className="text-xl font-medium text-foreground mb-2">Application received!</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Thanks, {form.adminName.split(" ")[0]}. We've received your application for{" "}
                <span className="font-medium text-foreground">{form.schoolName}</span>.
              </p>

              <div className="text-left bg-muted rounded-[8px] p-4 mb-6 flex flex-col gap-3 text-xs">
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--ts-green)" }} />
                  <span className="text-muted-foreground">Our team will review your application within <b className="text-foreground">24 hours</b></span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--ts-green)" }} />
                  <span className="text-muted-foreground">You'll receive your login credentials at <b className="text-foreground">{form.email}</b></span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--ts-green)" }} />
                  <span className="text-muted-foreground">Questions? Call or WhatsApp us at <b className="text-foreground">+91 99999 99999</b></span>
                </div>
              </div>

              <Button
                onClick={() => navigate("/")}
                className="w-full rounded-[20px] text-sm text-white border-0"
                style={{ background: "var(--gradient-blue-green)" }}
              >
                Back to home
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
