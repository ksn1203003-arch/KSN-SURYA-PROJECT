// Unit test (jsdom, no browser, no network) of the "attendance not set up" screens of the
// teacher Attendance panel.
//
// MOCKED: only the named functions the panel imports from "@/lib/userApi" (getTeacherClasses,
// getClassStudents, getAttendance, saveAttendance and the two stats functions). This is a unit test,
// not a browser test: no request ever leaves the test. The panel is rendered the way its real
// parent (pages/TeacherDashboard.tsx) renders it: <TeacherAttendancePanel ttClasses={ttClasses} />.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ComponentProps } from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom/vitest"

const api = vi.hoisted(() => ({
  saveAttendance: vi.fn(),
  getAttendance: vi.fn(),
  getClassStudents: vi.fn(),
  getClassAttendanceStats: vi.fn(),
  getClassAttendanceRange: vi.fn(),
  getTeacherClasses: vi.fn(),
}))

vi.mock("@/lib/userApi", () => ({ ...api }))

import { TeacherAttendancePanel } from "@/components/teacher/TeacherAttendancePanel"

type PanelClass = ComponentProps<typeof TeacherAttendancePanel>["ttClasses"][number]

function makeClass(over: Partial<PanelClass> & { id: string }): PanelClass {
  return {
    grade: 8, section: "A", name: null, subjects: [], timetable: [],
    timetable_updated_by_name: null, timetable_updated_at: null,
    year_start: null, has_start_date: false,
    ...over,
  }
}

const DATED_8A = makeClass({ id: "cls-8a", grade: 8, section: "A", year_start: "2026-06-01", has_start_date: true })
const UNDATED_8B = makeClass({ id: "cls-8b", grade: 8, section: "B" })

// Sentences copied from the TEXT object of TeacherAttendancePanel.tsx
const NOT_STARTED_8B =
  "Attendance for Class 8B has not been switched on yet. Your school admin needs to set the date this class's school year starts. You will be able to mark attendance as soon as that is done. Nothing is lost: nothing has been marked."
const SUFFIX = " (attendance not set up)"
const DATE_IS_SET = "The date is set. You can mark attendance now."
const STILL_NOT_SET = "Checked just now. The date is still not set."
const CHECK_FAILED = "Could not check right now. Please try again."

