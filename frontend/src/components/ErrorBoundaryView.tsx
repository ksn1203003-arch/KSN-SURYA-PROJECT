import { Component, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State { hasError: boolean }

export class ErrorBoundaryView extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const title = this.props.fallbackTitle ?? "This section couldn't load"

    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="text-xs text-muted-foreground">An unexpected error occurred. Try reloading the page.</p>
        <Button variant="outline" size="sm" onClick={() => this.setState({ hasError: false })}>
          Try again
        </Button>
      </div>
    )
  }
}
