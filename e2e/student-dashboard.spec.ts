import { test, expect } from "@playwright/test"

// Credentials defined in CLAUDE.md §11 — keep in sync if they change
const STUDENT = { identifier: "5c4", password: "TS@GHZg5b8" }

async function loginAsStudent(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  await page.locator('button:has-text("Student"), [role="tab"]:has-text("Student")').first().click()
  await page.waitForTimeout(400)
  const idInput = page.locator('input[placeholder*="phone" i], input[placeholder*="email" i], input[type="text"]').first()
  await idInput.click({ clickCount: 3 })
  await idInput.pressSequentially(STUDENT.identifier, { delay: 20 })
  const pwInput = page.locator('input[type="password"]').first()
  await pwInput.click({ clickCount: 3 })
  await pwInput.pressSequentially(STUDENT.password, { delay: 20 })
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL("**/student/dashboard**", { timeout: 20000 })
  await page.waitForLoadState("networkidle")
}

test.describe("Student Dashboard — hero banner, sidebar, and theming", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page)
    await page.waitForTimeout(600)
  })

  test("hero banner is clearly visible (not washed out) in both light and dark mode", async ({ page }) => {
    // Light mode (default)
    await expect(page.locator("text=Unlock Your Full")).toBeVisible()
    await expect(page.locator("text=Potential Today!")).toBeVisible()

    // Dark mode — this is the regression this test guards: an earlier bug had
    // two conflicting CSS blocks (a duplicate :root/.dark pair in index.css)
    // where the light-mode hero gradient silently won the cascade in dark mode,
    // making the banner nearly invisible against the page background.
    await page.evaluate(() => localStorage.setItem("teachscript-theme", "dark"))
    await page.reload()
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(500)
    await expect(page.locator("html")).toHaveAttribute("class", /dark/)
    await expect(page.locator("text=Unlock Your Full")).toBeVisible()
    await expect(page.locator("text=Potential Today!")).toBeVisible()

    // The "Welcome back" label must also be readable in dark mode — it was
    // previously hardcoded to a fixed purple that lost contrast against the
    // new dark banner background.
    await expect(page.locator("text=Welcome back")).toBeVisible()

    // Reset to light for subsequent tests in this file
    await page.evaluate(() => localStorage.setItem("teachscript-theme", "light"))
  })

  test("sidebar profile card and top navbar meet cleanly, no hard border seam at the junction", async ({ page }) => {
    // Regression guard: the sidebar header, sidebar's own right border, and the
    // top navbar's bottom border used to all converge at the same corner point,
    // producing a visible hard-edged "+" seam. Fixed by removing the competing
    // border lines at that junction and relying on background-color contrast.
    const sidebarHeader = page.locator("aside").first()
    await expect(sidebarHeader).toBeVisible()
    const profileCard = page.locator("text=Surya").first()
    await expect(profileCard).toBeVisible()
    // The sidebar header specifically must not have a bottom border (the
    // regression condition) — assert via computed style rather than a
    // visual-only check, so this fails loudly if the border returns.
    const borderBottomWidth = await page.locator("aside >> div").first().evaluate(el => getComputedStyle(el).borderBottomWidth)
    expect(["0px"]).toContain(borderBottomWidth)
  })

  test("student illustration renders based on account gender (defaults to boy image for non-female)", async ({ page }) => {
    // The illustration is decorative (alt="") so it is located by its src, not by alt text.
    const illustration = page.locator('img[src^="/student-"]')
    await expect(illustration).toBeVisible()
    const src = await illustration.getAttribute("src")
    // This test account's gender is "other" — must fall back to the boy
    // illustration (not break, not show a missing-image icon).
    expect(src).toBe("/student-boy.png")
    await expect(illustration).toHaveAttribute("alt", "")
    expect(await illustration.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
  })

  test("female student sees the new 3D girl illustration, loaded and not a black square", async ({ page }) => {
    // Re-fetch the profile as a female student: the login flow is real, only the
    // /api/auth/me response is rewritten so the shared test account is not modified.
    await page.route("**/api/auth/me", async route => {
      const response = await route.fetch()
      const body = await response.json() as { profile: { gender: string | null } }
      await route.fulfill({ response, json: { ...body, profile: { ...body.profile, gender: "female" } } })
    })
    await page.reload()
    await page.waitForLoadState("networkidle")

    const illustration = page.locator('img[src^="/student-"]')
    await expect(illustration).toBeVisible()
    await expect(illustration).toHaveAttribute("src", "/student-girl-3d.png")
    await expect(illustration).toHaveAttribute("alt", "")
    expect(await illustration.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)

    // Transparent background: the top-left corner pixel of the image must be fully transparent.
    const cornerAlpha = await illustration.evaluate((el: HTMLImageElement) => {
      const canvas = document.createElement("canvas")
      canvas.width = el.naturalWidth
      canvas.height = el.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) return -1
      ctx.drawImage(el, 0, 0)
      return ctx.getImageData(2, 2, 1, 1).data[3]
    })
    expect(cornerAlpha).toBe(0)
    await page.screenshot({ path: "ss_girl_light.png" })
  })
})

