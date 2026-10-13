import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getVideoStreamUrl, type ModuleItem } from "@/lib/moduleApi"

/**
 * Plays a lesson video in parts through a short stream link. The link lapses after
 * 5 minutes without use — for example a long pause in class — so when the player
 * reports an error it fetches a fresh link once and carries on from the same moment.
 */
export function LessonVideo({ item }: { item: ModuleItem }) {
  const [src, setSrc] = useState<string | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const videoRef = useRef<HTMLVideoElement>(null)
  const requestId = useRef(0)
  const refreshed = useRef(false)
  const resume = useRef<{ at: number; play: boolean } | null>(null)

  const load = useCallback(() => {
    const id = ++requestId.current
    setState("loading")
    getVideoStreamUrl(item)
      .then(url => { if (id === requestId.current) { setSrc(url); setState("ready") } })
      .catch(() => { if (id === requestId.current) setState("error") })
  }, [item])

  useEffect(() => {
    refreshed.current = false
    resume.current = null
    load()
    return () => { requestId.current++ }
  }, [load])

  function handleError() {
    if (refreshed.current) { setState("error"); return }
    refreshed.current = true
    const video = videoRef.current
    // Keep the first saved position if a refresh is already pending
    if (!resume.current) resume.current = { at: video?.currentTime ?? 0, play: video ? !video.paused : false }
    load()
  }

  function handleLoadedMetadata() {
    const video = videoRef.current
    const r = resume.current
    if (!video || !r) return
    resume.current = null
    if (r.at > 0) video.currentTime = r.at
    if (r.play) video.play().catch(() => undefined)
  }

  if (state === "error") return (
    <div role="alert" className="flex flex-col items-center justify-center h-full gap-3 text-sm text-white/80 bg-black p-4 text-center">
      <p>This video stopped loading. Please check your connection and try again.</p>
      <Button size="sm" variant="secondary" onClick={() => { refreshed.current = false; setSrc(null); load() }}>Try again</Button>
    </div>
  )

  return (
    <div className="relative flex items-center justify-center h-full bg-black">
      {state === "loading" && (
        <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading video…
        </div>
      )}
      {src && (
        <video
          ref={videoRef}
          src={src}
          controls
          preload="metadata"
          controlsList="nodownload"
          aria-label={item.label}
          className="max-h-full max-w-full"
          onError={handleError}
          onLoadedMetadata={handleLoadedMetadata}
          onPlaying={() => { refreshed.current = false }}
        />
      )}
    </div>
  )
}
