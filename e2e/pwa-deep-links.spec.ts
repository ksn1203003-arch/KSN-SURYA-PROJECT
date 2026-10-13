import { test, expect } from "@playwright/test"

// No sign-in needed. The service-worker test only means something on a production build:
//   cd frontend && npx vite build && npx vite preview --port 4173
//   E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/pwa-deep-links.spec.ts
// Against the dev server (no E2E_BASE_URL) there is no service worker, so that test skips itself.
// When E2E_BASE_URL is set the test FAILS instead of skipping if no worker registers, so a
// production-build run can never pass silently.
test.describe("Deep links and the offline cache", () => {
  const DEEP_LINK = "/student/dashboard/lessons/computer-science"
  const LOGIN_WITH_DEEP_LINK = /\/login\?redirect=%2Fstudent%2Fdashboard%2Flessons%2Fcomputer-science$/

  test("opening a deep dashboard address twice returns the app both times, not a 404", async ({ page }) => {
    const first = await page.goto(DEEP_LINK)
    expect(first?.status()).toBe(200)
    // Signed out, the dashboard guard sends the visitor to the login page and remembers the deep link.
    await expect(page).toHaveURL(LOGIN_WITH_DEEP_LINK)

    // Request the deep link itself again (a reload would re-request the login page instead).
    const second = await page.goto(DEEP_LINK)
    expect(second?.status()).toBe(200)
    await expect(page).toHaveURL(LOGIN_WITH_DEEP_LINK)
  })

  test("with the service worker active: deep links work offline, API and file addresses reach the network", async ({ page, context }) => {
    await page.goto("/")
    const hasServiceWorker = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
      ])
      return registration !== null
    })
    if (process.env.E2E_BASE_URL) {
      expect(hasServiceWorker, "E2E_BASE_URL is set, so a service worker must register").toBe(true)
    } else {
      test.skip(!hasServiceWorker, "no service worker registered (dev server) — only meaningful on a production build")
    }

    await page.reload() // let the active worker take control of the page

    // A dashboard deep link is answered by the worker with the cached app shell.
    const deepLink = await page.goto(DEEP_LINK)
    expect(deepLink?.fromServiceWorker()).toBe(true)

    // A file-like address and an API address must never be answered with the app shell: the worker
    // has to let them through to the network.
    const file = await page.goto("/certificate-download-check.txt")
    expect(file?.fromServiceWorker()).toBe(false)
    const api = await page.goto("/api/auth/me")
    expect(api?.fromServiceWorker()).toBe(false)

    // Offline, the cached shell still renders the deep link (it then asks the guard to send the signed-out
    // visitor to login, remembering the deep link) — proof the shell, not a network error page, was served.
    await context.setOffline(true)
    await page.goto(DEEP_LINK)
    await expect(page).toHaveURL(LOGIN_WITH_DEEP_LINK)
    await context.setOffline(false)
  })
})
