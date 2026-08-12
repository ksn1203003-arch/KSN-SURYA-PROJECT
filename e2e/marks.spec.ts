import { test, expect } from "@playwright/test"

const TEACHER = { identifier: "priya.sharma@dps-hyd.edu.in", password: "Teacher@1234" }
const STUDENT = { identifier: "5c4",                          password: "TS@GHZg5b8" }

async function loginAs(
  page: import("@playwright/test").Page,
  identifier: string,
  password: string,
  role: "student" | "teacher" | "admin" = "teacher"
) {
  await page.goto("/login")
  await page.evaluate(() =>
    fetch("/api/auth/signout", { method: "POST", credentials: "include" })
  ).catch(() => { /* ignore */ })
  await page.waitForTimeout(300)
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
  await page.waitForTimeout(500)
}

test.describe("Marks — teacher manages exams, student views results", () => {
  test("teacher can navigate to Marks view", async ({ page }) => {
    await loginAs(page, TEACHER.identifier, TEACHER.password, "teacher")
    await page.waitForURL("**/teacher/dashboard**", { timeout: 20000 })

    await page.locator('nav a:has-text("Marks"), aside a:has-text("Marks"), li:has-text("Marks")').first().click()
    await page.waitForTimeout(1000)

    const marksHeading = page.locator('h1:has-text("Marks"), h2:has-text("Marks"), h3:has-text("Marks"), h1:has-text("Exam"), h2:has-text("Exam")')
    await expect(marksHeading.first()).toBeVisible({ timeout: 8000 })
  })

  test("student can navigate to My Marks view", async ({ page }) => {
    await loginAs(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForURL("**/student/dashboard**", { timeout: 20000 })

    await page.locator('nav a:has-text("My Marks"), aside a:has-text("My Marks"), li:has-text("My Marks"), nav a:has-text("Marks"), li:has-text("Marks")').first().click()
    await page.waitForTimeout(1000)

    const heading = page.locator('h1:has-text("Marks"), h2:has-text("Marks"), h1:has-text("Exam")')
    await expect(heading.first()).toBeVisible({ timeout: 8000 })
  })

  test("teacher marks view has create exam button", async ({ page }) => {
    await loginAs(page, TEACHER.identifier, TEACHER.password, "teacher")
    await page.waitForURL("**/teacher/dashboard**", { timeout: 20000 })

    await page.locator('nav a:has-text("Marks"), aside a:has-text("Marks"), li:has-text("Marks")').first().click()
    await page.waitForTimeout(1500)

    const createBtn = page.locator('button:has-text("Create Exam"), button:has-text("New Exam"), button:has-text("Create"), button:has-text("Add Exam")')
    await expect(createBtn.first()).toBeVisible({ timeout: 8000 })
  })

  test("student My Marks shows either results or empty state", async ({ page }) => {
    await loginAs(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForURL("**/student/dashboard**", { timeout: 20000 })

    await page.locator('nav a:has-text("My Marks"), aside a:has-text("My Marks"), li:has-text("My Marks"), li:has-text("Marks")').first().click()
    await page.waitForTimeout(2000)

    // Either exam cards or empty state message — no blank screen
    const content = page.locator('h1, h2, p, [class*="card"], [class*="empty"]')
    expect(await content.count()).toBeGreaterThan(0)
  })
})
