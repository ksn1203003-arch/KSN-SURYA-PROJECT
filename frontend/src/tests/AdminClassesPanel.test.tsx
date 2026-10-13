// Unit test (jsdom, no browser, no network) of the "no school year start date" screens of the
// admin Classes panel: the amber chip, the top notice, the bulk dialog and the confirmation sentences.
//
// The panel is a presentational component; its real parent (pages/AdminDashboard.tsx) owns the state.
// The Harness below owns the same state the parent owns for the bulk dialog and passes the same
// props, so a click on "Set dates" or on a row checkbox behaves as it does in the app.
// Nothing from lib/userApi is imported by the panel, so nothing is mocked here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useState } from "react"
import type { ComponentProps } from "react"
import { render, screen, within, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom/vitest"
import AdminClassesPanel from "@/components/admin/AdminClassesPanel"
import type { ClassRow } from "@/components/admin/adminTypes"

type PanelProps = ComponentProps<typeof AdminClassesPanel>

const noop = (): void => undefined

// Sentences copied from the TEXT object of AdminClassesPanel.tsx (U+2013 is an en dash)
const CHIP = "No start date – teachers cannot mark attendance"
const NOTHING_TO_CHANGE =
  'None of the selected classes can be changed because they all already have a date. Tick "Also change classes that already have a date" to change them.'
const DIALOG_TITLE = "Set school year start for selected classes"

function makeClass(over: Partial<ClassRow> & { id: string }): ClassRow {
  return {
    grade: 5, section: "A", name: null, subjects: [],
    year_start: null, year_start_effective: "2026-06-01", has_start_date: false,
    teacher_id: null, teacher_name: null, student_count: 30, teachers: [], timetable: [],
    ...over,
  }
}

const UNDATED_5A = makeClass({ id: "c-5a", grade: 5, section: "A" })
const UNDATED_5B = makeClass({ id: "c-5b", grade: 5, section: "B" })
const DATED_6A = makeClass({ id: "c-6a", grade: 6, section: "A", year_start: "2026-04-01", year_start_effective: "2026-04-01", has_start_date: true })
const DATED_6B = makeClass({ id: "c-6b", grade: 6, section: "B", year_start: "2026-04-01", year_start_effective: "2026-04-01", has_start_date: true })

// Keeps the bulk-dialog state in the same shape and with the same resets as pages/AdminDashboard.tsx
function Harness({ classes, onSubmit, overrides }: {
  classes: ClassRow[]
  onSubmit?: () => void
  overrides?: Partial<PanelProps>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showBulk, setShowBulk] = useState(false)
  const [bulkDate, setBulkDate] = useState("")
  const [includeDated, setIncludeDated] = useState(false)
  const [reason, setReason] = useState("")

  function openBulk(ids?: string[]) {
    if (ids) setSelected(new Set(ids))
    setBulkDate(""); setIncludeDated(false); setReason("")
    setShowBulk(true)
  }

  const props: PanelProps = {
    classes, loadingClasses: false,
    selectedClassIds: selected,
    setSelectedClassIds: fn => setSelected(prev => fn(prev)),
    classBulkDeleteLoading: false, handleBulkDeleteClasses: noop,
    showAddClass: false, setShowAddClass: noop, addClassErr: "", setAddClassErr: noop,
    handleAddClass: noop, addClassLoading: false,
    newClassName: "", setNewClassName: noop, newSubjectInput: "", setNewSubjectInput: noop,
    newSubjects: [], setNewSubjects: noop,
    editClass: null, setEditClass: noop, editClassName: "", setEditClassName: noop,
    editSubjectInput: "", setEditSubjectInput: noop, editSubjects: [], setEditSubjects: noop,
    editClassErr: "", editClassLoading: false, handleEditClass: noop,
    editYearStart: "", setEditYearStart: noop, editYearStartReason: "", setEditYearStartReason: noop,
    yearStartError: null, yearStartConfirmOpen: false, yearStartPreviewLoading: false,
    yearStartPreview: null, yearStartCheckFailed: false,
    retryYearStartPreview: noop, confirmYearStartChange: noop, cancelYearStartChange: noop,
    showBulkYearStart: showBulk, openBulkYearStart: openBulk, closeBulkYearStart: () => setShowBulk(false),
    bulkYsDate: bulkDate, setBulkYsDate: setBulkDate,
    bulkYsIncludeDated: includeDated, setBulkYsIncludeDated: setIncludeDated,
    bulkYsReason: reason, setBulkYsReason: setReason,
    bulkYsLoading: false, bulkYsError: null, bulkYsOutcome: null, bulkYsFailedCount: 0,
    submitBulkYearStart: onSubmit ?? noop, retryBulkYearStart: noop,
    confirmDeleteClass: null, setConfirmDeleteClass: noop, handleDeleteClass: noop, deleteClassLoading: false,
  }
  return <AdminClassesPanel {...props} {...overrides} />
}

function rowOf(label: string): HTMLElement {
  const row = screen.getByText(label).closest("tr")
  if (!row) throw new Error(`No table row found for ${label}`)
  return row
}

function openDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: DIALOG_TITLE })
}

