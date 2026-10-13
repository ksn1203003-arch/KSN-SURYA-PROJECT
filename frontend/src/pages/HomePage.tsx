// ─────────────────────────────────────────────────────────────────────────────
// pages/HomePage.tsx — Public marketing landing page (/).
// Hero section, feature highlights, testimonials, and CTA to /signup or /login.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { LoginModal } from "@/components/LoginModal"
import { Button } from "@/components/ui/button"
import {
  BookOpen, MessageSquare, PenLine, Bot, ChevronRight, Sparkles, ArrowRight,
  ChevronDown, GraduationCap, Star, Users, Zap,
} from "lucide-react"

// ── Static data ───────────────────────────────────────────────────────────────

const CURRICULUM = [
  { grade: 3, title: "Class 3", desc: "Patterns, sequences, what is a computer, AI in daily life", periods: 30, emoji: "🔢" },
  { grade: 4, title: "Class 4", desc: "Algorithms, pattern recognition, inputs and outputs", periods: 30, emoji: "🔄" },
  { grade: 5, title: "Class 5", desc: "Abstraction, maze coding, Scratch Jr., how AI sees", periods: 30, emoji: "🧩" },
  { grade: 6, title: "Class 6", desc: "Scratch, loops, variables, AI ethics, chatbot project", periods: 40, emoji: "💬" },
  { grade: 7, title: "Class 7", desc: "Conditionals, lists, game design, data and bias", periods: 40, emoji: "🎮" },
  { grade: 8, title: "Class 8", desc: "Functions, Python intro, neural networks, capstone project", periods: 40, emoji: "🤖" },
]

const WHY_EARLY_SCHOOLS = [
  { quote: "One login replaces five different tools — attendance registers, mark sheets, homework diaries, certificate templates, and parent WhatsApp groups all in one place.", name: "Unified by design", role: "Student, Teacher, Admin & Parent dashboards", initials: "✓", gradient: "var(--gradient-stat-blue)" },
  { quote: "Certificates are generated with your own school's logo and colours — not a generic template. Attendance, marks, and progress update the moment a teacher enters them.", name: "Built for your school", role: "Custom branding, real-time updates", initials: "✓", gradient: "var(--gradient-stat-green)" },
  { quote: "Founding schools get a direct line to shape what we build next, plus founding-tier pricing locked in before it increases as new features launch.", name: "Founding school pricing", role: "Early access, roadmap input", initials: "✓", gradient: "var(--gradient-stat-amber)" },
]

const STEPS = [
  { num: 1, title: "School subscribes", desc: "Annual plan. 14-day free trial. No credit card needed.", emoji: "🏫" },
  { num: 2, title: "Everyone gets a login", desc: "Instant access for Students, Teachers, Admins, and Parents.", emoji: "👩‍🏫" },
  { num: 3, title: "Mark attendance, enter marks", desc: "One tap for attendance. Marks and grades calculate automatically.", emoji: "📅" },
  { num: 4, title: "Push homework & quizzes", desc: "Teachers assign work; students submit and get graded instantly.", emoji: "📖" },
  { num: 5, title: "Certificates auto-generate", desc: "With your school's own logo, the moment a student qualifies.", emoji: "✏️" },
  { num: 6, title: "Parents stay updated", desc: "Live attendance, marks, and progress — no separate app needed.", emoji: "✅" },
]

const STATS = [
  { end: 4, suffix: "", label: "User Roles", icon: Users, gradient: "var(--gradient-stat-blue)" },
  { end: 6, suffix: "", label: "Core Modules", icon: Star, gradient: "var(--gradient-stat-amber)" },
  { end: 210, suffix: "+", label: "Ready CS Lessons", icon: BookOpen, gradient: "var(--gradient-stat-green)" },
  { end: 14, suffix: "-day", label: "Free Trial", icon: GraduationCap, gradient: "var(--gradient-stat-purple)" },
]

const MARQUEE_ITEMS = [
  "✓ Attendance & Marks Tracking", "✓ Homework & Quizzes", "✓ Certificates with Your Branding",
  "✓ CBSE & State Board Aligned", "✓ Any Class, Any Grade", "✓ Auto-Graded Quizzes",
  "✓ Bilingual Support", "✓ Parent Dashboard Included", "✓ 14-Day Free Trial",
  "✓ No Credit Card Required",
]

