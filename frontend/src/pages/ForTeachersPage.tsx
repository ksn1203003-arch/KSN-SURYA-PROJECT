// ─────────────────────────────────────────────────────────────────────────────
// pages/ForTeachersPage.tsx — Marketing page targeting teachers (/for-teachers).
// Showcases lesson upload, attendance tracking, AI assistant, and quiz features.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { LoginModal } from "@/components/LoginModal"
import { Button } from "@/components/ui/button"
import { CircleCheck as CheckCircle2, BookOpen, MessageSquare, Award, Mic, ChartBar as BarChart2, Zap, Heart, ArrowRight } from "lucide-react"

const BENEFITS = [
  {
    icon: <BarChart2 className="w-5 h-5" />,
    gradient: "var(--gradient-stat-purple)",
    title: "Automatic reports",
    desc: "Attendance, quiz scores, student progress — all tracked automatically. No manual record-keeping.",
  },
  {
    icon: <Award className="w-5 h-5" />,
    gradient: "var(--gradient-stat-amber)",
    title: "Student certificates",
    desc: "TeachScript auto-generates chapter completion certificates. You get the credit. Students feel proud.",
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    gradient: "var(--gradient-stat-red)",
    title: "AI assistant",
    desc: "Ask the built-in AI assistant anything about any lesson, curriculum, or student difficulty. Answer in seconds.",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    gradient: "var(--gradient-stat-blue)",
    title: "Works offline",
    desc: "Download lessons to teach from unreliable internet. Everything syncs when you're back online.",
  },
  {
    icon: <Mic className="w-5 h-5" />,
    gradient: "var(--gradient-stat-blue)",
    title: "Whisper script (CS curriculum)",
    desc: "If you're assigned the CS curriculum, a teacher-facing script shows you exactly what to say each slide. Zero CS knowledge needed.",
  },
  {
    icon: <BookOpen className="w-5 h-5" />,
    gradient: "var(--gradient-stat-green)",
    title: "210 ready CS lessons",
    desc: "A fully planned Computer Science curriculum across Class 3–8, ready whenever your school needs it. Just open and teach.",
  },
]

const WHY_TEACHERS_CHOOSE_US = [
  {
    quote: "No CS background needed — the whisper script tells you exactly what to say, lesson by lesson, so you can teach with confidence from day one.",
    name: "No experience required",
    school: "Whisper script included",
    initials: "✓",
    subject: "For any class teacher",
  },
  {
    quote: "Quizzes are graded automatically the moment a student submits — no more manually checking notebooks one by one.",
    name: "Hours back every week",
    school: "Auto-graded quizzes",
    initials: "✓",
    subject: "Instant results",
  },
  {
    quote: "Points, streaks, and certificates make progress visible to students — turning coursework into something they want to keep coming back to.",
    name: "Built-in motivation",
    school: "Points & certificates",
    initials: "✓",
    subject: "For every grade",
  },
]

const DAY_IN_LIFE = [
  { time: "Before class", icon: <Zap className="w-5 h-5" />, gradient: "var(--gradient-stat-blue)", desc: "Open TeachScript on any device. Lesson is ready — no prep." },
  { time: "During class", icon: <Mic className="w-5 h-5" />, gradient: "var(--gradient-stat-green)", desc: "Whisper script shows what to say. Students interact on their screens." },
  { time: "After class", icon: <CheckCircle2 className="w-5 h-5" />, gradient: "var(--gradient-stat-amber)", desc: "Mark attendance in one tap. Quiz auto-graded. Reports updated." },
  { time: "Sunday night", icon: <MessageSquare className="w-5 h-5" />, gradient: "var(--gradient-stat-purple)", desc: "WhatsApp Sync sends parent updates automatically. You do nothing." },
]

