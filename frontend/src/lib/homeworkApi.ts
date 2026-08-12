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

export interface HomeworkItem {
  _id:         string
  class_id:    string
  subject:     string
  title:       string
  description: string
  due_date:    string
  is_active:   boolean
  created_at:  string
}

export interface HomeworkWithSubmission extends HomeworkItem {
  submission: {
    _id:          string
    answer_text:  string
    feedback:     string
    marks:        number | null
    submitted_at: string
    updated_at:   string
  } | null
}

export interface HomeworkSubmission {
  _id:          string
  homework_id:  string
  student_id:   string
  student_name: string
  answer_text:  string
  feedback:     string
  marks:        number | null
  submitted_at: string
  updated_at:   string
}

// Teacher / Admin
export async function getHomework(classId: string) {
  return apiFetch<{ homework: HomeworkItem[] }>(`/api/homework?class_id=${classId}`)
}

export async function createHomework(data: {
  class_id:    string
  subject:     string
  title:       string
  description: string
  due_date:    string
}) {
  return apiFetch<{ homework: HomeworkItem }>("/api/homework", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function deleteHomework(id: string) {
  return apiFetch<{ success: boolean }>(`/api/homework/${id}`, { method: "DELETE" })
}

export async function getHomeworkSubmissions(homeworkId: string) {
  return apiFetch<{ homework: HomeworkItem; submissions: HomeworkSubmission[] }>(
    `/api/homework/${homeworkId}/submissions`
  )
}

export async function giveFeedback(subId: string, feedback: string, marks: number | null) {
  return apiFetch<{ submission: HomeworkSubmission }>(`/api/homework/submissions/${subId}`, {
    method: "PATCH",
    body: JSON.stringify({ feedback, marks }),
  })
}

// Student
export async function getStudentHomework() {
  return apiFetch<{ homework: HomeworkWithSubmission[] }>("/api/homework")
}

export async function submitHomework(homeworkId: string, answer_text: string) {
  return apiFetch<{ submission: HomeworkWithSubmission["submission"] }>(
    `/api/homework/${homeworkId}/submit`,
    { method: "POST", body: JSON.stringify({ answer_text }) }
  )
}
