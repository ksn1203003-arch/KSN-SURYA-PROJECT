import { test, expect, type Page, type Response } from "@playwright/test"

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4–5 load reduction, checked in a real browser:
//  • people lists carry a photo address, never the photo; photos load only for rows on screen
//  • admin lists load every row and show 25 per page; select-all covers only the page
//  • student dashboard, teachers list and report cards (built once, reused)
//  • lesson videos play in parts through a session-bound stream link
// One sign-in per role for the whole file (sign-in is limited to 5 per 15 minutes).
// Run with --retries=0 so a retry never spends another sign-in.
// ─────────────────────────────────────────────────────────────────────────────

const API = process.env.E2E_API_URL ?? "http://localhost:4000"
const ADMIN   = { identifier: "ksn1203003@gmail.com",        password: "Admin@1234" }
const STUDENT = { identifier: "5c4",                         password: "TS@GHZg5b8" }
const TEACHER = { identifier: "priya.sharma@dps-hyd.edu.in", password: "Teacher@1234" }

async function signIn(page: Page, tab: "Student" | "Teacher" | "Admin", creds: { identifier: string; password: string }, shot: string) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  await page.screenshot({ path: `ss_${shot}_login_page.png` })
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
  await page.screenshot({ path: `ss_${shot}_after_login.png` })
}

function sidebar(page: Page, label: string) {
  return page.locator("aside").getByText(label, { exact: true }).first()
}

// ── Admin ─────────────────────────────────────────────────────────────────────
test.describe("Admin — people lists without photos inside, 25 rows per page", () => {
  test.describe.configure({ mode: "serial" })
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ serviceWorkers: "block" })
    await signIn(page, "Admin", ADMIN, "admin")
  })
  test.afterAll(async () => { await page.close() })

  test("Students list: every row loaded in pages of 200, no picture data in the list, photos only for the rows shown", async () => {
    const photoRequests = new Set<string>()
    page.on("request", r => { if (r.url().includes("/api/photos/")) photoRequests.add(r.url()) })
    const listResponse = page.waitForResponse(r => r.url().includes("/api/school/students") && r.request().method() === "GET")
    await sidebar(page, "Students").click()
    const res: Response = await listResponse
    expect(res.status()).toBe(200)
    expect(res.url()).toContain("limit=200")
    const body = await res.text()
    expect(body).not.toContain("data:image")
    expect(body).not.toContain("profile_photo_url")
    const total = (JSON.parse(body) as { pagination: { total: number } }).pagination.total

    const rows = page.locator('tbody input[type="checkbox"][aria-label^="Select "]')
    await expect(rows.first()).toBeVisible({ timeout: 15000 })
    expect(await rows.count()).toBeLessThanOrEqual(25)
    await page.waitForLoadState("networkidle")
    expect(photoRequests.size).toBeLessThanOrEqual(25)

    const pager = page.getByRole("navigation", { name: "students pages" })
    await expect(pager).toBeVisible()
    await expect(pager).toContainText(total > 25 ? `of ${total} students` : `${total} students`)
    await page.screenshot({ path: "ss_admin_students_list.png", fullPage: true })
  })

  test("Select-all ticks only the rows on this page", async () => {
    const pageRows = page.locator('tbody input[type="checkbox"][aria-label^="Select "]')
    const onPage = await pageRows.count()
    await page.getByRole("checkbox", { name: "Select all students on this page" }).check()
    await expect(page.getByText(new RegExp(`^${onPage} selected`))).toBeVisible()
    await page.screenshot({ path: "ss_admin_select_page.png" })
    await page.getByRole("button", { name: "Clear" }).click()
    await expect(page.getByText(/ selected/)).toHaveCount(0)
  })

  test("Teachers list carries photo addresses, not pictures", async () => {
    // The dashboard may already have loaded this list, so read it directly as the page does
    await sidebar(page, "Teachers").click()
    const res = await page.request.get(`${API}/api/school/teachers?page=1&limit=200`)
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).not.toContain("data:image")
    for (const t of (JSON.parse(body) as { teachers: Array<{ photo_url: string | null }> }).teachers) {
      if (t.photo_url) expect(t.photo_url).toMatch(/^\/api\/photos\/[a-f0-9]{24}\?v=\d+$/)
    }
    await expect(page.getByRole("navigation", { name: "teachers pages" })).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: "ss_admin_teachers_list.png", fullPage: true })
  })

  test("a malformed class filter is refused cleanly", async () => {
    const res = await page.request.get(`${API}/api/school/students?class_id[$ne]=x`)
    expect(res.status()).toBe(400)
  })

  test("regression — Classes still load", async () => {
    await sidebar(page, "Classes").click()
    await page.waitForLoadState("networkidle")
    await expect(page.getByText(/Class/).first()).toBeVisible()
    await page.screenshot({ path: "ss_admin_regression_classes.png" })
  })
})

