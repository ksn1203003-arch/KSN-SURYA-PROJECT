import { useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { SkeletonList } from "@/components/SkeletonCard"
import {
  Plus, Upload, Search, Trash2, X, ChevronDown, ChevronUp,
  GraduationCap, CheckCircle, AlertCircle, Star, CalendarCheck, Activity,
  BookMarked, FileQuestion, Loader2, Users,
} from "lucide-react"
import {
  Modal, Spinner, SectionHeader, Empty, CopyBtn, ListPager, usePagedRows,
  downloadStudentCredential, downloadBulkStudentCredentials,
} from "./adminComponents"
import { clsLabel } from "./adminShared"
import { formatYmdForDisplay } from "./adminTypes"
import type {
  ClassRow, StudentRow, StudentDetail, BulkResult,
  AttPeriod, StudentAttDetail, ClassHistoryLine,
} from "./adminTypes"
import { parseStudentFile, addParent, getParents, removeUser } from "@/lib/userApi"
import { UserPhoto } from "@/components/UserPhoto"
import { attendanceBasisLabel, formatCountedDate, istTodayYmd } from "@/lib/attendanceBasis"

// Sentences for the attendance figure of the open student row, kept in one place so Hindi can be added later
const ATTENDANCE_TEXT = {
  noData: "No data",
  noAttendanceSince: (date: string) => `No attendance recorded since ${date}`,
}

const END_REASON_LABEL: Record<string, string> = {
  promoted: "Moved to next class",
  stayed_back: "Stayed in same class",
  passed_out: "Passed out",
  transferred: "Moved class",
  correction: "Corrected",
}

// The student's classes over time, oldest first — shown in the expanded student row (admin screen only)
function ClassHistorySection({ history, onRetry }: { history: ClassHistoryLine[] | undefined; onRetry: () => void }) {
  return (
    <section aria-label="Class history" className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
        <GraduationCap className="w-3 h-3" />
        <h4 className="text-[11px] uppercase tracking-wider font-semibold">Class history</h4>
      </div>
      {history === undefined ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">Class history could not be loaded.</p>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={onRetry}>Try again</Button>
        </div>
      ) : history.length === 0 ? (
        <p className="text-xs text-muted-foreground">No class history yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {history.map((line, i) => {
            const badge = line.is_current ? "Current" : (line.end_reason ? (END_REASON_LABEL[line.end_reason] ?? "Class changed") : undefined)
            return (
              <li key={`${line.from_date}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-semibold text-foreground">{line.class_label ?? "Unknown class"}</span>
                {line.class_deleted && <span className="text-muted-foreground">(class removed)</span>}
                <span className="text-muted-foreground">
                  {line.is_current || !line.to_date
                    ? `Since ${formatYmdForDisplay(line.from_date)}`
                    : `${formatYmdForDisplay(line.from_date)} – ${formatYmdForDisplay(line.to_date)}`}
                </span>
                {badge && (
                  <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${line.is_current ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {badge}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

interface ParentRecord { id: string; name: string; email: string; is_active: boolean; created_at: string | null }

export function ParentsSection({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [parents, setParents] = useState<ParentRecord[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", email: "" })
  const [addErr, setAddErr] = useState("")
  const [addLoading, setAddLoading] = useState(false)
  const [addSuccess, setAddSuccess] = useState("")
  const [removeConfirm, setRemoveConfirm] = useState<ParentRecord | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const loadParents = useCallback(async () => {
    setLoading(true)
    const res = await getParents(studentId)
    setLoading(false)
    if ("error" in res) return
    setParents(res.parents)
  }, [studentId])

  const handleToggle = async () => {
    if (!expanded && parents === null) await loadParents()
    setExpanded(e => !e)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) { setAddErr("Name and email are required."); return }
    setAddErr(""); setAddLoading(true)
    const res = await addParent({ name: form.name.trim(), email: form.email.trim(), student_id: studentId })
    setAddLoading(false)
    if ("error" in res && res.error) { setAddErr(res.error); return }
    setAddSuccess(res.warning ?? "Parent account created. Login details sent by email.")
    setForm({ name: "", email: "" })
    setShowAdd(false)
    await loadParents()
  }

  const handleRemove = async () => {
    if (!removeConfirm) return
    setRemoveLoading(true)
    await removeUser(removeConfirm.id)
    setRemoveLoading(false)
    setRemoveConfirm(null)
    await loadParents()
  }

  const parentCount = parents?.length ?? 0

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden mt-3">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card w-full text-left hover:bg-muted/30 transition-colors"
      >
        <Users className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex-1">
          Parents / Guardians
        </span>
        {parents !== null && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: parentCount >= 2 ? "rgba(239,159,39,0.15)" : "rgba(83,74,183,0.1)", color: parentCount >= 2 ? "#EF9F27" : "#534AB7" }}>
            {parentCount}/2
          </span>
        )}
        {loading ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /> : expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-2">
          {addSuccess && (
            <div className="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" /> {addSuccess}
            </div>
          )}
          {parents === null || loading ? (
            <p className="text-xs text-muted-foreground py-2">Loading…</p>
          ) : parents.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-2 text-center">No parents linked yet — add one below.</p>
          ) : (
            <div className="space-y-1.5">
              {parents.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {p.is_active ? "Active" : "Inactive"}
                  </span>
                  <button onClick={() => setRemoveConfirm(p)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Remove parent" aria-label="Remove parent">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!showAdd && parentCount < 2 && (
            <Button size="sm" variant="outline" onClick={() => { setShowAdd(true); setAddSuccess("") }}
              className="h-7 text-xs rounded-lg gap-1.5 w-full mt-1">
              <Plus className="w-3 h-3" /> Add Parent
            </Button>
          )}
          {parentCount >= 2 && !showAdd && (
            <p className="text-[10px] text-muted-foreground/60 text-center pt-1">Maximum 2 parents per student</p>
          )}

          {showAdd && (
            <form onSubmit={handleAdd} className="space-y-2 border border-border rounded-lg p-3 bg-card mt-1">
              <p className="text-[11px] font-semibold text-foreground">Link parent for {studentName}</p>
              {addErr && <p className="text-[11px] text-red-500">{addErr}</p>}
              <div>
                <Label className="text-[10px] mb-1 block">Parent Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Parent's full name" className="h-8 text-xs rounded-md" required />
              </div>
              <div>
                <Label className="text-[10px] mb-1 block">Email Address *</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="parent@example.com" className="h-8 text-xs rounded-md" required />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowAdd(false); setAddErr("") }}
                  className="flex-1 h-7 text-xs rounded-md">Cancel</Button>
                <Button type="submit" size="sm" disabled={addLoading}
                  className="flex-1 h-7 text-xs rounded-md" style={{ background: "#534AB7", color: "white" }}>
                  {addLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send Invite"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {removeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRemoveConfirm(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-xs p-5 border border-border">
            <h3 className="text-sm font-semibold mb-2">Remove parent?</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Remove <strong>{removeConfirm.name}</strong> ({removeConfirm.email}) as a parent of {studentName}? Their account will be deactivated.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setRemoveConfirm(null)} className="flex-1 h-8 text-xs rounded-lg">Cancel</Button>
              <Button size="sm" disabled={removeLoading} onClick={handleRemove}
                className="flex-1 h-8 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white">
                {removeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface AdminStudentsPanelProps {
  students: StudentRow[]
  filteredStudents: StudentRow[]
  loadingStudents: boolean
  classes: ClassRow[]
  searchStudents: string
  setSearchStudents: (s: string) => void
  filterClass: string
  setFilterClass: (s: string) => void
  selectedIds: Set<string>
  setSelectedIds: (fn: (prev: Set<string>) => Set<string>) => void
  showBulkActions: boolean
  setShowBulkActions: (fn: (prev: boolean) => boolean) => void
  bulkActionClass: string
  setBulkActionClass: (s: string) => void
  bulkActionGender: string
  setBulkActionGender: (s: string) => void
  bulkActionLoading: boolean
  handleBulkAction: (action: string) => void
  expandedStudentId: string | null
  studentDetailMap: Record<string, StudentDetail>
  studentDetailLoading: string | null
  handleToggleStudent: (id: string) => void
  retryStudentDetail: (id: string) => void
  studentAttPeriod: AttPeriod
  setStudentAttPeriod: (p: AttPeriod) => void
  studentAttCache: Record<string, StudentAttDetail>
  studentAttLoading: boolean
  studentAttCustomFrom: string
  setStudentAttCustomFrom: (s: string) => void
  studentAttCustomTo: string
  setStudentAttCustomTo: (s: string) => void
  loadStudentAtt: (id: string, period: AttPeriod, from?: string, to?: string) => Promise<void>
  showStudentModal: boolean
  setShowStudentModal: (b: boolean) => void
  studentForm: { name: string; email: string; phone: string; roll_no: string; class_id: string; gender: string }
  setStudentForm: (fn: (prev: AdminStudentsPanelProps["studentForm"]) => AdminStudentsPanelProps["studentForm"]) => void
  studentErr: string
  studentLoading: boolean
  studentResult: { name: string; username: string; temp_password: string } | null
  setStudentResult: (r: { name: string; username: string; temp_password: string } | null) => void
  handleAddStudent: (e: React.FormEvent) => void
  showBulk: boolean
  setShowBulk: (b: boolean) => void
  bulkRows: Array<{ name: string; roll_no?: string; email?: string; phone?: string }>
  setBulkRows: (r: Array<{ name: string; roll_no?: string; email?: string; phone?: string }>) => void
  bulkClassId: string
  setBulkClassId: (s: string) => void
  bulkResults: BulkResult[]
  setBulkResults: (r: BulkResult[]) => void
  bulkLoading: boolean
  handleBulkImport: () => void
  editStudent: StudentRow | null
  setEditStudent: (s: StudentRow | null) => void
  editForm: { name: string; email: string; phone: string; gender: string; class_id: string }
  setEditForm: (fn: (prev: AdminStudentsPanelProps["editForm"]) => AdminStudentsPanelProps["editForm"]) => void
  editErr: string
  editLoading: boolean
  handleEditStudent: (e: React.FormEvent) => void
  confirmRemove: { id: string; name: string } | null
  setConfirmRemove: (v: { id: string; name: string } | null) => void
  handleRemove: () => void
  removeLoading: boolean
}

export default function AdminStudentsPanel({
  students, filteredStudents, loadingStudents, classes,
  searchStudents, setSearchStudents, filterClass, setFilterClass,
  selectedIds, setSelectedIds, showBulkActions, setShowBulkActions,
  bulkActionClass, setBulkActionClass, bulkActionGender, setBulkActionGender,
  bulkActionLoading, handleBulkAction,
  expandedStudentId, studentDetailMap, studentDetailLoading, handleToggleStudent, retryStudentDetail,
  studentAttPeriod, setStudentAttPeriod, studentAttCache, studentAttLoading,
  studentAttCustomFrom, setStudentAttCustomFrom, studentAttCustomTo, setStudentAttCustomTo, loadStudentAtt,
  showStudentModal, setShowStudentModal, studentForm, setStudentForm,
  studentErr, studentLoading, studentResult, setStudentResult, handleAddStudent,
  showBulk, setShowBulk, bulkRows, setBulkRows, bulkClassId, setBulkClassId,
  bulkResults, setBulkResults, bulkLoading, handleBulkImport,
  editStudent, setEditStudent, editForm, setEditForm, editErr, editLoading, handleEditStudent,
  confirmRemove, setConfirmRemove, handleRemove, removeLoading,
}: AdminStudentsPanelProps) {
  const studentPager = usePagedRows(filteredStudents, `${searchStudents}|${filterClass}`)
  const pageIds = studentPager.pageRows.map(s => s.id)
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id))
  const selectedCount = filteredStudents.filter(s => selectedIds.has(s.id)).length
  const selectedOffPage = selectedCount - pageIds.filter(id => selectedIds.has(id)).length
  const csvRef = useRef<HTMLInputElement>(null)

  return (
    <div className="w-full">
      <SectionHeader
        title="Students"
        sub={`${students.length} student${students.length !== 1 ? "s" : ""} total`}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setBulkResults([]); setBulkRows([]); setBulkClassId(""); setShowBulk(true) }}
              className="h-8 text-xs rounded-lg gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </Button>
            <Button size="sm" onClick={() => { setStudentResult(null); setStudentForm(() => ({ name:"",email:"",phone:"",roll_no:"",class_id:"",gender:"" })); setShowStudentModal(true) }}
              style={{ background: "var(--ts-purple)", color: "white" }} className="h-8 text-xs rounded-lg gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Student
            </Button>
          </div>
        }
      />

      {/* Search + filter bar */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={searchStudents} onChange={e => setSearchStudents(e.target.value)}
            placeholder="Search students…" className="pl-8 h-8 text-sm rounded-lg" />
        </div>
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
          className="h-8 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none min-w-[130px]">
          <option value="">All classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{clsLabel(c)}</option>)}
        </select>
      </div>

      {/* Bulk actions bar */}
      {filteredStudents.some(s => selectedIds.has(s.id)) && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-border bg-muted/60 flex-wrap">
          <span className="text-xs font-semibold text-foreground mr-1">
            {selectedCount} selected{selectedOffPage > 0 ? ` (${selectedOffPage} on other pages)` : ""}
          </span>
          <button onClick={() => setShowBulkActions(s => !s)}
            className="text-xs text-ts-blue font-medium hover:underline">{showBulkActions ? "Hide actions" : "Show actions"}</button>
          {showBulkActions && (
            <>
              <div className="flex items-center gap-1 ml-2">
                <select value={bulkActionClass} onChange={e => setBulkActionClass(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none">
                  <option value="">Move to class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{clsLabel(c)}</option>)}
                </select>
                <Button size="sm" disabled={!bulkActionClass || bulkActionLoading}
                  onClick={() => handleBulkAction("class")}
                  className="h-7 text-xs rounded-md px-2" style={{ background: "var(--ts-blue)", color: "white" }}>
                  {bulkActionLoading ? "…" : "Apply"}
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <select value={bulkActionGender} onChange={e => setBulkActionGender(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none">
                  <option value="">Set gender…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <Button size="sm" disabled={!bulkActionGender || bulkActionLoading}
                  onClick={() => handleBulkAction("gender")}
                  className="h-7 text-xs rounded-md px-2" style={{ background: "var(--ts-green)", color: "white" }}>
                  {bulkActionLoading ? "…" : "Apply"}
                </Button>
              </div>
              <Button size="sm" disabled={bulkActionLoading}
                onClick={() => {
                  const offPage = selectedOffPage > 0 ? `, including ${selectedOffPage} not on this page` : ""
                  if (confirm(`Delete ${selectedCount} student(s)${offPage}? This cannot be undone.`)) handleBulkAction("delete")
                }}
                className="h-7 text-xs rounded-md px-2 bg-red-500 hover:bg-red-600 text-white ml-auto">
                {bulkActionLoading ? "…" : `Delete ${selectedCount}`}
              </Button>
            </>
          )}
          <button onClick={() => setSelectedIds(() => new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}
      {pageAllSelected && selectedCount < filteredStudents.length && (
        <p role="status" className="mb-3 px-3 py-2 rounded-lg bg-muted/60 text-xs text-foreground">
          All {pageIds.length} students on this page are selected.{" "}
          <button className="font-semibold text-ts-blue hover:underline"
            onClick={() => setSelectedIds(() => new Set(filteredStudents.map(s => s.id)))}>
            Select all {filteredStudents.length} matching students
          </button>
        </p>
      )}

      {/* Summary stats bar */}
      {!loadingStudents && students.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total", value: students.length, color: "#534AB7", icon: <GraduationCap className="w-3.5 h-3.5" /> },
            { label: "Active", value: students.filter(s => s.is_active).length, color: "#639922", icon: <CheckCircle className="w-3.5 h-3.5" /> },
            { label: "Unassigned", value: students.filter(s => !s.class_id).length, color: "#f59e0b", icon: <AlertCircle className="w-3.5 h-3.5" /> },
            { label: "Avg Points", value: students.length > 0 ? Math.round(students.reduce((s, st) => s + (st.points ?? 0), 0) / students.length) : 0, color: "#f59e0b", icon: <Star className="w-3.5 h-3.5" /> },
          ].map(s => (
            <div key={s.label} className="skillio-card rounded-lg px-3 py-2 flex items-center gap-2">
              <span style={{ color: s.color }}>{s.icon}</span>
              <div>
                <p className="text-base font-bold text-foreground leading-none">{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {loadingStudents ? (
        <SkeletonList count={5} lines={2} showAvatar />
      ) : filteredStudents.length === 0 ? (
        <Empty
          icon={<GraduationCap className="w-6 h-6" />}
          title="No students yet"
          body="Add students one by one or bulk-import from a CSV file. They'll receive login credentials."
          action={<Button size="sm" onClick={() => setShowStudentModal(true)} style={{ background: "var(--ts-purple)", color: "white" }} className="text-xs h-8 rounded-lg gap-1">
            <Plus className="w-3.5 h-3.5" /> Add first student
          </Button>}
        />
      ) : (
        <>
        <div id="students-table" tabIndex={-1} aria-label="Students list" className="skillio-card rounded-xl overflow-x-auto scroll-mt-4 focus:outline-none">
          <table className="w-full text-sm border-collapse">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "200px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "110px" }} />
              <col />
              <col style={{ width: "100px" }} />
              <col style={{ width: "75px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--muted)" }}>
                <th className="px-4 py-3">
                  <input type="checkbox" aria-label="Select all students on this page"
                    checked={pageAllSelected}
                    onChange={e => setSelectedIds(prev => {
                      const next = new Set(prev)
                      pageIds.forEach(id => { if (e.target.checked) next.add(id); else next.delete(id) })
                      return next
                    })}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-purple-600"
                  />
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Class</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Username</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gender</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {studentPager.pageRows.map(s => {
                const checked = selectedIds.has(s.id)
                const initials = s.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
                const hasEmail = s.email && !s.email.includes(".internal.teachscript")
                const isExpanded = expandedStudentId === s.id
                const detail = studentDetailMap[s.id]
                const isLoadingDetail = studentDetailLoading === s.id
                // Which class and date the attendance figure was counted from (nothing is said by an older answer without the field)
                const countedFrom = detail?.counted_from
                const attendanceNoDataText = countedFrom ? ATTENDANCE_TEXT.noAttendanceSince(formatCountedDate(countedFrom)) : ATTENDANCE_TEXT.noData
                const attendanceBasisLine = detail && countedFrom !== undefined
                  ? attendanceBasisLabel({ countedFrom, className: detail.counted_class_label, todayYmd: istTodayYmd() })
                  : ""
                const joinedDate = s.created_at ? new Date(s.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : null
                return (
                  <>
                    <tr key={s.id} onClick={() => setSelectedIds(prev => { const next = new Set(prev); checked ? next.delete(s.id) : next.add(s.id); return next })}
                      className={`border-t border-border transition-colors cursor-pointer select-none ${checked ? "bg-purple-50/60 dark:bg-purple-900/10" : isExpanded ? "bg-muted/40" : "hover:bg-muted/30"}`}>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={checked} aria-label={`Select ${s.name}`}
                          onChange={e => setSelectedIds(prev => {
                            const next = new Set(prev)
                            e.target.checked ? next.add(s.id) : next.delete(s.id)
                            return next
                          })}
                          className="w-3.5 h-3.5 rounded cursor-pointer accent-purple-600"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <UserPhoto path={s.photo_url}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-border"
                            fallback={
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                style={{ background: "linear-gradient(135deg,#534AB7,#9D59C7)" }}>
                                {initials}
                              </div>
                            } />
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-sm truncate">{s.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {joinedDate && <span className="text-[10px] text-muted-foreground">Joined {joinedDate}</span>}
                              {s.points > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "#f59e0b" }}>
                                  <Star className="w-2.5 h-2.5" />{s.points.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {s.class_label ? (
                          <span className="inline-flex items-center whitespace-nowrap text-[11px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: "rgba(55,138,221,0.1)", color: "#378ADD" }}>
                            {s.class_label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{s.username ?? <span className="opacity-40">—</span>}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">{hasEmail ? s.email : <span className="opacity-40">—</span>}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">{s.phone ?? <span className="opacity-40">—</span>}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground capitalize">{s.gender ?? <span className="opacity-40">—</span>}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${s.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-green-500" : "bg-muted-foreground/50"}`} />
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => { setEditStudent(s); setEditForm(() => ({ name: s.name, email: hasEmail ? s.email : "", phone: s.phone ?? "", gender: s.gender ?? "", class_id: s.class_id ?? "" })); }}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-ts-purple hover:bg-muted transition-colors" title="Edit student" aria-label="Edit student"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setConfirmRemove({ id: s.id, name: s.name })}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remove student" aria-label="Remove student">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleToggleStudent(s.id)} title="View details" aria-label="View student details"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-[#534AB7] hover:bg-muted transition-colors">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${s.id}-detail`} className="border-t border-border bg-muted/20">
                        <td />
                        <td colSpan={8} className="px-4 py-4">
                          {isLoadingDetail ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading student details…
                            </div>
                          ) : detail ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-lg border border-border bg-card px-3 py-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <CalendarCheck className="w-3 h-3" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold">Attendance</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {detail.attendance_rate !== null ? `${detail.attendance_rate}%` : attendanceNoDataText}
                                  </p>
                                  {detail.attendance_breakdown.total > 0 && (
                                    <p className="text-[10px] text-muted-foreground">
                                      P:{detail.attendance_breakdown.present} L:{detail.attendance_breakdown.late} A:{detail.attendance_breakdown.absent}
                                    </p>
                                  )}
                                  {attendanceBasisLine && <p className="text-[10px] text-muted-foreground">{attendanceBasisLine}</p>}
                                </div>
                                <div className="rounded-lg border border-border bg-card px-3 py-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <Activity className="w-3 h-3" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold">Last Active</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {detail.last_active ?? "Never"}
                                  </p>
                                  {detail.minutes_active_last_day > 0 && (
                                    <p className="text-[10px] text-muted-foreground">{detail.minutes_active_last_day} min last session</p>
                                  )}
                                </div>
                                <div className="rounded-lg border border-border bg-card px-3 py-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <BookMarked className="w-3 h-3" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold">Learning</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">{detail.modules_completed} modules completed</p>
                                  <p className="text-[10px] text-muted-foreground">{detail.certificates_count} certificate{detail.certificates_count !== 1 ? "s" : ""} issued</p>
                                </div>
                                <div className="rounded-lg border border-border bg-card px-3 py-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <FileQuestion className="w-3 h-3" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold">Quizzes</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {detail.quizzes_attempted > 0 ? `${detail.quiz_avg_score ?? 0}% avg` : "Not attempted"}
                                  </p>
                                  {detail.quizzes_attempted > 0 && (
                                    <p className="text-[10px] text-muted-foreground">{detail.quizzes_attempted} quiz{detail.quizzes_attempted !== 1 ? "zes" : ""} attempted</p>
                                  )}
                                </div>
                              </div>
                              <ClassHistorySection history={detail.class_history} onRetry={() => retryStudentDetail(s.id)} />
                              {/* Attendance panel */}
                              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
                                  <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Class Attendance</span>
                                </div>
                                <div className="px-4 pt-3 pb-1">
                                  <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                                    {(["today", "week", "month", "year", "custom"] as const).map(p => (
                                      <button key={p}
                                        onClick={() => { setStudentAttPeriod(p); if (p !== "custom") void loadStudentAtt(s.id, p) }}
                                        className={`text-[10px] px-2.5 py-1 rounded-md font-semibold capitalize transition-all ${studentAttPeriod === p ? "bg-white dark:bg-neutral-800 text-[#534AB7] shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                                      >{p}</button>
                                    ))}
                                  </div>
                                </div>
                                {studentAttPeriod === "custom" && (
                                  <div className="px-4 pb-3 space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <p className="text-[10px] text-muted-foreground mb-1 font-medium">From</p>
                                        <DatePicker value={studentAttCustomFrom} onChange={setStudentAttCustomFrom} placeholder="Start date" max={studentAttCustomTo || undefined} />
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground mb-1 font-medium">To</p>
                                        <DatePicker value={studentAttCustomTo} onChange={setStudentAttCustomTo} placeholder="End date" min={studentAttCustomFrom || undefined} />
                                      </div>
                                    </div>
                                    <button disabled={!studentAttCustomFrom || !studentAttCustomTo}
                                      onClick={() => void loadStudentAtt(s.id, "custom", studentAttCustomFrom, studentAttCustomTo)}
                                      className="w-full text-xs py-1.5 rounded-lg bg-[#534AB7] text-white disabled:opacity-40 hover:bg-[#4338a3] transition-colors font-semibold">
                                      Load Attendance
                                    </button>
                                  </div>
                                )}
                                <div className="px-4 pb-4 pt-2">
                                  {(() => {
                                    const attKey = studentAttPeriod === "custom"
                                      ? `${s.id}_custom_${studentAttCustomFrom}_${studentAttCustomTo}`
                                      : `${s.id}_${studentAttPeriod}`
                                    const attData = studentAttCache[attKey]
                                    if (studentAttLoading) return (
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                                      </div>
                                    )
                                    if (!attData) return (
                                      <p className="text-xs text-muted-foreground/40 py-3 text-center">Select a period to view attendance</p>
                                    )
                                    const { summary, records } = attData
                                    const total = summary.total
                                    const pRate = summary.rate ?? 0
                                    const presentPct = total > 0 ? (summary.present / total) * 100 : 0
                                    const latePct    = total > 0 ? (summary.late    / total) * 100 : 0
                                    const absentPct  = total > 0 ? (summary.absent  / total) * 100 : 0
                                    const rateColor  = pRate >= 75 ? "#22c55e" : pRate >= 50 ? "#f59e0b" : "#ef4444"
                                    return (
                                      <div className="space-y-3">
                                        {total > 0 ? (
                                          <div className="flex items-center gap-4">
                                            <div className="text-center shrink-0 w-16">
                                              <p className="text-2xl font-bold leading-none" style={{ color: rateColor }}>{pRate}%</p>
                                              <p className="text-[9px] text-muted-foreground mt-1 uppercase tracking-wide">attendance</p>
                                            </div>
                                            <div className="flex-1 space-y-2">
                                              <div className="flex rounded-full overflow-hidden h-2 bg-muted">
                                                {presentPct > 0 && <div style={{ width: `${presentPct}%`, background: "#22c55e" }} />}
                                                {latePct    > 0 && <div style={{ width: `${latePct}%`,    background: "#f59e0b" }} />}
                                                {absentPct  > 0 && <div style={{ width: `${absentPct}%`,  background: "#ef4444" }} />}
                                              </div>
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />{summary.present} Present
                                                </span>
                                                {summary.late > 0 && (
                                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />{summary.late} Late
                                                  </span>
                                                )}
                                                {summary.absent > 0 && (
                                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{summary.absent} Absent
                                                  </span>
                                                )}
                                                <span className="text-[10px] text-muted-foreground ml-auto">{total} periods</span>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-xs text-muted-foreground/40 text-center py-2">No attendance records in this period</p>
                                        )}
                                        {records.length > 0 && (
                                          <div className="rounded-lg border border-border overflow-hidden">
                                            <div className="max-h-44 overflow-y-auto divide-y divide-border">
                                              {records.slice(0, 15).map((rec, i) => (
                                                <div key={i} className={`flex items-center gap-3 px-3 py-2 text-xs ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                                                  <span className="shrink-0 font-semibold text-foreground w-12">
                                                    {new Date(rec.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                                  </span>
                                                  <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                                                    {rec.period}
                                                  </span>
                                                  <span className="flex-1 text-muted-foreground truncate">{rec.subject}</span>
                                                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${rec.status === "present" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : rec.status === "late" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>
                                                    {rec.status}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                            {records.length > 15 && (
                                              <div className="px-3 py-1.5 bg-muted/30 border-t border-border text-center">
                                                <p className="text-[10px] text-muted-foreground">+{records.length - 15} more records</p>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs text-muted-foreground/60">Could not load details.</p>
                              <Button type="button" variant="outline" size="sm" className="h-7 text-xs rounded-lg" onClick={() => retryStudentDetail(s.id)}>Try again</Button>
                            </div>
                          )}
                          <ParentsSection studentId={s.id} studentName={s.name} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
        <ListPager {...studentPager} noun="students" anchorId="students-table" />
        </>
      )}

      {/* Add student modal */}
      {showStudentModal && (
        <Modal onClose={() => setShowStudentModal(false)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!studentResult) setShowStudentModal(false) }} />
          <div className="relative bg-card rounded-xl w-full max-w-sm p-6 border border-border max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowStudentModal(false)} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-semibold mb-4">Add Student</h3>
            {studentResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" /> Student added successfully!
                </div>
                <div className="bg-muted rounded-lg p-3 space-y-2 text-sm font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Student Name</span>
                    <span className="text-foreground font-semibold">{studentResult.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Username</span>
                    <span className="text-foreground">{studentResult.username}<CopyBtn text={studentResult.username} /></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Temp Password</span>
                    <span className="text-foreground font-bold">{studentResult.temp_password}<CopyBtn text={studentResult.temp_password} /></span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Share these credentials with the student. They should change their password after first login.</p>
                <Button
                  onClick={() => downloadStudentCredential(studentResult.name, studentResult.username, studentResult.temp_password)}
                  variant="outline" className="w-full h-9 text-sm rounded-lg gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download as Excel
                </Button>
                <div className="flex gap-2">
                  <Button onClick={() => { setStudentResult(null); setStudentForm(() => ({ name: "", email: "", phone: "", roll_no: "", class_id: "", gender: "" })) }} variant="outline" className="flex-1 h-9 text-sm rounded-lg">Add Another</Button>
                  <Button onClick={() => setShowStudentModal(false)} className="flex-1 h-9 text-sm rounded-lg" style={{ background: "var(--ts-purple)", color: "white" }}>Done</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddStudent} className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Full Name *</Label>
                  <Input value={studentForm.name} onChange={e => setStudentForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Student's full name" className="h-9 text-sm rounded-lg" required />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Class *</Label>
                  <select value={studentForm.class_id} onChange={e => setStudentForm(f => ({ ...f, class_id: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" required>
                    <option value="">Select class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{clsLabel(c)}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Roll Number *</Label>
                  <Input value={studentForm.roll_no} onChange={e => setStudentForm(f => ({ ...f, roll_no: e.target.value }))}
                    placeholder="e.g. 6A01" className="h-9 text-sm rounded-lg" required />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Gender</Label>
                  <select value={studentForm.gender} onChange={e => setStudentForm(f => ({ ...f, gender: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Email (optional)</Label>
                  <Input type="email" value={studentForm.email} onChange={e => setStudentForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="student@email.com" className="h-9 text-sm rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Phone (optional)</Label>
                  <Input value={studentForm.phone} onChange={e => setStudentForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="Parent's phone" className="h-9 text-sm rounded-lg" />
                </div>
                {studentErr && <p className="text-xs" style={{ color: "var(--ts-red)" }}>{studentErr}</p>}
                <Button type="submit" disabled={studentLoading} className="w-full h-9 text-sm rounded-lg mt-1" style={{ background: "var(--ts-purple)", color: "white" }}>
                  {studentLoading ? <><Spinner /> Adding…</> : "Add Student"}
                </Button>
              </form>
            )}
          </div>
        </div></Modal>
      )}

      {/* Edit student modal */}
      {editStudent && (
        <Modal onClose={() => !editLoading && setEditStudent(null)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !editLoading && setEditStudent(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-sm p-6 border border-border max-h-[90vh] overflow-y-auto">
            <button onClick={() => setEditStudent(null)} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-semibold mb-1">Edit Student</h3>
            <p className="text-xs text-muted-foreground mb-4">{editStudent.username && <span className="font-mono">{editStudent.username}</span>}</p>
            <form onSubmit={handleEditStudent} className="space-y-3">
              {editStudent.username && (
                <div>
                  <Label className="text-xs mb-1.5 block">Roll Number</Label>
                  <Input value={editStudent.username} readOnly disabled
                    className="h-9 text-sm rounded-lg font-mono bg-muted text-muted-foreground cursor-not-allowed" />
                  <p className="text-[10px] text-muted-foreground mt-1">Roll number cannot be changed after creation.</p>
                </div>
              )}
              <div>
                <Label className="text-xs mb-1.5 block">Full Name *</Label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Student's full name" className="h-9 text-sm rounded-lg" required />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Class</Label>
                <select value={editForm.class_id} onChange={e => setEditForm(f => ({ ...f, class_id: e.target.value }))}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">No change</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{clsLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Gender</Label>
                <select value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Email</Label>
                <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="student@email.com" className="h-9 text-sm rounded-lg" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Phone</Label>
                <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Parent's phone" className="h-9 text-sm rounded-lg" />
              </div>
              {editErr && <p className="text-xs" style={{ color: "var(--ts-red)" }}>{editErr}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setEditStudent(null)} className="flex-1 h-9 text-sm rounded-lg">Cancel</Button>
                <Button type="submit" disabled={editLoading} className="flex-1 h-9 text-sm rounded-lg" style={{ background: "var(--ts-purple)", color: "white" }}>
                  {editLoading ? <><Spinner /> Saving…</> : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div></Modal>
      )}

      {/* Bulk import modal */}
      {showBulk && (
        <Modal onClose={() => !bulkLoading && setShowBulk(false)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !bulkLoading && setShowBulk(false)} />
          <div className="relative bg-card rounded-xl w-full max-w-md p-6 border border-border max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowBulk(false)} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-semibold mb-1">
              {bulkResults.length > 0 ? "Import Complete" : "Bulk Import Students"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {bulkResults.length > 0
                ? `${bulkResults.filter(r => !r.error).length} of ${bulkResults.length} students imported successfully.${bulkResults.some(r => r.error) ? " Download the sheet to see credentials." : " Download the sheet to share login credentials."}`
                : "Upload a CSV or Excel file with columns: Name, Roll No, Email (opt), Phone (opt)"
              }
            </p>
            {bulkResults.length > 0 ? (
              <div className="space-y-3">
                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {bulkResults.map((r, i) => (
                    <div key={i} className={`text-xs p-2 rounded-lg ${r.error ? "bg-red-50 dark:bg-red-900/20 text-red-600" : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"}`}>
                      <span className="font-medium">{r.name}</span>
                      {r.error ? ` — ${r.error}` : ` — ${r.username} / ${r.temp_password}`}
                    </div>
                  ))}
                </div>
                {bulkResults.some(r => !r.error) && (
                  <Button onClick={() => downloadBulkStudentCredentials(bulkResults)}
                    variant="outline" className="w-full h-9 text-sm rounded-lg gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download all credentials as Excel
                  </Button>
                )}
                <Button onClick={() => setShowBulk(false)} className="w-full h-9 text-sm rounded-lg" style={{ background: "var(--ts-purple)", color: "white" }}>Done</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Class *</Label>
                  <select value={bulkClassId} onChange={e => setBulkClassId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none">
                    <option value="">Select class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{clsLabel(c)}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">File * <span className="text-muted-foreground font-normal">(CSV or Excel)</span></Label>
                  <input type="file" accept=".csv,.xlsx,.xls" ref={csvRef} className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return
                      setBulkRows(await parseStudentFile(file))
                    }}
                  />
                  <button type="button" onClick={() => csvRef.current?.click()}
                    className="w-full h-9 rounded-lg border border-dashed border-input flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-foreground/40 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {bulkRows.length > 0 ? `${bulkRows.length} students loaded` : "Choose CSV or Excel file"}
                  </button>
                </div>
                <Button onClick={handleBulkImport} disabled={!bulkClassId || !bulkRows.length || bulkLoading}
                  className="w-full h-9 text-sm rounded-lg" style={{ background: "var(--ts-purple)", color: "white" }}>
                  {bulkLoading ? <><Spinner /> Importing…</> : `Import ${bulkRows.length} students`}
                </Button>
              </div>
            )}
          </div>
        </div></Modal>
      )}

      {/* Confirm remove */}
      {confirmRemove && (
        <Modal onClose={() => !removeLoading && setConfirmRemove(null)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !removeLoading && setConfirmRemove(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-xs p-6 border border-border">
            <div className="flex items-center gap-2 text-red-500 mb-3">
              <AlertCircle className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Remove {confirmRemove.name}?</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">This will permanently delete their account and all data. This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmRemove(null)} className="flex-1 h-8 text-xs rounded-lg">Cancel</Button>
              <Button onClick={handleRemove} disabled={removeLoading} className="flex-1 h-8 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white">
                {removeLoading ? <Spinner /> : "Remove"}
              </Button>
            </div>
          </div>
        </div></Modal>
      )}
    </div>
  )
}
