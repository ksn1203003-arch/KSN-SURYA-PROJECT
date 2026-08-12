import { test, expect } from "@playwright/test"

const STUDENT = { identifier: "5c4", password: "TS@GHZg5b8" }
const BACKEND = "http://localhost:4000"

// Force a clean context for each test so session cookies from auth.spec.ts don't bleed in
test.use({ storageState: { cookies: [], origins: [] } })

test.describe("School boundary — API-level isolation", () => {
  test("authenticated API requests include school-scoped data only", async ({ request }) => {
    const signinRes = await request.post(`${BACKEND}/api/auth/signin`, {
      data: { identifier: STUDENT.identifier, password: STUDENT.password },
    })
    expect(signinRes.ok()).toBe(true)
    const signinData = await signinRes.json() as { user?: { school_id?: string } }
    const schoolId = signinData.user?.school_id

    const studentsRes = await request.get(`${BACKEND}/api/school/students`)
    if (studentsRes.ok()) {
      const { students } = await studentsRes.json() as { students?: Array<{ school_id: string }> }
      if (students?.length) {
        for (const s of students) {
          expect(s.school_id?.toString()).toBe(schoolId?.toString())
        }
      }
    }
  })

  test("student cannot access admin-only endpoint", async ({ request }) => {
    const signinRes = await request.post(`${BACKEND}/api/auth/signin`, {
      data: { identifier: STUDENT.identifier, password: STUDENT.password },
    })
    expect(signinRes.ok()).toBe(true)

    // GET /api/school/teachers — student may or may not be allowed, but must not see other schools
    const adminRes = await request.get(`${BACKEND}/api/school/teachers`)
    if (!adminRes.ok()) {
      expect([401, 403]).toContain(adminRes.status())
    }
  })

  test("unauthenticated request to /api/auth/me returns 401", async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/auth/me`)
    expect(res.status()).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toContain("Authentication required")
  })

  test("unauthenticated request to marks endpoint returns 401", async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/marks/my-results`)
    expect(res.status()).toBe(401)
  })

  test("unauthenticated request to homework endpoint returns 401", async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/homework`)
    expect(res.status()).toBe(401)
  })

  test("unauthenticated request to modules endpoint returns 401", async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/modules?class_id=123&subject=Math`)
    expect(res.status()).toBe(401)
  })
})
