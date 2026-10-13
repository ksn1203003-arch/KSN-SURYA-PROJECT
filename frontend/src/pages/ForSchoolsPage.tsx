// ─────────────────────────────────────────────────────────────────────────────
// pages/ForSchoolsPage.tsx — B2B marketing page for school decision-makers (/for-schools).
// Highlights admin panel, timetable management, and multi-class features.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { LoginModal } from "@/components/LoginModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CircleCheck as CheckCircle2, BookOpen, Users, ChartBar as BarChart2, MessageSquare, Award, ChevronRight, School, Clock, Shield, Wifi, ArrowRight, TrendingDown } from "lucide-react"

const PAIN_POINTS = [
  {
    pain: '"Attendance, marks, and homework are scattered across registers, spreadsheets, and WhatsApp"',
    fix: "One dashboard for every class — attendance, marks, homework, quizzes, and certificates, all in one place for Students, Teachers, Admins, and Parents.",
    icon: <MessageSquare className="w-5 h-5" />,
    gradient: "var(--gradient-stat-blue)",
  },
  {
    pain: '"We don\'t have a CS teacher for the new AI & coding syllabus"',
    fix: "Whisper script tells your existing teacher word-by-word what to say — no CS background needed, plus the full CBSE CT&AI curriculum, ready to teach.",
    icon: <BookOpen className="w-5 h-5" />,
    gradient: "var(--gradient-stat-green)",
  },
  {
    pain: '"Parents keep asking why they can\'t see their child\'s progress in real time"',
    fix: "Parents get a live, read-only view of attendance, marks, and homework — no separate app, no extra charge to families.",
    icon: <Users className="w-5 h-5" />,
    gradient: "var(--gradient-stat-amber)",
  },
  {
    pain: '"We can\'t afford expensive lab software or per-family app fees"',
    fix: "Works on any existing device, laptop or mobile. One school-wide subscription — never billed to parents.",
    icon: <Wifi className="w-5 h-5" />,
    gradient: "var(--gradient-stat-purple)",
  },
]

const STEPS = [
  { num: "01", title: "14-day free trial", desc: "Start today. No credit card. No setup. We import your class list in 10 minutes." },
  { num: "02", title: "We train your staff", desc: "One 30-minute onboarding call for your teachers and admin. We handle the rest." },
  { num: "03", title: "Classes go live", desc: "Attendance, marks, and homework tracking start day 1. Students, teachers, and admin get instant access." },
  { num: "04", title: "Track and comply", desc: "Admin dashboard shows attendance, progress, and board compliance %. Download reports any time." },
]

const WHY_FOUNDING_SCHOOLS = [
  {
    quote: "Attendance, marks, homework and certificates for every class in your school — one dashboard for Students, Teachers, Admins and Parents, instead of five separate tools.",
    name: "One platform, every role",
    role: "Full student-tracking suite",
    initials: "✓",
  },
  {
    quote: "Certificates are generated with your school's own logo and colours the moment a student qualifies — no manual design work, no waiting.",
    name: "Your branding, automatically",
    role: "Certificate generation built in",
    initials: "✓",
  },
  {
    quote: "The board compliance PDF is one click, built from real attendance and progress data already in the system — nothing to compile by hand.",
    name: "Compliance, made simple",
    role: "Auto-generated reports",
    initials: "✓",
  },
]

