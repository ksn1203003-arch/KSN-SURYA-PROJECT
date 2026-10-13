import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir:    "./e2e",
  timeout:    60_000,
  retries:    1,
  workers:    1,          // serial — tests share one DB, avoid race conditions
  reporter:   "list",
  use: {
    // Override with E2E_BASE_URL to run the same specs against a production build (`vite preview`).
    baseURL:       process.env.E2E_BASE_URL ?? "http://localhost:5173",
    headless:      true,
    slowMo:        0,
    screenshot:    "only-on-failure",
    video:         "off",
    trace:         "off",
    extraHTTPHeaders: {},
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Do NOT define webServer here — tests assume both servers are already running.
  // Start them manually: `npm run dev` in backend/ and frontend/ before running e2e.
})
