import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, BookOpen, Trash2, X, AlertTriangle, CalendarDays } from "lucide-react"
import { Modal, Spinner, SectionHeader, Empty } from "./adminComponents"
import { clsLabel, clsCompact } from "./adminShared"
import { formatYmdForDisplay, classStartDate, istToday } from "./adminTypes"
import type { ClassRow, YearStartPreview, BulkYearStartOutcome } from "./adminTypes"

// All the sentences for the school-year-start screens are kept here, in one place, so Hindi can be added later.
const TEXT = {
  noStartDateChip: "No start date – teachers cannot mark attendance",
  noticeMany: (n: number, total: number) =>
    `${n} of ${total} ${total === 1 ? "class has" : "classes have"} no school year start date. Teachers cannot mark attendance for ${n === 1 ? "this class" : "these classes"} yet.`,
  reasonLabel: "Reason (optional)",
  reasonHint: "Do not type student names.",
  checking: "Checking saved attendance…",
  checkFailed: "Could not check the saved attendance. Please try again.",
  confirmHeading: (label: string, from: string, to: string) =>
    `Change the school year start for ${label} from ${from} to ${to}?`,
  leaving: (n: number) =>
    `${sheetsText(n)} will stop counting in attendance percentages. ${n === 1 ? "It stays" : "They stay"} stored and will count again if you move the date back.`,
  entering: (n: number) => `${sheetsText(n)} will start counting.`,
  nothingAffected: "No saved attendance sheets are affected.",
  bulkTitle: "Set school year start for selected classes",
  firstSetHeading: (label: string, date: string) => `Set the school year start for ${label} to ${date}?`,
  futureLockoutOne: (date: string) => `Teachers cannot mark attendance for this class until ${date}.`,
  futureLockoutMany: (date: string) => `Teachers cannot mark attendance for these classes until ${date}.`,
  bulkConfirm: (date: string, n: number, future: boolean, includeDated: boolean) =>
    `Set ${date} as the start date for ${n} ${n === 1 ? "class" : "classes"}?${future ? "" : ` Teachers of ${n === 1 ? "this class" : "these classes"} can mark attendance straight away.`}${includeDated ? "" : " Classes that already have a date are not changed unless you tick the box above."}`,
  bulkSplit: (x: number, y: number) => `${x} will change, ${y} keep their date`,
  bulkNothingToChange: `None of the selected classes can be changed because they all already have a date. Tick "Also change classes that already have a date" to change them.`,
  bulkNotFound: (n: number) =>
    `${n} ${n === 1 ? "class" : "classes"} could not be found (${n === 1 ? "it" : "they"} may have been deleted).`,
  bulkUpdated: (n: number) => `${n} ${n === 1 ? "class" : "classes"} updated. Teachers can now mark attendance.`,
  bulkLeft: (n: number) =>
    `${n} ${n === 1 ? "class was" : "classes were"} left as ${n === 1 ? "it was" : "they were"} (${n === 1 ? "it already has" : "they already have"} a date or ${n === 1 ? "was" : "were"} changed by someone else).`,
  bulkFailed: (n: number) => `${n} ${n === 1 ? "class" : "classes"} could not be saved. Please try again.`,
}

function sheetsText(n: number): string {
  return `${n} saved attendance ${n === 1 ? "sheet" : "sheets"}`
}

function shiftYmd(ymd: string, years: number, days: number): string {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7)), d = Number(ymd.slice(8, 10))
  return new Date(Date.UTC(y + years, m - 1, d + days)).toISOString().slice(0, 10)
}

// 1 April or 1 June of the school year that is running today
function currentSchoolYearStart(today: string, month: "04" | "06"): string {
  const thisYear = `${today.slice(0, 4)}-${month}-01`
  return thisYear <= today ? thisYear : `${Number(today.slice(0, 4)) - 1}-${month}-01`
}

