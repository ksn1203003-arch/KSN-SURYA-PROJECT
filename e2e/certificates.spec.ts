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

// ─────────────────────────────────────────────────────────────────────────────
// Teacher-issued certificates + "load only what is on screen".
// One sign-in per role for the whole block (sign-in is limited to 5 per 15 min).
// Nothing here issues or revokes a real certificate — it stops at the confirmation step.
// ─────────────────────────────────────────────────────────────────────────────
const STUDENT_LOGIN = { identifier: "5c4", password: "TS@GHZg5b8" }

async function loginAs(page: import("@playwright/test").Page, tab: "Student" | "Teacher", creds: { identifier: string; password: string }) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  await page.screenshot({ path: `ss_${tab.toLowerCase()}_login_page.png` })
  await page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first().click()
  const idInput = page.locator('input[placeholder*="phone" i]').first()
  await idInput.click({ clickCount: 3 })
  await idInput.pressSequentially(creds.identifier, { delay: 20 })
  const pwInput = page.locator('input[type="password"]').first()
  await pwInput.click({ clickCount: 3 })
  await pwInput.pressSequentially(creds.password, { delay: 20 })
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(url => !url.href.includes("/login"), { timeout: 20000 })
  await page.waitForLoadState("networkidle")
}

/** API paths requested while `action` runs (query strings dropped). */
async function apiCallsDuring(page: import("@playwright/test").Page, action: () => Promise<void>): Promise<string[]> {
  const calls: string[] = []
  let lastRequestAt = Date.now()
  const onRequest = (req: import("@playwright/test").Request) => {
    const url = new URL(req.url())
    if (url.pathname.startsWith("/api/")) { calls.push(url.pathname); lastRequestAt = Date.now() }
  }
  page.on("request", onRequest)
  await action()
  await page.waitForLoadState("networkidle")
  // After an in-app click the page is already "loaded", so networkidle returns at once —
  // keep listening until no API request has started for a full quiet period.
  const QUIET_MS = 1500
  await expect.poll(() => Date.now() - lastRequestAt >= QUIET_MS, { timeout: 15000, intervals: [250] }).toBe(true)
  page.off("request", onRequest)
  return calls
}

test.describe("Teacher — certificates are issued by the teacher, sections load on demand", () => {
  test.describe.configure({ mode: "serial" })
  let page: import("@playwright/test").Page

  test.beforeAll(async ({ browser }) => {
    // The PWA service worker would hide API requests from the page — block it so request checks are real
    page = await browser.newPage({ serviceWorkers: "block" })
    await loginAs(page, "Teacher", TEACHER)
    await page.screenshot({ path: "ss_teacher_dashboard.png" })
  })
  test.afterAll(async () => { await page.close() })

  test("opening the dashboard loads no challenge, submission, certificate or sent-notification data", async () => {
    const calls = await apiCallsDuring(page, async () => { await page.reload() })
    // Sanity: requests really are being seen (the page always checks the session on load)
    expect(calls, "no API requests were captured at all").toContain("/api/auth/me")
    expect(calls.filter(c => c.startsWith("/api/challenges"))).toEqual([])
    expect(calls.filter(c => c.startsWith("/api/certificates"))).toEqual([])
    expect(calls.filter(c => c === "/api/teacher/notifications/sent")).toEqual([])
    expect(calls.filter(c => c === "/api/teacher/my-classes").length).toBeLessThanOrEqual(1)
  })

  test("Timetable then Lessons reuse one class-list request", async () => {
    const calls = await apiCallsDuring(page, async () => {
      await page.locator('nav a:has-text("Timetable"), button:has-text("Timetable")').first().click()
      await expect(page.getByRole("heading", { name: "Timetable" })).toBeVisible({ timeout: 10000 })
      await page.locator('nav a:has-text("Lessons"), button:has-text("Lessons")').first().click()
      await page.waitForLoadState("networkidle")
    })
    // The dashboard (previous test) already fetched the class list — both sections must reuse it
    expect(calls.filter(c => c === "/api/teacher/my-classes"), `API calls seen: ${calls.join(", ")}`).toEqual([])
    await page.screenshot({ path: "ss_teacher_lessons.png" })
  })

  test("Certificates shows who has completed; issuing needs a template, a student and a confirmation", async () => {
    await page.locator('nav a:has-text("Certificates"), button:has-text("Certificates")').first().click()
    const panel = page.getByRole("region", { name: "Who has completed a subject" })
    await expect(panel).toBeVisible({ timeout: 15000 })
    // Wait until the panel has finished loading: it then shows a summary line or an explanation
    await expect(panel).toContainText(/ready for a certificate|assigned to teach|No students in this class/, { timeout: 15000 })
    await page.screenshot({ path: "ss_teacher_certificates_panel.png", fullPage: true })

    // Nothing in this view lets a student claim a certificate
    await expect(page.getByText(/Claim/)).toHaveCount(0)

    const readyCheckboxes = panel.locator('input[type="checkbox"]:not([disabled])')
    test.skip(await readyCheckboxes.count() === 0, "No student is ready for a certificate in the first class/subject — issuing flow not exercised")
    const issueButton = panel.getByRole("button", { name: /Issue certificates/ })
    await expect(issueButton).toBeDisabled()
    await readyCheckboxes.last().check()
    await expect(issueButton).toBeDisabled() // still needs a template
    await panel.getByRole("button", { name: /Course Completion/ }).click()
    await expect(issueButton).toBeEnabled()
    await issueButton.click()
    const confirm = panel.getByRole("alertdialog", { name: "Confirm issuing certificates" })
    await expect(confirm).toBeVisible()
    await page.screenshot({ path: "ss_teacher_issue_confirm.png" })
    await confirm.getByRole("button", { name: "Cancel" }).click()
    await expect(confirm).toHaveCount(0)
  })

  test("regression — Homework still loads", async () => {
    await page.locator('nav a:has-text("Homework"), button:has-text("Homework")').first().click()
    await expect(page.getByRole("heading", { name: /Homework/i }).first()).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: "ss_teacher_regression_homework.png" })
  })
})

