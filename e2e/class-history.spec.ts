import { test, expect, type BrowserContext, type Locator, type Page, type Request, type Response as PwResponse } from "@playwright/test"

// ─────────────────────────────────────────────────────────────────────────────
// Class history, "Part 1", checked through the real screens (headless chromium):
//   D  admin Classes: class-name rules on create + rename, subject edit without a rename
//   A  admin Students: add a student into the teacher's class
//   E  teacher Attendance: the student is on the old class list, gone after the move
//   F  teacher Attendance: positive save in an EMPTY period, reload shows it
//   B  admin Students: move through the edit form; repeating the same save is harmless
//   G  wrong-class / wrong-date sheet is refused (no screen exists for this, see comment); the date used is the home class's START date
//   J5 a sheet dated one day BEFORE the class start is refused with before_start_date (no screen exists for this, see comment)
//   C  admin Students: bulk transfer; repeating it for a student already there is harmless
//   H  regression: both screens still load
//   I1 admin Classes: the school year start is changed, the confirmation shows its consequence sentence, the new date is shown under the class name and survives a reload; an out-of-range date is refused on screen before any confirmation
//   I1c admin Classes: changing the date asks first (Keep / Yes, change date); Keep saves nothing
//   J1 admin Classes: two more date changes through the Edit form, each confirmed with "Yes, change date", no reason typed
//   J2 teacher Attendance + admin Classes: a class with no stored date shows the "not switched on yet" card (no marking rows); the admin sets the first date (saved directly, no confirmation); "Check again" opens the class
//      (if the home class already has a stored date, the screen is checked for "Counted from <date>" and an annotation says the blocked card is proven in backend/src/tests/attendance.test.ts)
//   K1 admin Classes: bulk dialog "Set school year start for selected classes" with exactly the two E2E classes ticked; with the "Also change classes that
//      already have a date" box empty nothing can be saved; with it ticked one POST /api/school/classes-year-start saves both (updated 2, both "saved")
//   K2 admin Classes: one attendance sheet (dated today, saved by the ADMIN session through the API: no screen exists for an admin to mark a sheet) is
//      counted by the Edit-class confirmation: moving the start to tomorrow says "1 saved attendance sheet will stop counting" (Keep saves nothing, Yes saves),
//      moving it back says "1 saved attendance sheet will start counting"
//   K3 admin Classes (read only): the amber chip "No start date – ..." shows on every class without a stored date and nowhere else, the top notice
//      carries the right numbers, "Set dates" lists and ticks exactly those classes; nothing is saved. If no class lacks a date the test only adds the
//      annotation "NOT FOUND" (it is then NOT proven: look for the annotation in the report)
//   K4 teacher Attendance (read only): a class without a stored date is marked "(attendance not set up)" in the dropdown, shows the notice card, no
//      "Mark all present", Period disabled, and "Check again" keeps it blocked. Same "NOT FOUND" annotation if the teacher has no such class
//      K1 takes a read-only snapshot of every real class's stored start date (name not starting "E2E Test") and K3 proves, at its end, that none of them changed
//   K5 (not a test) both pages record every failed or refused /api/ request (page tag "admin" or "teacher", method, path with ids replaced, status, x-request-id and
//      rate-limit headers; NEVER bodies); the list is emptied before every test, so a message lists only requests of that test (the one 400 that I1 provokes on
//      purpose is removed again); failedRequestsNote() puts that list into the message of the status checks of I2, I3, K1 and K2
//   K6 teacher Attendance, View Stats (read only, no date save, no new sign-in): on the teacher's home class (which has a stored start date) the stats card shows the
//      basis line ("<class>, counted from <date>") and a "This Year" range that starts on the later of 1 June and the stored date; the stats answer carries
//      counted_from (= the stored date) and counted_class_label (= the class label); a request listener proves no POST/PATCH/PUT/DELETE is sent to /api/.
//      If the home class has no stored date the test only adds the annotation "NOT FOUND" (it is then NOT proven: look for it in the report)
//   I4 a teacher is refused (403) on the year-start change and on the class history (no screen exists for this)
//   I2 admin Students: the open student row lists every class the student has been in, oldest first
//   I3 admin Students: after the class is deleted the history still lists it as removed
// (Tests run in that order because each one builds on the last; the letters match the approved plan. Run order:
//  R5, D1, D2, I1, J2, A, E1, F, B, E2, I1c, J1, K1, K2, K3, K4, K6, I4, G, J5, C, I2, I3, H = 24 tests.)
// Save budget (all counted per admin, per hour; a run that fails halfway still used what it sent):
//   single date saves: 7 of 10 per hour = I1, I1c, J1 x2, J2, K2 x2 (J2 only when the home class has no date yet)
//   bulk date saves:   1 of 3 per hour  = K1
//   Run this file AT MOST ONCE PER HOUR. Do not add more date saves without counting them.
//
// SAFETY RULES (owner-approved, R5):
//   1. localhost only: base URL, API URL and every /api/ request must be localhost.
//   2. credentials come ONLY from environment variables (see requireEnv below).
//   3. one sign-in per role for the whole file; serial; no retries; no skip/only/fixme.
//   4. every record created is named "E2E Test ..." and only such records are ever deleted.
//   5. no rate limit, role, school or token check is bypassed.
//
// Environment:  E2E_ADMIN_ID  E2E_ADMIN_PASSWORD  E2E_TEACHER_ID  E2E_TEACHER_PASSWORD
//   optional:   E2E_BASE_URL (default http://localhost:5173)  E2E_API_URL (default http://localhost:4000)
//
// Known limits that no screen can undo (reported, not hidden):
//   - "Remove student" is a soft delete in this app: the E2E student stays in the Students
//     list as "Inactive" after the run (and its roll number stays reserved, so each run uses a new one).
//   - The attendance sheet saved in test F stays (no screen deletes a sheet).
//   - If the teacher's home class had no stored start date, test J2 gives it one (today minus 120 days); it stays.
//   - The attendance sheet saved in test K2 (class "E2E Test Class A ...", today, one present line for the E2E pupil) stays:
//     no screen deletes a sheet and deleting a class does not delete its sheets, so it is left pointing at a deleted class.
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
  if (!v) throw new Error(`Missing environment variable ${name}. Set E2E_ADMIN_ID, E2E_ADMIN_PASSWORD, E2E_TEACHER_ID and E2E_TEACHER_PASSWORD before running this spec.`)
  return v
}

const STAMP   = Date.now()
const PUPIL   = `E2E Test Pupil ${STAMP}`
const ROLL    = `e2e${STAMP}`                 // 16 chars (limit 20); the username is this in lower case
const CLASS_A = `E2E Test Class A ${STAMP}`
const CLASS_B = `E2E Test Class B ${STAMP}`
const BAD_NAME = "<b>x</b>"
const NAME_RULE = "Class name can use letters, numbers, spaces, hyphens and full stops only."

// The teacher's own class (found on the teacher's Attendance screen) is the "home" class.
let adminCtx: BrowserContext | undefined
let teacherCtx: BrowserContext | undefined
let admin: Page
let teacher: Page
const adminViolations: string[] = []
const teacherViolations: string[] = []

let homeClassId = ""
let homeLabel = ""          // how the admin screens label the home class
let pupilId = ""            // learned from the teacher's own class list (read only)
let sheetPeriod = 0         // the empty period used by test F

const todayUtc = () => new Date().toISOString().slice(0, 10)   // the Attendance screen's default date

/** Today in India (the school's day) as YYYY-MM-DD. */
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "2026-06-01" becomes "1 Jun 2026", the way the admin screens show a date. */
function showYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
const patchClassPath = /\/api\/school\/classes\/[a-f0-9]{24}$/
let classAId = ""           // learned from the first class save (test I1)

// ── K5: a record of every failed or refused /api/ request, kept for the messages of the status checks ──
// Only: method, path (24-hex ids replaced by ":id", query string removed), status (or "failed"), and these response
// headers when present: x-request-id, ratelimit-limit, ratelimit-remaining, ratelimit-reset, retry-after.
// A response body is NEVER read or stored (a failed answer may hold personal data).
interface ApiFailureNote { page: "admin" | "teacher"; method: string; path: string; status: number | "failed"; headers: Record<string, string> }
const API_FAILURE_HEADERS = ["x-request-id", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "retry-after"] as const
const failedApiRequests: ApiFailureNote[] = []

/** The note-safe path of an /api/ address (under E2E_API_URL, or the page's own origin), or null for anything else. */
function apiPathForNote(rawUrl: string): string | null {
  const u = new URL(rawUrl)
  const underApiUrl = rawUrl.startsWith(`${API_URL}/api`)
  const sameOriginApi = u.origin === new URL(BASE_URL).origin && u.pathname.startsWith("/api/")
  if (!underApiUrl && !sameOriginApi) return null
  return u.pathname.replace(/[a-f0-9]{24}/gi, ":id")
}

function watchApiFailures(page: Page, tag: "admin" | "teacher"): void {
  page.on("response", (res: PwResponse) => {
    const path = apiPathForNote(res.url())
    if (path === null || res.status() < 400) return
    const all = res.headers()
    const headers: Record<string, string> = {}
    for (const name of API_FAILURE_HEADERS) {
      const value = all[name]
      if (value !== undefined) headers[name] = value
    }
    failedApiRequests.push({ page: tag, method: res.request().method(), path, status: res.status(), headers })
  })
  page.on("requestfailed", (req: Request) => {
    const path = apiPathForNote(req.url())
    if (path === null) return
    failedApiRequests.push({ page: tag, method: req.method(), path, status: "failed", headers: {} })
  })
}

/** The list of the CURRENT test only (it is emptied in beforeEach). */
function failedRequestsNote(): string {
  return JSON.stringify(failedApiRequests)
}

/** Removes the newest note of one refusal that a test provokes on purpose, so it is not listed as a failure (test I1: the preview of an out-of-range date answers 400). */
function forgetExpectedRefusal(tag: "admin" | "teacher", method: string, pathEnd: string, status: number): void {
  for (let i = failedApiRequests.length - 1; i >= 0; i--) {
    const n = failedApiRequests[i]
    if (n.page === tag && n.method === method && n.status === status && n.path.endsWith(pathEnd)) {
      failedApiRequests.splice(i, 1)
      return
    }
  }
}

