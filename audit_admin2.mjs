import { chromium } from "playwright"
import path from "path"

const FRONTEND = "http://localhost:5173"
const SS = (name) => path.join("c:\\Users\\surya\\OneDrive - Axiom365\\Documents\\ClassroomAI", `adm2_${name}.png`)

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  // Login
  await page.goto(`${FRONTEND}/login`)
  await page.waitForLoadState("networkidle")
  await page.locator("button", { hasText: /^admin$/i }).click()
  await page.waitForTimeout(400)
  await page.locator('input[placeholder*="phone" i]').first().fill("ksn1203003@gmail.com")
  await page.locator('input[type="password"]').fill("Admin@1234")
  await page.locator('button[type="submit"]').click()
  await page.waitForURL("**/admin/dashboard", { timeout: 20000 })
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)

  const nav = async (label) => {
    const item = page.locator("aside a, aside button, nav a, nav button").filter({ hasText: new RegExp(`^${label}$`, "i") }).first()
    await item.click()
    await page.waitForTimeout(1800)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
  }

  // OVERVIEW — top and bottom
  await page.screenshot({ path: SS("01_overview_top") })
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(400)
  await page.screenshot({ path: SS("02_overview_scrolled") })

  // CLASSES
  await nav("Classes")
  await page.screenshot({ path: SS("03_classes") })
  // Click edit pencil on first row
  const firstEditBtn = page.locator("button[title='Edit'], button").filter({ has: page.locator("[data-lucide='pencil'], svg") }).first()
  const allBtns = await page.locator("tbody tr").first().locator("button").all()
  if (allBtns.length > 0) {
    await allBtns[0].click({ force: true })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: SS("04_classes_edit") })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(500)
  }

  // TEACHERS
  await nav("Teachers")
  await page.screenshot({ path: SS("05_teachers") })
  // Click chevron on first teacher row
  const teacherRows = page.locator("tbody tr")
  const rowCount = await teacherRows.count()
  if (rowCount > 0) {
    const chevronBtn = teacherRows.first().locator("button").last()
    await chevronBtn.click({ force: true }).catch(() => {})
    await page.waitForTimeout(800)
    await page.screenshot({ path: SS("06_teachers_row_expanded") })
  }

  // STUDENTS
  await nav("Students")
  await page.screenshot({ path: SS("07_students") })
  const studentRows = page.locator("tbody tr")
  const sRowCount = await studentRows.count()
  if (sRowCount > 0) {
    const sChevron = studentRows.first().locator("button").last()
    await sChevron.click({ force: true }).catch(() => {})
    await page.waitForTimeout(800)
    await page.screenshot({ path: SS("08_students_row_expanded") })
  }

  // TIMETABLE — select Class 6A
  await nav("Timetable")
  await page.screenshot({ path: SS("09_timetable_empty") })
  const ttSelect = page.locator("select").first()
  const ttOptions = await ttSelect.locator("option").all()
  if (ttOptions.length > 1) {
    await ttSelect.selectOption({ index: 3 }) // pick 6A
    await page.waitForTimeout(1500)
    await page.screenshot({ path: SS("10_timetable_with_class") })
  }

  // MARKS — click on Class 6A tab
  await nav("Marks")
  await page.screenshot({ path: SS("11_marks") })
  const marks6A = page.locator("button").filter({ hasText: /^6A$/ })
  if (await marks6A.count() > 0) {
    await marks6A.click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: SS("12_marks_6a_selected") })
  }

  // CERTIFICATES — select a class then scroll
  await nav("Certificates")
  await page.screenshot({ path: SS("13_certs_empty") })
  const certSelect = page.locator("select").first()
  const certOptions = await certSelect.locator("option").all()
  if (certOptions.length > 1) {
    await certSelect.selectOption({ index: 1 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: SS("14_certs_loaded") })
    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForTimeout(400)
    await page.screenshot({ path: SS("15_certs_scrolled") })
  }

  // REPORTS — top and scroll
  await nav("Reports")
  await page.screenshot({ path: SS("16_reports") })
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(300)
  await page.screenshot({ path: SS("17_reports_scrolled") })

  // DATA REQUESTS
  await nav("Data Requests")
  await page.screenshot({ path: SS("18_data_requests") })

  // NOTIFICATIONS — top and scroll down
  await nav("Notifications")
  await page.screenshot({ path: SS("19_notifications_top") })
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(300)
  await page.screenshot({ path: SS("20_notifications_bottom") })

  // SETTINGS — scroll down for full view
  await nav("Settings")
  await page.screenshot({ path: SS("21_settings_top") })
  await page.evaluate(() => window.scrollTo(0, 500))
  await page.waitForTimeout(300)
  await page.screenshot({ path: SS("22_settings_bottom") })

  await browser.close()
  console.log("Done.")
})()
