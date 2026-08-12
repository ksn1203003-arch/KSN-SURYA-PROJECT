const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:4000"

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T | { error: string; requestId?: string }> {
  const requestId = crypto.randomUUID()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      ...options,
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Request-ID": requestId, ...(options.headers ?? {}) },
    })
    const data = await res.json() as T | { error: string }
    if (!res.ok) return { error: (data as { error?: string }).error ?? "Request failed", requestId }
    return data
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { error: "Request timed out. Please try again.", requestId }
    return { error: "Network error. Please check your connection.", requestId }
  } finally {
    clearTimeout(timer)
  }
}

export interface DeletionRequest {
  _id:        string
  user_id:    string
  user_name:  string
  user_email: string
  user_role:  string
  reason:     string
  status:     "pending" | "approved" | "rejected"
  reviewed_at?: string
  created_at: string
}

export async function requestDataDeletion(reason: string) {
  return apiFetch<{ success: boolean; request_id: string }>("/api/dpdp/deletion-request", {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
}

export async function getDeletionRequests() {
  return apiFetch<{ requests: DeletionRequest[] }>("/api/dpdp/deletion-requests")
}

export async function reviewDeletionRequest(id: string, action: "approve" | "reject") {
  return apiFetch<{ success: boolean; status: string }>(`/api/dpdp/deletion-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  })
}