interface AdminClassesPanelProps {
  classes: ClassRow[]
  loadingClasses: boolean
  selectedClassIds: Set<string>
  setSelectedClassIds: (fn: (prev: Set<string>) => Set<string>) => void
  classBulkDeleteLoading: boolean
  handleBulkDeleteClasses: () => void
  showAddClass: boolean
  setShowAddClass: (b: boolean) => void
  addClassErr: string
  setAddClassErr: (s: string) => void
  handleAddClass: (e: React.FormEvent) => void
  addClassLoading: boolean
  newClassName: string
  setNewClassName: (s: string) => void
  newSubjectInput: string
  setNewSubjectInput: (s: string) => void
  newSubjects: string[]
  setNewSubjects: (fn: (prev: string[]) => string[]) => void
  editClass: ClassRow | null
  setEditClass: (c: ClassRow | null) => void
  editClassName: string
  setEditClassName: (s: string) => void
  editSubjectInput: string
  setEditSubjectInput: (s: string) => void
  editSubjects: string[]
  setEditSubjects: (fn: (prev: string[]) => string[]) => void
  editClassErr: string
  editClassLoading: boolean
  handleEditClass: (e: React.FormEvent) => void
  editYearStart: string
  setEditYearStart: (s: string) => void
  editYearStartReason: string
  setEditYearStartReason: (s: string) => void
  yearStartError: string | null
  yearStartConfirmOpen: boolean
  yearStartPreviewLoading: boolean
  yearStartPreview: YearStartPreview | null
  yearStartCheckFailed: boolean
  retryYearStartPreview: () => void
  confirmYearStartChange: () => void
  cancelYearStartChange: () => void
  showBulkYearStart: boolean
  openBulkYearStart: (idsToTick?: string[]) => void
  closeBulkYearStart: () => void
  bulkYsDate: string
  setBulkYsDate: (s: string) => void
  bulkYsIncludeDated: boolean
  setBulkYsIncludeDated: (b: boolean) => void
  bulkYsReason: string
  setBulkYsReason: (s: string) => void
  bulkYsLoading: boolean
  bulkYsError: string | null
  bulkYsOutcome: BulkYearStartOutcome | null
  bulkYsFailedCount: number
  submitBulkYearStart: () => void
  retryBulkYearStart: () => void
  confirmDeleteClass: { id: string; label: string } | null
  setConfirmDeleteClass: (v: { id: string; label: string } | null) => void
  handleDeleteClass: () => void
  deleteClassLoading: boolean
}