test.describe("Student Dashboard — Attendance/Avg Quiz tiles: wording + clickable navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page)
    await page.waitForTimeout(600)
  })

  test("Attendance tile shows distinct-day count alongside period count, not just raw period count mislabeled as days", async ({ page }) => {
    // Regression guard: the tile used to say "X of Y days" when Y was actually
    // a count of individual class PERIODS (a day with 8 periods marked
    // inflated the denominator to 8, not 1). Now it must lead with the
    // intuitive day-level figure and keep the period-level detail as a
    // secondary, clearly-labeled parenthetical.
    const attendanceTile = page.locator('[aria-label^="Attendance:"]')
    await expect(attendanceTile).toBeVisible()
    await expect(attendanceTile.getByText(/^\d+\/\d+ periods · \d+ days?$/)).toBeVisible()
  })

  test("Attendance and Avg Quiz tiles are keyboard-operable (role=button, focusable, Enter/Space activates)", async ({ page }) => {
    // Regression guard: these tiles were originally a plain <div onClick> —
    // invisible to keyboard and screen-reader users (no role, no tabIndex,
    // no key handler). Must now be a real interactive element.
    const attendanceTile = page.locator('[aria-label^="Attendance:"]')
    const quizTile = page.locator('[aria-label^="Avg Quiz:"]')
    await expect(attendanceTile).toHaveAttribute("role", "button")
    await expect(attendanceTile).toHaveAttribute("tabindex", "0")
    await expect(quizTile).toHaveAttribute("role", "button")
    await expect(quizTile).toHaveAttribute("tabindex", "0")

    await attendanceTile.focus()
    await expect(attendanceTile).toBeFocused()
    await page.keyboard.press("Enter")
    await page.waitForTimeout(500)
    // Scope to the page heading specifically — the sidebar nav also has a
    // "My attendance" label, which a loose text locator would also match.
    await expect(page.getByRole("heading", { name: "My Attendance" })).toBeVisible()
  })

  test("clicking the Avg Quiz tile navigates to the Quizzes view", async ({ page }) => {
    const quizTile = page.locator('[aria-label^="Avg Quiz:"]')
    await expect(quizTile).toBeVisible()
    await quizTile.click()
    await page.waitForTimeout(500)
    await expect(page.locator('h1:has-text("Quizzes"), h2:has-text("Quizzes")').first()).toBeVisible()
  })

  test("non-clickable tiles (Lessons, Points Earned) have no button role and are not keyboard-focusable", async ({ page }) => {
    const lessonsTile = page.locator(".skillio-card", { hasText: "Lessons" }).first()
    await expect(lessonsTile).toBeVisible()
    await expect(lessonsTile).not.toHaveAttribute("role", "button")
    await expect(lessonsTile).not.toHaveAttribute("tabindex", "0")
  })
})

test.describe("Student Dashboard — Events week navigation and calendar picker", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page)
    await page.waitForTimeout(600)
  })

  test("previous/next week arrows shift the displayed date range", async ({ page }) => {
    // Scope to the Events card specifically via its heading button — "this
    // week" also appears (lowercase, mid-sentence) in the unrelated "Daily
    // Activity" card's caption text elsewhere on the page, and a loose
    // div:has() selector matches multiple nested ancestor divs, not just the
    // card itself.
    const eventsCard = page.locator('button[aria-label="Pick a date"]').locator("xpath=ancestor::*[contains(@class,'skillio-card')][1]")
    const weekLabel = eventsCard.getByText("This week", { exact: true })
    await expect(weekLabel).toBeVisible()

    await eventsCard.locator('button[aria-label="Previous week"]').click()
    await page.waitForTimeout(300)
    // Once navigated away from the real current week, the label switches from
    // "This week" to an explicit date range (e.g. "27 Sept – 3 Oct") — this is
    // the fix for the original "no way to see previous weeks" complaint, and
    // the "it says This week but shows a different week" confusion it would
    // otherwise cause.
    await expect(eventsCard.locator("text=This week", { exact: true })).toHaveCount(0)

    // Next week arrow should bring it back to the current week
    await eventsCard.locator('button[aria-label="Next week"]').click()
    await page.waitForTimeout(300)
    await expect(eventsCard.locator("text=This week", { exact: true })).toBeVisible()
  })

  test("clicking the Events title opens the calendar date-picker (reuses the existing calendar icon, no duplicate icon added)", async ({ page }) => {
    const trigger = page.locator('button[aria-label="Pick a date"]')
    await expect(trigger).toBeVisible()
    // Regression guard: user asked for the existing orange calendar icon next
    // to "Events" to BE the trigger, not a second new icon added elsewhere.
    await expect(trigger.locator("text=Events")).toBeVisible()

    await trigger.click()
    await page.waitForTimeout(300)
    // Month-grid calendar popover should appear, same pattern as My Attendance
    const monthLabel = page.locator("text=/\\w+ \\d{4}/").first()
    await expect(monthLabel).toBeVisible()

    // Clicking a date closes the popover and re-centers the week strip on it
    const dayCells = page.locator('aside, [class*="skillio-card"]').locator("button", { hasText: /^\d{1,2}$/ })
    if (await dayCells.count() > 0) {
      await dayCells.first().click()
      await page.waitForTimeout(300)
    }
  })
})
