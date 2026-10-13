// ─────────────────────────────────────────────────────────────────────────────
// lib/userPhoto.ts — Loads profile photos from the address a people list sends
// (`/api/photos/<id>?v=<version>`). Each photo is fetched once per sign-in and
// shared by every place that shows it; sign-out forgets them all (sessionCaches).
// Pictures are turned into in-memory blob: addresses, which the page's security
// policy allows and which never outlive the tab.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react"
import { registerSessionCache } from "./sessionCaches"

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"
const PHOTO_PATH = /^\/api\/photos\/[a-f0-9]{24}\?v=\d+$/
const TIMEOUT_MS = 30_000

const loaded = new Map<string, Promise<string | null>>()
const objectUrls = new Set<string>()
// Changes on every sign-out, so a photo request still running at sign-out is thrown away
let session = 0

registerSessionCache(() => {
  session++
  objectUrls.forEach(url => URL.revokeObjectURL(url))
  objectUrls.clear()
  loaded.clear()
})

// Forget a failed attempt — but never a newer sign-in's request for the same photo
function forget(path: string, startedIn: number): void {
  if (startedIn === session) loaded.delete(path)
}

async function fetchPhoto(path: string): Promise<string | null> {
  const startedIn = session
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      credentials: "include",
      signal: controller.signal,
      headers: { "X-Request-ID": crypto.randomUUID() },
    })
    // No photo, or not allowed to see it — show initials and do not ask again this sign-in
    if (res.status === 404 || res.status === 403) return null
    // Busy (429) or a server problem — show initials now and try again the next time it is shown
    if (!res.ok) { forget(path, startedIn); return null }
    const blob = await res.blob()
    if (startedIn !== session || !blob.type.startsWith("image/")) return null
    const url = URL.createObjectURL(blob)
    objectUrls.add(url)
    return url
  } catch {
    // Network trouble — forget this attempt so the photo is tried again next time it is shown
    forget(path, startedIn)
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function loadUserPhoto(path: string | null | undefined): Promise<string | null> {
  if (!path || !PHOTO_PATH.test(path)) return Promise.resolve(null)
  let pending = loaded.get(path)
  if (!pending) {
    pending = fetchPhoto(path)
    loaded.set(path, pending)
  }
  return pending
}

/** The picture to show for a photo address, or null while loading / when there is none. */
export function useUserPhoto(path: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setSrc(null)
    loadUserPhoto(path).then(url => { if (active) setSrc(url) })
    return () => { active = false }
  }, [path])
  return src
}