const TYPEWRITER_WORDS = [
  "attendance & marks",
  "homework & quizzes",
  "every class, every grade",
  "report cards & certificates",
]

const CARD_GRADIENTS = [
  "var(--gradient-stat-blue)",
  "var(--gradient-stat-green)",
  "var(--gradient-stat-amber)",
  "var(--gradient-stat-purple)",
  "var(--gradient-stat-red)",
  "var(--gradient-stat-blue)",
]

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useScrollReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ob = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); ob.disconnect() } },
      { threshold }
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [threshold])
  return { ref, visible }
}

function useCounter(end: number, active: boolean, duration = 1800) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!active) return
    let current = 0
    const step = end / (duration / 16)
    const timer = setInterval(() => {
      current += step
      if (current >= end) { setCount(end); clearInterval(timer) }
      else setCount(Math.floor(current))
    }, 16)
    return () => clearInterval(timer)
  }, [active, end, duration])
  return count
}

function useTypewriter(words: string[], speed = 75, pause = 1800) {
  const [wordIdx, setWordIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [text, setText] = useState("")

  useEffect(() => {
    const current = words[wordIdx]
    let delay = deleting ? speed / 2 : speed
    if (!deleting && charIdx === current.length) delay = pause
    if (deleting && charIdx === 0) delay = 300

    const t = setTimeout(() => {
      if (!deleting && charIdx < current.length) {
        setCharIdx(c => c + 1)
        setText(current.slice(0, charIdx + 1))
      } else if (!deleting && charIdx === current.length) {
        setDeleting(true)
      } else if (deleting && charIdx > 0) {
        setCharIdx(c => c - 1)
        setText(current.slice(0, charIdx - 1))
      } else {
        setDeleting(false)
        setWordIdx(w => (w + 1) % words.length)
      }
    }, delay)
    return () => clearTimeout(t)
  }, [charIdx, deleting, wordIdx, words, speed, pause])

  return text
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FloatingParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      size: (i % 4) * 2 + 3,
      left: (i * 37 + 11) % 100,
      delay: (i * 0.65) % 9,
      duration: (i * 1.4 + 12) % 10 + 12,
      colorIdx: i % 4,
    })),
    []
  )
  const colors = [
    "rgba(55,138,221,0.55)",
    "rgba(99,153,34,0.45)",
    "rgba(83,74,183,0.45)",
    "rgba(239,159,39,0.45)",
  ]
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            bottom: -20,
            background: colors[p.colorIdx],
            animation: `particleRise ${p.duration}s ${p.delay}s ease-in infinite`,
          }}
        />
      ))}
    </div>
  )
}