function RoiResults({ students, periods, onGetStarted }: { students: number; periods: number; onGetStarted: () => void }) {
  const { hiringCost, subscriptionCost, saving } = useMemo(() => {
    // Classes: ~40 students/class; teacher handles ~18 class-periods/week
    const classes = Math.ceil(students / 40)
    const teachersNeeded = Math.max(1, Math.ceil((classes * periods) / 18))
    const hiringCost = teachersNeeded * 650000   // ₹6.5L/teacher/yr (salary + setup)
    const subscriptionCost = students <= 300 ? 40000 : students <= 1000 ? students * 250 : students * 150
    const saving = hiringCost - subscriptionCost
    return { hiringCost, subscriptionCost, saving }
  }, [students, periods])

  const fmt = (n: number) => "₹" + (n >= 100000 ? (n / 100000).toFixed(1) + "L" : n.toLocaleString("en-IN"))

  return (
    <div className="glass-card rounded-[14px] p-6 flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex justify-between items-center py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm text-muted-foreground">Hiring a CS teacher</span>
          <span className="text-sm font-semibold text-foreground">{fmt(hiringCost)}<span className="text-xs text-muted-foreground font-normal">/yr</span></span>
        </div>
        <div className="flex justify-between items-center py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm text-muted-foreground">TeachScript subscription</span>
          <span className="text-sm font-semibold" style={{ color: "var(--ts-blue)" }}>{fmt(subscriptionCost)}<span className="text-xs font-normal text-muted-foreground">/yr</span></span>
        </div>
        <div className="flex justify-between items-center py-4 px-4 rounded-[10px]" style={{ backgroundColor: "color-mix(in srgb, var(--ts-green) 12%, transparent)" }}>
          <span className="text-sm font-medium text-foreground">Annual saving</span>
          <span className="text-xl font-bold" style={{ color: "var(--ts-green)" }}>{fmt(Math.max(0, saving))}</span>
        </div>
      </div>
      <Button
        onClick={onGetStarted}
        className="w-full rounded-[20px] text-sm mt-4 text-white border-0"
        style={{ background: "var(--gradient-blue-green)" }}
      >
        Start saving today <ArrowRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  )
}

