// ─────────────────────────────────────────────────────────────────────────────
// lib/moduleApi.ts — API functions for lesson module management.
// Module and item CRUD, file upload with progress, reordering, and
// student item-viewed tracking.
// ─────────────────────────────────────────────────────────────────────────────
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

async function authFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const requestId = crypto.randomUUID()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        ...(options.headers ?? {}),
      },
    })
    const data = await res.json()
    if (!res.ok) {
      return { error: (data as { error?: string }).error ?? `Request failed (${res.status})`, requestId } as T
    }
    return data as T
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { error: "Request timed out. Please try again.", requestId } as T
    return { error: err instanceof Error ? err.message : "Network error", requestId } as T
  } finally {
    clearTimeout(timer)
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type ItemType = "file" | "link"
export type LinkType = "gdrive" | "youtube" | "other"

export interface ModuleItem {
  _id: string
  order: number
  type: ItemType
  label: string
  // file
  gridfs_id: string | null
  pdf_gridfs_id: string | null  // pre-converted PDF for PPTX/PPT inline viewing
  // PPT/PPTX only: converted once at upload. null on items uploaded before this field existed.
  conversion_status?: "pending" | "ready" | "failed" | null
  file_name: string | null
  file_type: string | null
  file_size: number | null
  // link
  link_url: string | null
  link_type: LinkType | null
}

export interface LessonModule {
  _id: string
  school_id: string
  class_id: string
  subject: string
  title: string
  order: number
  created_by: string
  items: ModuleItem[]
  created_at: string
  updated_at: string
}

// ── API calls ──────────────────────────────────────────────────────────────────

export async function getModuleCounts(classId: string): Promise<Record<string, number>> {
  const res = await authFetch<{ counts?: Record<string, number> }>(`/api/modules/counts?class_id=${encodeURIComponent(classId)}`)
  return res.counts ?? {}
}

export async function getModules(classId: string, subject: string): Promise<{
  modules: LessonModule[]
  viewedItemIds: string[]
} | { error: string }> {
  return authFetch<{ modules: LessonModule[]; viewedItemIds: string[] } | { error: string }>(`/api/modules?class_id=${encodeURIComponent(classId)}&subject=${encodeURIComponent(subject)}`)
}

export async function createModule(classId: string, subject: string, title?: string): Promise<{
  module: LessonModule
} | { error: string }> {
  return authFetch<{ module: LessonModule } | { error: string }>("/api/modules", {
    method: "POST",
    body: JSON.stringify({ class_id: classId, subject, title }),
  })
}

export async function renameModule(moduleId: string, title: string): Promise<{
  module: LessonModule
} | { error: string }> {
  return authFetch<{ module: LessonModule } | { error: string }>(`/api/modules/${moduleId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  })
}

export async function deleteModule(moduleId: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch<{ success: boolean } | { error: string }>(`/api/modules/${moduleId}`, { method: "DELETE" })
}

export async function getModuleDeleteImpact(moduleId: string): Promise<
  { certificate_count: number } | { error: string }
> {
  return authFetch<{ certificate_count: number } | { error: string }>(`/api/modules/${moduleId}/delete-impact`)
}

export async function reorderModules(ids: string[]): Promise<{ success: boolean } | { error: string }> {
  return authFetch<{ success: boolean } | { error: string }>("/api/modules/reorder", {
    method: "PUT",
    body: JSON.stringify({ ids }),
  })
}

// Upload up to 10 files at once — multipart/form-data (no Content-Type header, browser sets boundary)
export async function uploadFiles(moduleId: string, files: File[]): Promise<{
  items: ModuleItem[]
} | { error: string }> {
  try {
    const form = new FormData()
    files.forEach(f => form.append("files", f))
    const res = await fetch(`${BACKEND}/api/modules/${moduleId}/items`, {
      method: "POST",
      credentials: "include",
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      return { error: body.error ?? `Upload failed (${res.status})` }
    }
    return res.json()
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error during upload" }
  }
}

export async function addLink(moduleId: string, label: string, link_url: string): Promise<{
  item: ModuleItem
} | { error: string }> {
  return authFetch<{ item: ModuleItem } | { error: string }>(`/api/modules/${moduleId}/items`, {
    method: "POST",
    body: JSON.stringify({ label, link_url }),
  })
}

export async function renameItem(moduleId: string, itemId: string, label: string): Promise<{
  item: ModuleItem
} | { error: string }> {
  return authFetch<{ item: ModuleItem } | { error: string }>(`/api/modules/${moduleId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ label }),
  })
}

export async function deleteItem(moduleId: string, itemId: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch<{ success: boolean } | { error: string }>(`/api/modules/${moduleId}/items/${itemId}`, { method: "DELETE" })
}

export async function reorderItems(moduleId: string, ids: string[]): Promise<{ success: boolean } | { error: string }> {
  return authFetch<{ success: boolean } | { error: string }>(`/api/modules/${moduleId}/items/reorder`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
  })
}

export async function markItemViewed(moduleId: string, itemId: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch<{ success: boolean } | { error: string }>(`/api/modules/${moduleId}/items/${itemId}/viewed`, { method: "POST" })
}

