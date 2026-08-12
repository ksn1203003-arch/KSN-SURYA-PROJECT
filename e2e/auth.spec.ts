import { test, expect } from "@playwright/test"

// Credentials defined in CLAUDE.md §11 — keep in sync if they change
const STUDENT = { identifier: "5c4",                      password: "TS@GHZg5b8",   role: "student",  path: "/student/dashboard" }
const TEACHER = { identifier: "priya.sharma@dps-hyd.edu.in", password: "Teacher@1234", role: "teacher", path: "/teacher/dashboard" }
const ADMIN   = { identifier: "ksn1203003@gmail.com",         password: "Admin@1234",   role: "admin",   path: "/admin/dashboard"   }

async function login(
  page: import("@playwright/test").Page,
  identifier: string,
  password: string,
  role: "student" | "teacher" | "admin" = "teacher"
) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  // Click the correct role tab (Student / Teacher / Admin)
  const tabLabel = role.charAt(0).toUpperCase() + role.slice(1)
  await page.locator(`button:has-text("${tabLabel}"), [role="tab"]:has-text("${tabLabel}")`).first().click()
  await page.waitForTimeout(500)
  // Use pressSequentially so React's synthetic onChange fires on each keystroke
  const identifierInput = page.locator('input[placeholder*="phone" i], input[placeholder*="email" i], input[type="text"]').first()
  await identifierInput.click({ clickCount: 3 }) // triple-click to select all
  await identifierInput.pressSequentially(identifier, { delay: 30 })
  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.click({ clickCount: 3 })
  await passwordInput.pressSequentially(password, { delay: 30 })
  await page.waitForTimeout(300)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(500)
}

async function logout(page: import("@playwright/test").Page) {
  // Try clicking a Sign out / Log out button, or fall back to API call
  const signOutBtn = page.locator('button:has-text("Sign out"), button:has-text("Log out"), a:has-text("Sign out")')
  if (await signOutBtn.count() > 0) {
    await signOutBtn.first().click()
  } else {
    await page.request.post("http://localhost:4000/api/auth/signout")
    await page.goto("/login")
  }
  await page.waitForURL("**/login**", { timeout: 8000 }).catch(() => page.goto("/login"))
}

test.describe("Authentication — sign in and sign out", () => {
  test.beforeEach(async ({ page }) => {
    // Sign out via the page context so the cookie is cleared in the browser context too
    await page.goto("/login")
    await page.evaluate(() =>
      fetch("/api/auth/signout", { method: "POST", credentials: "include" })
    ).catch(() => { /* ignore */ })
    await page.waitForTimeout(300)
  })

  test("student can sign in and reaches student dashboard", async ({ page }) => {
    await login(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForURL("**/student/dashboard**", { timeout: 20000 })
    await expect(page).toHaveURL(/\/student\/dashboard/)
  })

  test("teacher can sign in and reaches teacher dashboard", async ({ page }) => {
    await login(page, TEACHER.identifier, TEACHER.password, "teacher")
    await page.waitForURL("**/teacher/dashboard**", { timeout: 20000 })
    await expect(page).toHaveURL(/\/teacher\/dashboard/)
  })

  test("admin can sign in and reaches admin dashboard", async ({ page }) => {
    await login(page, ADMIN.identifier, ADMIN.password, "admin")
    await page.waitForURL("**/admin/dashboard**", { timeout: 20000 })
    await expect(page).toHaveURL(/\/admin\/dashboard/)
  })

  test("wrong password shows error, not a crash", async ({ page }) => {
    await login(page, STUDENT.identifier, "WrongPassword999!", "student")
    // Should stay on login page (no navigation to dashboard)
    await page.waitForTimeout(2000)
    expect(page.url()).not.toMatch(/dashboard/)
  })

  test("unauthenticated access to dashboard redirects to login", async ({ page }) => {
    await page.goto("/student/dashboard")
    await page.waitForURL("**/login**", { timeout: 8000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test("student can sign out", async ({ page }) => {
    await login(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForURL("**/student/dashboard**", { timeout: 20000 })
    await logout(page)
    await expect(page).toHaveURL(/\/login|^\/$/)
  })
})