async function installApiGuard(ctx: BrowserContext, violations: string[]): Promise<void> {
  await ctx.route(url => new URL(url).pathname.startsWith("/api/"), async route => {
    const u = new URL(route.request().url())
    if (LOCAL_HOSTS.has(u.hostname)) { await route.continue(); return }
    violations.push(`${route.request().method()} ${u.hostname}${u.pathname}`)
    await route.abort("blockedbyclient")
  })
}

async function signIn(page: Page, tab: "Admin" | "Teacher", identifier: string, password: string): Promise<void> {
  await page.goto("/login")
  await page.locator("#identifier").waitFor()
  await page.screenshot({ path: `ss_class_history_login_${tab.toLowerCase()}.png` })   // empty form only
  await page.getByRole("button", { name: tab, exact: true }).click()
  await page.locator("#identifier").pressSequentially(identifier, { delay: 15 })
  await page.locator("#password").pressSequentially(password, { delay: 15 })
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  try {
    await page.waitForURL(u => u.pathname.startsWith(`/${tab.toLowerCase()}/dashboard`), { timeout: 30_000 })
  } catch {
    throw new Error(`${tab} sign-in did not reach /${tab.toLowerCase()}/dashboard. Check the E2E_* credentials, two-step sign-in, or the 5-per-15-minutes sign-in limit. No retry was made.`)
  }
  assertLocalUrl(page.url(), `page address after ${tab} sign-in`)   // redirect-proof
}

const sidebar = (page: Page, label: string): Locator => page.locator("aside").getByText(label, { exact: true }).first()

async function shot(target: Page | Locator, step: string): Promise<void> {
  await target.screenshot({ path: `ss_class_history_${step}.png` })
}

// ── Admin helpers ─────────────────────────────────────────────────────────────
async function openStudents(): Promise<void> {
  await admin.goto("/admin/dashboard")
  await sidebar(admin, "Students").click()
  await expect(admin.locator("#students-table").or(admin.getByText("No students yet"))).toBeVisible({ timeout: 20_000 })
}

async function openClasses(): Promise<void> {
  await admin.goto("/admin/dashboard")
  await sidebar(admin, "Classes").click()
  await expect(admin.getByRole("heading", { name: "Classes", exact: true }).first()).toBeVisible()
  await expect(admin.locator("tbody tr").first().or(admin.getByText("No classes yet"))).toBeVisible({ timeout: 20_000 })
}

const searchStudents = async (text: string) => { await admin.getByPlaceholder(/Search students/).fill(text) }
const studentRow = (name: string): Locator =>
  admin.locator("#students-table tbody tr").filter({ has: admin.getByRole("checkbox", { name: `Select ${name}` }) })
const classRow = (label: string): Locator => admin.locator("tbody tr").filter({ hasText: label })
const yearField = (): Locator => admin.getByLabel("School year starts")

/** Soft-removes one student through the real Remove button. Refuses any name not starting "E2E Test". */
async function removeStudentRow(name: string): Promise<void> {
  if (!name.startsWith("E2E Test")) throw new Error(`Refusing to remove "${name}": not an E2E Test record.`)
  const row = studentRow(name)
  await row.getByRole("button", { name: "Remove student" }).click()
  await expect(admin.getByRole("heading", { name: `Remove ${name}?` }).first()).toBeVisible()
  const deleted = admin.waitForResponse(r => r.request().method() === "DELETE" && /\/api\/users\/[a-f0-9]{24}$/.test(new URL(r.url()).pathname))
  // The admin screen renders this confirm box twice (panel + page level); the last one is on top.
  await admin.getByRole("button", { name: "Remove", exact: true }).last().click()
  expect((await deleted).status()).toBe(200)
  await expect(row.getByText("Inactive", { exact: true })).toBeVisible()
}

/** Deletes one class through the real Delete button. Refuses any label not starting "E2E Test". */
async function deleteClassRow(label: string): Promise<void> {
  if (!label.startsWith("E2E Test")) throw new Error(`Refusing to delete class "${label}": not an E2E Test record.`)
  const row = classRow(label)
  await row.getByRole("button", { name: "Delete class" }).click()
  await expect(admin.getByRole("heading", { name: `Delete ${label}?` }).first()).toBeVisible()
  const deleted = admin.waitForResponse(r => r.request().method() === "DELETE" && /\/api\/school\/classes\/[a-f0-9]{24}$/.test(new URL(r.url()).pathname))
  await admin.getByRole("button", { name: "Delete", exact: true }).last().click()
  expect((await deleted).status()).toBe(200)
  await expect(row).toHaveCount(0)
}

/** Start-of-run sweep: only ACTIVE students and classes whose name starts exactly "E2E Test". */
async function sweepLeftovers(): Promise<void> {
  await openStudents()
  if (await admin.locator("#students-table").count()) {
    await searchStudents("E2E Test")
    for (let i = 0; i < 50; i++) {
      const active = admin.locator("#students-table tbody tr")
        .filter({ has: admin.getByRole("checkbox", { name: /^Select E2E Test/ }) })
        .filter({ has: admin.getByText("Active", { exact: true }) })
      if (await active.count() === 0) break
      const label = await active.first().getByRole("checkbox").getAttribute("aria-label")
      const name = (label ?? "").replace(/^Select /, "")
      await removeStudentRow(name)          // throws unless the name starts with "E2E Test"
    }
  }
  await openClasses()
  for (let i = 0; i < 50; i++) {
    const leftovers = admin.locator("tbody tr").filter({ hasText: /E2E Test/ })
    if (await leftovers.count() === 0) break
    const label = ((await leftovers.first().locator("td").nth(1).textContent()) ?? "").trim()
    if (!label.startsWith("E2E Test")) break   // a real class that merely mentions the words: leave it
    await deleteClassRow(label)
  }
}

/** Read-only: what the admin API reports for one class's school year start (stored date or none, plus the effective date). */
async function readClassStart(classId: string): Promise<{ stored: string | null; effective: string | undefined; hasStartDate: boolean }> {
  const res = await admin.request.get(`${API_URL}/api/school/classes`)
  expect(res.status()).toBe(200)
  const body = await res.json() as { classes: Array<{ id: string; year_start?: string | null; year_start_effective?: string; has_start_date?: boolean }> }
  const c = body.classes.find(x => x.id === classId)
  expect(c, `class ${classId} must be in the admin class list`).toBeDefined()
  return { stored: c?.year_start ?? null, effective: c?.year_start_effective, hasStartDate: c?.has_start_date === true }
}

/** Read-only: the school year start the admin API reports for one class. */
async function readYearStart(classId: string): Promise<string | undefined> {
  return (await readClassStart(classId)).effective
}

/** The admin list shows a class's own name when it has one, else "Class 5A"; the teacher's dropdown shows "Class 5A · name". */
function adminLabelFromTeacherLabel(teacherLabel: string): string {
  const parts = teacherLabel.split(" · ")
  return parts.length > 1 ? parts.slice(1).join(" · ").trim() : teacherLabel.trim()
}

const yearStartConfirm = (): Locator => admin.getByRole("group", { name: "Confirm school year start change" })

// ── Helpers for the bulk dialog and the "no start date" screens (tests K1 to K4) ──
interface ClassListRow { id: string; grade: number; section: string; name: string | null; year_start: string | null; hasStartDate: boolean }

/** Read-only: the admin class list as the API sends it (the same list the Classes table draws, in the same order). */
async function readClassList(): Promise<ClassListRow[]> {
  const res = await admin.request.get(`${API_URL}/api/school/classes`)
  expect(res.status()).toBe(200)
  const body = await res.json() as { classes: Array<{ id: string; grade: number; section: string; name?: string | null; year_start?: string | null; has_start_date?: boolean }> }
  return body.classes.map(c => ({
    id: c.id, grade: c.grade, section: c.section, name: c.name ?? null,
    year_start: c.year_start ?? null, hasStartDate: c.has_start_date === true,
  }))
}

/** How the admin Classes table names a class (the component's clsLabel): its own name, else "Class 5A", else the section. */
function adminClassLabel(c: ClassListRow): string {
  return c.name ?? (c.grade > 0 ? `Class ${c.grade}${c.section}` : c.section)
}

/** How the teacher's Attendance screen names a class in sentences and in a blocked dropdown option. */
function teacherClassLabel(c: ClassListRow): string {
  return c.grade > 0 ? `Class ${c.grade}${c.section}` : (c.name ?? c.section)
}

/** Safety check before any bulk save: exactly `expected` class boxes are ticked and every one is an "E2E Test..." class. */
async function assertOnlyE2eClassesTicked(expected: number): Promise<void> {
  const ticked = admin.locator("tbody").getByRole("checkbox", { checked: true })
  await expect(ticked).toHaveCount(expected)
  const names = await ticked.evaluateAll(els => els.map(e => e.getAttribute("aria-label") ?? ""))
  expect(names.length).toBe(expected)
  for (const n of names) {
    expect(n.startsWith("Select E2E Test"), `a class that is not an E2E Test class is ticked: "${n}"`).toBe(true)
  }
}

/** Read-only: the stored year_start of every class whose name does NOT start with "E2E Test" (a real class), by class id. */
async function snapshotRealClassStarts(): Promise<Map<string, string | null>> {
  const snapshot = new Map<string, string | null>()
  for (const c of await readClassList()) {
    if (!(c.name ?? "").startsWith("E2E Test")) snapshot.set(c.id, c.year_start)
  }
  return snapshot
}

/** Taken at the start of K1 (after J2 may have given the home class its first date), compared at the end of K3. */
let realClassStartsBeforeK1: Map<string, string | null> | undefined

/** Read-only: every real class still has exactly the stored year_start it had before K1 (so K1, K2 and K3 changed none). */
async function assertRealClassStartsUntouched(): Promise<void> {
  expect(realClassStartsBeforeK1, "K1 must have taken the snapshot of the real classes' start dates before it saved anything").toBeDefined()
  const before = realClassStartsBeforeK1 ?? new Map<string, string | null>()
  const after = await snapshotRealClassStarts()
  for (const [id, start] of before) {
    expect(after.has(id), `real class ${id} has disappeared from the class list since K1`).toBe(true)
    expect(after.get(id), `the stored start date of real class ${id} changed during K1 to K3`).toBe(start)
  }
}

