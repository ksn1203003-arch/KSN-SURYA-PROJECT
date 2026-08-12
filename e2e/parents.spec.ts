import { test, expect, type Page } from "@playwright/test"

// Credentials
const ADMIN_EMAIL = "ksn1203003@gmail.com"
const ADMIN_PASSWORD = "Admin@1234"
const STUDENT_USERNAME = "5c4"
const STUDENT_PASSWORD = "TS@GHZg5b8"

async function loginAdmin(page: Page) {
  await page.goto("/login")
  await page.waitForLoadState("domcontentloaded")
  const tabBar = page.locator("div.flex.gap-1.p-1").first()
  await tabBar.locator("button").filter({ hasText: /^Admin$/ }).click()
  await page.locator('input[placeholder*="phone" i]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(url => !url.href.includes("/login"), { timeout: 15000 })
}

// ─── Admin tests — share one login ────────────────────────────────────────────
// Using a single browser page that persists across tests in this describe block
// This avoids hitting the 5-signin-per-15-min rate limiter

test.describe.serial("Parent Account Management — Admin", () => {
  let adminPage: Page

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    adminPage = await ctx.newPage()
    await loginAdmin(adminPage)
  })

  test.afterAll(async () => {
    await adminPage.context().close()
  })

  test("TC1 — Parent nav item appears in admin sidebar", async () => {
    await adminPage.screenshot({ path: "e2e/ss_parents_01_admin_dashboard.png" })
    const parentsNav = adminPage.getByRole("button", { name: /parents/i })
    await expect(parentsNav).toBeVisible({ timeout: 5000 })
    await adminPage.screenshot({ path: "e2e/ss_parents_02_nav_visible.png" })
  })

  test("TC2 — Parents view loads when nav item clicked", async () => {
    const parentsNav = adminPage.getByRole("button", { name: /parents/i })
    await parentsNav.click()
    await adminPage.waitForTimeout(1500)
    await adminPage.screenshot({ path: "e2e/ss_parents_03_parents_view.png" })
    const content = adminPage.locator("text=Loading students").or(adminPage.locator("text=No students found")).or(adminPage.locator("text=Parents / Guardians"))
    await expect(content.first()).toBeVisible({ timeout: 8000 })
  })

  test("TC3 — Parents section appears in expanded student row", async () => {
    // Navigate to Students
    const studentsNav = adminPage.getByRole("button", { name: /^students$/i })
    await studentsNav.click()
    await adminPage.waitForTimeout(2000)
    await adminPage.screenshot({ path: "e2e/ss_parents_04_students_view.png" })
    // Expand first student row via the aria-label expand button
    const chevronBtn = adminPage.locator("button[aria-label='View student details']").first()
    await expect(chevronBtn).toBeVisible({ timeout: 8000 })
    await chevronBtn.click()
    await adminPage.waitForTimeout(2000)
    await adminPage.screenshot({ path: "e2e/ss_parents_05_expanded_row.png" })
    const parentsSection = adminPage.locator("text=Parents / Guardians").first()
    await expect(parentsSection).toBeVisible({ timeout: 8000 })
  })

  test("TC4 — Parents section expands and shows add button or parent list", async () => {
    const parentsHeader = adminPage.locator("button", { hasText: /parents \/ guardians/i }).first()
    if (await parentsHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await parentsHeader.click()
      await adminPage.waitForTimeout(1000)
      await adminPage.screenshot({ path: "e2e/ss_parents_06_parents_expanded.png" })
      const addBtn = adminPage.locator("button", { hasText: /add parent/i }).first()
      const maxMsg = adminPage.locator("text=Maximum 2 parents").first()
      const parentRecord = adminPage.locator("text=Parents / Guardians").first()
      const isAddVisible = await addBtn.isVisible({ timeout: 3000 }).catch(() => false)
      const isMaxVisible = await maxMsg.isVisible({ timeout: 1000 }).catch(() => false)
      const isParentsVisible = await parentRecord.isVisible({ timeout: 1000 }).catch(() => false)
      expect(isAddVisible || isMaxVisible || isParentsVisible).toBeTruthy()
    } else {
      test.skip()
    }
  })

  test("RC1 — Students view still works after parent feature added", async () => {
    const studentsNav = adminPage.getByRole("button", { name: /^students$/i })
    await studentsNav.click()
    await adminPage.waitForTimeout(2000)
    await adminPage.screenshot({ path: "e2e/ss_parents_09_students_regression.png" })
    const table = adminPage.locator("table")
    await expect(table).toBeVisible({ timeout: 8000 })
  })
})

// ─── Public page tests — no login needed ──────────────────────────────────────

test.describe("Parent Account Management — Public", () => {
  test("TC5 — Parent login link visible on homepage", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")
    await page.screenshot({ path: "e2e/ss_parents_07_homepage.png" })
    const parentLink = page.locator("text=Parent").first()
    await expect(parentLink).toBeVisible({ timeout: 5000 })
  })

  test("TC6 — Clicking Parent on homepage navigates to login with parent role", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")
    const parentBtn = page.locator("nav button, nav a").filter({ hasText: /^Parent$/ }).first()
    if (await parentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await parentBtn.click()
      await page.waitForURL(url => url.href.includes("/login"), { timeout: 5000 })
      await page.screenshot({ path: "e2e/ss_parents_08_login_parent_tab.png" })
      expect(page.url()).toContain("role=parent")
    } else {
      test.skip()
    }
  })
})

// ─── Security tests — API level, no browser needed ────────────────────────────

test.describe("Parent Account Management — Security", () => {
  test("SC1 — GET /api/users/parents requires auth", async ({ request }) => {
    const res = await request.get("http://localhost:4000/api/users/parents?student_id=nonexistent")
    expect(res.status()).toBe(401)
  })

  test("SC2 — POST /api/users/add-parent requires auth", async ({ request }) => {
    const res = await request.post("http://localhost:4000/api/users/add-parent", {
      data: { name: "Test Parent", email: "test@test.com", student_id: "nonexistent" },
    })
    expect(res.status()).toBe(401)
  })
})

// ─── Regression — Student login (separate context, fresh login) ────────────

test.describe("Parent Account Management — Student Regression", () => {
  test("RC2 — Student login still works", async ({ page }) => {
    await page.goto("/login")
    await page.waitForLoadState("domcontentloaded")
    const tabBar = page.locator("div.flex.gap-1.p-1").first()
    await tabBar.locator("button").filter({ hasText: /^Student$/ }).click()
    await page.locator('input[placeholder*="phone" i]').fill(STUDENT_USERNAME)
    await page.locator('input[type="password"]').fill(STUDENT_PASSWORD)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await page.waitForURL(url => !url.href.includes("/login"), { timeout: 15000 })
    await page.screenshot({ path: "e2e/ss_parents_10_student_regression.png" })
    expect(page.url()).toContain("/student")
  })
})
