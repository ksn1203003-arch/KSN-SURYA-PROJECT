// ─────────────────────────────────────────────────────────────────────────────
// studentRoutes.ts
// Maps the student dashboard's sections to URLs under /student/dashboard.
//   /student/dashboard                         -> Overview
//   /student/dashboard/lessons                 -> subject list
//   /student/dashboard/lessons/computer-science -> one subject
// Only the section and the subject are in the URL. Module, quiz player and result
// screens stay in component state, and no ids or personal data ever go in a path.
// Exports: STUDENT_ROOT, parseStudentPath(), studentPath()
// ─────────────────────────────────────────────────────────────────────────────

export const STUDENT_ROOT = "/student/dashboard"

export const STUDENT_SECTIONS = [
  "lessons", "timetable", "quizzes", "homework", "certificates",
  "attendance", "live-coding", "teachers", "settings", "marks",
] as const

export type StudentSection = (typeof STUDENT_SECTIONS)[number]

export type StudentRoute =
  | { kind: "overview" }
  | { kind: "section"; section: StudentSection; subjectSlug: string | null }
  | { kind: "unknown" }

function isStudentSection(value: string): value is StudentSection {
  return (STUDENT_SECTIONS as readonly string[]).includes(value)
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

export function parseStudentPath(pathname: string): StudentRoute {
  if (pathname !== STUDENT_ROOT && !pathname.startsWith(`${STUDENT_ROOT}/`)) return { kind: "unknown" }
  const segments = pathname.slice(STUDENT_ROOT.length).split("/").filter(Boolean)
  if (segments.length === 0) return { kind: "overview" }

  const decoded = segments.map(safeDecode)
  if (decoded.some(segment => segment === null)) return { kind: "unknown" }
  const [section, subjectSlug, ...extra] = decoded as string[]

  if (!isStudentSection(section) || extra.length > 0) return { kind: "unknown" }
  if (subjectSlug !== undefined) {
    if (section !== "lessons" || subjectSlug === "") return { kind: "unknown" }
    return { kind: "section", section, subjectSlug }
  }
  return { kind: "section", section, subjectSlug: null }
}

export function studentPath(section: StudentSection | "overview", subjectSlug?: string | null): string {
  if (section === "overview") return STUDENT_ROOT
  if (section === "lessons" && subjectSlug) return `${STUDENT_ROOT}/lessons/${encodeURIComponent(subjectSlug)}`
  return `${STUDENT_ROOT}/${section}`
}