function chooseDate(value: string): void {
  fireEvent.change(screen.getByLabelText("School year starts"), { target: { value } })
}

// "Today" is fixed so the typed date is never in the future and the sentences do not depend on the real clock.
// Only Date is faked, timers stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-11T06:00:00.000Z"))
})
afterEach(() => {
  vi.useRealTimers()
})

describe("AdminClassesPanel: classes without a school year start date", () => {
  it("C1: the chip is on exactly the classes without a date, the notice counts them, and 'Set dates' ticks exactly those", async () => {
    const user = userEvent.setup()
    render(<Harness classes={[UNDATED_5A, UNDATED_5B, DATED_6A]} />)

    expect(screen.getAllByText(CHIP)).toHaveLength(2)
    expect(within(rowOf("Class 5A")).getByText(CHIP)).toBeInTheDocument()
    expect(within(rowOf("Class 5B")).getByText(CHIP)).toBeInTheDocument()
    expect(within(rowOf("Class 6A")).queryByText(CHIP)).not.toBeInTheDocument()
    expect(within(rowOf("Class 6A")).getByText("Year from 1 Apr 2026")).toBeInTheDocument()

    const notice = screen.getByRole("status")
    expect(notice).toHaveTextContent(
      "2 of 3 classes have no school year start date. Teachers cannot mark attendance for these classes yet.",
    )

    await user.click(within(notice).getByRole("button", { name: "Set dates" }))

    const dialog = openDialog()
    expect(screen.getByRole("checkbox", { name: "Select Class 5A" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Select Class 5B" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Select Class 6A" })).not.toBeChecked()

    expect(within(dialog).getByText("2 classes selected")).toBeInTheDocument()
    const items = within(dialog).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("Class 5A")
    expect(items[0]).toHaveTextContent("No date yet")
    expect(items[1]).toHaveTextContent("Class 5B")
    expect(items[1]).toHaveTextContent("No date yet")
    expect(within(dialog).queryByText("Class 6A")).not.toBeInTheDocument()
    expect(within(dialog).getByRole("checkbox", { name: "Also change classes that already have a date" })).not.toBeChecked()
  })

  it("C1b: the notice wording when one class of three, and the only class, has no date (current wording pinned)", () => {
    const first = render(<Harness classes={[UNDATED_5A, DATED_6A, DATED_6B]} />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 of 3 classes have no school year start date. Teachers cannot mark attendance for this class yet.",
    )
    first.unmount()

    render(<Harness classes={[UNDATED_5A]} />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 of 1 class has no school year start date. Teachers cannot mark attendance for this class yet.",
    )
  })

  it("C2: with every class dated there is no chip and no notice", () => {
    render(<Harness classes={[DATED_6A, DATED_6B]} />)

    expect(screen.queryByText(CHIP)).not.toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByText(/have no school year start date/)).not.toBeInTheDocument()
    expect(screen.queryByText(/has no school year start date/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Set dates" })).not.toBeInTheDocument()
    expect(within(rowOf("Class 6A")).getByText("Year from 1 Apr 2026")).toBeInTheDocument()
    expect(within(rowOf("Class 6B")).getByText("Year from 1 Apr 2026")).toBeInTheDocument()
  })

  describe("C3: singular and plural wording", () => {
    it("the edit-class confirmation says 'sheet' and 'It stays' for 1, 'sheets' and 'They stay' for 2", () => {
      const first = render(
        <Harness classes={[DATED_6A]} overrides={{
          editClass: DATED_6A, editYearStart: "2026-06-01", yearStartConfirmOpen: true,
          yearStartPreview: { current: "2026-04-01", date: "2026-06-01", sheets_leaving: 1, sheets_entering: 1 },
        }} />,
      )
      expect(screen.getByText("Change the school year start for Class 6A from 1 Apr 2026 to 1 Jun 2026?")).toBeInTheDocument()
      expect(screen.getByText(
        "1 saved attendance sheet will stop counting in attendance percentages. It stays stored and will count again if you move the date back.",
      )).toBeInTheDocument()
      expect(screen.getByText("1 saved attendance sheet will start counting.")).toBeInTheDocument()
      first.unmount()

      render(
        <Harness classes={[DATED_6A]} overrides={{
          editClass: DATED_6A, editYearStart: "2026-06-01", yearStartConfirmOpen: true,
          yearStartPreview: { current: "2026-04-01", date: "2026-06-01", sheets_leaving: 2, sheets_entering: 2 },
        }} />,
      )
      expect(screen.getByText(
        "2 saved attendance sheets will stop counting in attendance percentages. They stay stored and will count again if you move the date back.",
      )).toBeInTheDocument()
      expect(screen.getByText("2 saved attendance sheets will start counting.")).toBeInTheDocument()
    })

    it("the edit-class confirmation says nothing is affected when no sheet moves", () => {
      render(
        <Harness classes={[DATED_6A]} overrides={{
          editClass: DATED_6A, editYearStart: "2026-06-01", yearStartConfirmOpen: true,
          yearStartPreview: { current: "2026-04-01", date: "2026-06-01", sheets_leaving: 0, sheets_entering: 0 },
        }} />,
      )
      expect(screen.getByText("No saved attendance sheets are affected.")).toBeInTheDocument()
    })

    it("the bulk dialog says '1 class' / 'this class' for one selected class", async () => {
      const user = userEvent.setup()
      render(<Harness classes={[UNDATED_5A, UNDATED_5B, DATED_6A]} />)

      await user.click(screen.getByRole("checkbox", { name: "Select Class 5A" }))
      await user.click(screen.getByRole("button", { name: "Set school year start" }))
      const dialog = openDialog()
      chooseDate("2026-06-01")

      expect(within(dialog).getByText("1 class selected")).toBeInTheDocument()
      expect(within(dialog).getByText("1 will change, 0 keep their date")).toBeInTheDocument()
      expect(within(dialog).getByText(
        "Set 1 Jun 2026 as the start date for 1 class? Teachers of this class can mark attendance straight away. Classes that already have a date are not changed unless you tick the box above.",
      )).toBeInTheDocument()
    })

    it("the bulk dialog says '2 classes' / 'these classes' for two selected classes", async () => {
      const user = userEvent.setup()
      render(<Harness classes={[UNDATED_5A, UNDATED_5B, DATED_6A]} />)

      await user.click(screen.getByRole("checkbox", { name: "Select Class 5A" }))
      await user.click(screen.getByRole("checkbox", { name: "Select Class 5B" }))
      await user.click(screen.getByRole("button", { name: "Set school year start" }))
      const dialog = openDialog()
      chooseDate("2026-06-01")

      expect(within(dialog).getByText("2 classes selected")).toBeInTheDocument()
      expect(within(dialog).getByText("2 will change, 0 keep their date")).toBeInTheDocument()
      expect(within(dialog).getByText(
        "Set 1 Jun 2026 as the start date for 2 classes? Teachers of these classes can mark attendance straight away. Classes that already have a date are not changed unless you tick the box above.",
      )).toBeInTheDocument()
    })

    it("the bulk dialog split line when one class changes and one keeps its date (current wording pinned)", async () => {
      const user = userEvent.setup()
      render(<Harness classes={[UNDATED_5A, UNDATED_5B, DATED_6A]} />)

      await user.click(screen.getByRole("checkbox", { name: "Select Class 5A" }))
      await user.click(screen.getByRole("checkbox", { name: "Select Class 6A" }))
      await user.click(screen.getByRole("button", { name: "Set school year start" }))
      const dialog = openDialog()
      chooseDate("2026-06-01")

      expect(within(dialog).getByText("1 will change, 1 keep their date")).toBeInTheDocument()
      expect(within(dialog).getByText(
        "Set 1 Jun 2026 as the start date for 1 class? Teachers of this class can mark attendance straight away. Classes that already have a date are not changed unless you tick the box above.",
      )).toBeInTheDocument()
    })
  })

  it("C4: with only dated classes ticked the dialog says none can be changed and Save does not submit; ticking the box enables it", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness classes={[UNDATED_5A, DATED_6A, DATED_6B]} onSubmit={onSubmit} />)

    await user.click(screen.getByRole("checkbox", { name: "Select Class 6A" }))
    await user.click(screen.getByRole("checkbox", { name: "Select Class 6B" }))
    await user.click(screen.getByRole("button", { name: "Set school year start" }))
    const dialog = openDialog()
    const save = within(dialog).getByRole("button", { name: "Set start date" })
    const includeDated = within(dialog).getByRole("checkbox", { name: "Also change classes that already have a date" })

    // No date typed yet: Save is off
    expect(save).toBeDisabled()

    chooseDate("2026-06-01")

    expect(includeDated).not.toBeChecked()
    expect(within(dialog).getByText(NOTHING_TO_CHANGE)).toBeInTheDocument()
    expect(within(dialog).getByText("0 will change, 2 keep their date")).toBeInTheDocument()
    expect(save).toBeDisabled()
    await user.click(save)
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(includeDated)

    expect(includeDated).toBeChecked()
    expect(within(dialog).queryByText(NOTHING_TO_CHANGE)).not.toBeInTheDocument()
    expect(within(dialog).getByText(
      "Set 1 Jun 2026 as the start date for 2 classes? Teachers of these classes can mark attendance straight away.",
    )).toBeInTheDocument()
    expect(save).toBeEnabled()

    await user.click(save)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
