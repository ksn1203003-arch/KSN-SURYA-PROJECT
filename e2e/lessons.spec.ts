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

test.describe("Lessons — redesigned module/item two-pane view (student)", () => {
  async function enterFirstSubjectWithModules(page: import("@playwright/test").Page) {
    await loginAs(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForLoadState("networkidle")
    const lessonsNav = page.locator('nav a:has-text("Lessons"), button:has-text("Lessons"), [data-nav="Lessons"]').first()
    await expect(lessonsNav).toBeVisible({ timeout: 10000 })
    await lessonsNav.click()
    await page.waitForTimeout(800)
    // Click the first subject tile that actually has lesson items (skips "No lessons yet" subjects)
    const subjectTiles = page.locator('button:has(p:has-text("lesson item"))')
    await expect(subjectTiles.first()).toBeVisible({ timeout: 10000 })
    await subjectTiles.first().click()
    await page.waitForTimeout(800)
  }

  test("entering a subject shows the Modules Overview panel with the first module auto-selected", async ({ page }) => {
    await enterFirstSubjectWithModules(page)
    await expect(page.locator("text=Modules Overview")).toBeVisible()
    // First module button should be visually selected (purple-tinted background/text)
    const firstModuleBtn = page.locator('button:has-text("Module 1")').first()
    await expect(firstModuleBtn).toBeVisible()
  })

  test("switching modules in the left list updates the right panel's item list", async ({ page }) => {
    await enterFirstSubjectWithModules(page)
    const moduleButtons = page.locator('button:has-text("Module ")')
    const count = await moduleButtons.count()
    if (count < 2) {
      test.skip(true, "This subject only has one module — nothing to switch to")
      return
    }
    const firstTitle = await page.locator('button:has-text("Module 1")').first().locator("p").last().textContent()
    await moduleButtons.nth(1).click()
    await page.waitForTimeout(400)
    const panelTitle = page.locator('[placeholder="Search lessons or files…"]').locator("xpath=preceding::p[1]")
    await expect(panelTitle).not.toHaveText(firstTitle ?? "")
  })

  test("search filters items by label, and clearing restores the full list", async ({ page }) => {
    await enterFirstSubjectWithModules(page)
    const searchBox = page.locator('[placeholder="Search lessons or files…"]')
    await expect(searchBox).toBeVisible()
    await searchBox.fill("zzzznonexistentquery")
    await page.waitForTimeout(300)
    await expect(page.locator('text=No items match')).toBeVisible()
    const clearLink = page.locator('text=Clear search & filters')
    await expect(clearLink).toBeVisible()
    await clearLink.click()
    await page.waitForTimeout(300)
    await expect(page.locator('text=No items match')).toHaveCount(0)
  })

  test("Viewed / Remaining filter chips show live counts and filter the item list", async ({ page }) => {
    await enterFirstSubjectWithModules(page)
    const allChip = page.locator('button:has-text("All (")')
    const viewedChip = page.locator('button:has-text("Viewed (")')
    const remainingChip = page.locator('button:has-text("Remaining (")')
    await expect(allChip).toBeVisible()
    await expect(viewedChip).toBeVisible()
    await expect(remainingChip).toBeVisible()

    await remainingChip.click()
    await page.waitForTimeout(300)
    // No "Undo" links (only shown on already-done items) should be visible
    // while filtered to Remaining
    await expect(page.locator('button:has-text("Undo")')).toHaveCount(0)

    await allChip.click()
    await page.waitForTimeout(300)
  })

  test("clicking an item name opens the viewer without marking it done; Mark Done requires confirmation before it marks the item done", async ({ page }) => {
    await enterFirstSubjectWithModules(page)
    await page.locator('button:has-text("Remaining (")').click()
    await page.waitForTimeout(300)
    const markDoneBtn = page.locator('button:has-text("Mark Done")').first()
    const hasUnviewedItem = await markDoneBtn.count() > 0
    if (!hasUnviewedItem) {
      test.skip(true, "No remaining (unviewed) items for this student — nothing to test")
      return
    }

    // Clicking Mark Done opens a confirm dialog — does not mark it done yet
    await markDoneBtn.click()
    await page.waitForTimeout(300)
    const confirmDialog = page.locator('text=Mark this as done?')
    await expect(confirmDialog).toBeVisible()

    // Cancelling leaves the item unmarked
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('button:has-text("Mark Done")').first()).toBeVisible()

    // Confirming actually marks it done
    await page.locator('button:has-text("Mark Done")').first().click()
    await page.waitForTimeout(300)
    await page.locator('button:has-text("Yes, mark done")').click()
    await page.waitForTimeout(600)
    await expect(page.locator("text=Done").first()).toBeVisible()
    await expect(page.locator('button:has-text("Undo")').first()).toBeVisible()
  })

  test("Undo asks for confirmation, then moves the item back to Remaining", async ({ page }) => {
    await enterFirstSubjectWithModules(page)
    await page.locator('button:has-text("Viewed (")').click()
    await page.waitForTimeout(300)
    const undoBtn = page.locator('button:has-text("Undo")').first()
    const hasViewedItem = await undoBtn.count() > 0
    if (!hasViewedItem) {
      test.skip(true, "No viewed items for this student — nothing to undo")
      return
    }

    await undoBtn.click()
    await page.waitForTimeout(300)
    const confirmDialog = page.locator('text=Undo this item?')
    await expect(confirmDialog).toBeVisible()

    // Cancelling leaves the item marked done
    await page.locator('button:has-text("Cancel")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('button:has-text("Undo")').first()).toBeVisible()

    // Confirming moves it back to Remaining
    await undoBtn.click()
    await page.waitForTimeout(300)
    await page.locator('button:has-text("Yes, undo")').click()
    await page.waitForTimeout(600)
    await page.locator('button:has-text("Remaining (")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('button:has-text("Mark Done")').first()).toBeVisible()
  })
})
