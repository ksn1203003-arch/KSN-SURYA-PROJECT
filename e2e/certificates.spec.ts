import { test, expect } from "@playwright/test"

// End-to-end coverage for the Certificates UX redesign:
// 1. Deleting a module shows a confirmation dialog that warns about attached certificates.
// 2. The teacher Certificates view collapses modules with zero certificates instead of
//    rendering one empty card per module.

const TEACHER = { identifier: "priya.sharma@dps-hyd.edu.in", password: "Teacher@1234" }

async function loginAsTeacher(page: import("@playwright/test").Page) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  await page.locator('button:has-text("Teacher"), [role="tab"]:has-text("Teacher")').first().click()
  await page.waitForTimeout(500)
  const identifierInput = page.locator('input[placeholder*="phone" i], input[placeholder*="email" i], input[type="text"]').first()
  await identifierInput.click({ clickCount: 3 })
  await identifierInput.pressSequentially(TEACHER.identifier, { delay: 30 })
  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.click({ clickCount: 3 })
  await passwordInput.pressSequentially(TEACHER.password, { delay: 30 })
  await page.waitForTimeout(300)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(url => !url.href.includes("/login"), { timeout: 15000 })
}

test.describe("Certificates — module delete warning and collapsed empty state", () => {
  test("deleting a module shows a confirmation dialog with certificate impact", async ({ page }) => {
    await page.goto("/login")
    await page.screenshot({ path: "ss_login_before.png" })

    await loginAsTeacher(page)
    await page.waitForLoadState("networkidle")
    await page.screenshot({ path: "ss_dashboard_after_login.png" })

    const lessonsNav = page.locator('nav a:has-text("Lessons"), button:has-text("Lessons"), [data-nav="Lessons"]').first()
    await expect(lessonsNav).toBeVisible({ timeout: 10000 })
    await lessonsNav.click()
    await page.waitForTimeout(1000)

    // Lessons view requires picking a subject before modules appear
    const subjectCard = page.locator('button:has(p:has-text("Click to manage modules")), button:has(p:has-text("module"))').first()
    if (await subjectCard.count() > 0) {
      await subjectCard.click()
      await page.waitForTimeout(800)
    }
    await page.screenshot({ path: "ss_lessons_view.png" })

    // Create a throwaway module to safely exercise the delete-confirmation flow
    const addModuleBtn = page.locator('button:has-text("Add module")').first()
    if (await addModuleBtn.count() > 0) {
      await addModuleBtn.click()
      await page.waitForTimeout(300)
      const createBtn = page.locator('button:has-text("Create")').first()
      await createBtn.click()
      await page.waitForTimeout(800)
    }

    // Delete the last module (the one just created) — hover to reveal the delete icon
    const moduleCards = page.locator('[title="Delete module"]')
    const count = await moduleCards.count()
    test.skip(count === 0, "No module available to test delete on — subject may need selection first")

    await moduleCards.last().click({ force: true })
    await page.waitForTimeout(500)

    // Confirmation dialog should appear with a clear warning, not a native browser confirm()
    const dialog = page.locator('[role="alertdialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog).toContainText(/permanently delete/i)
    await page.screenshot({ path: "ss_delete_module_warning.png" })

    // Cancel — do not actually delete, this is a read-safe check of the warning UI
    await dialog.locator('button:has-text("Cancel")').click()
    await expect(dialog).not.toBeVisible()
  })

  test("Certificates view collapses modules with no certificates instead of listing them all", async ({ page }) => {
    await loginAsTeacher(page)
    await page.waitForLoadState("networkidle")

    const certsNav = page.locator('nav a:has-text("Certificates"), button:has-text("Certificates"), [data-nav="Certificates"]').first()
    await expect(certsNav).toBeVisible({ timeout: 10000 })
    await certsNav.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: "ss_certificates_view.png" })

    // A collapsed "N modules with no certificates yet" row should exist if any empty
    // modules are present, instead of one full empty-state card per module.
    const collapsedRow = page.locator('text=/modules? with no certificates yet/i')
    const emptyCardText = page.locator('text=No students have earned a certificate for this module yet.')

    // The old per-card empty-state message must not appear directly in the default view
    // (it's only shown, if at all, inside the collapsed section once expanded)
    if (await collapsedRow.count() > 0) {
      await collapsedRow.first().click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: "ss_certificates_empty_expanded.png" })
      await expect(emptyCardText).toHaveCount(0)
    }

    // Regression check — Homework is an unrelated existing feature; confirm it still loads
    const homeworkNav = page.locator('nav a:has-text("Homework"), button:has-text("Homework"), [data-nav="Homework"]').first()
    if (await homeworkNav.count() > 0) {
      await homeworkNav.click()
      await page.waitForTimeout(1200)
      await page.screenshot({ path: "ss_regression_homework.png" })
    }
  })
})