export function ForTeachersPage() {
  const navigate = useNavigate()
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginRole, setLoginRole] = useState<"student" | "teacher" | "admin">("teacher")
  const [lang, setLang] = useState<"en" | "hi">("en")

  const handleLoginClick = (role?: "student" | "teacher" | "admin") => {
    setLoginRole(role || "teacher")
    setLoginOpen(true)
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
        <div className="absolute top-10 left-10 w-64 h-64 rounded-full opacity-15 blur-3xl" style={{ background: "var(--ts-red)" }} />
        <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-blue)" }} />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Heart className="w-4 h-4 text-ts-red" />
            <span className="text-xs font-medium text-ts-red">Made for teachers</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-medium text-foreground leading-snug mb-4">
            Less admin, more teaching —
            <br className="hidden md:block" />
            <span className="gradient-text-blue-green"> whatever class you teach</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed mb-6">
            Attendance, marks, homework, and certificates are tracked automatically, so you spend less time on paperwork.
            And if you're assigned the CS curriculum, our whisper script and AI assistant mean "I'm not technical" is never a problem.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => navigate("/signup")}
              className="rounded-[20px] text-sm text-white border-0"
              style={{ background: "var(--gradient-blue-green)" }}
            >
              Join free — ask your principal <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              variant="outline"
              className="rounded-[20px] text-sm glass-card border-0"
              onClick={() => setLoginOpen(true)}
            >
              Teacher login
            </Button>
          </div>
        </div>
      </section>

      {/* A day in the life — gradient icon cards */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-medium text-foreground text-center mb-10">A teaching day with TeachScript</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {DAY_IN_LIFE.map((item, i) => (
              <div key={item.time} className="glass-card rounded-[14px] p-5 text-center relative overflow-hidden hover:scale-[1.02] transition-transform animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[14px]" style={{ background: item.gradient }} />
                <div className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center text-white" style={{ background: item.gradient }}>
                  {item.icon}
                </div>
                <p className="text-xs font-medium text-foreground mb-1">{item.time}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits — glass cards with gradient icons */}
      <section className="gradient-hero py-16 px-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-purple)" }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <h2 className="text-2xl font-medium text-foreground text-center mb-10">Built to make your job easier</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {BENEFITS.map((b, i) => (
              <div key={b.title} className="glass-card rounded-[14px] p-5 relative overflow-hidden hover:scale-[1.02] transition-transform animate-fade-in-up" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[14px]" style={{ background: b.gradient }} />
                <div className="p-2.5 rounded-[10px] w-fit mb-3 text-white" style={{ background: b.gradient }}>
                  {b.icon}
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">{b.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials — glass cards */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-medium text-foreground text-center mb-10">Why teachers choose us</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {WHY_TEACHERS_CHOOSE_US.map((t, i) => (
              <div key={t.name} className="glass-card rounded-[14px] p-5 relative overflow-hidden animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: i === 0 ? "var(--gradient-stat-blue)" : i === 1 ? "var(--gradient-stat-green)" : "var(--gradient-stat-amber)" }} />
                <p className="text-sm text-foreground leading-relaxed mb-4">"{t.quote}"</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0" style={{ background: i === 0 ? "var(--gradient-stat-blue)" : i === 1 ? "var(--gradient-stat-green)" : "var(--gradient-stat-amber)" }}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.subject} · {t.school}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's in the box — glass card with gradient checklist */}
      <section className="gradient-hero py-16 px-4 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-green)" }} />
        <div className="max-w-3xl mx-auto relative z-10">
          <h2 className="text-2xl font-medium text-foreground text-center mb-10">What you get</h2>
          <div className="glass-card rounded-[14px] p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-blue-green)" }} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                "210 curriculum-ready lesson slides",
                "Word-by-word whisper script every lesson",
                "Quiz builder and auto-grader",
                "Student certificate generator",
                "AI teaching assistant",
                "Hindi/English toggle",
                "Attendance tracker",
                "Progress dashboard",
                "Sunday WhatsApp parent updates",
                "Works offline (download lessons)",
                "Email and WhatsApp support",
                "Free training call on onboarding",
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-ts-green" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA — gradient button */}
      <section className="py-16 px-4">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="text-2xl font-medium text-foreground mb-3">Ready to spend less time on paperwork?</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Ask your school to sign up. It's free for 14 days, no credit card. You'll be up and running from day one.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={() => navigate("/for-schools")}
              className="rounded-[20px] text-sm w-full sm:w-auto text-white border-0"
              style={{ background: "var(--gradient-blue-green)" }}
            >
              Tell my school about TeachScript
            </Button>
            <Button
              variant="outline"
              className="rounded-[20px] text-sm w-full sm:w-auto glass-card border-0"
              onClick={() => setLoginOpen(true)}
            >
              Teacher login
            </Button>
          </div>
        </div>
      </section>

      <Footer />
      <LoginModal key={loginRole} isOpen={loginOpen} onClose={() => setLoginOpen(false)} defaultRole={loginRole} />
    </div>
  )
}
