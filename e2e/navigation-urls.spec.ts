import { test, expect, type BrowserContext, type Page } from "@playwright/test"

// Credentials defined in CLAUDE.md §11 — keep in sync if they change.
// The sign-in limit is 5 attempts / 15 min per IP, so every block below signs in ONCE and reuses
// that session for all of its tests (never one login per test).
const STUDENT = { identifier: "5c4",                         password: "TS@GHZg5b8" }
const TEACHER = { identifier: "priya.sharma@dps-hyd.edu.in", password: "Teacher@1234" }

const WRONG_ROLE_NOTICE = "That page isn't available for your account."

async function signInThroughForm(page: Page, tab: "Student" | "Teacher", creds: { identifier: string; password: string }) {
  await page.waitForLoadState("networkidle")
  await page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first().click()
  const idInput = page.locator('input[placeholder*="phone" i], input[placeholder*="email" i], input[type="text"]').first()
  await idInput.click({ clickCount: 3 })
  await idInput.pressSequentially(creds.identifier, { delay: 20 })
  const pwInput = page.locator('input[type="password"]').first()
  await pwInput.click({ clickCount: 3 })
  await pwInput.pressSequentially(creds.password, { delay: 20 })
  await page.locator('button[type="submit"]').first().click()
}

const sidebar = (page: Page) => page.locator('nav[aria-label="Main navigation"]')