// "Today" is fixed; only Date is faked, timers stay real
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-11T06:00:00.000Z"))
  for (const fn of Object.values(api)) fn.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("TeacherAttendancePanel: a class with no school year start date", () => {
  it("C5: the option says '(attendance not set up)'; choosing it shows the notice, no 'Mark all present', Period disabled, 'Check again'", async () => {
    const user = userEvent.setup()
    api.getClassStudents.mockResolvedValue({ students: [{ id: "stu-1", name: "Asha Rao", username: null, is_active: true }] })
    api.getAttendance.mockResolvedValue({ attendance: null })
    render(<TeacherAttendancePanel ttClasses={[DATED_8A, UNDATED_8B]} />)

    const classSelect = screen.getByLabelText("Class")
    const options = within(classSelect).getAllByRole("option")
    expect(options.map(o => o.textContent)).toEqual(["Select class…", "Class 8A", `Class 8B${SUFFIX}`])
    expect(options[2].textContent?.endsWith(SUFFIX)).toBe(true)
    expect(options[1].textContent?.endsWith(SUFFIX)).toBe(false)

    // Contrast first: the dated class (selected at the start) lets the teacher pick a period and mark everyone
    const period = screen.getByLabelText("Period")
    expect(period).toBeEnabled()
    await user.selectOptions(period, "1")
    await screen.findByRole("button", { name: "Mark all present" })
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    // Now the class without a date
    await user.selectOptions(classSelect, "cls-8b")

    const card = screen.getByRole("status")
    expect(card).toHaveTextContent(NOT_STARTED_8B)
    expect(within(card).getByRole("button", { name: "Check again" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Mark all present" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save Attendance" })).not.toBeInTheDocument()
    expect(screen.getByLabelText("Period")).toBeDisabled()
  })

  it("C5b: a class that has only its own name is called by that name in the option and in the notice", () => {
    const named = makeClass({ id: "cls-orchids", grade: 0, section: "A", name: "Orchids" })
    render(<TeacherAttendancePanel ttClasses={[named]} />)

    const options = within(screen.getByLabelText("Class")).getAllByRole("option")
    expect(options.map(o => o.textContent)).toEqual(["Select class…", `Orchids${SUFFIX}`])

    // The first class of the list is selected at the start, so the notice is already on screen
    expect(screen.getByRole("status")).toHaveTextContent("Attendance for Orchids has not been switched on yet.")
  })

  it("C6a: 'Check again' re-reads the class list once with fresh:true; a newly set date removes the card and shows 'Counted from'", async () => {
    const user = userEvent.setup()
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    api.getTeacherClasses.mockImplementation(async () => {
      await gate
      return { classes: [{ ...UNDATED_8B, year_start: "2026-06-01", has_start_date: true }] }
    })
    render(<TeacherAttendancePanel ttClasses={[UNDATED_8B]} />)

    expect(screen.getByRole("status")).toHaveTextContent(NOT_STARTED_8B)
    expect(api.getTeacherClasses).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Check again" }))

    // While the answer is awaited the button is busy and cannot be pressed again
    const busy = screen.getByRole("button", { name: "Checking…" })
    expect(busy).toBeDisabled()
    await user.click(busy)

    release()
    expect(await screen.findByText("Counted from 1 Jun 2026")).toBeInTheDocument()

    expect(api.getTeacherClasses).toHaveBeenCalledTimes(1)
    expect(api.getTeacherClasses).toHaveBeenCalledWith({ fresh: true })
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument()
    expect(screen.getByText(DATE_IS_SET)).toBeInTheDocument()
    expect(within(screen.getByLabelText("Class")).getByRole("option", { name: "Class 8B" })).toBeInTheDocument()
    expect(screen.getByLabelText("Period")).toBeEnabled()
  })

  it("C6b: when the re-read still says no date, the card stays and says so", async () => {
    const user = userEvent.setup()
    api.getTeacherClasses.mockResolvedValue({ classes: [{ ...UNDATED_8B }] })
    render(<TeacherAttendancePanel ttClasses={[UNDATED_8B]} />)

    await user.click(screen.getByRole("button", { name: "Check again" }))

    expect(await screen.findByText(STILL_NOT_SET)).toBeInTheDocument()
    expect(api.getTeacherClasses).toHaveBeenCalledTimes(1)
    expect(api.getTeacherClasses).toHaveBeenCalledWith({ fresh: true })
    expect(screen.getByRole("status")).toHaveTextContent(NOT_STARTED_8B)
    expect(screen.queryByText(/^Counted from/)).not.toBeInTheDocument()
  })

  it("C6c: when the re-read fails, an error line is announced and the card stays", async () => {
    const user = userEvent.setup()
    api.getTeacherClasses.mockResolvedValue({ error: "Network error" })
    render(<TeacherAttendancePanel ttClasses={[UNDATED_8B]} />)

    await user.click(screen.getByRole("button", { name: "Check again" }))

    const line = await screen.findByText(CHECK_FAILED)
    expect(line).toHaveAttribute("aria-live", "polite")
    expect(api.getTeacherClasses).toHaveBeenCalledTimes(1)
    expect(api.getTeacherClasses).toHaveBeenCalledWith({ fresh: true })

    const card = screen.getByRole("status")
    expect(card).toHaveTextContent(NOT_STARTED_8B)
    expect(within(card).getByRole("button", { name: "Check again" })).toBeEnabled()
    expect(screen.queryByText(/^Counted from/)).not.toBeInTheDocument()
  })
})

describe("TeacherAttendancePanel: a class with a school year start date", () => {
  it("C7: shows 'Counted from <date>' and no card", () => {
    render(<TeacherAttendancePanel ttClasses={[DATED_8A]} />)

    expect(screen.getByText("Counted from 1 Jun 2026")).toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByText(/has not been switched on yet/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Check again" })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText("Class")).getByRole("option", { name: "Class 8A" })).toBeInTheDocument()
    expect(screen.getByLabelText("Period")).toBeEnabled()
  })
})
