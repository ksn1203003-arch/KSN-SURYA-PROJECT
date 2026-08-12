// ─────────────────────────────────────────────────────────────────────────────
// pages/PricingPage.tsx — Public pricing plans page (/pricing).
// Shows Free, Standard, and Premium tiers with feature comparison and
// Razorpay payment links for school upgrades.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Navbar } from "@/components/Navbar"
import { Footer } from "@/components/Footer"
import { LoginModal } from "@/components/LoginModal"
import { Button } from "@/components/ui/button"
import { Check, ChevronDown, ChevronUp, ArrowRight, Sparkles } from "lucide-react"

const PLANS = [
  {
    name: "Starter",
    price: "\u20b940,000",
    unit: "per year",
    desc: "For schools up to 300 students",
    highlight: false,
    badge: null,
    cta: "Start free trial",
    gradient: "var(--gradient-stat-blue)",
    features: [
      "Class 6\u20138 curriculum (120 periods)",
      "1 teacher seat",
      "Basic AI assistant",
      "Quiz manager",
      "Basic admin dashboard",
      "Email support",
    ],
  },
  {
    name: "Standard",
    price: "\u20b9250",
    unit: "per student / year",
    desc: "For schools with 300\u20131,000 students",
    highlight: true,
    badge: "Most popular",
    cta: "Start free trial",
    gradient: "var(--gradient-blue-green)",
    features: [
      "Class 3\u20138 full curriculum (210 periods)",
      "Unlimited teacher seats",
      "Full AI assistant",
      "Complete admin dashboard",
      "WhatsApp Sunday Night Sync",
      "Board compliance report PDF",
      "WhatsApp support",
    ],
  },
  {
    name: "Premium",
    price: "\u20b9150",
    unit: "per student / year",
    desc: "For schools with 1,000+ students",
    highlight: false,
    badge: null,
    cta: "Contact sales",
    gradient: "var(--gradient-stat-purple)",
    features: [
      "Everything in Standard",
      "Co-branded board compliance report",
      "In-person teacher training day (1/year)",
      "ERP integration (Teachmint, MyClassCampus)",
      "Priority support",
      "Custom onboarding",
    ],
  },
]

const FAQS = [
  { q: "Can I try before paying?", a: "Yes, 14-day free trial. No credit card. Cancel anytime." },
  { q: "What happens after the trial?", a: "We will call you. If you want to continue, we raise a purchase order." },
  { q: "Do I need to buy new computers or tablets?", a: "No. Works on any existing device. Lessons also download for offline use." },
  { q: "Is this aligned to CBSE and State Board curriculum?", a: "Yes. Every lesson is structured for Computer Science teaching across CBSE, State Board, and ICSE schools. CBSE schools get full CT&AI skill code mapping." },
  { q: "What if my teacher doesn't know CS?", a: "That is exactly who this is for. The whisper script tells her word-by-word what to say." },
  { q: "Is student data safe?", a: "Yes. We comply with DPDP Act 2023. No behavioral tracking. No ads. No student PII for Class 3\u20135." },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass-card rounded-[12px] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-4 text-left"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

export function PricingPage() {
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

      {/* Hero — gradient */}
      <section className="gradient-hero py-14 px-4 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-blue)" }} />
        <div className="relative z-10">
          <h1 className="text-3xl font-medium text-foreground mb-3">Simple, school-friendly pricing</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Annual subscription. 14-day free trial on all plans. No credit card required to start.
          </p>
        </div>
      </section>

      {/* Pricing cards — glass with gradient top borders */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan, i) => (
              <div
                key={plan.name}
                className={`rounded-[14px] p-6 flex flex-col relative overflow-hidden animate-fade-in-up ${plan.highlight ? "glass-card shadow-lg scale-[1.03]" : "glass-card"}`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[14px]" style={{ background: plan.gradient }} />
                {plan.badge ? (
                  <span className="text-[11px] font-medium px-2.5 py-1 rounded-[20px] w-fit mb-3 text-white" style={{ background: plan.gradient }}>
                    <Sparkles className="w-3 h-3 inline mr-1" />{plan.badge}
                  </span>
                ) : (
                  <div className="h-5 mb-3" />
                )}

                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1">{plan.name}</p>
                  <p className="text-3xl font-medium text-foreground">{plan.price}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{plan.unit}</p>
                  <p className="text-xs text-muted-foreground mt-2">{plan.desc}</p>
                </div>

                <ul className="flex flex-col gap-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-foreground">
                      <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-ts-green" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => plan.cta === "Contact sales" ? navigate("/for-schools") : navigate("/signup")}
                  className={`rounded-[20px] text-sm w-full border-0 ${plan.highlight ? "text-white" : ""}`}
                  style={plan.highlight ? { background: plan.gradient } : {}}
                  variant={plan.highlight ? "default" : "outline"}
                >
                  {plan.cta} {plan.cta !== "Contact sales" && <ArrowRight className="w-4 h-4 ml-1" />}
                </Button>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-6">
            All prices exclusive of GST. Annual subscription billed upfront via purchase order or Razorpay.
          </p>
        </div>
      </section>

      {/* FAQ — glass cards */}
      <section className="gradient-hero py-16 px-4 relative overflow-hidden">
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: "var(--ts-amber)" }} />
        <div className="max-w-2xl mx-auto relative z-10">
          <h2 className="text-2xl font-medium text-foreground text-center mb-8">Frequently asked questions</h2>
          <div className="flex flex-col gap-3">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>

          <div className="mt-10 glass-card rounded-[14px] p-6 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: "var(--gradient-blue-green)" }} />
            <h3 className="text-base font-medium text-foreground mb-2">Still have questions?</h3>
            <p className="text-sm text-muted-foreground mb-4">We reply within 2 hours during school hours (Mon–Sat, 8am–6pm IST)</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="outline" className="rounded-[20px] text-xs glass-card border-0">
                WhatsApp us
              </Button>
              <Button onClick={() => navigate("/for-schools")} className="rounded-[20px] text-xs text-white border-0" style={{ background: "var(--gradient-blue-green)" }}>
                Request a demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <LoginModal key={loginRole} isOpen={loginOpen} onClose={() => setLoginOpen(false)} defaultRole={loginRole} />
    </div>
  )
}
