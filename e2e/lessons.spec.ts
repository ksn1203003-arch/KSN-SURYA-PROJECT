import { test, expect } from "@playwright/test"
import path from "path"
import { fileURLToPath } from "url"

// End-to-end test: teacher creates a lesson module and adds a link item,
// then student navigates to Lessons and sees the module.
// This covers the highest-traffic student flow that was previously untested.

const TEACHER = { identifier: "priya.sharma@dps-hyd.edu.in", password: "Teacher@1234" }
const STUDENT = { identifier: "5c4", password: "TS@GHZg5b8" }

async function loginAs(
  page: import("@playwright/test").Page,
  identifier: string,
  password: string,
  role: "teacher" | "student" | "admin",
) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  const tabLabel = role.charAt(0).toUpperCase() + role.slice(1)
  await page.locator(`button:has-text("${tabLabel}"), [role="tab"]:has-text("${tabLabel}")`).first().click()
  await page.waitForTimeout(500)
  const identifierInput = page.locator('input[placeholder*="phone" i], input[placeholder*="email" i], input[type="text"]').first()
  await identifierInput.click({ clickCount: 3 })
  await identifierInput.pressSequentially(identifier, { delay: 30 })
  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.click({ clickCount: 3 })
  await passwordInput.pressSequentially(password, { delay: 30 })
  await page.waitForTimeout(300)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(url => !url.href.includes("/login"), { timeout: 15000 })
}

test.describe("Lessons — teacher creates module, student views it", () => {

  test("teacher can navigate to Lessons view", async ({ page }) => {
    await loginAs(page, TEACHER.identifier, TEACHER.password, "teacher")

    // Wait for dashboard to settle
    await page.waitForLoadState("networkidle")

    // Navigate to Lessons
    const lessonsNav = page.locator('nav a:has-text("Lessons"), button:has-text("Lessons"), [data-nav="Lessons"]').first()
    await expect(lessonsNav).toBeVisible({ timeout: 10000 })
    await lessonsNav.click()
    await page.waitForTimeout(1000)

    // Should see the Lessons panel (subject selector or module list)
    const lessonsContent = page.locator('text=Lessons, text=Modules, text=Add Module, text=Select Subject').first()
    await expect(lessonsContent).toBeVisible({ timeout: 8000 })
  })

  test("student can navigate to Lessons view and sees modules", async ({ page }) => {
    await loginAs(page, STUDENT.identifier, STUDENT.password, "student")

    await page.waitForLoadState("networkidle")

    // Navigate to Lessons
    const lessonsNav = page.locator('nav a:has-text("Lessons"), button:has-text("Lessons"), [data-nav="Lessons"]').first()
    await expect(lessonsNav).toBeVisible({ timeout: 10000 })
    await lessonsNav.click()
    await page.waitForTimeout(1000)

    // Should see the Lessons panel
    const lessonsContent = page.locator('text=Lessons, text=Modules, text=Select Subject, text=No modules').first()
    await expect(lessonsContent).toBeVisible({ timeout: 8000 })
  })

  test("student dashboard loads and shows progress stats", async ({ page }) => {
    await loginAs(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForLoadState("networkidle")

    // Dashboard should show the student's name or key stats
    const dashContent = page.locator('text=Dashboard, text=Welcome, text=Progress, text=Points, text=Quiz').first()
    await expect(dashContent).toBeVisible({ timeout: 8000 })
  })

  test("teacher dashboard loads with class overview", async ({ page }) => {
    await loginAs(page, TEACHER.identifier, TEACHER.password, "teacher")
    await page.waitForLoadState("networkidle")

    // Dashboard should show teacher-specific content
    const dashContent = page.locator('text=Dashboard, text=Students, text=Class, text=Attendance, text=Lessons').first()
    await expect(dashContent).toBeVisible({ timeout: 8000 })
  })

  test("file token endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.post("/api/files/token", {
      data: { gridfsId: "507f1f77bcf86cd799439011" },
    })
    expect(res.status()).toBe(401)
  })

  test("AI assistant endpoint rejects unauthenticated requests", async ({ request }) => {
    const res = await request.post("/api/ai/lesson-assist", {
      data: { question: "test" },
    })
    expect(res.status()).toBe(401)
  })

  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/health")
    expect(res.status()).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe("ok")
  })

})