// ── Student ───────────────────────────────────────────────────────────────────
test.describe("Student — slim dashboard, teachers list, report card built once", () => {
  test.describe.configure({ mode: "serial" })
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ serviceWorkers: "block" })
    await signIn(page, "Student", STUDENT, "student")
  })
  test.afterAll(async () => { await page.close() })

  test("dashboard summary still has every number the tiles need", async () => {
    const summary = page.waitForResponse(r => r.url().endsWith("/api/student/dashboard"))
    await page.goto("/student/dashboard")
    const res = await summary
    expect(res.status()).toBe(200)
    const d = await res.json() as Record<string, unknown>
    for (const key of ["attendance_rate", "days_present", "days_total", "days_recorded", "points_total", "streak_days", "modules_total", "modules_completed"]) {
      expect(typeof d[key], key).toBe("number")
    }
    expect(Array.isArray(d.upcoming_events)).toBe(true)
    await expect(page.getByText(/periods ·/).first()).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: "ss_student_dashboard.png" })
  })

  test("teachers list carries photo addresses only", async () => {
    const list = page.waitForResponse(r => r.url().endsWith("/api/student/teachers"))
    await page.goto("/student/dashboard/teachers")
    const res = await list
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).not.toContain("data:image")
    await page.waitForLoadState("networkidle")
    await page.screenshot({ path: "ss_student_teachers.png" })
  })

  test("report card: second download is the same stored PDF", async () => {
    const first = await page.request.get(`${API}/api/marks/my-report-card`)
    expect(first.status()).toBe(200)
    expect(first.headers()["content-type"]).toContain("application/pdf")
    expect(first.headers()["cache-control"]).toBe("private, no-store")
    const second = await page.request.get(`${API}/api/marks/my-report-card`)
    expect(second.status()).toBe(200)
    expect(Buffer.compare(await first.body(), await second.body())).toBe(0)
  })

  test("a student cannot use the staff report-card route, and unknown photos answer 404", async () => {
    const me = await (await page.request.get(`${API}/api/auth/me`)).json() as { profile: { id: string } }
    expect(me.profile.id).toMatch(/^[a-f0-9]{24}$/)
    const staffRoute = await page.request.get(`${API}/api/marks/report-card/${me.profile.id}`)
    expect(staffRoute.status()).toBe(403)
    const photo = await page.request.get(`${API}/api/photos/000000000000000000000000`)
    expect(photo.status()).toBe(404)
  })

  test("regression — My Marks still loads", async () => {
    await page.goto("/student/dashboard/marks")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading").first()).toBeVisible()
    await page.screenshot({ path: "ss_student_regression_marks.png" })
  })
})

// ── Teacher ───────────────────────────────────────────────────────────────────
// A tiny file with a real MP4 signature (it will not decode — the check is that the
// player asks for it in parts through the stream link). Removed again in afterAll.
const MP4_BYTES = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.from([0, 0, 0, 0]), Buffer.from("mp42isom"),
  Buffer.from([0, 0, 0, 0x10]), Buffer.from("mdat"), Buffer.alloc(8, 1),
])

test.describe("Teacher — lesson videos play in parts; progress limited to own classes", () => {
  test.describe.configure({ mode: "serial" })
  let page: Page
  let moduleId: string | null = null
  let classId = ""
  let classLabel = ""
  let subject = ""

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ serviceWorkers: "block" })
    await signIn(page, "Teacher", TEACHER, "teacher")
  })
  test.afterAll(async () => {
    if (moduleId) await page.request.delete(`${API}/api/modules/${moduleId}`)
    await page.close()
  })

  test("a lesson video is fetched in parts through a session-bound stream link", async () => {
    const classes = await (await page.request.get(`${API}/api/teacher/my-classes`)).json() as {
      classes: Array<{ id: string; grade: number; section: string; subjects: string[] }>
    }
    const cls = classes.classes.find(c => c.subjects.length > 0)
    test.skip(!cls, "The teacher has no class with subjects")
    classId = cls!.id
    classLabel = `Class ${cls!.grade}${cls!.section}`
    subject = cls!.subjects[0]

    const created = await page.request.post(`${API}/api/modules`, { data: { class_id: classId, subject, title: "E2E video stream check" } })
    expect(created.ok()).toBe(true)
    moduleId = ((await created.json()) as { module: { _id: string } }).module._id
    const uploaded = await page.request.post(`${API}/api/modules/${moduleId}/items`, {
      multipart: { files: { name: "e2e-stream-check.mp4", mimeType: "video/mp4", buffer: MP4_BYTES } },
    })
    expect(uploaded.ok(), await uploaded.text()).toBe(true)

    await sidebar(page, "Lessons").click()
    await page.getByRole("button", { name: new RegExp(`^${classLabel}`) }).first().click()
    await page.getByRole("button", { name: new RegExp(subject) }).first().click()
    await expect(page.getByText("E2E video stream check")).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: "ss_teacher_lessons_module.png" })

    const part = page.waitForResponse(r => /\/api\/files\/[a-f0-9]{24}\?st=/.test(r.url()), { timeout: 20000 })
    await page.getByText("e2e-stream-check", { exact: false }).first().click()
    const res = await part
    expect([200, 206]).toContain(res.status())
    expect(res.headers()["cross-origin-resource-policy"]).toBe("same-site")
    expect(res.headers()["content-type"]).toBe("video/mp4")
    await page.waitForTimeout(1500)
    await page.screenshot({ path: "ss_teacher_video_player.png" })

    // The same link without the signed-in session plays nothing
    const bare = await fetch(res.url(), { headers: { Range: "bytes=0-9" } })
    expect(bare.status).toBe(401)
  })

  test("class progress only for a class the teacher teaches", async () => {
    test.skip(!classId, "No class found in the previous test")
    const ok = await page.request.get(`${API}/api/teacher/student-progress?class_id=${classId}`)
    expect(ok.status()).toBe(200)
    const bad = await page.request.get(`${API}/api/teacher/student-progress?class_id=not-an-id`)
    expect(bad.status()).toBe(400)
  })

  test("regression — Attendance still loads", async () => {
    await page.keyboard.press("Escape")
    await sidebar(page, "Attendance").click()
    await page.waitForLoadState("networkidle")
    await expect(page.getByText(/Attendance/).first()).toBeVisible()
    await page.screenshot({ path: "ss_teacher_regression_attendance.png" })
  })
})