const bulkDialog = (): Locator => admin.getByRole("dialog", { name: "Set school year start for selected classes", exact: true })

/** Exact sentences of the admin screens (the component's own texts, copied here on purpose so a wording change fails a test). */
const ADMIN_TEXT = {
  noStartDateChip: "No start date – teachers cannot mark attendance",
  notice: (n: number, total: number) =>
    `${n} of ${total} ${total === 1 ? "class has" : "classes have"} no school year start date. Teachers cannot mark attendance for ${n === 1 ? "this class" : "these classes"} yet.`,
  bulkNothingToChange: `None of the selected classes can be changed because they all already have a date. Tick "Also change classes that already have a date" to change them.`,
}

/** Exact sentences of the teacher's Attendance screen. */
const TEACHER_TEXT = {
  notStarted: (label: string) =>
    `Attendance for ${label} has not been switched on yet. Your school admin needs to set the date this class's school year starts. You will be able to mark attendance as soon as that is done. Nothing is lost: nothing has been marked.`,
  stillNotSet: "Checked just now. The date is still not set.",
  notStartedSuffix: " (attendance not set up)",
}

// ── Teacher helpers ───────────────────────────────────────────────────────────
const classSelect  = (): Locator => teacher.locator("select").filter({ hasText: "Select class" }).first()
const periodSelect = (): Locator => teacher.locator("select").filter({ hasText: "Select period" }).first()
const sheetRows    = (): Locator => teacher.locator("tbody tr")
const pupilSheetRow = (): Locator => sheetRows().filter({ hasText: PUPIL })

async function openTeacherAttendance(): Promise<void> {
  await teacher.goto("/teacher/dashboard")
  await sidebar(teacher, "Attendance").click()
  await expect(teacher.getByRole("heading", { name: "Attendance", exact: true }).first()).toBeVisible()
}

/** Picks the class and period on the Attendance screen and waits until the list and the saved sheet have loaded. */
async function showSheet(classId: string, period: number): Promise<void> {
  await expect(classSelect().locator(`option[value="${classId}"]`)).toBeAttached({ timeout: 20_000 })
  await classSelect().selectOption(classId)
  const roster = teacher.waitForResponse(r => r.url().includes("/api/teacher/class-students") && r.request().method() === "GET")
  const sheet  = teacher.waitForResponse(r => r.url().includes("/api/teacher/attendance?") && r.request().method() === "GET")
  await periodSelect().selectOption(String(period))
  const [rosterRes, sheetRes] = await Promise.all([roster, sheet])
  expect(rosterRes.status()).toBe(200)
  expect(sheetRes.status()).toBe(200)
  await expect(teacher.getByText(/Loading students/)).toHaveCount(0)
}

