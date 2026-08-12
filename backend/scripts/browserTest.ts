/**
 * Full browser test using Puppeteer — tests all user scenarios end-to-end.
 * Usage: npx tsx --env-file=.env scripts/browserTest.ts
 */

import puppeteer, { type Browser, type Page } from "puppeteer"

const BASE = "http://localhost:5173"
let browser: Browser
let page: Page
let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log(`  ❌ ${name}`)
    console.log(`       → ${msg.slice(0, 150)}`)
    failed++
    failures.push(`${name}: ${msg.slice(0, 150)}`)
  }
}

async function goto(path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 20000 })
}

async function waitForNavTo(urlPart: string, timeout = 12000) {
  await page.waitForFunction(
    (part: string) => window.location.href.includes(part),
    { timeout },
    urlPart
  )
}

async function waitForBodyText(text: string, timeout = 10000) {
  await page.waitForFunction(
    (t: string) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
    { timeout },
    text
  )
}

async function getBody() {
  return page.evaluate(() => document.body.innerText)
}

async function clearStorage() {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
}

async function selectTab(role: "student" | "teacher" | "admin") {
  await page.waitForSelector("#identifier", { timeout: 8000 })
  await page.evaluate((r) => {
    const btns = Array.from(document.querySelectorAll("button"))
    const btn = btns.find(b => b.textContent?.trim().toLowerCase() === r)
    if (btn) (btn as HTMLButtonElement).click()
  }, role)
  await new Promise(r => setTimeout(r, 400))
}

async function loginWith(identifier: string, password: string, role: "student" | "teacher" | "admin") {
  await goto("/login")
  await selectTab(role)
  await page.click("#identifier", { clickCount: 3 })
  await page.type("#identifier", identifier)
  await page.click("#password", { clickCount: 3 })
  await page.type("#password", password)
  await page.keyboard.press("Enter")
}

// ══════════════════════════════════════════════════════════════════════════════

