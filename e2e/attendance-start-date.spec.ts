import { test, expect, type BrowserContext, type Locator, type Page, type Request as PwRequest, type Response as PwResponse } from "@playwright/test"

// ─────────────────────────────────────────────────────────────────────────────
// "Attendance is counted from the class's start date", checked through the real screens (headless chromium).
//
// WHAT IS PROVEN (owner-approved rule): every attendance figure counts only sheets dated on or after the class's stored
// start date. The server also sends `counted_from` and `counted_class_label`, and the screens show a basis line made by
// attendanceBasisLabel(): "Class 7A, counted from 1 Aug 2026" / "All recorded sheets" /
// "Counting starts on 1 Jan 2027, so nothing is counted yet."
//
//   R5  both/all sessions are on localhost and nothing left it
//   P1  student (read only): baseline from GET /api/student/attendance and /api/student/dashboard; the Dashboard tile and the
//       My Attendance screen show the basis line the server's counted_from / counted_class_label produce
//   P1p parent (read only, annotation "NOT FOUND" when there is no parent test login linked to that student): baseline
//   P2  admin: finds the student's class (id from the student's own /api/auth/me), reads the stored date (date may be none),
//       reads the admin student-detail baseline, moves the start to TOMORROW through the Edit class form        (date save 1)
//   P3  everything now counts nothing: student API + both student screens, admin API + the open student row
//   P3p parent: API total 0 / rate null / recorded false, screen shows the basis line and the neutral "N/A" (no orange class)
//   P4  admin: moves the start back to the recorded original (a date can never be cleared, so a class that had none gets
//       the earliest allowed date, which counts every sheet)                                                     (date save 2)
//   P5  figures are back: student API (this year window and all-time) equals the baseline, screens show the new basis line,
//       admin student-detail equals the admin baseline
//   P5p parent: figures equal the baseline and the student's own
// (Run order: R5, P1, P1p, P2, P3, P3p, P4, P5, P5p = 9 tests; they build on each other.)
//
// Date saves: exactly 2 (limit is 10 per hour per admin). Sign-ins: 1 admin + 1 student + 1 parent (when configured).
// If any test after P2 fails, the following tests do not run (serial mode); the afterAll hook then moves the date back
// through the same Edit class form, so the real class is never left on tomorrow's date.
//
// SAFETY RULES (owner-approved):
//   1. localhost only: base URL, API URL and every /api/ request must be localhost (also after redirects).
//   2. credentials come ONLY from environment variables (see requireEnv below), never written in this file.
//   3. one sign-in per role for the whole file; serial; no automatic repeats; every test always runs in full.
//   4. no record is created or deleted by this spec. Only ONE existing class date is changed and restored (a real class).
//   5. no rate limit, role, school or token check is bypassed; no request is replaced or faked.
//
// Environment:  E2E_ADMIN_ID  E2E_ADMIN_PASSWORD  E2E_STUDENT_ID  E2E_STUDENT_PASSWORD
//   optional:   E2E_PARENT_ID  E2E_PARENT_PASSWORD (a parent test login linked to that same student)
//               E2E_BASE_URL (default http://localhost:5173)  E2E_API_URL (default http://localhost:4000)
//
// Known limits (reported, not hidden):
//   - The class of the student is a REAL class: while the run is between P2 and P4 its start date is tomorrow, so a teacher
//     of that class cannot save a sheet dated today in that window (a few minutes).
//   - If the class had NO stored date, P4 can only give it the earliest allowed date (a date cannot be cleared). The class
//     then counts every sheet of the last two years instead of "all sheets"; that is the same figure for any school with
//     less than two years of sheets, but the screens' basis line changes from "All recorded sheets" to a date.
//   - The expected wording of the basis line is written out below (basisLabel) on purpose, so that a wording change in
//     lib/attendanceBasis.ts fails this spec; it must give the same text as attendanceBasisLabel().
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173"
const API_URL  = (process.env.E2E_API_URL ?? "http://localhost:4000").replace(/\/+$/, "")

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

function assertLocalUrl(raw: string, what: string): void {
  const host = new URL(raw).hostname
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to run: ${what} is "${host}", not localhost / 127.0.0.1 / [::1].`)
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable ${name}. Set E2E_ADMIN_ID, E2E_ADMIN_PASSWORD, E2E_STUDENT_ID and E2E_STUDENT_PASSWORD before running this spec.`)
  return v
}

// ── Contexts, pages and what the first tests learn ────────────────────────────
let adminCtx: BrowserContext | undefined
let studentCtx: BrowserContext | undefined
let parentCtx: BrowserContext | undefined
let admin: Page
let student: Page
let parent: Page | undefined
const adminViolations: string[] = []
const studentViolations: string[] = []
const parentViolations: string[] = []

let studentId = ""
let studentName = ""
let studentClassId = ""

