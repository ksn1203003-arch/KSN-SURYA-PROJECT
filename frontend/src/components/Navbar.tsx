// ─────────────────────────────────────────────────────────────────────────────
// components/Navbar.tsx — Public site top navigation bar.
// Shown on the landing page and marketing pages. Includes mobile hamburger
// menu, language toggle (EN/HI), and a login button.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Menu, X, Globe, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"

interface NavbarProps {
  onLoginClick?: (role?: "student" | "teacher" | "admin") => void
  lang?: "en" | "hi"
  onLangToggle?: () => void
  onParentLoginClick?: () => void
}

export function Navbar({ onLoginClick, lang = "en", onLangToggle, onParentLoginClick }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const navigate = useNavigate()

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline) }
  }, [])

  const navLinks = [
    { label: lang === "hi" ? "होम" : "Home", to: "/" },
    { label: lang === "hi" ? "यह कैसे काम करता है" : "How it works", to: "/#how-it-works" },
    { label: lang === "hi" ? "पाठ्यक्रम" : "Curriculum", to: "/#curriculum" },
    { label: lang === "hi" ? "मूल्य निर्धारण" : "Pricing", to: "/pricing" },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md w-full border-b border-border">
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white" style={{ backgroundColor: "var(--ts-red)" }}>
          <WifiOff className="w-3.5 h-3.5" />
          You are offline. Cached lessons are still available.
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-5 h-5 rounded-full bg-ts-blue" />
            <span className="text-base font-medium text-foreground">TeachScript</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop right actions */}
          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={onLangToggle}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              <Globe className="w-3 h-3" />
              {lang === "en" ? "EN | हि" : "हि | EN"}
            </button>
            <ModeToggle />
            <Button
              variant="outline"
              size="sm"
              className="rounded-[20px] text-xs h-7 px-3 text-ts-purple"
              style={{ borderColor: "#534AB7" }}
              onClick={() => onLoginClick?.("student")}
            >
              {lang === "hi" ? "छात्र" : "Student"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-[20px] text-xs h-7 px-3 text-ts-blue"
              style={{ borderColor: "#378ADD" }}
              onClick={() => onLoginClick?.("teacher")}
            >
              {lang === "hi" ? "शिक्षक" : "Teacher"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-[20px] text-xs h-7 px-3 text-ts-green"
              style={{ borderColor: "#639922" }}
              onClick={() => onLoginClick?.("admin")}
            >
              {lang === "hi" ? "प्रशासक" : "Admin"}
            </Button>
            <button
              onClick={onParentLoginClick ?? (() => navigate("/login?role=parent"))}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
            >
              {lang === "hi" ? "अभिभावक" : "Parent"}
            </button>
            <Button
              size="sm"
              className="rounded-[20px] text-xs h-7 px-3 bg-ts-blue text-white"
              onClick={() => navigate("/signup")}
            >
              {lang === "hi" ? "साइन अप" : "Sign up"}
            </Button>
          </div>

          {/* Mobile hamburger */}
          <div className="flex lg:hidden items-center gap-2">
            <ModeToggle />
            <button
              className="p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-card px-4 pb-4 border-t border-border">
          <div className="flex flex-col gap-2 pt-3">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm text-muted-foreground hover:text-foreground py-1"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-wrap gap-2 mt-2">
              <Button variant="outline" size="sm" className="rounded-[20px] text-xs text-ts-purple" style={{ borderColor: "#534AB7" }} onClick={() => { onLoginClick?.("student"); setMobileOpen(false) }}>Student</Button>
              <Button variant="outline" size="sm" className="rounded-[20px] text-xs text-ts-blue" style={{ borderColor: "#378ADD" }} onClick={() => { onLoginClick?.("teacher"); setMobileOpen(false) }}>Teacher</Button>
              <Button variant="outline" size="sm" className="rounded-[20px] text-xs text-ts-green" style={{ borderColor: "#639922" }} onClick={() => { onLoginClick?.("admin"); setMobileOpen(false) }}>Admin</Button>
              <Button variant="ghost" size="sm" className="rounded-[20px] text-xs text-muted-foreground" onClick={() => { (onParentLoginClick ?? (() => navigate("/login?role=parent")))(); setMobileOpen(false) }}>Parent</Button>
              <Button size="sm" className="rounded-[20px] text-xs bg-ts-blue text-white" onClick={() => { navigate("/signup"); setMobileOpen(false) }}>Sign up</Button>
            </div>
            <button onClick={onLangToggle} className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Globe className="w-3 h-3" /> EN | हि
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