async function readSheet(classId: string, date: string, period: number): Promise<{ attendance: { records: Array<{ student_id: string; status: string }> } | null }> {
  const q = new URLSearchParams({ class_id: classId, date, period: String(period) })
  const res = await teacher.request.get(`${API_URL}/api/teacher/attendance?${q}`)
  expect(res.status()).toBe(200)
  return await res.json() as { attendance: { records: Array<{ student_id: string; status: string }> } | null }
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe("Class history, Parts 1 and 2 — through the real screens", () => {
  test.describe.configure({ mode: "serial", retries: 0, timeout: 120_000 })

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000)
    assertLocalUrl(BASE_URL, "E2E_BASE_URL")
    assertLocalUrl(API_URL, "E2E_API_URL")
    const adminCreds   = { id: requireEnv("E2E_ADMIN_ID"),   pw: requireEnv("E2E_ADMIN_PASSWORD") }
    const teacherCreds = { id: requireEnv("E2E_TEACHER_ID"), pw: requireEnv("E2E_TEACHER_PASSWORD") }

    adminCtx = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block" })
    teacherCtx = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block" })
    await installApiGuard(adminCtx, adminViolations)
    await installApiGuard(teacherCtx, teacherViolations)
    admin = await adminCtx.newPage()
    teacher = await teacherCtx.newPage()

    // One sign-in per role for the whole file
    await signIn(admin, "Admin", adminCreds.id, adminCreds.pw)
    await signIn(teacher, "Teacher", teacherCreds.id, teacherCreds.pw)

    // K5: from here on both pages record failed or refused /api/ requests (no bodies) for the status-check messages
    watchApiFailures(admin, "admin")
    watchApiFailures(teacher, "teacher")

    // The teacher's own (first) class is the "home" class used for the student
    await sidebar(teacher, "Attendance").click()
    const firstClass = classSelect().locator("option:not([value=''])").first()
    await expect(firstClass).toBeAttached({ timeout: 20_000 })
    homeClassId = (await firstClass.getAttribute("value")) ?? ""
    expect(homeClassId).toMatch(/^[a-f0-9]{24}$/)

    await sweepLeftovers()
  })

  test.beforeEach(() => {
    failedApiRequests.length = 0      // K5: a message lists only the failed requests made during that test
  })

  test.afterEach(() => {
    expect(adminViolations, "an admin-page /api/ request left localhost").toEqual([])
    expect(teacherViolations, "a teacher-page /api/ request left localhost").toEqual([])
  })

  test.afterAll(async () => {
    test.setTimeout(180_000)
    const problems: string[] = []
    if (admin && adminCtx) {
      try {
        await openStudents()
        if (await admin.locator("#students-table").count()) {
          await searchStudents(PUPIL)
          const row = studentRow(PUPIL)
          if (await row.count() && await row.getByText("Active", { exact: true }).count()) await removeStudentRow(PUPIL)
        }
      } catch (e) { problems.push(`student cleanup: ${(e as Error).message}`) }
      for (const label of [CLASS_A, CLASS_B]) {
        try {
          await openClasses()
          if (await classRow(label).count()) await deleteClassRow(label)
        } catch (e) { problems.push(`class cleanup (${label}): ${(e as Error).message}`) }
      }
    }
    await adminCtx?.close()
    await teacherCtx?.close()
    expect(problems, "cleanup of E2E Test records").toEqual([])
  })

  test("R5 — both sessions are on localhost and nothing left it", async () => {
    assertLocalUrl(admin.url(), "admin page")
    assertLocalUrl(teacher.url(), "teacher page")
    await expect(admin).toHaveURL(/\/admin\/dashboard/)
    await expect(teacher).toHaveURL(/\/teacher\/dashboard/)
  })

  // ── D: class-name rules (also creates the two E2E classes) ─────────────────
  test("D1 — Classes: a name with markup is refused and nothing is created; valid E2E classes are accepted", async () => {
    await openClasses()
    const before = await admin.locator("tbody tr").count()

    await admin.getByRole("button", { name: /^Add (Class|your first class)$/ }).first().click()
    const form = admin.locator("form").filter({ has: admin.getByPlaceholder(/e\.g\. 6A, Nursery/) })
    await form.getByPlaceholder(/e\.g\. 6A, Nursery/).fill(BAD_NAME)
    await form.getByRole("button", { name: "Create Class" }).click()
    await expect(form.getByText(NAME_RULE)).toBeVisible()
    await shot(form, "D1_create_refused")
    await admin.getByRole("button", { name: "Close" }).click()

    await openClasses()
    expect(await admin.locator("tbody tr").count(), "a class was created from the refused name").toBe(before)
    await expect(admin.getByText(BAD_NAME)).toHaveCount(0)

    for (const label of [CLASS_A, CLASS_B]) {
      await admin.getByRole("button", { name: /^Add (Class|your first class)$/ }).first().click()
      const f = admin.locator("form").filter({ has: admin.getByPlaceholder(/e\.g\. 6A, Nursery/) })
      await f.getByPlaceholder(/e\.g\. 6A, Nursery/).fill(label)
      await f.getByRole("button", { name: "Create Class" }).click()
      await expect(f).toBeHidden()
      await expect(classRow(label)).toBeVisible()
    }
    await shot(classRow(CLASS_A), "D1_class_created")
  })

  test("D2 — Classes: a rename to a bad name is refused; a subject edit without renaming still works", async () => {
    await openClasses()
    const row = classRow(CLASS_A)
    await row.getByRole("button", { name: "Edit class" }).click()
    const form = admin.locator("form").filter({ has: admin.getByPlaceholder(/Orchids, Sunrise/) })
    await form.getByPlaceholder(/Orchids, Sunrise/).fill(BAD_NAME)
    await form.getByRole("button", { name: "Save Changes" }).click()
    await expect(form.getByText(NAME_RULE)).toBeVisible()
    await shot(form, "D2_rename_refused")
    await form.getByRole("button", { name: "Cancel" }).click()
    await expect(form).toBeHidden()
    await expect(classRow(CLASS_A)).toBeVisible()         // the name did not change
    await expect(admin.getByText(BAD_NAME)).toHaveCount(0)

    // Subject edit, name left exactly as it is (the rule only checks a CHANGED name)
    await row.getByRole("button", { name: "Edit class" }).click()
    const form2 = admin.locator("form").filter({ has: admin.getByPlaceholder(/Orchids, Sunrise/) })
    await expect(form2.getByPlaceholder(/Orchids, Sunrise/)).toHaveValue(CLASS_A)
    await form2.getByPlaceholder(/Type & press Enter/).fill("E2E Subject")
    await form2.getByPlaceholder(/Type & press Enter/).press("Enter")
    const saved = admin.waitForResponse(r => r.request().method() === "PATCH" && /\/api\/school\/classes\/[a-f0-9]{24}$/.test(new URL(r.url()).pathname))
    await form2.getByRole("button", { name: "Save Changes" }).click()
    expect((await saved).status()).toBe(200)
    await expect(form2).toBeHidden()
    await expect(classRow(CLASS_A).getByText("E2E Subject", { exact: true })).toBeVisible()
    await shot(classRow(CLASS_A), "D2_subject_saved")
  })

  // ── I1: school year start on the Edit class screen ─────────────────────────
  test("I1 — Classes: the school year start can be set, shows under the class name and survives a reload; an out-of-range date is refused on screen", async () => {
    await openClasses()
    await classRow(CLASS_A).getByRole("button", { name: "Edit class" }).click()
    await expect(yearField()).toBeVisible()
    await expect(admin.getByText("The day this class's school year begins, usually 1 April or 1 June. Attendance is counted from this date.")).toBeVisible()
    const original = await yearField().inputValue()
    expect(original).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    await admin.getByRole("button", { name: "1 April", exact: true }).click()
    await expect(yearField()).toHaveValue(/-04-01$/)
    await admin.getByRole("button", { name: "1 June", exact: true }).click()
    await expect(yearField()).toHaveValue(/-06-01$/)

    let target = shiftYmd(istToday(), -100)
    if (target === original) target = shiftYmd(target, -1)
    await yearField().fill(target)
    await admin.getByRole("button", { name: "Save Changes" }).click()

    // CLASS_A already has a stored date, so a change is confirmed first, with the consequence sentence from the preview.
    // CLASS_A has no saved attendance sheets, so nothing is affected.
    const confirm = yearStartConfirm()
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText(`from ${showYmd(original)} to ${showYmd(target)}`)
    await expect(confirm).toContainText("No saved attendance sheets are affected.")
    await shot(confirm, "I1_confirm")
    const saved = admin.waitForResponse(r => r.request().method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname))
    await confirm.getByRole("button", { name: "Yes, change date" }).click()
    const res = await saved
    expect(res.status()).toBe(200)
    expect((res.request().postDataJSON() as { year_start?: string }).year_start).toBe(target)
    const savedBody = await res.json() as { sheets_leaving?: number; sheets_entering?: number }
    expect(savedBody.sheets_leaving).toBe(0)
    expect(savedBody.sheets_entering).toBe(0)
    classAId = new URL(res.url()).pathname.split("/").pop() ?? ""
    expect(classAId).toMatch(/^[a-f0-9]{24}$/)
    await expect(yearField()).toBeHidden()
    await expect(classRow(CLASS_A)).toContainText(`Year from ${showYmd(target)}`)

    await openClasses()                      // a fresh load: the date really was saved
    await expect(classRow(CLASS_A)).toContainText(`Year from ${showYmd(target)}`)
    await shot(classRow(CLASS_A), "I1_year_saved")
    expect(await readYearStart(classAId)).toBe(target)

    // Three years back is outside the allowed range. For a class that already has a date, Save Changes first asks the
    // server for the preview; the server refuses it there (400), so NO confirmation opens and NO save is sent.
    // The server's sentence shows beside the field and nothing is saved.
    await classRow(CLASS_A).getByRole("button", { name: "Edit class" }).click()
    await yearField().fill(shiftYmd(istToday(), -3 * 366))
    const refused = admin.waitForResponse(r => r.request().method() === "GET" && /\/api\/school\/classes\/[a-f0-9]{24}\/year-start-preview$/.test(new URL(r.url()).pathname))
    await admin.getByRole("button", { name: "Save Changes" }).click()
    expect((await refused).status()).toBe(400)
    forgetExpectedRefusal("admin", "GET", "/year-start-preview", 400)   // provoked on purpose, so it is not a failure note
    await expect(admin.getByRole("alert").filter({ hasText: /^Choose a date after / })).toBeVisible()
    await expect(yearStartConfirm()).toHaveCount(0)   // a refused date never reaches the confirmation
    await expect(yearField()).toBeVisible()          // the form stays open
    await shot(admin.locator("form").filter({ has: yearField() }), "I1_out_of_range")
    await admin.getByRole("button", { name: "Cancel" }).click()
    await expect(yearField()).toBeHidden()
    expect(await readYearStart(classAId), "the refused date must not have been saved").toBe(target)
  })

  // ── J2: the teacher's home class must have a stored start date before attendance can be marked ──
  test("J2 — Attendance: a class with no stored start date shows the 'not switched on yet' card; once the admin sets a date, 'Check again' opens the class", async ({}, testInfo) => {
    expect(homeClassId).toMatch(/^[a-f0-9]{24}$/)
    await openTeacherAttendance()
    const option = classSelect().locator(`option[value="${homeClassId}"]`)
    await expect(option).toBeAttached({ timeout: 20_000 })
    const optionText = ((await option.textContent()) ?? "").trim()
    const teacherLabel = optionText.replace(/ \(attendance not set up\)$/, "").trim()
    expect(teacherLabel).not.toBe("")

    const before = await readClassStart(homeClassId)
    // The dropdown marks a class without a stored date, so the screen and the API must agree
    expect(optionText.endsWith("(attendance not set up)"), "the dropdown suffix must match has_start_date from the API").toBe(!before.hasStartDate)

    const notice = teacher.getByRole("status").filter({ hasText: "has not been switched on yet" })
    let finalStart: string

    if (!before.hasStartDate) {
      // 1. The teacher opens the class: one notice card, no marking rows
      await classSelect().selectOption(homeClassId)
      await expect(notice).toBeVisible()
      await expect(notice).toContainText(`Attendance for ${teacherLabel} has not been switched on yet`)
      await expect(teacher.getByRole("button", { name: "Mark all present", exact: true })).toHaveCount(0)
      await expect(periodSelect()).toBeDisabled()
      await shot(notice, "J2_blocked_card")

      // 2. The admin gives the class its first date: the box is empty and the first date is saved directly (no confirmation)
      const adminLabel = adminLabelFromTeacherLabel(teacherLabel)
      await openClasses()
      const row = classRow(adminLabel)
      expect(await row.count(), `exactly one admin class row must match "${adminLabel}"`).toBe(1)
      await row.getByRole("button", { name: "Edit class" }).click()
      await expect(yearField()).toHaveValue("")
      const firstDate = shiftYmd(istToday(), -120)
      await yearField().fill(firstDate)
      const saved = admin.waitForResponse(r => r.request().method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname))
      await admin.getByRole("button", { name: "Save Changes" }).click()
      const res = await saved
      expect(res.status()).toBe(200)
      expect((res.request().postDataJSON() as { year_start?: string }).year_start).toBe(firstDate)
      await expect(yearStartConfirm()).toHaveCount(0)
      await expect(yearField()).toBeHidden()
      await expect(classRow(adminLabel)).toContainText(`Year from ${showYmd(firstDate)}`)
      const after = await readClassStart(homeClassId)
      expect(after.hasStartDate, "the home class must now have a stored date").toBe(true)
      expect(after.stored).toBe(firstDate)

      // 3. The teacher presses "Check again": the card goes away and the class can be opened
      await teacher.getByRole("button", { name: "Check again", exact: true }).click()
      await expect(notice).toBeHidden({ timeout: 20_000 })
      await showSheet(homeClassId, 1)
      await expect(sheetRows().first().or(teacher.getByText("No students found in this class."))).toBeVisible()
      finalStart = firstDate
    } else {
      // The home class already had a stored date: nothing is faked, only the dated screen is checked
      testInfo.annotations.push({ type: "info", description: "home class already had a start date; the blocked card is proven by backend/src/tests/attendance.test.ts" })
      await classSelect().selectOption(homeClassId)
      await expect(notice).toHaveCount(0)
      finalStart = before.stored ?? ""
      expect(finalStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }

    // Both paths: the dated class shows where its attendance is counted from
    await expect(teacher.getByText(`Counted from ${showYmd(finalStart)}`)).toBeVisible()
    await expect(notice).toHaveCount(0)
    await shot(teacher.getByText(`Counted from ${showYmd(finalStart)}`), "J2_counted_from")
  })

  // ── A: add the student ─────────────────────────────────────────────────────
  test("A — Students: add a student into the teacher's class; the list shows it under that class", async () => {
    await openStudents()
    await admin.getByRole("button", { name: "Add Student", exact: true }).click()
    const form = admin.locator("form").filter({ has: admin.getByPlaceholder("Student's full name") })
    await form.getByPlaceholder("Student's full name").fill(PUPIL)
    const classPick = form.locator("select").first()
    const option = classPick.locator(`option[value="${homeClassId}"]`)
    await expect(option).toBeAttached({ timeout: 20_000 })
    homeLabel = ((await option.textContent()) ?? "").trim()
    expect(homeLabel).not.toBe("")
    await classPick.selectOption(homeClassId)
    await form.getByPlaceholder("e.g. 6A01").fill(ROLL)
    await form.getByRole("button", { name: "Add Student" }).click()
    await expect(admin.getByText("Student added successfully!")).toBeVisible()
    await admin.getByRole("button", { name: "Done", exact: true }).click()

    await searchStudents(PUPIL)
    const row = studentRow(PUPIL)
    await expect(row).toBeVisible()
    await expect(row.getByText(homeLabel, { exact: true })).toBeVisible()
    await shot(row, "A_student_added")

    // The "View student details" panel opens (its class history block is checked in test I2).
    await row.getByRole("button", { name: "View student details" }).click()
    await expect(admin.getByText("Parents / Guardians")).toBeVisible()
    await row.getByRole("button", { name: "View student details" }).click()
  })

  // ── E (first half): teacher sees the student on the home class list ───────
  test("E1 — Attendance (teacher): the student is on the class list of the home class", async () => {
    await openTeacherAttendance()
    await showSheet(homeClassId, 1)
    await expect(pupilSheetRow()).toBeVisible()
    await shot(pupilSheetRow(), "E1_teacher_sees_student")

    // Read-only lookup of the student's id (needed by test G), same teacher session
    const res = await teacher.request.get(`${API_URL}/api/teacher/class-students?class_id=${homeClassId}`)
    expect(res.status()).toBe(200)
    const body = await res.json() as { students: Array<{ id: string; name: string }> }
    pupilId = body.students.find(s => s.name === PUPIL)?.id ?? ""
    expect(pupilId).toMatch(/^[a-f0-9]{24}$/)
  })

  // ── F: positive save in an empty period ────────────────────────────────────
  test("F — Attendance (teacher): save a sheet in an EMPTY period; the screen confirms and a reload shows it", async () => {
    const date = todayUtc()
    // Never overwrite an existing sheet: find a period with no saved sheet (read-only lookups).
    for (const p of [8, 7, 6, 5, 4, 3, 2, 1]) {
      if ((await readSheet(homeClassId, date, p)).attendance === null) { sheetPeriod = p; break }
    }
    if (!sheetPeriod) {
      throw new Error(`Test F stopped on purpose: every period (1-8) of the teacher's class already has a saved sheet for ${date}. Nothing was overwritten.`)
    }

    await openTeacherAttendance()
    await showSheet(homeClassId, sheetPeriod)
    await expect(pupilSheetRow()).toBeVisible()
    await teacher.getByRole("button", { name: "Mark all present", exact: true }).click()
    // Everyone present, except the E2E student marked late so that a reload can prove the sheet was really saved
    await pupilSheetRow().getByRole("button", { name: /^late$/i }).click()
    await expect(pupilSheetRow().getByRole("button", { name: /^late$/i })).toHaveClass(/bg-amber-500/)

    const posted = teacher.waitForResponse(r => r.url().includes("/api/teacher/attendance") && r.request().method() === "POST")
    await teacher.getByRole("button", { name: "Save Attendance" }).click()
    expect((await posted).status(), "saving the sheet").toBe(200)
    await expect(teacher.getByText("Attendance saved!")).toBeVisible()
    await shot(pupilSheetRow(), "F_saved")

    const saved = (await readSheet(homeClassId, date, sheetPeriod)).attendance
    expect(saved, "the sheet should exist now").not.toBeNull()
    expect(saved!.records.find(r => r.student_id === pupilId)?.status).toBe("late")

    // Reload and open the same period again: the saved marks come back
    await openTeacherAttendance()
    await showSheet(homeClassId, sheetPeriod)
    await expect(pupilSheetRow().getByRole("button", { name: /^late$/i })).toHaveClass(/bg-amber-500/)
    const others = sheetRows().filter({ hasNotText: PUPIL })
    if (await others.count()) {
      await expect(others.first().getByRole("button", { name: /^present$/i })).toHaveClass(/bg-emerald-500/)
    }
    await shot(pupilSheetRow(), "F_after_reload")
  })

  // ── B: move through the edit form ──────────────────────────────────────────
  test("B — Students: moving through the edit form changes the class badge; saving the same thing again is harmless", async () => {
    await openStudents()
    await searchStudents(PUPIL)
    const row = studentRow(PUPIL)
    await row.getByRole("button", { name: "Edit student" }).click()
    const form = admin.locator("form").filter({ has: admin.getByPlaceholder("Student's full name") })
    await form.locator("select").first().selectOption({ label: CLASS_A })
    const moved = admin.waitForResponse(r => r.request().method() === "PATCH" && /\/api\/users\/student\/[a-f0-9]{24}$/.test(new URL(r.url()).pathname))
    await form.getByRole("button", { name: "Save Changes" }).click()
    expect((await moved).status()).toBe(200)
    await expect(form).toBeHidden()
    // Right after the save the badge text comes from the save answer (it may read "Class 0…" for an admin-named class),
    // so only the class name is matched here; the exact label is checked after a fresh load.
    await expect(row).toContainText(new RegExp(CLASS_A, "i"))

    await openStudents()
    await searchStudents(PUPIL)
    await expect(row.getByText(CLASS_A, { exact: true })).toBeVisible()
    await shot(row, "B_moved")

    // The same save again: no change, no error
    await row.getByRole("button", { name: "Edit student" }).click()
    const form2 = admin.locator("form").filter({ has: admin.getByPlaceholder("Student's full name") })
    const again = admin.waitForResponse(r => r.request().method() === "PATCH" && /\/api\/users\/student\/[a-f0-9]{24}$/.test(new URL(r.url()).pathname))
    await form2.getByRole("button", { name: "Save Changes" }).click()
    expect((await again).status()).toBe(200)
    await expect(form2).toBeHidden()
    await expect(row.getByText(CLASS_A, { exact: true })).toBeVisible()
    await shot(row, "B_same_save")
  })

  // ── E (second half) ────────────────────────────────────────────────────────
  test("E2 — Attendance (teacher): after the move, a fresh load of the old class list no longer shows the student", async () => {
    await openTeacherAttendance()
    await showSheet(homeClassId, 1)
    await expect(pupilSheetRow()).toHaveCount(0)
    await expect(sheetRows().first().or(teacher.getByText("No students found in this class."))).toBeVisible()
    await shot(teacher.getByRole("heading", { name: "Attendance", exact: true }).first(), "E2_student_gone")
  })

  // ── I1c: a class with students asks before the date changes ───────────────
  test("I1c — Classes: changing the date of a class asks first (consequence sentence); Keep saves nothing, Yes saves", async () => {
    // At this point the E2E student is in CLASS_A (moved there in test B), so the class has 1 student.
    let patches = 0
    const countPatches = (r: Request) => { if (r.method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname)) patches++ }
    admin.on("request", countPatches)
    try {
      await openClasses()
      await classRow(CLASS_A).getByRole("button", { name: "Edit class" }).click()
      const oldDate = await yearField().inputValue()
      const newDate = shiftYmd(oldDate, -10)
      await yearField().fill(newDate)
      await admin.getByRole("button", { name: "Save Changes" }).click()

      const confirm = yearStartConfirm()
      await expect(confirm).toBeVisible()
      await expect(confirm).toContainText(`from ${showYmd(oldDate)} to ${showYmd(newDate)}`)
      // CLASS_A (where the pupil is) has no saved attendance sheets, so the preview says nothing is affected
      await expect(confirm).toContainText("No saved attendance sheets are affected.")
      await expect(confirm.getByRole("button", { name: `Keep ${showYmd(oldDate)}` })).toBeFocused()
      await shot(confirm, "I1c_confirm")

      await confirm.getByRole("button", { name: `Keep ${showYmd(oldDate)}` }).click()
      await expect(confirm).toBeHidden()
      await expect(yearField()).toHaveValue(oldDate)
      expect(patches, "Keep must not send a save").toBe(0)

      await yearField().fill(newDate)
      await admin.getByRole("button", { name: "Save Changes" }).click()
      await expect(confirm).toBeVisible()
      const saved = admin.waitForResponse(r => r.request().method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname))
      await admin.getByRole("button", { name: "Yes, change date" }).click()
      const savedRes = await saved
      expect(savedRes.status()).toBe(200)
      const savedBody = await savedRes.json() as { sheets_leaving?: number; sheets_entering?: number }
      expect(savedBody.sheets_leaving).toBe(0)
      expect(savedBody.sheets_entering).toBe(0)
      expect(patches).toBe(1)
      await expect(classRow(CLASS_A)).toContainText(`Year from ${showYmd(newDate)}`)
      expect(await readYearStart(classAId)).toBe(newDate)
    } finally {
      admin.off("request", countPatches)
    }
  })

  // ── J1: two more date changes through the Edit form, no reason typed ───────
  test("J1 — Classes: the date can be changed twice more through the Edit form; each change is confirmed, answers 200, and shows in the list", async () => {
    // The admin may change a date at most 10 times an hour; this test makes 2 single saves (the whole file makes 7 single
    // saves and 1 bulk save per run: see "Save budget" in the header).
    expect(classAId).toMatch(/^[a-f0-9]{24}$/)
    let current = await readYearStart(classAId)
    expect(current).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    for (const step of [1, 2]) {
      const oldDate = current as string
      const newDate = shiftYmd(oldDate, -10)
      await openClasses()
      await classRow(CLASS_A).getByRole("button", { name: "Edit class" }).click()
      await expect(yearField()).toHaveValue(oldDate)
      await yearField().fill(newDate)                      // the optional reason box is left empty on purpose
      await admin.getByRole("button", { name: "Save Changes" }).click()

      const confirm = yearStartConfirm()
      await expect(confirm).toBeVisible()
      await expect(confirm).toContainText(`from ${showYmd(oldDate)} to ${showYmd(newDate)}`)
      await expect(confirm).toContainText("No saved attendance sheets are affected.")
      await shot(confirm, `J1_confirm_${step}`)

      const saved = admin.waitForResponse(r => r.request().method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname))
      await confirm.getByRole("button", { name: "Yes, change date" }).click()
      const res = await saved
      expect(res.status(), `date change ${step}`).toBe(200)
      const sent = res.request().postDataJSON() as { year_start?: string; reason?: string }
      expect(sent.year_start).toBe(newDate)
      expect(sent.reason, "no reason was typed, so none may be sent").toBeUndefined()
      await expect(yearField()).toBeHidden()
      await expect(classRow(CLASS_A)).toContainText(`Year from ${showYmd(newDate)}`)
      expect(await readYearStart(classAId)).toBe(newDate)
      current = newDate
    }
    await shot(classRow(CLASS_A), "J1_after_two_changes")
  })

  // ── K1: the bulk dialog sets the start date of the two E2E classes ─────────
  test("K1 — Classes: the bulk dialog changes the date of the two E2E classes only when 'Also change classes that already have a date' is ticked", async () => {
    // Uses 1 of the 3 bulk saves per hour. Only the two "E2E Test..." classes are ever ticked; "Select all classes" and
    // "Select classes with no date" are never pressed. The date is today minus 30 days (inside the allowed range).
    realClassStartsBeforeK1 = await snapshotRealClassStarts()   // read only; compared again at the end of K3
    expect(classAId).toMatch(/^[a-f0-9]{24}$/)
    const classB = (await readClassList()).find(c => c.name === CLASS_B)
    expect(classB, `${CLASS_B} must be in the admin class list`).toBeDefined()
    const classBId = classB?.id ?? ""
    expect(classBId).toMatch(/^[a-f0-9]{24}$/)

    const [startA, startB] = await Promise.all([readClassStart(classAId), readClassStart(classBId)])
    expect(startA.hasStartDate, "the E2E class A has a stored date after test I1").toBe(true)
    expect(startB.hasStartDate, "a class made through the screen is stored with a date").toBe(true)
    let date = shiftYmd(istToday(), -30)
    while (date === startA.stored || date === startB.stored) date = shiftYmd(date, -1)   // a class that already has this date would answer "unchanged"

    let bulkPosts = 0
    const countBulk = (r: Request) => { if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/api/school/classes-year-start")) bulkPosts++ }
    admin.on("request", countBulk)
    try {
      await openClasses()
      await expect(admin.locator("tbody").getByRole("checkbox", { checked: true })).toHaveCount(0)   // nothing is ticked on a fresh load
      await admin.locator("tbody").getByRole("checkbox", { name: `Select ${CLASS_A}`, exact: true }).check()
      await admin.locator("tbody").getByRole("checkbox", { name: `Select ${CLASS_B}`, exact: true }).check()
      await assertOnlyE2eClassesTicked(2)

      await admin.getByRole("button", { name: "Set school year start", exact: true }).click()
      const dialog = bulkDialog()
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText("2 classes selected")
      const items = dialog.getByRole("listitem")
      await expect(items).toHaveCount(2)
      await expect(items.filter({ hasText: CLASS_A })).toContainText(`Year from ${showYmd(startA.stored ?? "")}`)
      await expect(items.filter({ hasText: CLASS_B })).toContainText(`Year from ${showYmd(startB.stored ?? "")}`)

      const dateBox = dialog.getByLabel("School year starts")
      const includeDated = dialog.getByRole("checkbox", { name: "Also change classes that already have a date" })
      const submit = dialog.getByRole("button", { name: "Set start date", exact: true })
      await expect(dateBox).toBeVisible()
      await expect(dialog.getByRole("button", { name: "1 April", exact: true })).toBeVisible()
      await expect(dialog.getByRole("button", { name: "1 June", exact: true })).toBeVisible()
      await expect(dialog.getByLabel("Reason (optional)")).toBeVisible()
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible()
      await expect(includeDated).not.toBeChecked()
      await expect(submit).toBeDisabled()                 // no date chosen yet

      // Box NOT ticked: both classes already have a date, so nothing can be changed and nothing can be sent
      await dateBox.fill(date)
      await expect(dialog).toContainText("0 will change, 2 keep their date")
      await expect(dialog).toContainText(ADMIN_TEXT.bulkNothingToChange)
      await expect(submit).toBeDisabled()
      expect(bulkPosts, "nothing may be sent while no selected class can change").toBe(0)
      await shot(dialog, "K1_nothing_to_change")

      // Box ticked: the same two classes can now be changed
      await includeDated.check()
      await expect(dialog).not.toContainText(ADMIN_TEXT.bulkNothingToChange)
      await expect(dialog).toContainText(`Set ${showYmd(date)} as the start date for 2 classes? Teachers of these classes can mark attendance straight away.`)
      await expect(submit).toBeEnabled()
      await expect(items).toHaveCount(2)
      await assertOnlyE2eClassesTicked(2)                 // the safety check, right before the one bulk save
      await shot(dialog, "K1_ready_to_save")

      const done = admin.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/api/school/classes-year-start"))
      await submit.click()
      const res = await done
      expect(res.status(), `bulk date save; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
      const sent = res.request().postDataJSON() as { year_start?: string; include_dated?: boolean; reason?: string; classes?: Array<{ id: string }> }
      expect(sent.year_start).toBe(date)
      expect(sent.include_dated).toBe(true)
      expect(sent.reason, "no reason was typed, so none may be sent").toBeUndefined()
      expect((sent.classes ?? []).map(c => c.id).sort()).toEqual([classAId, classBId].sort())
      const body = await res.json() as { results: Array<{ id: string; status: string }>; updated: number }
      expect(body.updated).toBe(2)
      expect(body.results.map(r => r.status)).toEqual(["saved", "saved"])
      expect(body.results.map(r => r.id).sort()).toEqual([classAId, classBId].sort())
      expect(bulkPosts).toBe(1)

      await expect(dialog).toContainText("2 classes updated. Teachers can now mark attendance.")
      await shot(dialog, "K1_saved")
      await dialog.getByRole("button", { name: "Done", exact: true }).click()
      await expect(bulkDialog()).toBeHidden()
      await expect(classRow(CLASS_A)).toContainText(`Year from ${showYmd(date)}`)
      await expect(classRow(CLASS_B)).toContainText(`Year from ${showYmd(date)}`)
      await expect(admin.locator("tbody").getByRole("checkbox", { checked: true })).toHaveCount(0)   // the selection was cleared
      expect((await readClassStart(classAId)).stored).toBe(date)
      expect((await readClassStart(classBId)).stored).toBe(date)
    } finally {
      admin.off("request", countBulk)
    }
  })

  // ── K2: the confirmation counts a real saved sheet ─────────────────────────
  test("K2 — Classes: with one saved sheet the confirmation says 1 sheet will stop counting (Keep saves nothing, Yes saves); moved back it says 1 will start counting", async () => {
    // 2 single date saves (the "Yes" of each direction). The one sheet is saved by the ADMIN session through the API
    // (POST /api/teacher/attendance accepts the admin role for any class of the school): no screen lets an admin mark a
    // sheet, so this setup call has no screen. Everything that is asserted afterwards is read on the real Edit class screen.
    expect(classAId).toMatch(/^[a-f0-9]{24}$/)
    expect(pupilId).toMatch(/^[a-f0-9]{24}$/)
    const today = istToday()
    const tomorrow = shiftYmd(today, 1)
    const baseline = await readYearStart(classAId)
    if (!baseline || baseline > today) {
      throw new Error(`Test K2 stopped on purpose: the E2E class A starts on ${baseline ?? "no date"}, which is not on or before today (${today}), so a sheet dated today would be refused. Nothing was posted.`)
    }
    let period = 0
    for (const p of [8, 7, 6, 5, 4, 3, 2, 1]) {
      if ((await readSheet(classAId, today, p)).attendance === null) { period = p; break }
    }
    if (!period) throw new Error(`Test K2 stopped on purpose: every period of ${today} already has a saved sheet for the E2E class A; nothing was posted.`)

    const posted = await admin.request.post(`${API_URL}/api/teacher/attendance`, {
      data: { class_id: classAId, date: today, period, subject: "", records: [{ student_id: pupilId, student_name: PUPIL, status: "present" }] },
    })
    expect(posted.status(), `saving the one sheet as the admin; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
    const sheet = (await readSheet(classAId, today, period)).attendance
    expect(sheet, "the sheet should exist now").not.toBeNull()
    expect(sheet?.records.map(r => r.student_id)).toEqual([pupilId])
    expect(sheet?.records[0]?.status).toBe("present")

    let patches = 0
    const countPatches = (r: Request) => { if (r.method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname)) patches++ }
    admin.on("request", countPatches)
    try {
      // 1. Move the start to tomorrow: the sheet (today) would stop counting. Keep saves nothing.
      await openClasses()
      await classRow(CLASS_A).getByRole("button", { name: "Edit class" }).click()
      await expect(yearField()).toHaveValue(baseline)
      await yearField().fill(tomorrow)
      await admin.getByRole("button", { name: "Save Changes" }).click()
      const confirm = yearStartConfirm()
      await expect(confirm).toBeVisible()
      await expect(confirm).toContainText(`from ${showYmd(baseline)} to ${showYmd(tomorrow)}`)
      await expect(confirm).toContainText("1 saved attendance sheet will stop counting")
      await expect(confirm).not.toContainText("No saved attendance sheets are affected.")
      await shot(confirm, "K2_confirm_stop_counting")
      await confirm.getByRole("button", { name: `Keep ${showYmd(baseline)}` }).click()
      await expect(confirm).toBeHidden()
      await expect(yearField()).toHaveValue(baseline)
      expect(patches, "Keep must not send a save").toBe(0)
      expect(await readYearStart(classAId), "Keep must leave the stored date as it was").toBe(baseline)

      // 2. The same change again, this time confirmed with Yes
      await yearField().fill(tomorrow)
      await admin.getByRole("button", { name: "Save Changes" }).click()
      await expect(confirm).toBeVisible()
      await expect(confirm).toContainText("1 saved attendance sheet will stop counting")
      const toTomorrow = admin.waitForResponse(r => r.request().method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname))
      await confirm.getByRole("button", { name: "Yes, change date" }).click()
      const firstRes = await toTomorrow
      expect(firstRes.status(), `moving the start to tomorrow; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
      expect((firstRes.request().postDataJSON() as { year_start?: string }).year_start).toBe(tomorrow)
      const firstBody = await firstRes.json() as { sheets_leaving?: number; sheets_entering?: number }
      expect(firstBody.sheets_leaving).toBe(1)
      expect(firstBody.sheets_entering).toBe(0)
      expect(patches).toBe(1)
      await expect(yearField()).toBeHidden()
      await expect(classRow(CLASS_A)).toContainText(`Year from ${showYmd(tomorrow)}`)
      expect(await readYearStart(classAId)).toBe(tomorrow)

      // 3. Move the start back to the date it had: the same sheet would start counting again
      await openClasses()
      await classRow(CLASS_A).getByRole("button", { name: "Edit class" }).click()
      await expect(yearField()).toHaveValue(tomorrow)
      await yearField().fill(baseline)
      await admin.getByRole("button", { name: "Save Changes" }).click()
      await expect(confirm).toBeVisible()
      await expect(confirm).toContainText(`from ${showYmd(tomorrow)} to ${showYmd(baseline)}`)
      await expect(confirm).toContainText("1 saved attendance sheet will start counting")
      await expect(confirm).not.toContainText("No saved attendance sheets are affected.")
      await shot(confirm, "K2_confirm_start_counting")
      const toBaseline = admin.waitForResponse(r => r.request().method() === "PATCH" && patchClassPath.test(new URL(r.url()).pathname))
      await confirm.getByRole("button", { name: "Yes, change date" }).click()
      const secondRes = await toBaseline
      expect(secondRes.status(), `moving the start back; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
      expect((secondRes.request().postDataJSON() as { year_start?: string }).year_start).toBe(baseline)
      const secondBody = await secondRes.json() as { sheets_leaving?: number; sheets_entering?: number }
      expect(secondBody.sheets_leaving).toBe(0)
      expect(secondBody.sheets_entering).toBe(1)
      expect(patches).toBe(2)
      await expect(yearField()).toBeHidden()
      await expect(classRow(CLASS_A)).toContainText(`Year from ${showYmd(baseline)}`)
      expect(await readYearStart(classAId)).toBe(baseline)

      // Moving a date never deletes a sheet: the one saved at the start of this test is still there
      const stillThere = (await readSheet(classAId, today, period)).attendance
      expect(stillThere, "moving the start date must not delete the saved sheet").not.toBeNull()
    } finally {
      admin.off("request", countPatches)
    }
  })

  // ── K3: the "no start date" chip and notice on the admin Classes screen (read only) ──
  test("K3 — Classes (read only): the chip shows on exactly the classes without a stored date; the notice numbers are right; 'Set dates' ticks exactly those classes", async ({}, testInfo) => {
    // Nothing is saved: the "Set start date" button is never pressed and a counter proves no bulk request is sent.
    // NOTE: "Set dates" makes the app itself tick the classes without a date (in the dialog only, until Cancel).
    const list = await readClassList()
    const missing = list.filter(c => !c.hasStartDate)
    if (missing.length === 0) {
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: no class without a start date, chip and notice not exercised" })
      await assertRealClassStartsUntouched()   // still proves that K1 and K2 left every real class's date alone
      return
    }

    let bulkPosts = 0
    const countBulk = (r: Request) => { if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/api/school/classes-year-start")) bulkPosts++ }
    admin.on("request", countBulk)
    try {
      await openClasses()
      const rows = admin.locator("tbody tr")
      await expect(rows).toHaveCount(list.length)
      // Each class's row is found by its own label (not by its position), so the check cannot drift onto another class
      const rowOf = (c: ClassListRow): Locator => {
        const label = adminClassLabel(c)
        return classRow(label).filter({ has: admin.getByRole("checkbox", { name: `Select ${label}`, exact: true }) })
      }
      for (const c of list) {
        const label = adminClassLabel(c)
        const row = rowOf(c)
        await expect(row, `exactly one table row must belong to the class "${label}"`).toHaveCount(1)
        const chip = row.getByText(ADMIN_TEXT.noStartDateChip, { exact: true })
        if (c.hasStartDate) {
          await expect(chip, `"${label}" has a stored date, so it must not show the chip`).toHaveCount(0)
          await expect(row).toContainText(`Year from ${showYmd(c.year_start ?? "")}`)
        } else {
          await expect(chip, `"${label}" has no stored date, so it must show the chip`).toHaveCount(1)
        }
      }

      const notice = admin.getByRole("status").filter({ hasText: "no school year start date" })
      await expect(notice).toContainText(ADMIN_TEXT.notice(missing.length, list.length))
      await shot(notice, "K3_notice")

      await admin.getByRole("button", { name: "Set dates", exact: true }).click()
      const dialog = bulkDialog()
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText(`${missing.length} ${missing.length === 1 ? "class" : "classes"} selected`)
      const items = dialog.getByRole("listitem")
      await expect(items).toHaveCount(missing.length)
      for (let k = 0; k < missing.length; k++) {
        await expect(items.nth(k)).toContainText(adminClassLabel(missing[k]))
        await expect(items.nth(k)).toContainText("No date yet")
      }
      for (const c of list) {
        const box = rowOf(c).getByRole("checkbox")
        if (c.hasStartDate) await expect(box).not.toBeChecked()
        else await expect(box).toBeChecked()
      }
      await expect(dialog.getByRole("button", { name: "Set start date", exact: true })).toBeDisabled()   // no date was chosen
      await shot(dialog, "K3_set_dates_dialog")
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
      await expect(dialog).toBeHidden()

      // Cancel leaves the classes without a date ticked (real classes among them). Untick every ticked class box so no real
      // class stays selected; unticking only changes the selection on this screen and saves nothing.
      const tickedBoxes = admin.locator("tbody").getByRole("checkbox", { checked: true })
      for (let guard = 0; guard < list.length + 5 && await tickedBoxes.count() > 0; guard++) {
        await tickedBoxes.first().uncheck()
      }
      await expect(tickedBoxes, "no class box may stay ticked after this test").toHaveCount(0)
      expect(bulkPosts, "this read-only test must never send a bulk save").toBe(0)
    } finally {
      admin.off("request", countBulk)
    }

    // The end of the read-only block of tests K1 to K3: no real class's stored date changed (also covers K1 and K2)
    await assertRealClassStartsUntouched()
  })

  // ── K4: the teacher's "attendance not set up" card (read only) ─────────────
  test("K4 — Attendance (teacher, read only): a class without a stored date is marked in the dropdown, shows the card, hides the marking buttons and stays blocked after 'Check again'", async ({}, testInfo) => {
    // Nothing is saved: no marking buttons exist on the blocked card and "Save Attendance" is never looked for or pressed.
    const res = await teacher.request.get(`${API_URL}/api/teacher/my-classes`)
    expect(res.status()).toBe(200)
    const body = await res.json() as { classes: Array<{ id: string; grade: number; section: string; name?: string | null; year_start?: string | null; has_start_date?: boolean }> }
    const blocked = body.classes.filter(c => c.has_start_date === false)
    if (blocked.length === 0) {
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: no class without a start date for this teacher, blocked card not exercised" })
      return
    }

    for (const c of blocked) {
      const label = teacherClassLabel({ id: c.id, grade: c.grade, section: c.section, name: c.name ?? null, year_start: c.year_start ?? null, hasStartDate: false })
      await openTeacherAttendance()
      const option = classSelect().locator(`option[value="${c.id}"]`)
      await expect(option).toBeAttached({ timeout: 20_000 })
      const optionText = ((await option.textContent()) ?? "").trim()
      expect(optionText.endsWith(TEACHER_TEXT.notStartedSuffix), `the dropdown option "${optionText}" must end with "${TEACHER_TEXT.notStartedSuffix}"`).toBe(true)
      expect(optionText).toBe(`${label}${TEACHER_TEXT.notStartedSuffix}`)

      await classSelect().selectOption(c.id)
      const notice = teacher.getByRole("status").filter({ hasText: "has not been switched on yet" })
      await expect(notice).toContainText(TEACHER_TEXT.notStarted(label))
      await expect(teacher.getByRole("button", { name: "Mark all present", exact: true })).toHaveCount(0)
      await expect(periodSelect()).toBeDisabled()
      await shot(notice, `K4_blocked_${c.id.slice(-6)}`)

      // "Check again" asks the server once; the class is still without a date, so it stays blocked
      const fresh = teacher.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname.endsWith("/api/teacher/my-classes"))
      await notice.getByRole("button", { name: "Check again", exact: true }).click()
      expect((await fresh).status(), "Check again must answer 200").toBe(200)
      await expect(teacher.getByText(TEACHER_TEXT.stillNotSet)).toBeVisible()
      await expect(notice).toContainText(TEACHER_TEXT.notStarted(label))
      await expect(teacher.getByRole("button", { name: "Mark all present", exact: true })).toHaveCount(0)
      await expect(periodSelect()).toBeDisabled()
    }
  })

  // ── K6: the teacher's View Stats card says what the numbers are counted from (read only) ──
  test("K6 — Attendance stats (teacher, read only): on the teacher's home class (which has a stored start date) the View Stats card shows the basis line and a This Year range that starts on the later of 1 June and the stored date", async ({}, testInfo) => {
    // Nothing is saved: no date is changed, no sheet is marked, no sign-in is made. The page only reads, and a request listener
    // proves that no POST, PATCH, PUT or DELETE leaves the teacher page while the test runs.
    expect(homeClassId).toMatch(/^[a-f0-9]{24}$/)
    const classesRes = await teacher.request.get(`${API_URL}/api/teacher/my-classes`)
    expect(classesRes.status()).toBe(200)
    const classesBody = await classesRes.json() as { classes: Array<{ id: string; grade: number; section: string; name?: string | null; year_start?: string | null; has_start_date?: boolean }> }
    const home = classesBody.classes.find(c => c.id === homeClassId)
    expect(home, `the home class ${homeClassId} must be in the teacher's class list`).toBeDefined()
    const stored = home?.year_start
    if (!home || home.has_start_date !== true || typeof stored !== "string") {
      testInfo.annotations.push({ type: "info", description: "NOT FOUND: home class has no start date, stats basis not exercised" })
      return
    }
    expect(stored).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const label = teacherClassLabel({ id: home.id, grade: home.grade, section: home.section, name: home.name ?? null, year_start: stored, hasStartDate: true })
    const today = istToday()
    // The component: "This Year" starts on 1 June of the school year that is running now (before June that is last year's 1 June),
    // or on the date the server counted from when that is later; the date is written day-month-year.
    const [thisYear, thisMonth] = today.split("-").map(Number)
    const juneFirst = `${thisMonth >= 6 ? thisYear : thisYear - 1}-06-01`
    const rangeFrom = stored > juneFirst ? stored : juneFirst
    const dmy = (ymd: string): string => ymd.split("-").reverse().join("-")
    const expectedRange = `${dmy(rangeFrom)} → ${dmy(today)}`
    // attendanceBasisLabel(): a start that is still in the future counts nothing yet, otherwise "<class>, counted from <date>"
    const expectedBasis = stored > today
      ? `Counting starts on ${showYmd(stored)}, so nothing is counted yet.`
      : `${label}, counted from ${showYmd(stored)}`

    const mutations: string[] = []
    const watchMutations = (r: Request) => {
      const method = r.method()
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") return
      const path = apiPathForNote(r.url())
      if (path !== null) mutations.push(`${method} ${path}`)
    }
    teacher.on("request", watchMutations)
    try {
      await openTeacherAttendance()
      await teacher.getByRole("button", { name: "View Stats", exact: true }).click()
      const statsClass = teacher.locator("select").filter({ hasText: "Select class…" }).first()
      await expect(statsClass.locator(`option[value="${homeClassId}"]`)).toBeAttached({ timeout: 20_000 })
      await statsClass.selectOption(homeClassId)

      const loaded = teacher.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname.endsWith("/api/teacher/attendance-stats"))
      await teacher.getByRole("button", { name: "Load Stats", exact: true }).click()
      const res = await loaded
      expect(res.status(), `the stats request; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
      expect(new URL(res.url()).searchParams.get("class_id"), "the stats request must be for the home class").toBe(homeClassId)
      const body = await res.json() as { counted_from?: string | null; counted_class_label?: string | null }
      expect(body.counted_from, "the stats answer must count from the stored start date").toBe(stored)
      expect(body.counted_class_label, "the stats answer must carry the class label").toBe(label)

      // The screen: the year card prints the range, and the basis line sits under the four cards
      const yearCard = teacher.getByText("This Year · Class Average", { exact: true }).locator("xpath=..")
      await expect(yearCard).toBeVisible()
      await expect(yearCard.getByText(expectedRange, { exact: true })).toBeVisible()
      const basisLine = teacher.getByText(expectedBasis, { exact: true })
      await expect(basisLine).toBeVisible()
      await shot(basisLine.locator("xpath=.."), "K6_stats_basis")
    } finally {
      teacher.off("request", watchMutations)
    }
    expect(mutations, "this read-only test must never send a POST, PATCH, PUT or DELETE").toEqual([])
  })

  // ── I4: a teacher cannot change a year start or read a class history (no screen) ──
  test("I4 — a teacher is refused (403) on the year-start change and on the class history, and nothing changes", async () => {
    // NO SCREEN: the teacher's screens have no such controls, so this calls the same API from the teacher's own
    // signed-in browser session (page.request) and reads the result back as the admin.
    expect(classAId).toMatch(/^[a-f0-9]{24}$/)
    expect(pupilId).toMatch(/^[a-f0-9]{24}$/)
    const before = await readYearStart(classAId)
    const change = await teacher.request.patch(`${API_URL}/api/school/classes/${classAId}`, { data: { year_start: istToday() } })
    expect(change.status()).toBe(403)
    const history = await teacher.request.get(`${API_URL}/api/school/student-detail/${pupilId}`)
    expect(history.status()).toBe(403)
    expect(await history.text()).not.toContain("class_history")
    expect(await readYearStart(classAId)).toBe(before)
  })

  // ── G: refused sheet (no screen) ───────────────────────────────────────────
  test("G — a sheet that lists a student who was not in the class on that date is refused (HTTP 400, nothing saved)", async () => {
    // NO SCREEN: the Attendance screen only ever lists the class's current students, so it never offers a
    // wrong-class student. This one check therefore calls the same API the screen uses, from the signed-in
    // teacher's browser session (page.request), and reads the result back with a read-only call.
    // The sheet is dated on the home class's START date: the class gate accepts that day (nothing is before the start),
    // and the pupil only joined today, so they were NOT in the class on it. A student moved TODAY did belong to the old
    // class today, so today's date would (correctly) be accepted; a date before the class start would be refused by the
    // start-date gate instead (test J5), so neither of those can be used here.
    const start = await readClassStart(homeClassId)
    expect(start.hasStartDate, "test J2 should have given the home class a stored start date").toBe(true)
    const date = start.stored ?? ""
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    if (date >= istToday()) {
      throw new Error(`Test G stopped on purpose: the home class starts on ${date}, which is not before today (${istToday()}), so the pupil would have been in the class on that date. Nothing was posted.`)
    }
    let period = 0
    for (const p of [8, 7, 6, 5, 4, 3, 2, 1]) {
      if ((await readSheet(homeClassId, date, p)).attendance === null) { period = p; break }
    }
    if (!period) throw new Error(`Test G stopped on purpose: every period of ${date} already has a saved sheet; nothing was posted.`)

    const res = await teacher.request.post(`${API_URL}/api/teacher/attendance`, {
      data: { class_id: homeClassId, date, period, subject: "", records: [{ student_id: pupilId, student_name: PUPIL, status: "present" }] },
    })
    expect(res.status()).toBe(400)
    const body = await res.json() as { error?: string }
    expect(body.error ?? "").toMatch(/not in this class on that date/i)
    expect((await readSheet(homeClassId, date, period)).attendance, "no sheet may have been created").toBeNull()
  })

  // ── J5: a sheet before the class start is refused (no screen) ──────────────
  test("J5 — a sheet dated one day before the class start is refused with before_start_date (HTTP 400, nothing saved)", async () => {
    // NO SCREEN: the teacher's date picker already stops at the start date (its minimum), so the screen never offers an
    // earlier day. The server still has to refuse it, so this one check calls the same API the screen uses, from the signed-in
    // teacher's browser session (page.request), and reads the result back with a read-only call. Only the refused day is
    // posted: the start date itself is not tested here, to avoid saving another sheet.
    const start = await readClassStart(homeClassId)
    expect(start.hasStartDate, "test J2 should have given the home class a stored start date").toBe(true)
    const startDate = start.stored ?? ""
    expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const date = shiftYmd(startDate, -1)
    if (date > istToday()) {
      throw new Error(`Test J5 stopped on purpose: the day before the class start (${date}) is in the future, so the server would refuse it for that reason instead. Nothing was posted.`)
    }
    let period = 0
    for (const p of [8, 7, 6, 5, 4, 3, 2, 1]) {
      if ((await readSheet(homeClassId, date, p)).attendance === null) { period = p; break }
    }
    if (!period) throw new Error(`Test J5 stopped on purpose: every period of ${date} already has a saved sheet; nothing was posted.`)

    const res = await teacher.request.post(`${API_URL}/api/teacher/attendance`, {
      data: { class_id: homeClassId, date, period, subject: "", records: [{ student_id: pupilId, student_name: PUPIL, status: "present" }] },
    })
    expect(res.status()).toBe(400)
    const body = await res.json() as { error?: string; code?: string }
    expect(body.code).toBe("before_start_date")
    expect(body.error ?? "").toMatch(/before the class's school year starts/i)
    expect((await readSheet(homeClassId, date, period)).attendance, "no sheet may have been created").toBeNull()
  })

  // ── C: bulk transfer ───────────────────────────────────────────────────────
  test("C — Students: bulk move to another class changes the badge; repeating it for a student already there is harmless", async () => {
    await openStudents()
    await searchStudents(PUPIL)
    const row = studentRow(PUPIL)
    await expect(row).toBeVisible()
    await row.getByRole("checkbox", { name: `Select ${PUPIL}` }).check()
    await expect(admin.getByText(/^1 selected/)).toBeVisible()       // only the E2E student is ticked
    await admin.getByRole("button", { name: "Show actions" }).click()

    const classPick = admin.locator("select").filter({ hasText: "Move to class" }).first()
    const apply = classPick.locator("xpath=..").getByRole("button", { name: "Apply" })

    for (const expectedMoved of [1, 0]) {
      await classPick.selectOption({ label: CLASS_B })
      const done = admin.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname.endsWith("/api/users/bulk-transfer"))
      await apply.click()
      const res = await done
      expect(res.status()).toBe(200)
      const body = await res.json() as { moved: number; skipped: Array<{ reason: string }> }
      expect(body.moved).toBe(expectedMoved)
      if (expectedMoved === 0) expect(body.skipped.map(s => s.reason)).toContain("already_in_class")
      await expect(row.getByText(CLASS_B, { exact: true })).toBeVisible()
      await shot(row, expectedMoved ? "C_bulk_moved" : "C_bulk_repeat")
    }
    await expect(admin.getByRole("heading", { name: "Students", exact: true }).first()).toBeVisible()   // page still fine
  })

  // ── I2: class history on the admin student row ─────────────────────────────
  test("I2 — Students: the open student row lists every class the student has been in, oldest first, with the current one marked", async () => {
    // Moves so far: home class -> CLASS_A (test B), CLASS_A -> CLASS_B (test C); the repeated saves made no extra lines.
    await openStudents()
    await searchStudents(PUPIL)
    const row = studentRow(PUPIL)
    const detailDone = admin.waitForResponse(r => r.request().method() === "GET" && /\/api\/school\/student-detail\/[a-f0-9]{24}$/.test(new URL(r.url()).pathname))
    await row.getByRole("button", { name: "View student details" }).click()
    expect((await detailDone).status(), `the student detail request must answer 200; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
    const history = admin.getByRole("region", { name: "Class history" })
    await expect(history).toBeVisible()
    const lines = history.getByRole("listitem")
    await expect(lines).toHaveCount(3)
    await expect(lines.nth(0)).toContainText("Moved class")
    await expect(lines.nth(0)).not.toContainText(CLASS_A)     // the first line is the home class, not CLASS_A
    await expect(lines.nth(1)).toContainText(CLASS_A)
    await expect(lines.nth(1)).toContainText("Moved class")
    await expect(lines.nth(2)).toContainText(CLASS_B)
    await expect(lines.nth(2)).toContainText("Current")
    await expect(lines.nth(2)).toContainText("Since")
    await shot(history, "I2_history")
  })

  // ── I3: a deleted class stays in the history ───────────────────────────────
  test("I3 — Students: after the class is deleted, the student's history still lists it as removed", async () => {
    // A class with active students cannot be deleted, so the E2E student is removed first (a soft delete, as in the cleanup).
    await openStudents()
    await searchStudents(PUPIL)
    await removeStudentRow(PUPIL)
    await openClasses()
    await deleteClassRow(CLASS_B)

    await openStudents()
    await searchStudents(PUPIL)
    const row = studentRow(PUPIL)
    const detailDone = admin.waitForResponse(r => r.request().method() === "GET" && /\/api\/school\/student-detail\/[a-f0-9]{24}$/.test(new URL(r.url()).pathname))
    await row.getByRole("button", { name: "View student details" }).click()
    expect((await detailDone).status(), `the student detail request must answer 200; failed or refused /api/ requests so far: ${failedRequestsNote()}`).toBe(200)
    const history = admin.getByRole("region", { name: "Class history" })
    await expect(history).toBeVisible()
    await expect(history.getByRole("listitem").filter({ hasText: CLASS_B })).toContainText("(class removed)")
    await shot(history, "I3_class_removed")
  })

  // ── H: regression ──────────────────────────────────────────────────────────
  test("H — regression: the admin Students list and the teacher Attendance screen still load", async () => {
    await openStudents()
    await expect(admin.getByRole("heading", { name: "Students", exact: true }).first()).toBeVisible()
    await shot(admin.getByRole("heading", { name: "Students", exact: true }).first(), "H_admin_students")

    await openTeacherAttendance()
    await showSheet(homeClassId, 1)
    await expect(sheetRows().first().or(teacher.getByText("No students found in this class."))).toBeVisible()
    await shot(teacher.getByRole("heading", { name: "Attendance", exact: true }).first(), "H_teacher_attendance")
  })
})