// ── Dates (all IST, as YYYY-MM-DD strings; never a device-zone Date) ──────────
/** Today in India (the school's day) as YYYY-MM-DD. */
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
/** Same month and day some years earlier (29 Feb falls back to 28 Feb, like the server's subtractYearsYmd). */
function subtractYears(ymd: string, years: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const candidate = new Date(Date.UTC(y - years, m - 1, d))
  if (candidate.getUTCMonth() !== m - 1) return `${String(y - years).padStart(4, "0")}-02-28`
  return candidate.toISOString().slice(0, 10)
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "2026-06-01" becomes "1 Jun 2026", the way the screens show a date. */
function showYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** The caption under an attendance figure, written out here on purpose (same text as attendanceBasisLabel()). */
function basisLabel(countedFrom: string | null, className: string | null, today: string): string {
  if (countedFrom === null || !/^\d{4}-\d{2}-\d{2}$/.test(countedFrom)) return "All recorded sheets"
  const date = showYmd(countedFrom)
  if (countedFrom > today) return `Counting starts on ${date}, so nothing is counted yet.`
  return className ? `${className}, counted from ${date}` : `Counted from ${date}`
}

function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }
const exactText = (s: string): RegExp => new RegExp(`^${escapeRegExp(s)}$`)

// ── Answer shapes (only the fields this spec reads) ───────────────────────────
interface SlotSummary { total: number; present: number; absent: number; late: number; rate: number; recorded: boolean }
interface StudentAttendanceBody {
  summary: { today: SlotSummary; this_week: SlotSummary; this_month: SlotSummary; this_year: SlotSummary }
  counted_from: string | null
  counted_class_label: string | null
}
interface DashboardBody {
  attendance_rate: number; days_present: number; days_total: number; days_recorded: number
  counted_from: string | null; counted_class_label: string | null
}
interface AdminDetailBody {
  attendance_rate: number | null
  attendance_breakdown: { present: number; late: number; absent: number; total: number }
  counted_from: string | null; counted_class_label: string | null
}
interface ParentAttendanceBody {
  records: unknown[]; total: number; present: number; late: number; absent: number
  rate: number | null; recorded: boolean
  counted_from: string | null; counted_class_label: string | null
}
interface ClassListRow { id: string; grade: number; section: string; name: string | null; year_start: string | null; hasStartDate: boolean }

interface Baseline { att: StudentAttendanceBody; dash: DashboardBody }
let baseline: Baseline | undefined
let adminBaseline: AdminDetailBody | undefined
let parentBaseline: ParentAttendanceBody | undefined
let parentState: "none" | "unlinked" | "linked" = "none"

interface MovePlan {
  classId: string
  label: string                 // how the admin Classes table names the class
  serverLabel: string           // how the server names it in counted_class_label
  original: string | null       // the stored date before this run (null = none stored)
  target: string                // tomorrow (or the day after, when tomorrow was already stored)
  restoreTo: string             // the original, or the earliest allowed date when there was none
  sheetsLeaving: number         // answer of the first save (0 when the class had no stored date)
}
let plan: MovePlan | undefined
let dateRestored = false

function requireBaseline(): Baseline {
  if (!baseline) throw new Error("P1 did not record the baseline, so this test cannot run.")
  return baseline
}
function requirePlan(): MovePlan {
  if (!plan) throw new Error("P2 did not record the move plan, so this test cannot run.")
  return plan
}

// ── A record of every failed or refused /api/ request, kept for the messages of the status checks ──
// Only: method, path (24-hex ids replaced by ":id", query string removed) and status (or "failed"). A response body is
// NEVER read or stored (a failed answer may hold personal data).
interface ApiFailureNote { page: string; method: string; path: string; status: number | "failed" }
const failedApiRequests: ApiFailureNote[] = []

function apiPathForNote(rawUrl: string): string | null {
  const u = new URL(rawUrl)
  const underApiUrl = rawUrl.startsWith(`${API_URL}/api`)
  const sameOriginApi = u.origin === new URL(BASE_URL).origin && u.pathname.startsWith("/api/")
  if (!underApiUrl && !sameOriginApi) return null
  return u.pathname.replace(/[a-f0-9]{24}/gi, ":id")
}

function watchApiFailures(page: Page, tag: string): void {
  page.on("response", (res: PwResponse) => {
    const path = apiPathForNote(res.url())
    if (path === null || res.status() < 400) return
    failedApiRequests.push({ page: tag, method: res.request().method(), path, status: res.status() })
  })
  page.on("requestfailed", (req: PwRequest) => {
    const path = apiPathForNote(req.url())
    if (path === null) return
    failedApiRequests.push({ page: tag, method: req.method(), path, status: "failed" })
  })
}

const failedRequestsNote = (): string => JSON.stringify(failedApiRequests)

