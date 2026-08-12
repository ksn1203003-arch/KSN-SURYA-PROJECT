// ─────────────────────────────────────────────────────────────────────────────
// components/ErrorBoundary.tsx — React error boundary with a fallback UI.
// Catches unhandled render errors anywhere in the tree and shows a friendly
// "Something went wrong" message instead of a blank screen.
// ─────────────────────────────────────────────────────────────────────────────
import { Component, type ReactNode } from "react"

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(err: Error) {
    console.error("[TeachScript Error Boundary]", err)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "var(--background)" }}
      >
        <div className="max-w-xs w-full text-center flex flex-col items-center gap-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: "rgba(226,75,74,0.10)" }}
          >
            ⚠️
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-foreground">Something went wrong</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              An unexpected error occurred. Reloading the page will fix this in most cases.
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#534AB7,#378ADD)" }}
          >
            Reload page
          </button>

          <a
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Go to login instead
          </a>
        </div>
      </div>
    )
  }
}