test.describe.serial("Student dashboard — every section and subject has its own URL", () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    page = await context.newPage()
  })

  test.afterAll(async () => {
    await context.close()
  })

  test("a logged-out deep link goes to login, then returns to the same section after signing in", async () => {
    await page.goto("/student/dashboard/homework")
    await expect(page).toHaveURL(/\/login\?redirect=%2Fstudent%2Fdashboard%2Fhomework$/)
    await page.screenshot({ path: "ss_nav_01_login_redirect.png" })

    await signInThroughForm(page, "Student", STUDENT)
    await expect(page).toHaveURL(/\/student\/dashboard\/homework$/, { timeout: 20000 })
    await expect(page).toHaveTitle("Homework – TeachScript")
    await page.screenshot({ path: "ss_nav_02_homework_after_login.png" })
  })

  test("clicking a sidebar item changes the URL and the page title; Refresh stays on that section", async () => {
    await sidebar(page).getByText("My Marks", { exact: true }).click()
    await expect(page).toHaveURL(/\/student\/dashboard\/marks$/)
    await expect(page).toHaveTitle("My Marks – TeachScript")

    await page.reload()
    await expect(page).toHaveURL(/\/student\/dashboard\/marks$/)
    await expect(page).toHaveTitle("My Marks – TeachScript")
    await expect(sidebar(page).locator('[aria-current="page"]')).toContainText("My Marks")
    await page.screenshot({ path: "ss_nav_03_marks_after_refresh.png" })
  })

  test("Back and Forward move between the sections the student visited", async () => {
    await sidebar(page).getByText("Timetable", { exact: true }).click()
    await expect(page).toHaveURL(/\/student\/dashboard\/timetable$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/student\/dashboard\/marks$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/student\/dashboard\/homework$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/student\/dashboard\/marks$/)
  })

  test("a subject has its own URL that survives Refresh, and Back returns to the subject list", async () => {
    await sidebar(page).getByText("Lessons", { exact: true }).click()
    await expect(page).toHaveURL(/\/student\/dashboard\/lessons$/)

    await page.getByRole("button", { name: /Computer Science/ }).first().click()
    await expect(page).toHaveURL(/\/student\/dashboard\/lessons\/computer-science$/)
    await expect(page.getByText("Modules Overview")).toBeVisible()
    await expect(page).toHaveTitle("Computer Science – Lessons – TeachScript")

    await page.reload()
    await expect(page).toHaveURL(/\/student\/dashboard\/lessons\/computer-science$/)
    await expect(page.getByText("Modules Overview")).toBeVisible()
    await page.screenshot({ path: "ss_nav_04_subject_after_refresh.png" })

    await page.goBack()
    await expect(page).toHaveURL(/\/student\/dashboard\/lessons$/)
    await expect(page.getByText("My Subjects")).toBeVisible()
  })

  test("clicking Lessons in the sidebar while inside a subject returns to the subject list", async () => {
    await page.getByRole("button", { name: /Computer Science/ }).first().click()
    await expect(page).toHaveURL(/\/student\/dashboard\/lessons\/computer-science$/)

    await sidebar(page).getByText("Lessons", { exact: true }).click()
    await expect(page).toHaveURL(/\/student\/dashboard\/lessons$/)
    await expect(page.getByText("My Subjects")).toBeVisible()
  })

  test("an unknown section shows a friendly message inside the dashboard, with a way back", async () => {
    await page.goto("/student/dashboard/nonsense")
    await expect(page.getByRole("heading", { name: "We can't find that page" })).toBeVisible()
    await expect(page).toHaveTitle("Page not found – TeachScript")
    await expect(sidebar(page)).toBeVisible()
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveCount(0)
    await page.screenshot({ path: "ss_nav_05_unknown_section.png" })

    // The sidebar works from the not-found page...
    await sidebar(page).getByText("Dashboard", { exact: true }).click()
    await expect(page).toHaveURL(/\/student\/dashboard$/)
    await expect(page.getByText("Unlock Your Full")).toBeVisible()

    // ...and so does the button on the page itself.
    await page.goto("/student/dashboard/nonsense")
    await page.getByRole("button", { name: "Back to Dashboard" }).click()
    await expect(page).toHaveURL(/\/student\/dashboard$/)
    await expect(page.getByText("Unlock Your Full")).toBeVisible()
  })

  test("an unknown subject shows a friendly message, not a blank page", async () => {
    await page.goto("/student/dashboard/lessons/zzz-not-a-real-subject")
    await expect(page.getByRole("heading", { name: "We can't find that subject" })).toBeVisible()
    await expect(page).toHaveTitle("Subject not found – TeachScript")
    await page.getByRole("button", { name: "Back to Lessons" }).click()
    await expect(page).toHaveURL(/\/student\/dashboard\/lessons$/)
    await expect(page.getByText("My Subjects")).toBeVisible()
  })

  test("opening a subject moves keyboard focus to the main content (not on first load)", async () => {
    await page.goto("/student/dashboard/lessons")
    await expect(page.getByText("My Subjects")).toBeVisible()
    await page.waitForLoadState("networkidle")
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("MAIN")

    await page.getByRole("button", { name: /Computer Science/ }).first().click()
    await expect(page).toHaveURL(/\/student\/dashboard\/lessons\/computer-science$/)
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("MAIN")
  })

  test("the old bare /student/dashboard address still opens the Overview", async () => {
    await page.goto("/student/dashboard")
    await expect(page.getByText("Unlock Your Full")).toBeVisible()
    await expect(page).toHaveTitle("Dashboard – TeachScript")
  })

  test("a student opening another role's dashboard lands on their own, with a short notice", async () => {
    await page.goto("/teacher/dashboard")
    await expect(page).toHaveURL(/\/student\/dashboard$/)
    await expect(page.getByText(WRONG_ROLE_NOTICE)).toBeVisible()
    await page.screenshot({ path: "ss_nav_06_wrong_role_notice.png" })

    await page.getByRole("button", { name: "Dismiss notice" }).click()
    await expect(page.getByText(WRONG_ROLE_NOTICE)).toBeHidden()
  })

  test("?redirect= on the login page: a valid dashboard path is followed, forged ones are ignored", async () => {
    // Positive control: proves the redirect is read at all, so the forged cases below are meaningful.
    await page.goto(`/login?redirect=${encodeURIComponent("/student/dashboard/marks")}`)
    await expect.poll(() => new URL(page.url()).pathname).toBe("/student/dashboard/marks")

    const forged = [
      "https://evil.example.com",
      "//evil.example.com",
      "/\\evil.example.com",
      "/student/..%2f..%2fevil",
      "/admin/dashboard/classes",
    ]
    for (const value of forged) {
      await page.goto(`/login?redirect=${encodeURIComponent(value)}`)
      await expect.poll(() => new URL(page.url()).pathname, { message: value }).toBe("/student/dashboard")
    }
  })

  test("a failed subject-list request shows a Retry (not 'link is out of date'), and Retry recovers", async () => {
    await page.route("**/api/teacher/student-timetable**", route => route.abort())
    await page.goto("/student/dashboard/lessons/zzz-unknown-subject")
    await expect(page.getByText("We couldn't load your subjects")).toBeVisible()
    await expect(page.getByRole("heading", { name: "We can't find that subject" })).toBeHidden()
    await page.screenshot({ path: "ss_nav_08_retry.png" })

    await page.unroute("**/api/teacher/student-timetable**")
    await page.getByRole("button", { name: "Retry" }).click()
    // Once the request succeeds the slug really is unknown, so the not-found message is now correct.
    await expect(page.getByRole("heading", { name: "We can't find that subject" })).toBeVisible()
  })

  test("after signing out, Back does not reveal the previous dashboard page", async () => {
    await page.goto("/student/dashboard/homework")
    await page.getByRole("button", { name: /sign out/i }).first().click()
    await expect(page).toHaveURL(/\/login/)

    await page.goBack()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText("Unlock Your Full")).toBeHidden()
  })
})

