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

// Regression coverage for: laptop sleeps >15min while a dashboard tab is open →
// idle timer silently signs out → tab showed zeroed dashboard data on wake, and
// refresh bounced to /login with zero explanation. Fix: AuthContext tags the
// sign-out reason ("idle" | "session-expired") via sessionStorage, LoginPage
// shows a one-time explanatory banner, and StudentDashboard's refreshDashboard()
// now has a real failure branch instead of silently leaving stale/zeroed state.
test.describe("Session expiry — explained sign-out, no silent zeroed dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
    await page.evaluate(() =>
      fetch("/api/auth/signout", { method: "POST", credentials: "include" })
    ).catch(() => { /* ignore */ })
    await page.waitForTimeout(300)
  })

  test("idle sign-out shows an explanatory banner on the login page", async ({ page }) => {
    await login(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForURL("**/student/dashboard**", { timeout: 20000 })

    // Simulate what AuthContext's idle timer does when the deadline is reached:
    // revoke the server-side session AND wait for it to actually take effect
    // before navigating, so React's own auth state isn't still stale when the
    // login page mounts (a raw fetch() alone only updates the server/cookie —
    // it doesn't update the in-memory `user` state the way the app's own
    // handleSignOut() does, which would cause a stale-auth redirect race).
    await page.evaluate(() => sessionStorage.setItem("ts_signout_reason", "idle"))
    // Relative "/api/..." resolves against the page's own origin (localhost:5173,
    // the Vite dev server — which has no backend proxy configured), not the
    // backend. Hit the real backend origin directly so this signout actually
    // succeeds server-side, same as the app's own apiFetch() helpers do.
    const signoutRes = await page.evaluate(async () => {
      const r = await fetch("http://localhost:4000/api/auth/signout", { method: "POST", credentials: "include" })
      return r.status
    })
    expect(signoutRes).toBe(200)
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
    // RequireAuth re-checks /api/auth/me on mount; give it a moment to resolve
    // to "unauthenticated" and settle on /login rather than racing a redirect.
    await page.waitForURL("**/login**", { timeout: 10000 })

    const banner = page.locator('[role="status"]:has-text("inactivity")')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(banner).toContainText("15 minutes of inactivity")

    // Read-once semantics: reloading the login page must not show it again
    await page.reload()
    await page.waitForLoadState("networkidle")
    await expect(page.locator('[role="status"]:has-text("inactivity")')).toHaveCount(0)
  })

  test("dashboard shows a retry banner (not zeroed stats) on a non-auth fetch failure, preserving existing data", async ({ page }) => {
    await login(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForURL("**/student/dashboard**", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    // Let the real dashboard data load once before we start failing requests
    await page.waitForTimeout(1000)
    await expect(page.locator('text=67%')).toBeVisible()

    // Fail every subsequent dashboard fetch with a generic server error (not 401)
    // so we hit the retry-banner branch, not the session-expired branch, then
    // force a refetch via the sidebar's Clock In button (wired to refreshDashboard).
    await page.route("**/api/student/dashboard", route => route.fulfill({ status: 500, body: JSON.stringify({ error: "Simulated failure" }) }))
    await page.locator('button:has-text("Clock In")').first().click()
    await page.waitForTimeout(1000)

    const errorBanner = page.locator('[role="alert"]')
    await expect(errorBanner).toBeVisible({ timeout: 5000 })
    await expect(errorBanner).toContainText("couldn't load your dashboard")
    await expect(errorBanner).toContainText("may not be up to date")
    // Existing real data must still be visible — not wiped to zero
    await expect(page.locator('text=67%')).toBeVisible()
    // Must NOT have been bounced to login — a non-401 failure should never sign the user out
    await expect(page).toHaveURL(/\/student\/dashboard/)
  })

  test("a 401 on the dashboard fetch signs the user out with the session-expired banner, not a zeroed dashboard", async ({ page }) => {
    await login(page, STUDENT.identifier, STUDENT.password, "student")
    await page.waitForURL("**/student/dashboard**", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1000)

    await page.route("**/api/student/dashboard", route => route.fulfill({ status: 401, body: JSON.stringify({ error: "Authentication required" }) }), { times: 1 })
    await page.reload()

    // Must redirect to login (not sit on a zeroed dashboard) and show the session-expired banner
    await page.waitForURL("**/login**", { timeout: 10000 })
    const banner = page.locator('[role="status"]:has-text("session")')
    await expect(banner).toBeVisible({ timeout: 5000 })
  })
})