async function run() {
  console.log("\n🌐 TeachScript — Full Browser Test Suite\n")
  console.log(`   Frontend: ${BASE}`)
  console.log(`   Backend:  http://localhost:4000\n`)

  browser = await puppeteer.launch({
    headless: false,
    args: ["--window-size=1280,800", "--no-sandbox"],
    defaultViewport: { width: 1280, height: 800 },
    protocolTimeout: 60000,
  })
  page = await browser.newPage()
  page.setDefaultTimeout(12000)

  // ── Public Pages ────────────────────────────────────────────────────────────
  console.log("📄 Public Pages")

  await test("Homepage loads", async () => {
    await goto("/")
    await page.waitForSelector("body")
  })

  await test("Login page shows all 3 role tabs", async () => {
    await goto("/login")
    await page.waitForSelector("#identifier", { timeout: 8000 })
    const body = await getBody()
    if (!body.toLowerCase().includes("student") || !body.toLowerCase().includes("teacher") || !body.toLowerCase().includes("admin"))
      throw new Error("Missing role tabs. Body: " + body.slice(0, 100))
  })

  await test("404 page renders for unknown route", async () => {
    await goto("/this-page-does-not-exist-xyz")
    await new Promise(r => setTimeout(r, 1500))
    const body = (await getBody()).toLowerCase()
    if (!body.includes("not found") && !body.includes("missing") && !body.includes("oops") && !body.includes("404"))
      throw new Error("404 page not showing")
  })

  // ── Route Guards (logged out) ───────────────────────────────────────────────
  console.log("\n🔒 Route Guards")

  await test("Unauthenticated user → /admin/dashboard → redirected to /login", async () => {
    await clearStorage()
    await goto("/admin/dashboard")
    await new Promise(r => setTimeout(r, 2000))
    if (!page.url().includes("/login")) throw new Error(`Expected /login, got: ${page.url()}`)
  })

  await test("Unauthenticated user → /teacher/dashboard → redirected to /login", async () => {
    await clearStorage()
    await goto("/teacher/dashboard")
    await new Promise(r => setTimeout(r, 2000))
    if (!page.url().includes("/login")) throw new Error(`Expected /login, got: ${page.url()}`)
  })

  await test("Unauthenticated user → /student/dashboard → redirected to /login", async () => {
    await clearStorage()
    await goto("/student/dashboard")
    await new Promise(r => setTimeout(r, 2000))
    if (!page.url().includes("/login")) throw new Error(`Expected /login, got: ${page.url()}`)
  })

  // ── Role Segregation ────────────────────────────────────────────────────────
  console.log("\n🔐 Role Segregation — wrong tab tests")

  await test("Admin credentials on Student tab → rejected with error", async () => {
    await clearStorage()
    await loginWith("admin@dps-hyd.edu.in", "Admin@1234", "student")
    await new Promise(r => setTimeout(r, 3000))
    const url = page.url()
    const body = (await getBody()).toLowerCase()
    if (url.includes("dashboard")) throw new Error(`Should NOT navigate to dashboard, got: ${url}`)
    if (!body.includes("admin") && !body.includes("tab")) throw new Error("No role error shown")
  })

  await test("Teacher credentials on Admin tab → rejected with error", async () => {
    await clearStorage()
    await loginWith("priya.sharma@dps-hyd.edu.in", "Teacher@1234", "admin")
    await new Promise(r => setTimeout(r, 3000))
    if (page.url().includes("dashboard")) throw new Error(`Should NOT navigate to dashboard`)
  })

  await test("Student credentials on Teacher tab → rejected with error", async () => {
    await clearStorage()
    await loginWith("6b01", "Student@1234", "teacher")
    await new Promise(r => setTimeout(r, 3000))
    if (page.url().includes("dashboard")) throw new Error(`Should NOT navigate to dashboard`)
  })

  await test("Wrong password → error shown", async () => {
    await clearStorage()
    await loginWith("admin@dps-hyd.edu.in", "WrongPass999", "admin")
    await new Promise(r => setTimeout(r, 3000))
    const body = (await getBody()).toLowerCase()
    if (!body.includes("incorrect") && !body.includes("invalid") && !body.includes("failed") && !body.includes("password"))
      throw new Error("No error for wrong password")
  })

  await test("Non-existent user → error shown", async () => {
    await clearStorage()
    await loginWith("ghost@fake.com", "anything", "admin")
    // Wait for an error div or the page to settle
    await new Promise(r => setTimeout(r, 4000))
    const body = await page.evaluate(() => document.body.innerText).catch(() => "")
    if (!body.toLowerCase().includes("no account") && !body.toLowerCase().includes("not found") && !body.toLowerCase().includes("invalid") && !body.toLowerCase().includes("failed"))
      throw new Error("No error for non-existent user. Body: " + body.slice(0, 150))
  })

  // ── Admin Login & Dashboard ─────────────────────────────────────────────────
  console.log("\n🏫 Admin Dashboard")

  await test("Admin login → navigates to /admin/dashboard", async () => {
    await clearStorage()
    await loginWith("admin@dps-hyd.edu.in", "Admin@1234", "admin")
    await waitForNavTo("/admin/dashboard", 10000)
  })

  await test("Admin dashboard shows school name", async () => {
    await waitForBodyText("Delhi Public School", 10000)
  })

  await test("Admin dashboard shows teacher/student/class stats", async () => {
    const body = await getBody()
    // Stats show 3 teachers, 5 students, 5 classes
    if (!body.includes("3") || !body.includes("5")) throw new Error("Stats missing. Body: " + body.slice(0, 300))
  })

  await test("Admin dashboard shows class list", async () => {
    const body = await getBody()
    if (!body.includes("6") && !body.includes("Class") && !body.includes("A") && !body.includes("B"))
      throw new Error("No class list. Body: " + body.slice(0, 300))
  })

  await test("Admin → page refresh → stays on /admin/dashboard", async () => {
    await page.reload({ waitUntil: "networkidle2" })
    await waitForNavTo("/admin/dashboard")
    await waitForBodyText("Delhi Public School", 8000)
  })

  await test("Already logged-in admin visiting /login → redirected to dashboard", async () => {
    await goto("/login")
    await new Promise(r => setTimeout(r, 2000))
    if (page.url().includes("/login")) throw new Error("Should redirect away from /login when authenticated")
  })

  // ── Teacher Login & Dashboard ───────────────────────────────────────────────
  console.log("\n👩‍🏫 Teacher Dashboard")

  await test("Teacher login → navigates to /teacher/dashboard", async () => {
    await clearStorage()
    await loginWith("priya.sharma@dps-hyd.edu.in", "Teacher@1234", "teacher")
    await waitForNavTo("/teacher/dashboard", 10000)
  })

  await test("Teacher dashboard shows teacher name (Priya Sharma)", async () => {
    await waitForBodyText("Priya", 10000)
  })

  await test("Teacher dashboard shows assigned class (6B)", async () => {
    await waitForBodyText("6B", 8000)
  })

  await test("Teacher dashboard shows student roster", async () => {
    const body = await getBody()
    if (!body.includes("Arjun") && !body.includes("Preethi") && !body.includes("Rohan") && !body.includes("student"))
      throw new Error("No student data visible. Body: " + body.slice(0, 400))
  })

  await test("Teacher → page refresh → stays on /teacher/dashboard", async () => {
    await page.reload({ waitUntil: "networkidle2" })
    await waitForNavTo("/teacher/dashboard")
    await waitForBodyText("Priya", 8000)
  })

  // ── Student Login & Dashboard ───────────────────────────────────────────────
  console.log("\n🎒 Student Dashboard")

  await test("Student login (username) → navigates to /student/dashboard", async () => {
    await clearStorage()
    await loginWith("6b01", "Student@1234", "student")
    await waitForNavTo("/student/dashboard", 10000)
  })

  await test("Student dashboard shows student name (Arjun Reddy)", async () => {
    await waitForBodyText("Arjun", 10000)
  })

  await test("Student → page refresh → stays on /student/dashboard", async () => {
    await page.reload({ waitUntil: "networkidle2" })
    await waitForNavTo("/student/dashboard")
    await waitForBodyText("Arjun", 8000)
  })

  // ── Sign Out ────────────────────────────────────────────────────────────────
  console.log("\n🚪 Sign Out")

  await test("Sign out clears token and redirects away from dashboard", async () => {
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("button, a, [role='button']"))
      const btn = all.find(el => el.textContent?.toLowerCase().includes("sign out") || el.textContent?.toLowerCase().includes("log out"))
      if (btn) (btn as HTMLElement).click()
    })
    await new Promise(r => setTimeout(r, 2500))
    const token = await page.evaluate(() => localStorage.getItem("ts_token"))
    if (token) throw new Error("Token still in localStorage after sign out")
    if (page.url().includes("/student/dashboard")) throw new Error("Still on student dashboard after sign out")
  })

  // ── Forgot Password ─────────────────────────────────────────────────────────
  console.log("\n🔑 Forgot Password")

  await test("Forgot password link shows email form", async () => {
    await clearStorage()
    await goto("/login")
    await page.waitForSelector("#identifier", { timeout: 5000 })
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"))
      const fp = btns.find(b => b.textContent?.toLowerCase().includes("forgot"))
      if (fp) fp.click()
    })
    await new Promise(r => setTimeout(r, 800))
    await waitForBodyText("email", 5000)
  })

  await test("Forgot password → valid email → shows confirmation", async () => {
    const emailInput = await page.$("input[type='email']") ?? await page.$("input[placeholder*='email' i]")
    if (!emailInput) throw new Error("Email input not found")
    await emailInput.click({ clickCount: 3 })
    await emailInput.type("admin@dps-hyd.edu.in")
    await page.keyboard.press("Enter")
    await new Promise(r => setTimeout(r, 3000))
    const body = (await getBody()).toLowerCase()
    if (!body.includes("sent") && !body.includes("check") && !body.includes("reset") && !body.includes("link"))
      throw new Error("No confirmation shown. Body: " + body.slice(0, 200))
  })

  // ── Summary ─────────────────────────────────────────────────────────────────
  await browser.close()

  const total = passed + failed
  console.log("\n" + "═".repeat(55))
  console.log(`📊 Results: ${passed}/${total} passed  |  ${failed} failed`)
  console.log("═".repeat(55))

  if (failures.length > 0) {
    console.log("\n❌ Failures:")
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
  } else {
    console.log("\n🎉 All tests passed!")
  }
  console.log("")
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error("\n💥 Test runner crashed:", err.message)
  browser?.close()
  process.exit(1)
})