// ── Localhost guard, sign-in, small helpers ───────────────────────────────────
async function installApiGuard(ctx: BrowserContext, violations: string[]): Promise<void> {
  await ctx.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
    const u = new URL(route.request().url())
    if (LOCAL_HOSTS.has(u.hostname)) { await route.continue(); return }
    violations.push(`${route.request().method()} ${u.hostname}${u.pathname}`)
    await route.abort("blockedbyclient")
  })
}

async function signIn(page: Page, tab: "Admin" | "Student" | "Parent", identifier: string, password: string): Promise<void> {
  await page.goto("/login")
  await page.locator("#identifier").waitFor()
  await page.screenshot({ path: `ss_attendance_start_login_${tab.toLowerCase()}.png` })   // empty form only
  await page.getByRole("button", { name: tab, exact: true }).click()
  await page.locator("#identifier").pressSequentially(identifier, { delay: 15 })
  await page.locator("#password").pressSequentially(password, { delay: 15 })
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  try {
    await page.waitForURL(u => u.pathname.startsWith(`/${tab.toLowerCase()}/dashboard`), { timeout: 30_000 })
  } catch {
    throw new Error(`${tab} sign-in did not reach /${tab.toLowerCase()}/dashboard. Check the E2E_* credentials, a forced password change, two-step sign-in, or the 5-per-15-minutes sign-in limit. No repeat was made.`)
  }
  assertLocalUrl(page.url(), `page address after ${tab} sign-in`)   // redirect-proof
}

const sidebar = (page: Page, label: string): Locator => page.locator("aside").getByText(label, { exact: true }).first()

async function shot(target: Page | Locator, step: string): Promise<void> {
  await target.screenshot({ path: `ss_attendance_start_${step}.png` })
}

