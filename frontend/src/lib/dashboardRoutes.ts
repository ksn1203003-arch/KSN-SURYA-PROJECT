// ─────────────────────────────────────────────────────────────────────────────
// dashboardRoutes.ts
// Single source of truth for dashboard URLs and for which in-app paths are safe
// ?redirect= targets. Used by RequireAuth (App.tsx), LoginPage and SetPasswordPage so
// the three can never drift apart.
// Exports: DASHBOARD_ROLES, dashboardPathForRole(), getSafeRedirectPath(), slugifySubject(),
//          subjectSlugs(), slugForSubject(), findSubjectBySlug(), WRONG_ROLE_NOTICE
// ─────────────────────────────────────────────────────────────────────────────

type DashboardKey = "student" | "teacher" | "admin" | "parent"

const DASHBOARD_ROOTS: Record<DashboardKey, string> = {
  student: "/student/dashboard",
  teacher: "/teacher/dashboard",
  admin: "/admin/dashboard",
  parent: "/parent/dashboard",
}

// Roles allowed to open each dashboard. App.tsx passes these same lists to RequireAuth, so the route
// guard and the ?redirect= check can never disagree.
export const DASHBOARD_ROLES: Record<DashboardKey, readonly string[]> = {
  student: ["student"],
  teacher: ["teacher", "admin", "super_admin"],
  admin: ["admin", "super_admin"],
  parent: ["parent"],
}

// Dashboards whose sections have their own URLs (/student/dashboard/lessons …). A role is added here
// when its dashboard is migrated; until then only its bare dashboard address is a valid redirect target.
const DASHBOARDS_WITH_SECTIONS: readonly DashboardKey[] = ["student"]

const MAX_REDIRECT_LENGTH = 200

export const WRONG_ROLE_NOTICE = "That page isn't available for your account."

export function dashboardPathForRole(role: string): string {
  if (role === "student") return DASHBOARD_ROOTS.student
  if (role === "teacher") return DASHBOARD_ROOTS.teacher
  if (role === "parent") return DASHBOARD_ROOTS.parent
  return DASHBOARD_ROOTS.admin
}

function hasUnsafeShape(candidate: string): boolean {
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return true
  if (candidate.includes("\\") || candidate.includes("://")) return true
  if (candidate.includes("?") || candidate.includes("#")) return true
  if (/%2f|%5c/i.test(candidate)) return true
  if (/\s/.test(candidate)) return true
  for (const ch of candidate) {
    if (ch.charCodeAt(0) < 32) return true
  }
  return candidate.split("/").some(segment => segment === "." || segment === "..")
}

// Returns the path if it is a dashboard path the given role may open, otherwise null.
// Matches whole path segments (so "/studentevil" is rejected), checks both the raw and the
// URL-decoded form, and only ever returns a path on this site — never a full URL.
// When `role` is given, a path that belongs to a different role's dashboard is rejected so the
// caller falls back to the user's own dashboard instead of showing an error.
export function getSafeRedirectPath(raw: string | null | undefined, role?: string): string | null {
  if (!raw || raw.length > MAX_REDIRECT_LENGTH) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (hasUnsafeShape(raw) || hasUnsafeShape(decoded)) return null

  const key = (Object.keys(DASHBOARD_ROOTS) as DashboardKey[]).find(k => {
    const root = DASHBOARD_ROOTS[k]
    return raw === root || (DASHBOARDS_WITH_SECTIONS.includes(k) && raw.startsWith(`${root}/`))
  })
  if (!key) return null
  if (role && !DASHBOARD_ROLES[key].includes(role)) return null
  return raw
}

// "Computer Science" -> "computer-science". Unicode-aware (letters, combining marks, digits) so
// subjects named in Hindi keep their vowel signs and still get a readable slug.
export function slugifySubject(subject: string): string {
  return subject
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}

// The URL slug of every subject in a list, in the same order. Subjects that slugify the same
// ("C" and "C++") get -2, -3 … (skipping any slug already taken, e.g. by a subject literally named
// "C 2") and a name with no letters or digits becomes "subject", so every subject stays reachable by
// its own URL. Slugs follow list order, so reordering the subjects can change which one gets a suffix.
export function subjectSlugs(subjects: readonly string[]): string[] {
  const used = new Set<string>()
  return subjects.map(subject => {
    const base = slugifySubject(subject) || "subject"
    let slug = base
    for (let attempt = 2; used.has(slug); attempt++) slug = `${base}-${attempt}`
    used.add(slug)
    return slug
  })
}

export function slugForSubject(subject: string, subjects: readonly string[]): string {
  const index = subjects.indexOf(subject)
  return index === -1 ? (slugifySubject(subject) || "subject") : subjectSlugs(subjects)[index]
}

export function findSubjectBySlug(slug: string, subjects: readonly string[]): string | null {
  const index = subjectSlugs(subjects).indexOf(slug)
  return index === -1 ? null : subjects[index]
}