export async function unmarkItemViewed(moduleId: string, itemId: string): Promise<{ success: boolean } | { error: string }> {
  return authFetch<{ success: boolean } | { error: string }>(`/api/modules/${moduleId}/items/${itemId}/viewed`, { method: "DELETE" })
}

// Fetch a backend file as a blob URL.
// 1. Calls /api/files/token to get a short-lived one-time token (auth via cookie).
// 2. Fetches the file with ?ft= so the JWT never appears in a URL.
// 3. Returns a blob: URL safe to use in <img>, <video>, <iframe>, or <a download>.
export async function fetchAsBlobUrl(url: string): Promise<string> {
  const gridfsIdMatch = url.match(/\/api\/files\/([a-f0-9]{24})/)
  if (gridfsIdMatch) {
    try {
      const tokenRes = await fetch(`${BACKEND}/api/files/token`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gridfsId: gridfsIdMatch[1] }),
      })
      if (tokenRes.ok) {
        const { fileToken } = await tokenRes.json() as { fileToken: string }
        const fileUrl = `${BACKEND}/api/files/${gridfsIdMatch[1]}?ft=${encodeURIComponent(fileToken)}`
        const res = await fetch(fileUrl)
        if (!res.ok) throw new Error(`File fetch failed: ${res.status}`)
        const blob = await res.blob()
        return URL.createObjectURL(blob)
      }
    } catch { /* fall through to credentials fetch */ }
  }

  // Fallback: direct fetch with cookie credentials
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`File fetch failed: ${res.status}`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

// Lesson videos play in parts: the <video> player asks for one piece at a time using a
// short reusable link, so a whole video is never downloaded before it starts and seeking
// works. Every other file (PDF, slides, images, documents) keeps the one-time whole download.
const STREAMED_VIDEO_TYPES = new Set(["mp4", "webm"])

export function isStreamedVideo(item: ModuleItem): boolean {
  return item.type === "file" && !!item.gridfs_id && STREAMED_VIDEO_TYPES.has((item.file_type ?? "").toLowerCase())
}

/** Address for playing a lesson video in parts. Throws when the video cannot be prepared. */
export async function getVideoStreamUrl(item: ModuleItem): Promise<string> {
  if (!isStreamedVideo(item) || !item.gridfs_id) throw new Error("Not a lesson video")
  const res = await authFetch<{ streamToken: string } | { error: string }>("/api/files/stream-token", {
    method: "POST",
    body: JSON.stringify({ gridfsId: item.gridfs_id }),
  })
  if ("error" in res) throw new Error(res.error)
  return `${BACKEND}/api/files/${item.gridfs_id}?st=${encodeURIComponent(res.streamToken)}`
}

// Returns the backend URL for a file item (no auth token — use with fetchAsBlobUrl)
// or an embed URL for link items (Google Drive, YouTube, external).
export function getViewerUrl(item: ModuleItem): string {
  if (item.type === "file" && item.gridfs_id) {
    // PPTX/PPT: prefer pre-converted PDF for inline viewing
    if ((item.file_type === "pptx" || item.file_type === "ppt") && item.pdf_gridfs_id) {
      return `${BACKEND}/api/files/${item.pdf_gridfs_id}`
    }
    return `${BACKEND}/api/files/${item.gridfs_id}`
  }
  if (item.type === "link" && item.link_url) {
    if (item.link_type === "gdrive") return driveEmbedUrl(item.link_url)
    if (item.link_type === "youtube") return youtubeEmbedUrl(item.link_url)
    return item.link_url
  }
  return ""
}

// Convert Google Drive share URL → embed/preview URL
export function driveEmbedUrl(url: string): string {
  const slidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([^/?#]+)/)
  if (slidesMatch) return `https://docs.google.com/presentation/d/${slidesMatch[1]}/embed?start=false&loop=false&delayms=3000`

  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([^/?#]+)/)
  if (docsMatch) return `https://docs.google.com/document/d/${docsMatch[1]}/preview`

  const sheetsMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([^/?#]+)/)
  if (sheetsMatch) return `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/preview`

  const fileMatch = url.match(/\/file\/d\/([^/?#]+)/)
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`

  const openMatch = url.match(/[?&]id=([^&]+)/)
  if (openMatch) return `https://drive.google.com/file/d/${openMatch[1]}/preview`

  return url
}

// Convert YouTube URL → embed URL
export function youtubeEmbedUrl(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (match) return `https://www.youtube.com/embed/${match[1]}`
  return url
}

// PPTX/PPT without a converted PDF (LibreOffice not available) — show download card
export type SlideConversionState = "converting" | "ready" | "failed"

/**
 * Viewing state of a PPT/PPTX item, or null for any other item. "converting" means the
 * one-time conversion is still running — the screen shows a status and a manual
 * "Check again" button; it never polls the server. Older items with no PDF and no status
 * were never converted, so they are treated as "failed" (the teacher re-uploads them).
 */
export function slideConversionState(item: ModuleItem): SlideConversionState | null {
  if (item.type !== "file" || (item.file_type !== "pptx" && item.file_type !== "ppt")) return null
  if (item.pdf_gridfs_id) return "ready"
  if (item.conversion_status === "pending") return "converting"
  return "failed"
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Icon-mapping JSX for these moved to components/LessonItemTypeIcon.tsx
// (LessonFileTypeIcon / LessonLinkTypeIcon) — this file is API/data logic only.