function RevealSection({
  children, className = "", delay = 0, direction = "up",
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  direction?: "up" | "left" | "right" | "scale"
}) {
  const { ref, visible } = useScrollReveal()
  const cls = {
    up: "reveal-up", left: "reveal-left", right: "reveal-right", scale: "reveal-scale",
  }[direction]
  return (
    <div
      ref={ref}
      className={`${cls} ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

function MarqueeStrip() {
  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]
  return (
    <div
      className="overflow-hidden py-3 border-y border-transparent"
      style={{ background: "var(--gradient-blue-green)" }}
    >
      <div className="flex whitespace-nowrap animate-marquee gap-10">
        {doubled.map((item, i) => (
          <span key={i} className="text-xs font-semibold text-white/90 flex-shrink-0">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function AnimatedStatCard({ end, suffix, label, icon: Icon, gradient, active }: {
  end: number; suffix: string; label: string; icon: React.ElementType; gradient: string; active: boolean
}) {
  const count = useCounter(end, active)
  return (
    <div className="flex flex-col items-center text-center group">
      <div
        className="w-14 h-14 rounded-[16px] flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition-transform duration-300"
        style={{ background: gradient }}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className={`text-3xl md:text-4xl font-black text-foreground tabular-nums ${active ? "animate-count-reveal" : "opacity-0"}`}>
        {end >= 1000 ? count.toLocaleString("en-IN") : count}{suffix}
      </div>
      <div className="text-xs text-muted-foreground mt-1 font-medium">{label}</div>
    </div>
  )
}

// ── useScrollY ────────────────────────────────────────────────────────────────
function useScrollY() {
  const [y, setY] = useState(0)
  useEffect(() => {
    const h = () => setY(window.scrollY)
    window.addEventListener("scroll", h, { passive: true })
    return () => window.removeEventListener("scroll", h)
  }, [])
  return y
}

// ── SmokeLayer — rising fog clouds ────────────────────────────────────────────
function SmokeLayer({ colors, count = 6 }: { colors: string[]; count?: number }) {
  const clouds = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i, w: 145 + (i * 83) % 225, h: 72 + (i * 47) % 138,
      left: (i * 17 + 4) % 87, delay: (i * 1.7) % 9,
      dur: 10 + (i * 3.3) % 16, alpha: 0.065 + (i % 4) * 0.022,
      color: colors[i % colors.length],
    })), [count, colors])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {clouds.map(c => (
        <div key={c.id} className="absolute rounded-full" style={{
          width: c.w, height: c.h, left: `${c.left}%`, bottom: -40,
          background: c.color, filter: "blur(44px)", opacity: c.alpha,
          animation: `smokeRise ${c.dur}s ${c.delay}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

// ── AuroraLayer — shimmering colour blobs with parallax ───────────────────────
function AuroraLayer({ colors, scrollY = 0, depth = 0 }: { colors: string[]; scrollY?: number; depth?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {colors.map((color, i) => (
        <div key={i} className="absolute rounded-full" style={{
          width: `${200 + i * 120}px`, height: `${100 + i * 60}px`,
          left: `${5 + i * 26}%`, top: `${10 + i * 19}%`,
          background: color, filter: "blur(70px)",
          opacity: 0.13 + (i % 3) * 0.04,
          transform: depth ? `translateY(${scrollY * depth * (i % 2 === 0 ? 1 : -0.65)}px)` : undefined,
          animation: `auroraWave ${7 + i * 2.8}s ${i * 2}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

// ── StarField — drifting specks ────────────────────────────────────────────────
function StarField({ count = 28, colors }: { count?: number; colors?: string[] }) {
  const stars = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i, size: 1.5 + (i * 0.6) % 3,
      left: (i * 31 + 7) % 97, btm: (i * 17) % 60,
      delay: (i * 0.9) % 11, dur: 8 + (i * 2.3) % 11,
      color: colors ? colors[i % colors.length] : `hsla(${(i * 41) % 360},65%,68%,0.75)`,
    })), [count, colors])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {stars.map(s => (
        <div key={s.id} className="absolute rounded-full" style={{
          width: s.size, height: s.size, left: `${s.left}%`, bottom: `${s.btm}%`,
          background: s.color, boxShadow: `0 0 ${s.size * 2.5}px ${s.color}`,
          animation: `starFloat ${s.dur}s ${s.delay}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

// ── NeonGrid — pulsing grid lines with glowing nodes ─────────────────────────
function NeonGrid({ color = "rgba(55,138,221,0.18)" }: { color?: string }) {
  const nodes = useMemo(() =>
    Array.from({ length: 9 }, (_, i) => ({
      id: i, x: (i * 11 + 5) % 95, y: (i * 13 + 8) % 88,
      dur: 1.8 + (i * 0.6) % 2.2, delay: (i * 0.45) % 3,
    })), [])
  const nodeColor = color.replace(/[\d.]+\)$/, "0.85)")
  const glowColor = color.replace(/[\d.]+\)$/, "0.55)")
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      <div className="absolute inset-0" style={{
        backgroundImage: `linear-gradient(${color} 1px,transparent 1px),linear-gradient(90deg,${color} 1px,transparent 1px)`,
        backgroundSize: "48px 48px",
        animation: "neonGridPulse 4s ease-in-out infinite",
      }} />
      {nodes.map(n => (
        <div key={n.id} className="absolute rounded-full" style={{
          width: 6, height: 6, left: `${n.x}%`, top: `${n.y}%`,
          background: nodeColor, boxShadow: `0 0 10px 4px ${glowColor}`,
          animation: `neonGridPulse ${n.dur}s ${n.delay}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

// ── LightRays — diagonal sweeping rays ───────────────────────────────────────
function LightRays({ color }: { color: string }) {
  const rays = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => ({
      id: i, width: 70 + i * 38, left: i * 18 + 4, dur: 9 + i * 2.8, delay: i * 2.4,
    })), [])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {rays.map(r => (
        <div key={r.id} className="absolute top-0" style={{
          width: r.width, height: "160%", left: `${r.left}%`, top: "-30%",
          background: `linear-gradient(180deg,${color}55 0%,${color}22 55%,transparent 100%)`,
          transform: "skewX(-14deg)",
          animation: `lightRaySweep ${r.dur}s ${r.delay}s linear infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Tilt3D — mouse-driven 3D perspective tilt wrapper ─────────────────────────
function Tilt3D({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    const rx = ((e.clientY - r.top  - r.height / 2) / (r.height / 2)) * -9
    const ry = ((e.clientX - r.left - r.width  / 2) / (r.width  / 2)) *  9
    el.style.transform = `perspective(720px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.03,1.03,1.03)`
  }
  const onLeave = () => { if (ref.current) ref.current.style.transform = "" }
  return (
    <div ref={ref} className={`tilt-3d ${className}`}
      style={{ transition: "transform 0.18s ease" }}
      onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
    </div>
  )
}

// ── ROI Calculator ────────────────────────────────────────────────────────────

function sliderBg(value: number, min: number, max: number) {
  const pct = ((value - min) / (max - min)) * 100
  return `linear-gradient(to right, var(--ts-blue) ${pct}%, var(--border) ${pct}%)`
}

function RoiCalculator() {
  const [periods, setPeriods] = useState(5)
  const [students, setStudents] = useState(500)
  const classes = Math.ceil(students / 40)
  const teachersNeeded = Math.max(1, Math.ceil((classes * periods) / 18))
  const hiringCost = teachersNeeded * 650000
  const subCost = students <= 300 ? 40000 : students <= 1000 ? students * 250 : students * 150
  const saving = hiringCost - subCost

  return (
    <div className="glass-card card-glow rounded-[20px] p-7 max-w-[520px] mx-auto relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[20px]" style={{ background: "var(--gradient-blue-green)" }} />
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm font-medium text-foreground">CS periods per week</label>
            <span className="text-sm font-bold text-ts-blue">{periods}</span>
          </div>
          <input type="range" min={1} max={10} value={periods}
            onChange={e => setPeriods(Number(e.target.value))}
            className="ts-slider w-full"
            style={{ background: sliderBg(periods, 1, 10) }} />
        </div>
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm font-medium text-foreground">Number of students</label>
            <span className="text-sm font-bold text-ts-blue">{students.toLocaleString("en-IN")}</span>
          </div>
          <input type="range" min={100} max={2000} step={50} value={students}
            onChange={e => setStudents(Number(e.target.value))}
            className="ts-slider w-full"
            style={{ background: sliderBg(students, 100, 2000) }} />
        </div>
        <div className="grid gap-3 mt-1">
          <div className="flex justify-between items-center p-4 rounded-[14px] bg-ts-red-light border border-ts-red/20">
            <span className="text-sm text-foreground/75">Hiring {teachersNeeded} CS teacher{teachersNeeded > 1 ? "s" : ""}</span>
            <span className="text-sm font-semibold text-foreground">₹{hiringCost.toLocaleString("en-IN")}/year</span>
          </div>
          <div className="flex justify-between items-center p-4 rounded-[14px] bg-ts-blue-light border border-ts-blue/20">
            <span className="text-sm text-foreground/75">TeachScript subscription</span>
            <span className="text-sm font-bold text-ts-blue-dark">₹{subCost.toLocaleString("en-IN")}/year</span>
          </div>
          <div className="flex justify-between items-center p-4 rounded-[14px]" style={{ background: "var(--gradient-blue-green)" }}>
            <span className="text-sm text-white/90 font-semibold">Your annual saving 🎉</span>
            <span className="text-base font-black text-white">
              {saving > 0 ? `₹${saving.toLocaleString("en-IN")}` : "Contact us"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function HomePage() {
  const navigate = useNavigate()
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginRole, setLoginRole] = useState<"student" | "teacher" | "admin">("teacher")
  const [lang, setLang] = useState<"en" | "hi">("en")

  const typedText = useTypewriter(TYPEWRITER_WORDS)
  const scrollY   = useScrollY()

  // Stats counter trigger
  const statsRef = useRef<HTMLDivElement>(null)
  const [statsActive, setStatsActive] = useState(false)
  useEffect(() => {
    const el = statsRef.current
    if (!el) return
    const ob = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setStatsActive(true); ob.disconnect() } },
      { threshold: 0.25 }
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [])

  const handleLoginClick = (role?: "student" | "teacher" | "admin") => {
    setLoginRole(role || "teacher")
    setLoginOpen(true)
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden pt-14">
      <Navbar onLoginClick={handleLoginClick} lang={lang} onLangToggle={() => setLang(l => l === "en" ? "hi" : "en")} />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center px-4 overflow-hidden hero-mesh">

        {/* Animated grid overlay */}
        <div className="absolute inset-0 bg-grid pointer-events-none" />

        {/* Colour orbs — subtle, clean */}
        <div className="absolute top-16 left-[12%] w-96 h-96 rounded-full blur-[120px] opacity-[0.18] animate-orb-1" style={{ background: "var(--ts-blue)" }} />
        <div className="absolute bottom-16 right-[12%] w-72 h-72 rounded-full blur-[100px] opacity-[0.14] animate-orb-2" style={{ background: "var(--ts-purple)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] rounded-full blur-[150px] opacity-[0.07] animate-orb-3" style={{ background: "var(--ts-green)" }} />

        {/* Rising particles */}
        <FloatingParticles />

        {/* Decorative spinning ring */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] rounded-full border border-ts-blue/10 animate-spin-slow pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[820px] h-[820px] rounded-full border border-ts-purple/8 animate-spin-slow pointer-events-none" style={{ animationDirection: "reverse", animationDuration: "35s" }} />

        {/* Hero content */}
        <div className="relative z-10 max-w-4xl mx-auto text-center">

          {/* Pill badge */}
          <div className="animate-hero-entrance" style={{ animationDelay: "0s" }}>
            <span className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full mb-7 glass-card animate-glow-pulse border border-ts-blue/25">
              <Sparkles className="w-3.5 h-3.5 text-ts-blue" />
              <span className="text-ts-blue-dark dark:text-blue-300">
                CBSE & State Board Aligned · Built for Every Class
              </span>
            </span>
          </div>

          {/* Headline with typewriter */}
          <div className="animate-hero-entrance" style={{ animationDelay: "0.15s" }}>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-foreground mb-2 leading-tight tracking-tight">
              Walk into{" "}
              <span className="animate-gradient-text">{typedText || " "}</span>
              <span className="animate-cursor inline-block w-[3px] h-[0.85em] bg-ts-blue ml-1 align-middle rounded-sm" />
            </h1>
          </div>

          <div className="animate-hero-entrance" style={{ animationDelay: "0.25s" }}>
            <h2 className="text-3xl md:text-5xl font-black text-foreground/80 mb-7">
              Open the app.{" "}
              <span className="animate-gradient-text">Teach.</span>
            </h2>
          </div>

          <div className="animate-hero-entrance" style={{ animationDelay: "0.35s" }}>
            <p className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Attendance, marks, homework, quizzes, and certificates — for every class in your school.
              Plus a ready-made Computer Science curriculum for Classes 3–8 —{" "}
              <strong className="text-foreground">no CS background needed to teach it.</strong>
            </p>
          </div>

          {/* CTA buttons */}
          <div className="animate-hero-entrance flex flex-wrap items-center justify-center gap-4 mb-10" style={{ animationDelay: "0.45s" }}>
            <Button
              onClick={() => navigate("/signup")}
              className="btn-neon rounded-full px-8 py-3 h-auto text-base text-white border-0 animate-glow-pulse font-bold shadow-2xl"
              style={{ background: "var(--gradient-blue-green)" }}
            >
              Start free 14-day trial <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-7 py-3 h-auto text-base glass-card border border-border/60 font-semibold hover:border-ts-blue/40 transition-colors"
              onClick={() => navigate("/for-teachers")}
            >
              Watch how it works
            </Button>
          </div>

          {/* Trust badge pills */}
          <div className="animate-hero-entrance flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "0.55s" }}>
            {["📊 Attendance & marks", "🏅 Certificates included", "👨‍👩‍👧 Parent dashboard", "🎓 210 ready CS lessons", "🆓 14-day free trial"].map((badge, i) => (
              <span
                key={badge}
                className="text-xs px-3.5 py-1.5 rounded-full glass-card border border-border/40 font-medium text-foreground/70"
                style={{ animationDelay: `${0.6 + i * 0.06}s` }}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-muted-foreground animate-scroll-bounce">
          <span className="text-[10px] tracking-widest uppercase">Scroll</span>
          <ChevronDown className="w-4 h-4" />
        </div>
      </section>

      {/* ── MARQUEE STRIP ─────────────────────────────────────────────────── */}
      <MarqueeStrip />

      {/* ── ANIMATED STATS ────────────────────────────────────────────────── */}
      <div className="section-glow-divider" />
      <section className="py-20 px-4 relative overflow-hidden">
        <AuroraLayer colors={["rgba(43,130,217,0.22)","rgba(107,79,216,0.18)"]} scrollY={scrollY} depth={0.04} />
        <div ref={statsRef} className="max-w-4xl mx-auto relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {STATS.map(s => (
              <AnimatedStatCard key={s.label} {...s} active={statsActive} />
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <div className="section-glow-divider" />
      <section className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{ background: "var(--gradient-blue-green)" }} />
        <StarField count={20} colors={["rgba(43,130,217,0.7)","rgba(107,79,216,0.65)"]} />
        <div className="max-w-5xl mx-auto relative z-10">

          <RevealSection className="text-center mb-14">
            <span className="text-[11px] font-black tracking-[0.2em] uppercase text-ts-blue mb-3 block">What You Get</span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">Everything, fully loaded</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">Four pillars that run your whole school in one place</p>
          </RevealSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { gradient: "var(--gradient-stat-blue)",   title: "Attendance & Marks",  desc: "One tap for attendance. Marks, percentages, and letter grades calculate automatically.", emoji: "📊" },
              { gradient: "var(--gradient-stat-amber)",  title: "Homework & Quizzes",  desc: "Assign work, auto-grade quizzes, and give feedback — all in one dashboard.", emoji: "📝" },
              { gradient: "var(--gradient-stat-green)",  title: "Certificates",        desc: "Auto-generated with your own school's logo and colours, the moment a student qualifies.", emoji: "🏅" },
              { gradient: "var(--gradient-stat-purple)", title: "AI Assistant",        desc: "Ask anything about any lesson. Get an answer in plain language instantly.", emoji: "🤖" },
            ].map((card, i) => (
              <RevealSection key={card.title} delay={i * 90} direction="up">
                <Tilt3D className="h-full">
                <div className="glass-card card-glow card-shimmer rounded-[18px] p-6 relative overflow-hidden h-full group">
                  <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[18px]" style={{ background: card.gradient }} />
                  <div className="text-4xl mb-5 emoji-wiggle">{card.emoji}</div>
                  <h3 className="text-sm font-bold text-foreground mb-2">{card.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
                </div>
                </Tilt3D>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <div className="section-glow-divider" />
      <section id="how-it-works" className="py-20 px-4 gradient-hero relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-[0.06] blur-[130px] animate-orb-2" style={{ background: "var(--ts-purple)" }} />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-[0.06] blur-[110px] animate-orb-1" style={{ background: "var(--ts-blue)" }} />
        <div className="max-w-5xl mx-auto relative z-10">

          <RevealSection className="text-center mb-14">
            <span className="text-[11px] font-black tracking-[0.2em] uppercase text-ts-blue mb-3 block">How It Works</span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">Up and running in a day. No setup headaches.</h2>
            <p className="text-sm text-muted-foreground">Six simple steps from subscription to your whole school online.</p>
          </RevealSection>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            {STEPS.map((step, i) => (
              <RevealSection key={step.num} delay={i * 70} direction="up">
                <div className="flex flex-col items-center text-center w-full group cursor-default">
                  <div className="relative mb-4 mx-auto w-fit">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl glass-card shadow-lg border border-border/30 group-hover:scale-110 transition-transform duration-300 emoji-wiggle">
                      {step.emoji}
                    </div>
                    <div
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm"
                      style={{ background: "var(--gradient-blue-green)" }}
                    >
                      {step.num}
                    </div>
                  </div>
                  <h4 className="text-xs font-bold text-foreground mb-1">{step.title}</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── CURRICULUM ────────────────────────────────────────────────────── */}
      <div className="section-glow-divider" />
      <section id="curriculum" className="py-20 px-4 relative overflow-hidden">
        <AuroraLayer colors={["rgba(31,160,76,0.15)","rgba(43,130,217,0.18)"]} scrollY={scrollY} depth={0.03} />
        <div className="max-w-5xl mx-auto relative z-10">

          <RevealSection className="text-center mb-14">
            <span className="text-[11px] font-black tracking-[0.2em] uppercase text-ts-blue mb-3 block">Curriculum</span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">Full curriculum for Classes 3 to 8</h2>
            <p className="text-sm text-muted-foreground">Mapped to CBSE, State Board & ICSE Computer Science curriculum</p>
          </RevealSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {CURRICULUM.map((c, i) => (
              <RevealSection key={c.grade} delay={i * 75} direction={i % 2 === 0 ? "left" : "right"}>
                <Tilt3D className="h-full">
                <div
                  onClick={() => navigate("/signup")}
                  className="glass-card card-glow card-shimmer rounded-[18px] p-6 cursor-pointer relative overflow-hidden group h-full"
                >
                  <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[18px]" style={{ background: CARD_GRADIENTS[i] }} />
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{c.emoji}</span>
                      <span className="text-xs font-black px-3 py-1.5 rounded-full text-white" style={{ background: CARD_GRADIENTS[i] }}>
                        {c.title}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-semibold">{c.periods} periods</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">{c.desc}</p>
                  <span className="text-xs flex items-center gap-1 font-semibold text-ts-blue group-hover:gap-2 transition-all duration-200">
                    Preview lesson <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
                </Tilt3D>
              </RevealSection>
            ))}
          </div>

          <RevealSection>
            <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
              All lessons are mapped to national CS curriculum guidelines and are compatible with CBSE, State Board, and ICSE schools across India.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ── ROI CALCULATOR ────────────────────────────────────────────────── */}
      <div className="section-glow-divider" />
      <section className="py-20 px-4 gradient-hero relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-[0.07] blur-[130px] animate-orb-1" style={{ background: "var(--ts-blue)" }} />
        <NeonGrid color="rgba(43,130,217,0.12)" />
        <div className="max-w-3xl mx-auto relative z-10">

          <RevealSection className="text-center mb-10">
            <span className="text-[11px] font-black tracking-[0.2em] uppercase text-ts-blue mb-3 block">ROI Calculator</span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">See how much your school saves</h2>
            <p className="text-sm text-muted-foreground">Compare the TeachScript subscription vs hiring a dedicated CS teacher</p>
          </RevealSection>

          <RevealSection direction="scale">
            <RoiCalculator />
          </RevealSection>

          <RevealSection className="text-center mt-8">
            <Button
              onClick={() => navigate("/signup")}
              className="btn-neon rounded-full px-7 py-3 h-auto text-sm text-white border-0 font-bold animate-glow-pulse"
              style={{ background: "var(--gradient-blue-green)" }}
            >
              Start free 14-day trial
            </Button>
          </RevealSection>
        </div>
      </section>

      {/* ── WHY EARLY SCHOOLS CHOOSE US ───────────────────────────────────── */}
      <div className="section-glow-divider" />
      <section className="py-20 px-4 relative overflow-hidden">
        <AuroraLayer colors={["rgba(107,79,216,0.18)","rgba(43,130,217,0.15)"]} scrollY={scrollY} depth={0.035} />
        <div className="max-w-5xl mx-auto relative z-10">

          <RevealSection className="text-center mb-14">
            <span className="text-[11px] font-black tracking-[0.2em] uppercase text-ts-blue mb-3 block">Why Early Schools Choose Us</span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">Built different, from day one</h2>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {WHY_EARLY_SCHOOLS.map((t, i) => (
              <RevealSection
                key={t.name}
                delay={i * 90}
                direction={i === 0 ? "left" : i === 2 ? "right" : "up"}
              >
                <Tilt3D className="h-full">
                <div className="glass-card card-glow rounded-[18px] p-6 flex flex-col gap-4 relative overflow-hidden h-full">
                  <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: t.gradient }} />
                  <p className="text-sm text-foreground leading-relaxed flex-1">"{t.quote}"</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 text-white animate-pulse-glow"
                      style={{ background: t.gradient }}
                    >
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </div>
                </Tilt3D>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING PREVIEW ───────────────────────────────────────────────── */}
      <div className="section-glow-divider" />
      <section className="py-20 px-4 gradient-hero relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-[0.06] blur-[110px] animate-orb-3" style={{ background: "var(--ts-purple)" }} />
        <LightRays color="rgba(107,79,216,0.35)" />
        <div className="max-w-5xl mx-auto relative z-10">

          <RevealSection className="text-center mb-14">
            <span className="text-[11px] font-black tracking-[0.2em] uppercase text-ts-blue mb-3 block">Pricing</span>
            <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">Simple, school-friendly pricing</h2>
            <p className="text-sm text-muted-foreground">Annual subscription · 14-day free trial · No credit card required</p>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            {[
              { name: "Starter",  price: "₹40,000", unit: "per year",             desc: "For schools up to 300 students",      highlight: false, badge: null,            gradient: "var(--gradient-stat-blue)" },
              { name: "Standard", price: "₹250",    unit: "per student / year",   desc: "For 300–1,000 student schools",       highlight: true,  badge: "Most popular 🔥", gradient: "var(--gradient-blue-green)" },
              { name: "Premium",  price: "₹150",    unit: "per student / year",   desc: "For schools with 1,000+ students",    highlight: false, badge: null,            gradient: "var(--gradient-stat-purple)" },
            ].map((plan, i) => (
              <RevealSection key={plan.name} delay={i * 90} direction="up">
                <Tilt3D className="h-full">
                <div
                  className={`rounded-[18px] p-6 flex flex-col gap-3 relative overflow-hidden h-full glass-card ${plan.highlight ? "card-glow animate-glow-pulse" : "card-glow"}`}
                  style={plan.highlight ? { border: "1.5px solid rgba(55,138,221,0.3)" } : {}}
                >
                  <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[18px]" style={{ background: plan.gradient }} />
                  {plan.badge
                    ? <span className="text-[11px] font-black px-3 py-1.5 rounded-full w-fit text-white" style={{ background: plan.gradient }}>{plan.badge}</span>
                    : <div className="h-6" />
                  }
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">{plan.name}</p>
                    <p className="text-3xl font-black text-foreground">{plan.price}</p>
                    <p className="text-xs text-muted-foreground">{plan.unit}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{plan.desc}</p>
                  <Button
                    onClick={() => navigate("/signup")}
                    className={`btn-neon rounded-full text-xs mt-auto w-full border-0 font-bold ${plan.highlight ? "text-white" : ""}`}
                    style={plan.highlight ? { background: plan.gradient } : {}}
                    variant={plan.highlight ? "default" : "outline"}
                  >
                    {plan.name === "Premium" ? "Contact sales" : "Start free trial"}
                  </Button>
                </div>
                </Tilt3D>
              </RevealSection>
            ))}
          </div>

          <RevealSection className="text-center">
            <Button variant="ghost" onClick={() => navigate("/pricing")} className="text-sm font-semibold text-ts-blue">
              See full pricing details <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </RevealSection>
        </div>
      </section>

      {/* ── FINAL CTA BANNER ──────────────────────────────────────────────── */}
      <section className="py-16 px-4 relative overflow-hidden" style={{ background: "var(--gradient-blue-green)" }}>
        <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
        <FloatingParticles />
        <RevealSection className="relative z-10 max-w-2xl mx-auto text-center">
          <div className="text-4xl mb-4">🚀</div>
          <h2 className="text-2xl md:text-3xl font-black text-white mb-3">
            Ready to run your whole school on one platform?
          </h2>
          <p className="text-sm text-white/75 mb-8">Be among the first schools to try it. Start your free 14-day trial today.</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              onClick={() => navigate("/signup")}
              className="btn-neon rounded-full px-8 py-3 h-auto text-base font-black bg-white text-ts-blue-dark border-0 shadow-2xl hover:bg-white/90"
            >
              Start free trial <Zap className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-7 py-3 h-auto text-base font-semibold border-white/40 !text-white bg-transparent hover:bg-white/10"
              onClick={() => navigate("/for-schools")}
            >
              Learn more
            </Button>
          </div>
        </RevealSection>
      </section>

      <Footer />

      <LoginModal key={loginRole} isOpen={loginOpen} onClose={() => setLoginOpen(false)} defaultRole={loginRole} />
    </div>
  )
}