/** A read-only GET from a signed-in browser session; the status is checked BEFORE the body is read. */
async function getJson<T>(page: Page, path: string, what: string): Promise<T> {
  const res = await page.request.get(`${API_URL}${path}`)
  expect(res.status(), `${what} must answer 200; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
  return await res.json() as T
}

// ── Admin helpers ─────────────────────────────────────────────────────────────
const patchClassPath = /\/api\/school\/classes\/[a-f0-9]{24}$/
const yearField = (): Locator => admin.getByLabel("School year starts")
const yearStartConfirm = (): Locator => admin.getByRole("group", { name: "Confirm school year start change" })

async function openClasses(): Promise<void> {
  await admin.goto("/admin/dashboard")
  await sidebar(admin, "Classes").click()
  await expect(admin.getByRole("heading", { name: "Classes", exact: true }).first()).toBeVisible()
  await expect(admin.locator("tbody tr").first().or(admin.getByText("No classes yet"))).toBeVisible({ timeout: 20_000 })
}

async function openStudents(): Promise<void> {
  await admin.goto("/admin/dashboard")
  await sidebar(admin, "Students").click()
  await expect(admin.locator("#students-table").or(admin.getByText("No students yet"))).toBeVisible({ timeout: 20_000 })
}

/** Read-only: the admin class list as the API sends it (the same list the Classes table draws). */
async function readClassList(): Promise<ClassListRow[]> {
  const body = await getJson<{ classes: Array<{ id: string; grade: number; section: string; name?: string | null; year_start?: string | null; has_start_date?: boolean }> }>(
    admin, "/api/school/classes", "the admin class list")
  return body.classes.map(c => ({
    id: c.id, grade: c.grade, section: c.section, name: c.name ?? null,
    year_start: c.year_start ?? null, hasStartDate: c.has_start_date === true,
  }))
}

/** How the admin Classes table names a class: its own name, else "Class 5A", else the section. */
function adminClassLabel(c: ClassListRow): string {
  return c.name ?? (c.grade > 0 ? `Class ${c.grade}${c.section}` : c.section)
}
/** How the server names the class in `counted_class_label`: "Class 5A" for a numbered class, else its own name. */
function serverClassLabel(c: ClassListRow): string {
  return c.grade > 0 ? `Class ${c.grade}${c.section}` : (c.name ?? c.section)
}

/** The one table row of a class, found by its own select box (not by position). */
function classRowOf(label: string): Locator {
  return admin.locator("tbody tr").filter({ has: admin.getByRole("checkbox", { name: `Select ${label}`, exact: true }) })
}

async function storedStartOf(classId: string): Promise<string | null> {
  const found = (await readClassList()).find(c => c.id === classId)
  expect(found, `class ${classId} must be in the admin class list`).toBeDefined()
  return found?.year_start ?? null
}

/**
 * Changes the start date of one class through the real Edit class form and waits for the answer.
 * from === null: the class has no stored date, so the first date is saved directly (no confirmation).
 * from is a date: Save Changes asks first, the confirmation must name from and to, and "Yes, change date" saves.
 */
async function changeYearStart(a: { classId: string; label: string; from: string | null; to: string; step: string }): Promise<{ sheets_leaving: number; sheets_entering: number }> {
  await openClasses()
  const row = classRowOf(a.label)
  const rowCount = await row.count()
  if (rowCount !== 1) {
    throw new Error(`Expected exactly one Classes row for "${a.label}" but found ${rowCount}. Nothing was changed.`)
  }
  await row.getByRole("button", { name: "Edit class" }).click()
  await expect(yearField()).toBeVisible()
  await expect(yearField()).toHaveValue(a.from ?? "")
  await yearField().fill(a.to)

  const isThisPatch = (r: PwResponse): boolean =>
    r.request().method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname) && new URL(r.url()).pathname.endsWith(`/${a.classId}`)

  let answered: Promise<PwResponse>
  if (a.from === null) {
    answered = admin.waitForResponse(isThisPatch)
    await admin.getByRole("button", { name: "Save Changes" }).click()
  } else {
    await admin.getByRole("button", { name: "Save Changes" }).click()
    const confirm = yearStartConfirm()
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText(`from ${showYmd(a.from)} to ${showYmd(a.to)}`)
    await shot(confirm, `${a.step}_confirm`)
    answered = admin.waitForResponse(isThisPatch)
    await confirm.getByRole("button", { name: "Yes, change date" }).click()
  }
  const res = await answered
  expect(res.status(), `saving the start date (${a.step}); failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
  expect((res.request().postDataJSON() as { year_start?: string }).year_start).toBe(a.to)
  const body = await res.json() as { sheets_leaving?: number; sheets_entering?: number }
  if (a.from === null) await expect(yearStartConfirm()).toHaveCount(0)   // a first date is saved directly
  await expect(yearField()).toBeHidden()
  await expect(classRowOf(a.label)).toContainText(`Year from ${showYmd(a.to)}`)
  await shot(classRowOf(a.label), `${a.step}_row_saved`)
  expect(await storedStartOf(a.classId), "the stored date must now be the one that was saved").toBe(a.to)
  return { sheets_leaving: body.sheets_leaving ?? 0, sheets_entering: body.sheets_entering ?? 0 }
}

/** The student's row on the admin Students screen, found by the exact name; the class label narrows twins. */
async function openStudentDetail(): Promise<void> {
  await openStudents()
  await admin.getByPlaceholder(/Search students/).fill(studentName)
  const byName = admin.locator("#students-table tbody tr")
    .filter({ has: admin.getByRole("checkbox", { name: `Select ${studentName}`, exact: true }) })
  await expect(byName.first()).toBeVisible({ timeout: 20_000 })
  let row = byName
  if (await byName.count() > 1) {
    const cls = requirePlan()
    row = byName.filter({ hasText: cls.label })
  }
  const n = await row.count()
  if (n !== 1) throw new Error(`Expected exactly one Students row for the test student but found ${n} (same name in more than one row). Nothing was changed.`)
  const detailDone = admin.waitForResponse(r =>
    r.request().method() === "GET" && new URL(r.url()).pathname.endsWith(`/api/school/student-detail/${studentId}`))
  await row.getByRole("button", { name: "View student details" }).click()
  const res = await detailDone
  expect(res.status(), `the student detail request must answer 200; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
}

/** The Attendance box of the open student row on the admin Students screen. */
const adminAttendanceCard = (): Locator =>
  admin.locator("div.rounded-lg").filter({ has: admin.locator("span").filter({ hasText: /^Attendance$/ }) })

// ── Student screen helpers ────────────────────────────────────────────────────
/** Opens the Dashboard, drops the browser's stored dashboard figure (what waiting 5 minutes does) and reloads it. */
async function loadStudentDashboardFresh(): Promise<void> {
  await student.goto("/student/dashboard")
  assertLocalUrl(student.url(), "student page address")
  await student.evaluate(() => {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null && k.startsWith("ts_dash_v2_")) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  })
  await student.reload()
  assertLocalUrl(student.url(), "student page address after reload")
}

/** Shows what the student's two attendance screens must say for these server answers. */
async function expectStudentScreens(att: StudentAttendanceBody, dash: DashboardBody, step: string): Promise<void> {
  const today = istToday()
  const label = basisLabel(att.counted_from, att.counted_class_label, today)
  expect(basisLabel(dash.counted_from, dash.counted_class_label, today), "the dashboard and the attendance answers must give the same basis line").toBe(label)

  // Dashboard: the Attendance tile
  await loadStudentDashboardFresh()
  const tile = student.locator('[aria-label^="Attendance:"]')
  await expect(tile).toHaveAttribute("aria-label", `Attendance: ${dash.attendance_rate}%. View details`, { timeout: 20_000 })
  const periodsText = `${dash.days_present}/${dash.days_total} periods · ${dash.days_recorded} day${dash.days_recorded !== 1 ? "s" : ""}`
  await expect(tile.getByText(periodsText, { exact: true })).toBeVisible()
  await expect(tile.getByText(label, { exact: true })).toBeVisible()
  await shot(tile, `${step}_student_tile`)

  // My Attendance: the line at the top and the This Year box
  await student.goto("/student/dashboard/attendance")
  assertLocalUrl(student.url(), "student page address (My Attendance)")
  await expect(student.getByRole("heading", { name: "My Attendance", exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(student.locator("p.text-xs.text-muted-foreground").filter({ hasText: exactText(label) })).toBeVisible()
  const yearBox = student.locator("div.skillio-card.flex-col").filter({ has: student.getByText("This Year", { exact: true }) })
  await expect(yearBox).toHaveCount(1)
  const y = att.summary.this_year
  if (y.recorded) {
    await expect(yearBox).toContainText(`${y.rate}%`)
    await expect(yearBox).toContainText(`${y.present}P · ${y.late}L · ${y.absent}A`)
    await expect(yearBox).toContainText(`${y.total} periods`)
  } else if (att.counted_from !== null && att.counted_from > today) {
    await expect(student.getByText("Not counted yet", { exact: true })).toHaveCount(4)   // Today, This Week, This Month, This Year
  }
  await shot(student.locator("main").first(), `${step}_student_my_attendance`)
}

// ── Parent screen helper ──────────────────────────────────────────────────────
async function expectParentScreen(att: ParentAttendanceBody, step: string): Promise<void> {
  if (!parent) throw new Error("expectParentScreen needs the parent session.")
  const label = basisLabel(att.counted_from, att.counted_class_label, istToday())
  await parent.goto("/parent/dashboard")
  assertLocalUrl(parent.url(), "parent page address")
  await sidebar(parent, "Attendance").click()
  await expect(parent.getByRole("heading", { name: "Attendance", exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(parent.locator("p.text-xs.text-muted-foreground").filter({ hasText: exactText(label) })).toBeVisible()
  if (att.rate === null) {
    const na = parent.getByText("N/A", { exact: true })
    await expect(na).toBeVisible()
    await expect(na).toHaveClass(/text-muted-foreground/)
    await expect(na).not.toHaveClass(/text-orange-500/)       // nothing counted is never coloured as a low figure
    await expect(na).not.toHaveClass(/text-green-600/)
  } else {
    await expect(parent.getByText(`${att.rate}%`, { exact: true })).toBeVisible()
  }
  await shot(parent.locator("main").first(), `${step}_parent_attendance`)
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Attendance is counted from the class start date — through the real screens", () => {
  test.describe.configure({ mode: "serial", retries: 0, timeout: 120_000 })

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000)
    assertLocalUrl(BASE_URL, "E2E_BASE_URL")
    assertLocalUrl(API_URL, "E2E_API_URL")
    const adminCreds   = { id: requireEnv("E2E_ADMIN_ID"),   pw: requireEnv("E2E_ADMIN_PASSWORD") }
    const studentCreds = { id: requireEnv("E2E_STUDENT_ID"), pw: requireEnv("E2E_STUDENT_PASSWORD") }
    const parentId = process.env.E2E_PARENT_ID
    const parentPw = process.env.E2E_PARENT_PASSWORD
    const parentCreds = parentId && parentPw ? { id: parentId, pw: parentPw } : null

    adminCtx = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block" })
    studentCtx = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block" })
    await installApiGuard(adminCtx, adminViolations)
    await installApiGuard(studentCtx, studentViolations)
    admin = await adminCtx.newPage()
    student = await studentCtx.newPage()

    // One sign-in per role for the whole file
    await signIn(admin, "Admin", adminCreds.id, adminCreds.pw)
    await signIn(student, "Student", studentCreds.id, studentCreds.pw)
    if (parentCreds) {
      parentCtx = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block" })
      await installApiGuard(parentCtx, parentViolations)
      parent = await parentCtx.newPage()
      await signIn(parent, "Parent", parentCreds.id, parentCreds.pw)
    }

    // From here on the pages record failed or refused /api/ requests (no bodies) for the status-check messages
    watchApiFailures(admin, "admin")
    watchApiFailures(student, "student")
    if (parent) watchApiFailures(parent, "parent")
  })

  test.beforeEach(() => {
    failedApiRequests.length = 0      // a message lists only the failed requests made during that test
  })

  test.afterEach(() => {
    expect(adminViolations, "an admin-page /api/ request left localhost").toEqual([])
    expect(studentViolations, "a student-page /api/ request left localhost").toEqual([])
    expect(parentViolations, "a parent-page /api/ request left localhost").toEqual([])
  })

  test.afterAll(async () => {
    test.setTimeout(180_000)
    let restoreError: unknown = null
    try {
      // Safety net: when a test between P2 and P4 failed, P4 did not run. Put the real class's date back here.
      if (plan && !dateRestored && admin) {
        const stored = await storedStartOf(plan.classId)
        if (stored === plan.target) {
          await changeYearStart({ classId: plan.classId, label: plan.label, from: plan.target, to: plan.restoreTo, step: "afterAll_restore" })
          dateRestored = true
        } else if (stored !== plan.original && stored !== plan.restoreTo) {
          throw new Error(`The class "${plan.label}" has the start date ${stored ?? "none"}, which is neither the original (${plan.original ?? "none"}), the test date (${plan.target}) nor the restore date (${plan.restoreTo}). It was NOT touched; check it by hand.`)
        }
      }
    } catch (e) {
      restoreError = e
    }
    await adminCtx?.close()
    await studentCtx?.close()
    await parentCtx?.close()
    if (restoreError) throw restoreError
  })

  test("R5 — all sessions are on localhost and nothing left it", async () => {
    assertLocalUrl(admin.url(), "admin page")
    assertLocalUrl(student.url(), "student page")
    await expect(admin).toHaveURL(/\/admin\/dashboard/)
    await expect(student).toHaveURL(/\/student\/dashboard/)
    if (parent) {
      assertLocalUrl(parent.url(), "parent page")
      await expect(parent).toHaveURL(/\/parent\/dashboard/)
    }
  })

  // ── P1: the student's baseline (read only) ─────────────────────────────────
  test("P1 — student (read only): the figures and both screens carry the basis line of the class's stored start date", async ({}, testInfo) => {
    const me = await getJson<{ profile: { id: string; name: string; role: string; class_id: string | null } }>(student, "/api/auth/me", "the student's own profile")
    expect(me.profile.role, "E2E_STUDENT_ID must be a student account").toBe("student")
    studentId = me.profile.id
    studentName = me.profile.name
    studentClassId = me.profile.class_id ?? ""
    expect(studentId).toMatch(/^[a-f0-9]{24}$/)
    expect(studentName.trim(), "the student must have a name").not.toBe("")
    expect(studentClassId, "the test student must be in a class").toMatch(/^[a-f0-9]{24}$/)

    const att = await getJson<StudentAttendanceBody>(student, "/api/student/attendance", "GET /api/student/attendance")
    const dash = await getJson<DashboardBody>(student, "/api/student/dashboard", "GET /api/student/dashboard")
    expect(att.counted_from, "both answers must name the same counted-from date").toBe(dash.counted_from)
    expect(att.counted_class_label).toBe(dash.counted_class_label)
    baseline = { att, dash }

    if (!(dash.days_total > 0)) {
      throw new Error("Test P1 stopped on purpose: the student has no counted attendance (days_total is 0), so moving the start date could not be seen. Nothing was changed. Use a student that has saved sheets on or after the class start.")
    }
    if (att.summary.this_year.total === 0) {
      testInfo.annotations.push({ type: "info", description: "the This Year window holds 0 periods at baseline; only the all-time figure (Dashboard tile) proves the change" })
    }
    testInfo.annotations.push({ type: "info", description: `baseline: counted_from=${att.counted_from ?? "none"}, class=${att.counted_class_label ?? "none"}, all-time periods=${dash.days_total}, this-year periods=${att.summary.this_year.total}` })

    await expectStudentScreens(att, dash, "P1")
  })

  // ── P1p: the parent's baseline (read only) ─────────────────────────────────
  test("P1p — parent (read only): the child is the same student and the parent's figures equal the student's", async ({}, testInfo) => {
    if (!parent) {
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: no parent test login, parent screen not exercised" })
      return
    }
    const b = requireBaseline()
    const child = await getJson<{ child: { _id: string } }>(parent, "/api/parent/child", "GET /api/parent/child")
    if (child.child._id !== studentId) {
      parentState = "unlinked"
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: the parent test login is linked to a different student, parent screen not exercised" })
      return
    }
    parentState = "linked"
    const att = await getJson<ParentAttendanceBody>(parent, "/api/parent/child/attendance", "GET /api/parent/child/attendance")
    parentBaseline = att
    expect(att.counted_from).toBe(b.dash.counted_from)
    expect(att.counted_class_label).toBe(b.dash.counted_class_label)
    expect(att.total, "the parent's total must equal the student's all-time periods").toBe(b.dash.days_total)
    expect(att.present).toBe(b.dash.days_present)
    expect(att.rate, "the parent's rate must equal the student's rate (one decimal both)").toBe(b.dash.attendance_rate)
    await expectParentScreen(att, "P1p")
  })

  // ── P2: the admin moves the class's start date to tomorrow (date save 1) ───
  test("P2 — admin: the student's class is found and its start date is moved to tomorrow through the Edit class form", async ({}, testInfo) => {
    const b = requireBaseline()
    const list = await readClassList()
    const cls = list.find(c => c.id === studentClassId)
    expect(cls, "the student's class (id from the student's own profile) must be in the admin class list").toBeDefined()
    if (!cls) return
    const serverLabel = serverClassLabel(cls)
    expect(serverLabel, "the class found by id must carry the label the student's answer names").toBe(b.att.counted_class_label)
    expect(cls.year_start, "the stored date must be the counted-from date the student's answer showed").toBe(b.att.counted_from)
    const label = adminClassLabel(cls)

    // The class must be one row on the Classes screen (found by its own select box)
    await openClasses()
    const rowCount = await classRowOf(label).count()
    if (rowCount !== 1) {
      throw new Error(`Test P2 stopped on purpose: expected exactly one Classes row for "${label}" but found ${rowCount}. Nothing was changed.`)
    }

    // The admin's own baseline for the same student (read only)
    adminBaseline = await getJson<AdminDetailBody>(admin, `/api/school/student-detail/${studentId}`, "GET /api/school/student-detail (baseline)")
    expect(adminBaseline.counted_from).toBe(b.att.counted_from)
    expect(adminBaseline.counted_class_label).toBe(b.att.counted_class_label)

    // The dates
    const today = istToday()
    const original = cls.year_start
    let target = shiftYmd(today, 1)                                   // tomorrow (IST), inside "60 days ahead"
    if (target === original) target = shiftYmd(today, 2)              // the same date again would change nothing
    const restoreTo = original ?? shiftYmd(subtractYears(today, 2), 1) // the earliest allowed date plus one day (safe at midnight)
    plan = { classId: cls.id, label, serverLabel, original, target, restoreTo, sheetsLeaving: 0 }
    testInfo.annotations.push({ type: "info", description: `class "${label}": stored start ${original ?? "none"} -> ${target} (restore to ${restoreTo})` })

    const answer = await changeYearStart({ classId: cls.id, label, from: original, to: target, step: "P2" })
    plan.sheetsLeaving = answer.sheets_leaving
    expect(answer.sheets_entering).toBe(0)
    if (original !== null) {
      expect(answer.sheets_leaving, "the student's saved sheets (all before tomorrow) leave the school year").toBeGreaterThan(0)
    }
  })

  // ── P3: everything counts nothing ──────────────────────────────────────────
  test("P3 — nothing counts: student figures are 0 with counted_from tomorrow, both student screens and the admin student row say so", async () => {
    const b = requireBaseline()
    const p = requirePlan()

    const att = await getJson<StudentAttendanceBody>(student, "/api/student/attendance", "GET /api/student/attendance (after the move)")
    expect(att.counted_from).toBe(p.target)
    expect(att.counted_class_label).toBe(b.att.counted_class_label)
    for (const key of ["today", "this_week", "this_month", "this_year"] as const) {
      expect(att.summary[key].total, `summary.${key}.total`).toBe(0)
      expect(att.summary[key].recorded, `summary.${key}.recorded`).toBe(false)
    }
    const dash = await getJson<DashboardBody>(student, "/api/student/dashboard", "GET /api/student/dashboard (after the move)")
    expect(dash.counted_from).toBe(p.target)
    expect(dash.days_total).toBe(0)
    expect(dash.days_present).toBe(0)
    expect(dash.days_recorded).toBe(0)
    expect(dash.attendance_rate).toBe(0)
    await expectStudentScreens(att, dash, "P3")

    // The admin's API and the open student row
    const detail = await getJson<AdminDetailBody>(admin, `/api/school/student-detail/${studentId}`, "GET /api/school/student-detail (after the move)")
    expect(detail.attendance_breakdown).toEqual({ present: 0, late: 0, absent: 0, total: 0 })
    expect(detail.attendance_rate).toBeNull()
    expect(detail.counted_from).toBe(p.target)
    expect(detail.counted_class_label).toBe(b.att.counted_class_label)

    await openStudentDetail()
    const card = adminAttendanceCard()
    await expect(card).toHaveCount(1)
    await expect(card).toContainText(`No attendance recorded since ${showYmd(p.target)}`)
    await expect(card).toContainText(basisLabel(p.target, b.att.counted_class_label, istToday()))
    await expect(card).not.toContainText("%")
    await expect(card).not.toContainText(/P:\d+ L:\d+ A:\d+/)
    await shot(card, "P3_admin_attendance_box")
  })

  // ── P3p: the parent sees nothing counted ───────────────────────────────────
  test("P3p — parent: total 0, rate null, recorded false, the basis line and a neutral N/A (no orange class)", async ({}, testInfo) => {
    if (!parent) {
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: no parent test login, parent screen not exercised" })
      return
    }
    if (parentState !== "linked") {
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: the parent test login is not linked to the test student, parent screen not exercised" })
      return
    }
    const p = requirePlan()
    const b = requireBaseline()
    const att = await getJson<ParentAttendanceBody>(parent, "/api/parent/child/attendance", "GET /api/parent/child/attendance (after the move)")
    expect(att.total).toBe(0)
    expect(att.present).toBe(0)
    expect(att.late).toBe(0)
    expect(att.absent).toBe(0)
    expect(att.rate).toBeNull()
    expect(att.recorded).toBe(false)
    expect(att.counted_from).toBe(p.target)
    expect(att.counted_class_label).toBe(b.att.counted_class_label)
    await expectParentScreen(att, "P3p")
  })

  // ── P4: move the date back (date save 2) ───────────────────────────────────
  test("P4 — admin: the start date is moved back to the recorded original (or the earliest allowed date when there was none)", async () => {
    const p = requirePlan()
    expect(await storedStartOf(p.classId), "the class must still be on the test date before it is moved back").toBe(p.target)
    try {
      const answer = await changeYearStart({ classId: p.classId, label: p.label, from: p.target, to: p.restoreTo, step: "P4" })
      expect(answer.sheets_leaving).toBe(0)
      if (p.original !== null) {
        expect(answer.sheets_entering, "the sheets that left come back").toBeGreaterThanOrEqual(p.sheetsLeaving)
      }
      dateRestored = true
    } finally {
      // The real class must never stay on tomorrow's date: read the stored value back whatever happened above.
      const now = await storedStartOf(p.classId)
      if (now === p.restoreTo) dateRestored = true
    }
  })

  // ── P5: the figures are back ───────────────────────────────────────────────
  test("P5 — figures are back: student and admin numbers equal the baseline and the screens show the restored basis line", async () => {
    const b = requireBaseline()
    const p = requirePlan()
    expect(dateRestored, "P4 must have put the date back").toBe(true)

    const att = await getJson<StudentAttendanceBody>(student, "/api/student/attendance", "GET /api/student/attendance (after the restore)")
    expect(att.counted_from).toBe(p.restoreTo)
    expect(att.counted_class_label).toBe(b.att.counted_class_label)
    const y = att.summary.this_year
    const y0 = b.att.summary.this_year
    expect({ present: y.present, late: y.late, absent: y.absent, total: y.total }, "the This Year window must equal the baseline")
      .toEqual({ present: y0.present, late: y0.late, absent: y0.absent, total: y0.total })
    expect(y.recorded).toBe(y0.recorded)

    const dash = await getJson<DashboardBody>(student, "/api/student/dashboard", "GET /api/student/dashboard (after the restore)")
    expect(dash.counted_from).toBe(p.restoreTo)
    expect(dash.days_total, "all-time periods must equal the baseline").toBe(b.dash.days_total)
    expect(dash.days_present).toBe(b.dash.days_present)
    expect(dash.days_recorded).toBe(b.dash.days_recorded)
    expect(dash.attendance_rate).toBe(b.dash.attendance_rate)
    await expectStudentScreens(att, dash, "P5")

    // The admin's API and the open student row equal the admin baseline
    if (!adminBaseline) throw new Error("P2 did not record the admin baseline, so this test cannot run.")
    const detail = await getJson<AdminDetailBody>(admin, `/api/school/student-detail/${studentId}`, "GET /api/school/student-detail (after the restore)")
    expect(detail.attendance_breakdown, "the admin breakdown must equal the baseline").toEqual(adminBaseline.attendance_breakdown)
    expect(detail.attendance_rate).toBe(adminBaseline.attendance_rate)
    expect(detail.counted_from).toBe(p.restoreTo)

    await openStudentDetail()
    const card = adminAttendanceCard()
    await expect(card).toHaveCount(1)
    await expect(card).toContainText(basisLabel(p.restoreTo, b.att.counted_class_label, istToday()))
    if (detail.attendance_rate !== null) {
      const t = detail.attendance_breakdown
      await expect(card).toContainText(`${detail.attendance_rate}%`)
      await expect(card).toContainText(`P:${t.present} L:${t.late} A:${t.absent}`)
    }
    await shot(card, "P5_admin_attendance_box")
  })

  // ── P5p: the parent's figures are back ─────────────────────────────────────
  test("P5p — parent: figures equal the baseline and the student's own", async ({}, testInfo) => {
    if (!parent) {
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: no parent test login, parent screen not exercised" })
      return
    }
    if (parentState !== "linked" || !parentBaseline) {
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: the parent test login is not linked to the test student, parent screen not exercised" })
      return
    }
    const p = requirePlan()
    const b = requireBaseline()
    const att = await getJson<ParentAttendanceBody>(parent, "/api/parent/child/attendance", "GET /api/parent/child/attendance (after the restore)")
    expect(att.counted_from).toBe(p.restoreTo)
    expect(att.counted_class_label).toBe(b.att.counted_class_label)
    expect(att.total, "the parent's total must equal the baseline").toBe(parentBaseline.total)
    expect(att.present).toBe(parentBaseline.present)
    expect(att.late).toBe(parentBaseline.late)
    expect(att.absent).toBe(parentBaseline.absent)
    expect(att.rate).toBe(parentBaseline.rate)
    expect(att.recorded).toBe(true)

    const dash = await getJson<DashboardBody>(student, "/api/student/dashboard", "GET /api/student/dashboard (parent comparison)")
    expect(att.total, "the parent's total must equal the student's total").toBe(dash.days_total)
    expect(att.rate, "the parent's rate must equal the student's rate (one decimal both)").toBe(dash.attendance_rate)
    await expectParentScreen(att, "P5p")
  })
})