// No sign-in needed: /api/auth/me is answered with a made-up profile, so the dashboard guard's
// forced-password-change rule can be checked without spending login attempts.
test.describe("Forced password change keeps the page the user was heading to", () => {
  const profile = (role: "student" | "teacher") => ({
    profile: {
      id: "e2e-user", name: "E2E User", email: "e2e@example.com", phone: null, username: null,
      role, gender: null, school_id: "e2e-school", class_id: null, profile_photo_url: null,
      preferred_language: "english", is_active: true, must_change_password: true,
    },
  })

  test("a deep link is carried through /set-password as ?redirect=", async ({ page }) => {
    await page.route("**/api/auth/me", route => route.fulfill({ json: profile("student") }))
    await page.goto("/student/dashboard/homework")
    await expect(page).toHaveURL(/\/set-password\?forced=1&redirect=%2Fstudent%2Fdashboard%2Fhomework$/)
  })

  test("a wrong-role link is sent to the user's own dashboard first, then to /set-password", async ({ page }) => {
    await page.route("**/api/auth/me", route => route.fulfill({ json: profile("teacher") }))
    await page.goto("/student/dashboard/homework")
    await expect(page).toHaveURL(/\/set-password\?forced=1&redirect=%2Fteacher%2Fdashboard$/)
  })
})

test.describe.serial("Teacher — wrong-role links and unchanged dashboard", () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    page = await context.newPage()
    await page.goto("/login")
    await signInThroughForm(page, "Teacher", TEACHER)
    await page.waitForURL("**/teacher/dashboard**", { timeout: 20000 })
  })

  test.afterAll(async () => {
    await context.close()
  })

  test("a teacher opening the admin dashboard lands on the teacher dashboard with a notice", async () => {
    await page.goto("/admin/dashboard")
    await expect(page).toHaveURL(/\/teacher\/dashboard$/)
    await expect(page.getByText(WRONG_ROLE_NOTICE)).toBeVisible()
    await page.screenshot({ path: "ss_nav_07_teacher_wrong_role.png" })

    // The notice is shown once: a Refresh on the same page must not repeat it.
    await page.reload()
    await expect(page).toHaveURL(/\/teacher\/dashboard$/)
    await expect(sidebar(page)).toBeVisible()
    await expect(page.getByText(WRONG_ROLE_NOTICE)).toBeHidden()
  })

  test("a teacher's own dashboard address is unchanged and still loads", async () => {
    await page.goto("/teacher/dashboard")
    await expect(page).toHaveURL(/\/teacher\/dashboard$/)
    await expect(sidebar(page)).toBeVisible()
    await expect(page.getByText(WRONG_ROLE_NOTICE)).toBeHidden()
  })

  test("a teacher cannot open a student section address", async () => {
    await page.goto("/student/dashboard/lessons")
    await expect(page).toHaveURL(/\/teacher\/dashboard$/)
  })
})