export function ForSchoolsPage() {
  const navigate = useNavigate()
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginRole, setLoginRole] = useState<"student" | "teacher" | "admin">("teacher")
  const [lang, setLang] = useState<"en" | "hi">("en")

  const handleLoginClick = (role?: "student" | "teacher" | "admin") => {
    setLoginRole(role || "teacher")
    setLoginOpen(true)
  }
  const [roiStudents, setRoiStudents] = useState(200)
  const [roiPeriods, setRoiPeriods] = useState(3)
  const [demoName, setDemoName] = useState("")
  const [demoPhone, setDemoPhone] = useState("")
  const [demoSchool, setDemoSchool] = useState("")
  const [demoCity, setDemoCity] = useState("")
  const [submitted, setSubmitted] = useState(false)

  function submitDemo() {
    if (!demoName.trim() || !demoPhone.trim()) return
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-background pt-14">
      <Navbar
        onLoginClick={handleLoginClick}
        lang={lang}
        onLangToggle={() => setLang(l => l === "en" ? "hi" : "en")}
      />

      {/* Hero — gradient with floating orbs */}
      <section className="gradient-hero py-16 px-4 relative overflow-hidden">
        <div className="absolute top-10 right-10 w-64 h-64 rounded-full opacity-15 blur-3xl" style={{ background: "var(--ts-blue)" }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-green)" }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <School className="w-4 h-4 text-ts-blue" />
            <span className="text-xs font-medium text-ts-blue">For school administrators</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-medium text-foreground leading-snug mb-4">
            Run your whole school on one platform
            <br className="hidden md:block" />
            <span className="gradient-text-blue-green"> — attendance, marks, and more</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed mb-6">
            TeachScript tracks attendance, marks, homework, quizzes, and certificates for every class in your school —
            plus a complete CBSE-aligned Computer Science curriculum your existing teacher can deliver with no CS background.
            Works offline, on any device.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => navigate("/signup")}
              className="rounded-[20px] text-sm text-white border-0"
              style={{ background: "var(--gradient-blue-green)" }}
            >
              Start free trial <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              variant="outline"
              className="rounded-[20px] text-sm glass-card border-0"
              onClick={() => document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth" })}
            >
              Request a demo
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-6">
            {["14-day free trial", "No credit card", "Works on existing devices", "CBSE & State Board aligned"].map(b => (
              <div key={b} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-ts-green" />
                {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem / Solution — glass cards with gradient top borders */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-medium text-foreground text-center mb-3">We hear this from schools every week</h2>
          <p className="text-sm text-muted-foreground text-center mb-10">TeachScript was built to solve exactly these problems.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {PAIN_POINTS.map((p, i) => (
              <div key={p.pain} className="glass-card rounded-[14px] p-5 relative overflow-hidden animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[14px]" style={{ background: p.gradient }} />
                <div className="p-2.5 rounded-[10px] w-fit mb-3 text-white" style={{ background: p.gradient }}>
                  {p.icon}
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-2 italic">{p.pain}</p>
                <p className="text-sm text-foreground leading-relaxed">{p.fix}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — gradient step numbers */}
      <section className="gradient-hero py-16 px-4 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-blue)" }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <h2 className="text-2xl font-medium text-foreground text-center mb-10">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.num} className="relative animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="text-3xl font-bold mb-3 gradient-text-blue-green">{step.num}</div>
                <h3 className="text-sm font-medium text-foreground mb-2">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="hidden md:block absolute top-2 -right-3 w-4 h-4 text-ts-blue/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — glass cards with gradient icons */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-medium text-foreground text-center mb-10">Everything your school needs</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: <BarChart2 className="w-5 h-5" />, gradient: "var(--gradient-stat-purple)", title: "Admin dashboard", desc: "Track attendance, marks, teacher activity, and board compliance % for every class, in one place." },
              { icon: <Award className="w-5 h-5" />, gradient: "var(--gradient-stat-amber)", title: "Student certificates", desc: "Auto-generated certificates with your school's own logo and colours. Downloadable PDF." },
              { icon: <Clock className="w-5 h-5" />, gradient: "var(--gradient-stat-blue)", title: "Sunday Night Sync", desc: "Automated WhatsApp digest to parents every Sunday with their child's weekly progress across every subject." },
              { icon: <BookOpen className="w-5 h-5" />, gradient: "var(--gradient-stat-green)", title: "210 ready CS lessons", desc: "Full Computer Science curriculum for Classes 3–8. PPT slides, activities, videos, and quizzes included." },
              { icon: <MessageSquare className="w-5 h-5" />, gradient: "var(--gradient-stat-green)", title: "Whisper script", desc: "For the CS curriculum: a word-by-word teacher script, so any teacher can deliver it with confidence." },
              { icon: <Shield className="w-5 h-5" />, gradient: "var(--gradient-stat-red)", title: "DPDP compliant", desc: "No behavioral tracking. No ads. No student PII for Class 3–5. Compliant with DPDP Act 2023." },
            ].map((f, i) => (
              <div key={f.title} className="glass-card rounded-[14px] p-5 relative overflow-hidden hover:scale-[1.02] transition-transform animate-fade-in-up" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[14px]" style={{ background: f.gradient }} />
                <div className="p-2.5 rounded-[10px] w-fit mb-3 text-white" style={{ background: f.gradient }}>
                  {f.icon}
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section className="gradient-hero py-16 px-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-green)" }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="flex items-center gap-2 mb-2 justify-center">
            <TrendingDown className="w-4 h-4 text-ts-green" />
            <span className="text-xs font-medium text-ts-green">ROI calculator</span>
          </div>
          <h2 className="text-2xl font-medium text-foreground text-center mb-2">See how much your school saves</h2>
          <p className="text-sm text-muted-foreground text-center mb-10">Compare hiring a dedicated CS teacher vs the TeachScript subscription that covers your whole school</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Sliders */}
            <div className="glass-card rounded-[14px] p-6 space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-foreground">Number of students</label>
                  <span className="text-sm font-semibold" style={{ color: "var(--ts-blue)" }}>{roiStudents.toLocaleString("en-IN")}</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={2000}
                  step={50}
                  value={roiStudents}
                  onChange={e => setRoiStudents(Number(e.target.value))}
                  className="ts-slider w-full"
                  style={{ background: `linear-gradient(to right, var(--ts-blue) ${((roiStudents - 50) / (2000 - 50)) * 100}%, var(--border) ${((roiStudents - 50) / (2000 - 50)) * 100}%)` }}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>50</span><span>2,000</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-foreground">CS periods per week</label>
                  <span className="text-sm font-semibold" style={{ color: "var(--ts-blue)" }}>{roiPeriods}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={roiPeriods}
                  onChange={e => setRoiPeriods(Number(e.target.value))}
                  className="ts-slider w-full"
                  style={{ background: `linear-gradient(to right, var(--ts-blue) ${((roiPeriods - 1) / (6 - 1)) * 100}%, var(--border) ${((roiPeriods - 1) / (6 - 1)) * 100}%)` }}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>1/week</span><span>6/week</span>
                </div>
              </div>
            </div>

            {/* Results */}
            <RoiResults students={roiStudents} periods={roiPeriods} onGetStarted={() => navigate("/signup")} />
          </div>
        </div>
      </section>

      {/* Curriculum Compliance Checklist */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-2 justify-center">
            <CheckCircle2 className="w-4 h-4 text-ts-green" />
            <span className="text-xs font-medium text-ts-green">CBSE · State Board · ICSE</span>
          </div>
          <h2 className="text-2xl font-medium text-foreground text-center mb-2">The CS curriculum, fully board-compliant</h2>
          <p className="text-sm text-muted-foreground text-center mb-10">If your school needs the mandatory CBSE CT&AI curriculum, every TeachScript lesson is structured to meet its requirements across all major Indian school boards.</p>

          <div className="glass-card rounded-[16px] p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[16px]" style={{ background: "var(--gradient-stat-green)" }} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: "CS curriculum mapped", desc: "All 6 grades (3–8) covered — algorithms, AI, data, and computational thinking" },
                { label: "CBSE CT&AI aligned", desc: "Fully maps to skill subject codes 417 & 843 for CBSE schools" },
                { label: "State board compatible", desc: "Works for Telangana, AP, Maharashtra, Karnataka, TN state board CS syllabus" },
                { label: "6 competency domains", desc: "Algorithms, Data, Networking, AI/ML, Cybersafety, and CT — all 6 covered" },
                { label: "40 periods per grade covered", desc: "Each grade has 40 lesson-period plans matching school annual planners" },
                { label: "Bilingual content (EN + HI)", desc: "Every lesson's explanation and whisper script available in Hindi" },
                { label: "Auto compliance PDF", desc: "One-click PDF for board inspection — shows class-wise completion %" },
                { label: "DPDP Act 2023 compliant", desc: "No behavioral profiling, no ads, data stored in Indian data centres" },
              ].map((item, i) => (
                <div key={item.label} className="flex items-start gap-3 p-3 rounded-[10px] hover:bg-muted/50 transition-colors animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--ts-green) 15%, transparent)" }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-ts-green" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials — glass cards */}
      <section className="gradient-hero py-16 px-4 relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-amber)" }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <h2 className="text-2xl font-medium text-foreground text-center mb-10">Why founding schools choose us</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {WHY_FOUNDING_SCHOOLS.map((t, i) => (
              <div key={t.name} className="glass-card rounded-[14px] p-5 relative overflow-hidden animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: i === 0 ? "var(--gradient-stat-blue)" : i === 1 ? "var(--gradient-stat-green)" : "var(--gradient-stat-amber)" }} />
                <p className="text-sm text-foreground leading-relaxed mb-4">"{t.quote}"</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{ background: i === 0 ? "var(--gradient-stat-blue)" : i === 1 ? "var(--gradient-stat-green)" : "var(--gradient-stat-amber)" }}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo form — glass card with gradient top */}
      <section id="demo-form" className="py-16 px-4">
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-medium text-foreground text-center mb-3">Request a free demo</h2>
          <p className="text-sm text-muted-foreground text-center mb-8">We'll call you within 2 hours during school hours (Mon–Sat, 8am–6pm IST)</p>

          {submitted ? (
            <div className="glass-card rounded-[14px] p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-stat-green)" }} />
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-ts-green" />
              <h3 className="text-base font-medium text-foreground mb-2">Demo request received!</h3>
              <p className="text-sm text-muted-foreground">Our team will call {demoPhone} within 2 hours. See you soon!</p>
            </div>
          ) : (
            <div className="glass-card rounded-[14px] p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-blue-green)" }} />
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Your name *</label>
                  <Input className="h-9 text-sm" placeholder="Principal / VP name" value={demoName} onChange={e => setDemoName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">WhatsApp number *</label>
                  <Input className="h-9 text-sm" placeholder="+91 98765 43210" value={demoPhone} onChange={e => setDemoPhone(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">School name</label>
                  <Input className="h-9 text-sm" placeholder="School full name" value={demoSchool} onChange={e => setDemoSchool(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">City</label>
                  <Input className="h-9 text-sm" placeholder="City" value={demoCity} onChange={e => setDemoCity(e.target.value)} />
                </div>
                <Button
                  onClick={submitDemo}
                  className="w-full rounded-[20px] text-sm mt-1 text-white border-0"
                  style={{ background: "var(--gradient-blue-green)" }}
                  disabled={!demoName.trim() || !demoPhone.trim()}
                >
                  Request demo call
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  We respect your privacy. No spam. Unsubscribe anytime.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
      <LoginModal key={loginRole} isOpen={loginOpen} onClose={() => setLoginOpen(false)} defaultRole={loginRole} />
    </div>
  )
}
