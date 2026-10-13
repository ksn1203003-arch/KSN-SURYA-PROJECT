import { describe, it, expect } from "vitest"
import {
  DASHBOARD_ROLES, dashboardPathForRole, getSafeRedirectPath, slugifySubject, subjectSlugs,
  slugForSubject, findSubjectBySlug,
} from "@/lib/dashboardRoutes"
import { parseStudentPath, studentPath, STUDENT_ROOT } from "@/lib/studentRoutes"

describe("dashboardPathForRole", () => {
  it("maps each role to its own dashboard", () => {
    expect(dashboardPathForRole("student")).toBe("/student/dashboard")
    expect(dashboardPathForRole("teacher")).toBe("/teacher/dashboard")
    expect(dashboardPathForRole("parent")).toBe("/parent/dashboard")
    expect(dashboardPathForRole("admin")).toBe("/admin/dashboard")
    expect(dashboardPathForRole("super_admin")).toBe("/admin/dashboard")
  })
})

describe("getSafeRedirectPath", () => {
  it("accepts the dashboard root, and any section below it for the student dashboard", () => {
    expect(getSafeRedirectPath("/student/dashboard", "student")).toBe("/student/dashboard")
    expect(getSafeRedirectPath("/student/dashboard/lessons/computer-science", "student"))
      .toBe("/student/dashboard/lessons/computer-science")
    expect(getSafeRedirectPath("/teacher/dashboard", "admin")).toBe("/teacher/dashboard")
  })

  it("only allows sub-paths on dashboards whose sections have URLs", () => {
    expect(getSafeRedirectPath("/teacher/dashboard/marks", "admin")).toBeNull()
    expect(getSafeRedirectPath("/parent/dashboard/marks")).toBeNull()
    expect(getSafeRedirectPath("/admin/dashboard/classes", "admin")).toBeNull()
  })

  it("accepts a dashboard path when no role is given (logged-out visitor)", () => {
    expect(getSafeRedirectPath("/student/dashboard/homework")).toBe("/student/dashboard/homework")
    expect(getSafeRedirectPath("/parent/dashboard")).toBe("/parent/dashboard")
  })

  it("rejects another role's dashboard so the caller falls back to the user's own", () => {
    expect(getSafeRedirectPath("/admin/dashboard", "teacher")).toBeNull()
    expect(getSafeRedirectPath("/student/dashboard/lessons", "teacher")).toBeNull()
    expect(getSafeRedirectPath("/teacher/dashboard", "student")).toBeNull()
    expect(getSafeRedirectPath("/student/dashboard", "parent")).toBeNull()
  })

  it("accepts a real deep link whose subject is named in Hindi", () => {
    expect(getSafeRedirectPath("/student/dashboard/lessons/हिंदी", "student"))
      .toBe("/student/dashboard/lessons/हिंदी")
  })

  it("rejects empty, missing and over-long values", () => {
    expect(getSafeRedirectPath(null)).toBeNull()
    expect(getSafeRedirectPath("")).toBeNull()
    expect(getSafeRedirectPath(`/student/dashboard/${"a".repeat(300)}`)).toBeNull()
  })

  it("rejects forged redirects", () => {
    const forged = [
      "//evil.com",
      "//evil.com/student/dashboard",
      "/\\evil.com",
      "/student/dashboard\\..\\evil",
      "https://evil.com",
      "https://evil.com/student/dashboard",
      "javascript:alert(1)",
      "/student/..%2f..",
      "/student/dashboard/..%2f..%2fevil",
      "/student/dashboard/%5cevil",
      "/student/dashboard/../../evil",
      "/student/dashboard/./x",
      "/student/dashboard?next=//evil.com",
      "/student/dashboard#x",
      "/student/dashboard/%2e%2e/%2e%2e/evil",
      "/student/dashboard/%252f%252fevil",
    ]
    for (const value of forged) expect(getSafeRedirectPath(value, "student"), value).toBeNull()
  })

  it("matches whole path segments, not prefixes", () => {
    expect(getSafeRedirectPath("/studentevil")).toBeNull()
    expect(getSafeRedirectPath("/student/dashboardevil")).toBeNull()
    expect(getSafeRedirectPath("/student")).toBeNull()
    expect(getSafeRedirectPath("/pricing")).toBeNull()
    expect(getSafeRedirectPath("/login")).toBeNull()
  })

  it("rejects malformed percent-encoding instead of throwing", () => {
    expect(getSafeRedirectPath("/student/dashboard/%E0%A4%A")).toBeNull()
  })
})

