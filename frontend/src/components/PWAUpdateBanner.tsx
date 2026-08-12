import { useRegisterSW } from "virtual:pwa-register/react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PWAUpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl px-4 py-3 bg-background border shadow-lg text-sm">
      <RefreshCw className="w-4 h-4 text-primary shrink-0" />
      <span className="text-foreground font-medium">A new version is available</span>
      <Button
        size="sm"
        className="rounded-full text-xs"
        onClick={() => updateServiceWorker(true)}
      >
        Update now
      </Button>
    </div>
  )
}