export default function AdminClassesPanel({
  classes, loadingClasses,
  selectedClassIds, setSelectedClassIds, classBulkDeleteLoading, handleBulkDeleteClasses,
  showAddClass, setShowAddClass, addClassErr, setAddClassErr, handleAddClass, addClassLoading,
  newClassName, setNewClassName, newSubjectInput, setNewSubjectInput, newSubjects, setNewSubjects,
  editClass, setEditClass, editClassName, setEditClassName, editSubjectInput, setEditSubjectInput,
  editSubjects, setEditSubjects, editClassErr, editClassLoading, handleEditClass,
  editYearStart, setEditYearStart, editYearStartReason, setEditYearStartReason,
  yearStartError, yearStartConfirmOpen, yearStartPreviewLoading, yearStartPreview, yearStartCheckFailed,
  retryYearStartPreview, confirmYearStartChange, cancelYearStartChange,
  showBulkYearStart, openBulkYearStart, closeBulkYearStart,
  bulkYsDate, setBulkYsDate, bulkYsIncludeDated, setBulkYsIncludeDated, bulkYsReason, setBulkYsReason,
  bulkYsLoading, bulkYsError, bulkYsOutcome, bulkYsFailedCount, submitBulkYearStart, retryBulkYearStart,
  confirmDeleteClass, setConfirmDeleteClass, handleDeleteClass, deleteClassLoading,
}: AdminClassesPanelProps) {
  const today = istToday()
  const oldYearStart = editClass ? (classStartDate(editClass) ?? "") : ""
  const missingClasses = classes.filter(c => classStartDate(c) === null)
  const selectedClasses = classes.filter(c => selectedClassIds.has(c.id))
  const bulkDateChosen = bulkYsDate !== ""
  const bulkTooMany = selectedClasses.length > 200
  // How many of the selected classes the save would really change (x) and how many keep their date (y)
  const selectedWithDate = selectedClasses.filter(c => classStartDate(c) !== null).length
  const bulkWillChange = bulkYsIncludeDated ? selectedClasses.length : selectedClasses.length - selectedWithDate
  const bulkKeepDate = bulkYsIncludeDated ? 0 : selectedWithDate
  const bulkDateIsFuture = bulkDateChosen && bulkYsDate > today
  // The edit form: a first date (no saved date yet) is confirmed only when it lies in the future
  const editFirstSet = oldYearStart === ""
  const editDateIsFuture = editYearStart !== "" && editYearStart > today

  // "Keep <old date>" puts the cursor back on the date box (the confirmation replaces the form)
  const keepPressed = useRef(false)
  function keepOldDate() {
    keepPressed.current = true
    cancelYearStartChange()
  }
  useEffect(() => {
    if (!yearStartConfirmOpen && keepPressed.current) {
      keepPressed.current = false
      document.getElementById("class-year-start")?.focus()
    }
  }, [yearStartConfirmOpen])

  // When the bulk dialog closes and its opening button is gone (e.g. the notice), land on the header buttons
  const bulkWasOpen = useRef(false)
  useEffect(() => {
    if (showBulkYearStart) { bulkWasOpen.current = true; return }
    if (!bulkWasOpen.current) return
    bulkWasOpen.current = false
    if (document.activeElement && document.activeElement !== document.body) return
    for (const id of ["classes-bulk-year-start-btn", "classes-add-btn"]) {
      const el = document.getElementById(id)
      if (el && !(el as HTMLButtonElement).disabled) { el.focus(); break }
    }
  }, [showBulkYearStart])

  return (
    <div className="w-full">
      <SectionHeader
        title="Classes"
        sub={`${classes.length} class${classes.length !== 1 ? "es" : ""} in your school`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button id="classes-bulk-year-start-btn" size="sm" variant="outline" disabled={selectedClassIds.size === 0}
              onClick={() => openBulkYearStart()} className="h-8 text-xs rounded-lg gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Set school year start
            </Button>
            <Button id="classes-add-btn" size="sm" onClick={() => { setAddClassErr(""); setShowAddClass(true) }}
              style={{ background: "var(--ts-blue)", color: "white" }} className="h-8 text-xs rounded-lg gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Class
            </Button>
          </div>
        }
      />

      {/* Classes without a start date: teachers cannot mark attendance for them yet */}
      {!loadingClasses && classes.length > 0 && missingClasses.length > 0 && (
        <div role="status" className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3 px-3 py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <p className="text-xs flex-1">{TEXT.noticeMany(missingClasses.length, classes.length)}</p>
          <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg self-start sm:self-auto"
            onClick={() => openBulkYearStart(missingClasses.map(c => c.id))}>
            Set dates
          </Button>
        </div>
      )}

      {/* Class bulk actions bar */}
      {selectedClassIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg border border-border bg-muted/60">
          <span className="text-xs font-semibold text-foreground">{selectedClassIds.size} selected</span>
          <Button size="sm" disabled={classBulkDeleteLoading}
            onClick={() => {
              if (confirm(`Delete ${selectedClassIds.size} class${selectedClassIds.size > 1 ? "es" : ""}? Students and teachers assigned will lose their class assignment. This cannot be undone.`))
                handleBulkDeleteClasses()
            }}
            className="h-7 text-xs rounded-md px-3 bg-red-500 hover:bg-red-600 text-white">
            {classBulkDeleteLoading ? <><Spinner /> Deleting…</> : <><Trash2 className="w-3 h-3 mr-1" />Delete {selectedClassIds.size}</>}
          </Button>
          <button onClick={() => setSelectedClassIds(() => new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {loadingClasses ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : classes.length === 0 ? (
        <Empty
          icon={<BookOpen className="w-6 h-6" />}
          title="No classes yet"
          body="Create classes for your school. Each class can have a teacher and students assigned to it."
          action={<Button size="sm" onClick={() => setShowAddClass(true)} style={{ background: "var(--ts-blue)", color: "white" }} className="text-xs h-8 rounded-lg gap-1">
            <Plus className="w-3.5 h-3.5" /> Add your first class
          </Button>}
        />
      ) : (
        <div className="skillio-card rounded-xl overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm border-collapse">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "180px" }} />
              <col style={{ width: "140px" }} />
              <col />
              <col style={{ width: "240px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "72px" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--muted)" }}>
                <th className="px-4 py-3">
                  <input type="checkbox"
                    aria-label="Select all classes"
                    className="rounded border-border cursor-pointer"
                    checked={selectedClassIds.size === classes.length && classes.length > 0}
                    onChange={e => setSelectedClassIds(() => e.target.checked ? new Set(classes.map(c => c.id)) : new Set())}
                  />
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Class</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Custom Label</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subjects</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Teacher</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Students</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {classes.map(cls => (
                <tr key={cls.id} className={`border-t border-border transition-colors ${selectedClassIds.has(cls.id) ? "bg-muted/60" : "hover:bg-muted/30"}`}>
                  <td className="px-4 py-3.5">
                    <input type="checkbox"
                      aria-label={`Select ${clsLabel(cls)}`}
                      className="rounded border-border cursor-pointer"
                      checked={selectedClassIds.has(cls.id)}
                      onChange={e => setSelectedClassIds(prev => {
                        const next = new Set(prev)
                        e.target.checked ? next.add(cls.id) : next.delete(cls.id)
                        return next
                      })}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-foreground break-words" title={clsLabel(cls)}>{clsLabel(cls)}</span>
                    {classStartDate(cls) !== null ? (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Year from {formatYmdForDisplay(classStartDate(cls) ?? "")}</p>
                    ) : (
                      <span className="inline-flex items-start gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-px" aria-hidden="true" />
                        {TEXT.noStartDateChip}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{cls.name ? <span className="font-medium text-foreground">{cls.name}</span> : <span className="opacity-40">—</span>}</td>
                  <td className="px-4 py-3.5">
                    {cls.subjects?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {cls.subjects.map(s => (
                          <span key={s} className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: "rgba(83,74,183,0.12)", color: "#534AB7" }}>{s}</span>
                        ))}
                      </div>
                    ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {cls.teachers?.length > 0 ? (() => {
                      const byTeacher = new Map<string, { name: string | null; subjects: string[] }>()
                      for (const t of cls.teachers) {
                        if (!byTeacher.has(t.teacher_id)) byTeacher.set(t.teacher_id, { name: t.teacher_name, subjects: [] })
                        byTeacher.get(t.teacher_id)!.subjects.push(t.subject)
                      }
                      return (
                        <div className="flex flex-col gap-1.5">
                          {Array.from(byTeacher.entries()).map(([tid, { name, subjects }]) => (
                            <div key={tid} className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <span className="font-medium text-foreground text-xs shrink-0">{name ?? "—"}</span>
                              <div className="flex flex-wrap gap-0.5">
                                {subjects.map(s => (
                                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(55,138,221,0.12)", color: "#378ADD" }}>{s}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })() : cls.teacher_name ? (
                      <span className="text-xs font-medium text-foreground">{cls.teacher_name}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60 italic">Not assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold" style={{ background: "rgba(83,74,183,0.1)", color: "#534AB7" }}>{cls.student_count}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => { setEditClass(cls); setEditClassName(cls.name ?? ""); setEditSubjects(() => cls.subjects ?? []); setEditSubjectInput(""); }}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-[#534AB7] hover:bg-muted transition-colors" title="Edit class" aria-label="Edit class"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => setConfirmDeleteClass({ id: cls.id, label: clsLabel(cls) })}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete class" aria-label="Delete class">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add class modal */}
      {showAddClass && (
        <Modal onClose={() => setShowAddClass(false)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddClass(false)} />
          <div className="relative bg-card rounded-xl w-full max-w-sm p-6 border border-border max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowAddClass(false)} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-semibold mb-4">Add Class</h3>
            <form onSubmit={handleAddClass} className="space-y-4">
              <div>
                <Label className="text-xs mb-1.5 block">Class Name</Label>
                <Input value={newClassName} onChange={e => setNewClassName(e.target.value)}
                  placeholder="e.g. 6A, Nursery, LKG, Pre-KG, 8B" className="h-9 text-sm rounded-lg" autoFocus />
                <p className="text-[10px] text-muted-foreground mt-1">This will be the display name shown everywhere in the app.</p>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Subjects <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div className="flex gap-2">
                  <Input value={newSubjectInput} onChange={e => setNewSubjectInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === "Enter" || e.key === ",") && newSubjectInput.trim()) {
                        e.preventDefault()
                        const sub = newSubjectInput.trim()
                        if (!newSubjects.some(s => s.toLowerCase() === sub.toLowerCase())) setNewSubjects(prev => [...prev, sub])
                        setNewSubjectInput("")
                      }
                    }}
                    placeholder="Type & press Enter to add" className="h-9 text-sm rounded-lg flex-1" />
                  <Button type="button" variant="outline" className="h-9 text-xs px-3 rounded-lg flex-shrink-0"
                    onClick={() => {
                      const sub = newSubjectInput.trim()
                      if (sub && !newSubjects.some(s => s.toLowerCase() === sub.toLowerCase())) setNewSubjects(prev => [...prev, sub])
                      setNewSubjectInput("")
                    }}>
                    Add
                  </Button>
                </div>
                {newSubjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {newSubjects.map(s => (
                      <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                        style={{ background: "rgba(83,74,183,0.1)", color: "#534AB7" }}>
                        {s}
                        <button type="button" onClick={() => setNewSubjects(prev => prev.filter(x => x !== s))}
                          className="ml-0.5 hover:text-red-500 transition-colors" aria-label={`Remove ${s}`}><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {addClassErr && <p className="text-xs" style={{ color: "var(--ts-red)" }}>{addClassErr}</p>}
              <Button type="submit" disabled={addClassLoading} className="w-full h-9 text-sm rounded-lg"
                style={{ background: "var(--ts-blue)", color: "white" }}>
                {addClassLoading ? <><Spinner /> Creating…</> : "Create Class"}
              </Button>
            </form>
          </div>
        </div></Modal>
      )}

      {/* Edit class modal */}
      {editClass && (
        <Modal onClose={() => !editClassLoading && setEditClass(null)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !editClassLoading && setEditClass(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-sm p-6 border border-border max-h-[90vh] overflow-y-auto">
            <button onClick={() => setEditClass(null)} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-semibold mb-1">Edit Class: {clsCompact(editClass)}</h3>
            <p className="text-xs text-muted-foreground mb-4">Update name, subjects and school year start for this class.</p>
            {yearStartConfirmOpen ? (
              <div className="space-y-4" role="group" aria-label="Confirm school year start change">
                <div className="space-y-2 text-sm text-foreground" aria-live="polite">
                  <p>{editFirstSet
                    ? TEXT.firstSetHeading(clsLabel(editClass), formatYmdForDisplay(editYearStart))
                    : TEXT.confirmHeading(clsLabel(editClass), formatYmdForDisplay(oldYearStart), formatYmdForDisplay(editYearStart))}</p>
                  {editDateIsFuture && <p>{TEXT.futureLockoutOne(formatYmdForDisplay(editYearStart))}</p>}
                  {!editFirstSet && yearStartPreviewLoading && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner /> {TEXT.checking}</p>
                  )}
                  {!editFirstSet && yearStartPreview && (
                    <>
                      {yearStartPreview.sheets_leaving > 0 && <p>{TEXT.leaving(yearStartPreview.sheets_leaving)}</p>}
                      {yearStartPreview.sheets_entering > 0 && <p>{TEXT.entering(yearStartPreview.sheets_entering)}</p>}
                      {yearStartPreview.sheets_leaving === 0 && yearStartPreview.sheets_entering === 0 && <p>{TEXT.nothingAffected}</p>}
                    </>
                  )}
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button type="button" variant="outline" disabled={editClassLoading || (!editFirstSet && (yearStartPreviewLoading || !yearStartPreview))} onClick={confirmYearStartChange}
                    className="flex-1 h-9 text-sm rounded-lg">
                    {editClassLoading ? <><Spinner /> Saving…</> : "Yes, change date"}
                  </Button>
                  <Button type="button" autoFocus disabled={editClassLoading} onClick={keepOldDate}
                    className="flex-1 h-9 text-sm rounded-lg" style={{ background: "var(--ts-blue)", color: "white" }}>
                    {editFirstSet ? "Keep" : `Keep ${formatYmdForDisplay(oldYearStart)}`}
                  </Button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleEditClass} noValidate className="space-y-4">
              <div>
                <Label className="text-xs mb-1.5 block">Custom Label</Label>
                <Input value={editClassName} onChange={e => setEditClassName(e.target.value)}
                  placeholder="e.g. Orchids, Sunrise, Explorers" className="h-9 text-sm rounded-lg" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Subjects</Label>
                <div className="flex gap-2">
                  <Input value={editSubjectInput} onChange={e => setEditSubjectInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === "Enter" || e.key === ",") && editSubjectInput.trim()) {
                        e.preventDefault()
                        const sub = editSubjectInput.trim()
                        if (!editSubjects.some(s => s.toLowerCase() === sub.toLowerCase())) setEditSubjects(prev => [...prev, sub])
                        setEditSubjectInput("")
                      }
                    }}
                    placeholder="Type & press Enter to add" className="h-9 text-sm rounded-lg flex-1" />
                  <Button type="button" variant="outline" className="h-9 text-xs px-3 rounded-lg flex-shrink-0"
                    onClick={() => {
                      const sub = editSubjectInput.trim()
                      if (sub && !editSubjects.some(s => s.toLowerCase() === sub.toLowerCase())) setEditSubjects(prev => [...prev, sub])
                      setEditSubjectInput("")
                    }}>
                    Add
                  </Button>
                </div>
                {editSubjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {editSubjects.map(s => (
                      <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                        style={{ background: "rgba(83,74,183,0.1)", color: "#534AB7" }}>
                        {s}
                        <button type="button" onClick={() => setEditSubjects(prev => prev.filter(x => x !== s))}
                          className="ml-0.5 hover:text-red-500 transition-colors" aria-label={`Remove ${s}`}><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-1.5">Teachers will pick from these subjects when being assigned to this class.</p>
              </div>
              <div>
                <Label htmlFor="class-year-start" className="text-xs mb-1.5 block">School year starts</Label>
                <Input id="class-year-start" type="date" value={editYearStart}
                  min={shiftYmd(today, -2, 0)} max={shiftYmd(today, 0, 60)}
                  onChange={e => setEditYearStart(e.target.value)}
                  aria-invalid={yearStartError ? true : undefined}
                  aria-describedby={yearStartError ? "class-year-start-help class-year-start-error" : "class-year-start-help"}
                  className="h-9 text-sm rounded-lg" />
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg"
                    onClick={() => setEditYearStart(currentSchoolYearStart(today, "04"))}>1 April</Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg"
                    onClick={() => setEditYearStart(currentSchoolYearStart(today, "06"))}>1 June</Button>
                </div>
                <p id="class-year-start-help" className="text-[10px] text-muted-foreground mt-1.5">
                  The day this class's school year begins, usually 1 April or 1 June. Attendance is counted from this date.
                </p>
                {yearStartError && (
                  <p id="class-year-start-error" role="alert" className="text-xs mt-1.5" style={{ color: "var(--ts-red)" }}>{yearStartError}</p>
                )}
                {yearStartCheckFailed && (
                  <div role="alert" className="mt-1.5 flex flex-wrap items-center gap-2">
                    <p className="text-xs" style={{ color: "var(--ts-red)" }}>{TEXT.checkFailed}</p>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={retryYearStartPreview}>Try again</Button>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="class-year-start-reason" className="text-xs mb-1.5 block">{TEXT.reasonLabel}</Label>
                <Textarea id="class-year-start-reason" value={editYearStartReason}
                  onChange={e => setEditYearStartReason(e.target.value)}
                  maxLength={100}
                  aria-describedby="class-year-start-reason-help"
                  className="text-sm rounded-lg min-h-16" />
                <div className="flex items-start justify-between gap-2 mt-1">
                  <p id="class-year-start-reason-help" className="text-[10px] text-muted-foreground">{TEXT.reasonHint}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums shrink-0">{editYearStartReason.length}/100</p>
                </div>
              </div>
              {editClassErr && <p className="text-xs" style={{ color: "var(--ts-red)" }}>{editClassErr}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditClass(null)} className="flex-1 h-9 text-sm rounded-lg">Cancel</Button>
                <Button type="submit" disabled={editClassLoading || yearStartPreviewLoading} className="flex-1 h-9 text-sm rounded-lg"
                  style={{ background: "var(--ts-blue)", color: "white" }}>
                  {editClassLoading ? <><Spinner /> Saving…</> : "Save Changes"}
                </Button>
              </div>
            </form>
            )}
          </div>
        </div></Modal>
      )}

      {/* Set school year start for many classes */}
      {showBulkYearStart && (
        <Modal onClose={closeBulkYearStart}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeBulkYearStart} />
          <div role="dialog" aria-modal="true" aria-labelledby="bulk-ys-title"
            className="relative bg-card rounded-xl w-full max-w-md p-6 border border-border max-h-[90vh] overflow-y-auto">
            <button onClick={closeBulkYearStart} disabled={bulkYsLoading} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 id="bulk-ys-title" className="text-base font-semibold mb-3 pr-6">{TEXT.bulkTitle}</h3>

            {/* The result is read out by screen readers when it appears */}
            <div role="status" aria-live="polite" className="space-y-1.5">
              {bulkYsOutcome && (
                <>
                  {bulkYsOutcome.updated > 0 && <p className="text-sm text-foreground">{TEXT.bulkUpdated(bulkYsOutcome.updated)}</p>}
                  {bulkYsOutcome.leftAsTheyWere > 0 && <p className="text-sm text-muted-foreground">{TEXT.bulkLeft(bulkYsOutcome.leftAsTheyWere)}</p>}
                  {bulkYsOutcome.notFound > 0 && <p className="text-sm text-muted-foreground">{TEXT.bulkNotFound(bulkYsOutcome.notFound)}</p>}
                  {bulkYsOutcome.failed > 0 && <p className="text-sm" style={{ color: "var(--ts-red)" }}>{TEXT.bulkFailed(bulkYsOutcome.failed)}</p>}
                </>
              )}
            </div>

            {bulkYsOutcome ? (
              <div className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
                <Button type="button" variant="outline" onClick={closeBulkYearStart} disabled={bulkYsLoading} className="flex-1 h-9 text-sm rounded-lg">
                  {bulkYsFailedCount > 0 ? "Close" : "Done"}
                </Button>
                {bulkYsFailedCount > 0 && (
                  <Button type="button" onClick={retryBulkYearStart} disabled={bulkYsLoading} className="flex-1 h-9 text-sm rounded-lg"
                    style={{ background: "var(--ts-blue)", color: "white" }}>
                    {bulkYsLoading ? <><Spinner /> Saving…</> : "Retry"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <p className="text-xs font-semibold text-foreground">
                      {selectedClasses.length} {selectedClasses.length === 1 ? "class" : "classes"} selected
                    </p>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg"
                      disabled={bulkYsLoading || missingClasses.length === 0}
                      onClick={() => setSelectedClassIds(() => new Set(missingClasses.map(c => c.id)))}>
                      Select classes with no date
                    </Button>
                  </div>
                  {selectedClasses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No classes selected. Tick classes in the table, or use "Select classes with no date".</p>
                  ) : (
                    <ul className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                      {selectedClasses.map(c => (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 px-3 py-1.5 text-xs">
                          <span className="font-medium text-foreground break-words min-w-0">{clsLabel(c)}</span>
                          <span className="text-muted-foreground">
                            {classStartDate(c) !== null ? `Year from ${formatYmdForDisplay(classStartDate(c) ?? "")}` : "No date yet"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {bulkTooMany && (
                    <p role="alert" className="text-xs mt-1.5" style={{ color: "var(--ts-red)" }}>
                      You can set at most 200 classes at a time. Please untick some classes.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="bulk-ys-date" className="text-xs mb-1.5 block">School year starts</Label>
                  <Input id="bulk-ys-date" type="date" value={bulkYsDate}
                    min={shiftYmd(today, -2, 0)} max={shiftYmd(today, 0, 60)}
                    onChange={e => setBulkYsDate(e.target.value)}
                    disabled={bulkYsLoading}
                    aria-describedby={bulkYsError ? "bulk-ys-date-help bulk-ys-error" : "bulk-ys-date-help"}
                    className="h-9 text-sm rounded-lg" />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg" disabled={bulkYsLoading}
                      onClick={() => setBulkYsDate(currentSchoolYearStart(today, "04"))}>1 April</Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg" disabled={bulkYsLoading}
                      onClick={() => setBulkYsDate(currentSchoolYearStart(today, "06"))}>1 June</Button>
                  </div>
                  <p id="bulk-ys-date-help" className="text-[10px] text-muted-foreground mt-1.5">
                    The day these classes' school year begins, usually 1 April or 1 June. Attendance is counted from this date.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-border" checked={bulkYsIncludeDated} disabled={bulkYsLoading}
                    onChange={e => setBulkYsIncludeDated(e.target.checked)} />
                  Also change classes that already have a date
                </label>
                <div>
                  <Label htmlFor="bulk-ys-reason" className="text-xs mb-1.5 block">{TEXT.reasonLabel}</Label>
                  <Textarea id="bulk-ys-reason" value={bulkYsReason} onChange={e => setBulkYsReason(e.target.value)}
                    maxLength={100} disabled={bulkYsLoading} aria-describedby="bulk-ys-reason-help"
                    className="text-sm rounded-lg min-h-16" />
                  <div className="flex items-start justify-between gap-2 mt-1">
                    <p id="bulk-ys-reason-help" className="text-[10px] text-muted-foreground">{TEXT.reasonHint}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums shrink-0">{bulkYsReason.length}/100</p>
                  </div>
                </div>
                {selectedClasses.length > 0 && !bulkYsIncludeDated && (
                  <p className="text-xs text-muted-foreground">{TEXT.bulkSplit(bulkWillChange, bulkKeepDate)}</p>
                )}
                {selectedClasses.length > 0 && bulkWillChange === 0 && (
                  <p className="text-xs text-foreground">{TEXT.bulkNothingToChange}</p>
                )}
                {bulkDateChosen && bulkWillChange > 0 && (
                  <div className="space-y-1.5 text-sm text-foreground">
                    <p>{TEXT.bulkConfirm(formatYmdForDisplay(bulkYsDate), bulkWillChange, bulkDateIsFuture, bulkYsIncludeDated)}</p>
                    {bulkDateIsFuture && <p>{bulkWillChange === 1 ? TEXT.futureLockoutOne(formatYmdForDisplay(bulkYsDate)) : TEXT.futureLockoutMany(formatYmdForDisplay(bulkYsDate))}</p>}
                  </div>
                )}
                {bulkYsError && (
                  <p id="bulk-ys-error" role="alert" className="text-xs" style={{ color: "var(--ts-red)" }}>{bulkYsError}</p>
                )}
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button type="button" variant="outline" onClick={closeBulkYearStart} disabled={bulkYsLoading} className="flex-1 h-9 text-sm rounded-lg">Cancel</Button>
                  <Button type="button" onClick={submitBulkYearStart}
                    disabled={bulkYsLoading || !bulkDateChosen || selectedClasses.length === 0 || bulkWillChange === 0 || bulkTooMany}
                    className="flex-1 h-9 text-sm rounded-lg" style={{ background: "var(--ts-blue)", color: "white" }}>
                    {bulkYsLoading ? <><Spinner /> Saving…</> : "Set start date"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div></Modal>
      )}

      {/* Confirm delete class */}
      {confirmDeleteClass && (
        <Modal onClose={() => !deleteClassLoading && setConfirmDeleteClass(null)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deleteClassLoading && setConfirmDeleteClass(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-xs p-6 border border-border">
            <div className="flex items-center gap-2 text-red-500 mb-3">
              <h3 className="text-sm font-semibold">Delete {confirmDeleteClass.label}?</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              This will permanently delete the class. Students and teachers assigned to this class will lose their class assignment. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteClass(null)} className="flex-1 h-8 text-xs rounded-lg">Cancel</Button>
              <Button onClick={handleDeleteClass} disabled={deleteClassLoading} className="flex-1 h-8 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white">
                {deleteClassLoading ? <Spinner /> : "Delete"}
              </Button>
            </div>
          </div>
        </div></Modal>
      )}
    </div>
  )
}