describe("subject slugs", () => {
  it("turns subject names into readable lowercase slugs", () => {
    expect(slugifySubject("Computer Science")).toBe("computer-science")
    expect(slugifySubject("  Maths & Logic! ")).toBe("maths-logic")
  })

  it("keeps non-Latin subject names usable", () => {
    expect(slugifySubject("हिंदी")).toBe("हिंदी")
  })

  it("finds the subject for a slug, and null when it does not exist", () => {
    const subjects = ["English", "Computer Science", "Maths"]
    expect(findSubjectBySlug("computer-science", subjects)).toBe("Computer Science")
    expect(findSubjectBySlug("zzz", subjects)).toBeNull()
  })

  it("gives subjects that slugify the same their own URL, so each one stays reachable", () => {
    const subjects = ["C", "C++", "C#", "Maths"]
    expect(subjectSlugs(subjects)).toEqual(["c", "c-2", "c-3", "maths"])
    expect(findSubjectBySlug("c-2", subjects)).toBe("C++")
    expect(slugForSubject("C#", subjects)).toBe("c-3")
  })

  it("never gives two subjects the same slug, even when a generated suffix matches a real subject", () => {
    const subjects = ["C", "C+", "C 2"]
    const slugs = subjectSlugs(subjects)
    expect(new Set(slugs).size).toBe(subjects.length)
    expect(slugs).toEqual(["c", "c-2", "c-2-2"])
    for (const subject of subjects) {
      expect(findSubjectBySlug(slugForSubject(subject, subjects), subjects)).toBe(subject)
    }
  })

  it("gives a name with no letters or digits a usable slug", () => {
    expect(subjectSlugs(["!!!"])).toEqual(["subject"])
    expect(findSubjectBySlug("subject", ["!!!"])).toBe("!!!")
  })
})

describe("DASHBOARD_ROLES", () => {
  it("lets admins open the teacher dashboard but not students the admin dashboard", () => {
    expect(DASHBOARD_ROLES.teacher).toContain("admin")
    expect(DASHBOARD_ROLES.admin).not.toContain("student")
    expect(DASHBOARD_ROLES.student).toEqual(["student"])
  })
})

describe("parseStudentPath / studentPath", () => {
  it("treats the bare dashboard address as the Overview", () => {
    expect(parseStudentPath("/student/dashboard")).toEqual({ kind: "overview" })
    expect(parseStudentPath("/student/dashboard/")).toEqual({ kind: "overview" })
  })

  it("parses a section and a subject", () => {
    expect(parseStudentPath("/student/dashboard/homework"))
      .toEqual({ kind: "section", section: "homework", subjectSlug: null })
    expect(parseStudentPath("/student/dashboard/lessons/computer-science"))
      .toEqual({ kind: "section", section: "lessons", subjectSlug: "computer-science" })
  })

  it("flags unknown sections, extra segments and subjects outside Lessons", () => {
    expect(parseStudentPath("/student/dashboard/nonsense")).toEqual({ kind: "unknown" })
    expect(parseStudentPath("/student/dashboard/lessons/a/b")).toEqual({ kind: "unknown" })
    expect(parseStudentPath("/student/dashboard/homework/x")).toEqual({ kind: "unknown" })
    expect(parseStudentPath("/teacher/dashboard/marks")).toEqual({ kind: "unknown" })
    expect(parseStudentPath("/student/dashboard/lessons/%E0%A4%A")).toEqual({ kind: "unknown" })
  })

  it("builds addresses that parse back to the same route", () => {
    expect(studentPath("overview")).toBe(STUDENT_ROOT)
    expect(studentPath("marks")).toBe("/student/dashboard/marks")
    expect(parseStudentPath(studentPath("lessons", "computer-science")))
      .toEqual({ kind: "section", section: "lessons", subjectSlug: "computer-science" })
    expect(parseStudentPath(studentPath("lessons", "हिंदी")))
      .toEqual({ kind: "section", section: "lessons", subjectSlug: "हिंदी" })
  })
})