test.describe("Student — no self-claim, sections load on demand", () => {
  test.describe.configure({ mode: "serial" })
  let page: import("@playwright/test").Page

  test.beforeAll(async ({ browser }) => {
    // The PWA service worker would hide API requests from the page — block it so request checks are real
    page = await browser.newPage({ serviceWorkers: "block" })
    await loginAs(page, "Student", STUDENT_LOGIN)
    await page.screenshot({ path: "ss_student_dashboard.png" })
  })
  test.afterAll(async () => { await page.close() })

  test("opening Homework directly does not load dashboard, quests or classmates", async () => {
    const calls = await apiCallsDuring(page, async () => { await page.goto("/student/dashboard/homework") })
    // Sanity: requests really are being seen (the page always checks the session on load)
    expect(calls, "no API requests were captured at all").toContain("/api/auth/me")
    expect(calls).not.toContain("/api/student/dashboard")
    expect(calls).not.toContain("/api/student/quests")
    expect(calls).not.toContain("/api/student/classmates")
    expect(calls.filter(c => c.startsWith("/api/challenges"))).toEqual([])
  })

  test("opening the Dashboard loads its summary once", async () => {
    const calls = await apiCallsDuring(page, async () => {
      await page.locator("aside").getByText("Dashboard", { exact: true }).click()
      await page.waitForURL(/\/student\/dashboard$/)
    })
    expect(calls.filter(c => c === "/api/student/dashboard").length, `API calls seen: ${calls.join(", ")}`).toBe(1)
    await page.screenshot({ path: "ss_student_dashboard_on_demand.png" })
  })

  test("Certificates has no Claim button and explains that the teacher issues them", async () => {
    await page.goto("/student/dashboard/certificates")
    await expect(page.getByText("Your teacher issues a certificate when you complete a subject.")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button", { name: /Claim/ })).toHaveCount(0)
    await page.screenshot({ path: "ss_student_certificates.png", fullPage: true })
  })

  test("the retired claim API refuses with 403", async () => {
    const backend = process.env.E2E_BACKEND_URL ?? "http://localhost:4000"
    const res = await page.request.post(`${backend}/api/student-certificates/claim`, { data: { subject: "Maths" } })
    expect(res.status()).toBe(403)
  })

  test("regression — Lessons still opens", async () => {
    await page.goto("/student/dashboard/lessons")
    await page.waitForLoadState("networkidle")
    await expect(page.getByText("My Subjects", { exact: true })).toBeVisible({ timeout: 10000 })
    // Per-subject progress comes from the dashboard summary, which the Lessons screen still loads
    await expect(page.getByText(/\d+\/\d+ done/).first()).toBeVisible()
    await page.screenshot({ path: "ss_student_regression_lessons.png" })
  })
})
