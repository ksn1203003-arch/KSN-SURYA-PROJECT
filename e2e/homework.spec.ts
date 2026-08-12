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

test.describe("Homework — create, student submit, teacher feedback", () => {
  test("teacher can navigate to Homework view", async ({ page }) => {
    await loginAs(page, TEACHER.identifier, TEACHER.password, "teacher")
    await page.waitForURL("**/teacher/dashboard**", { timeout: 20000 })

    // Navigate to Homework in sidebar
    await page.locator('nav a:has-text("Homework"), aside a:has-text("Homework"), li:has-text("Homework")').first().click()
    await page.waitForTimeout(1000)

    // Homework panel should be visible — at minimum a heading or create button
    const homeworkHeading = page.locator('h1:has-text("Homework"), h2:has-text("Homework"), h3:has-text("Homework"), [data-testid="homework-panel"]')
    await expect(homeworkHeading.first()).toBeVisible({ timeout: 8000 })
  })

  test("student can navigate to Homework view", async ({ page }) => {
    await loginAs(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForURL("**/student/dashboard**", { timeout: 20000 })

    await page.locator('nav a:has-text("Homework"), aside a:has-text("Homework"), li:has-text("Homework")').first().click()
    await page.waitForTimeout(1000)

    const homeworkHeading = page.locator('h1:has-text("Homework"), h2:has-text("Homework"), h3:has-text("Homework")')
    await expect(homeworkHeading.first()).toBeVisible({ timeout: 8000 })
  })

  test("teacher homework view has a create-homework button", async ({ page }) => {
    await loginAs(page, TEACHER.identifier, TEACHER.password, "teacher")
    await page.waitForURL("**/teacher/dashboard**", { timeout: 20000 })

    await page.locator('nav a:has-text("Homework"), aside a:has-text("Homework"), li:has-text("Homework")').first().click()
    await page.waitForTimeout(1500)

    // Should have a create / new homework button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New Homework"), button:has-text("Add Homework"), button:has-text("+ Homework")')
    await expect(createBtn.first()).toBeVisible({ timeout: 8000 })
  })
})
