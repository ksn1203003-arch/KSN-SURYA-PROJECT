// ─────────────────────────────────────────────────────────────────────────────
// components/mode-toggle.tsx — Light / dark theme toggle button.
// Reads and sets the theme via ThemeProvider. Shown in the topbar of every dashboard.
// Exports: ModeToggle
// ─────────────────────────────────────────────────────────────────────────────
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <Sun className="h-[1.2rem] w-[1.2rem] transition-transform hover:rotate-45" />
      ) : (
        <Moon className="h-[1.2rem] w-[1.2rem] transition-transform hover:-rotate-12" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
