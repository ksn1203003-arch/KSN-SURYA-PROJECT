import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { SkeletonList } from "@/components/SkeletonCard"
import {
  Plus, Upload, Search, Trash2, X, ChevronDown, ChevronUp,
  Users, CheckCircle, UserX, AlertCircle, Activity, GraduationCap,
  BookMarked, School, CalendarCheck, Loader2,
} from "lucide-react"
import {
  Modal, Spinner, SectionHeader, Empty, CopyBtn,
  downloadTeacherCredential, downloadBulkTeacherCredentials,
  MultiSelectDropdown, ListPager, usePagedRows,
} from "./adminComponents"
import { clsLabel } from "./adminShared"
import type {
  ClassRow, TeacherRow, TeacherDetail, BulkTeacherResult,
  AttPeriod, TeacherAttDetail,
} from "./adminTypes"
import { parseTeacherFile } from "@/lib/userApi"
import { UserPhoto } from "@/components/UserPhoto"

interface AdminTeachersPanelProps {
  teachers: TeacherRow[]
  filteredTeachers: TeacherRow[]
  loadingTeachers: boolean
  classes: ClassRow[]
  searchTeachers: string
  setSearchTeachers: (s: string) => void
  selectedTeacherIds: Set<string>
  setSelectedTeacherIds: (fn: (prev: Set<string>) => Set<string>) => void
  showTeacherBulkActions: boolean
  setShowTeacherBulkActions: (fn: (prev: boolean) => boolean) => void
  teacherBulkClass: string
  setTeacherBulkClass: (s: string) => void
  teacherBulkActionLoading: boolean
  handleTeacherBulkAction: (action: string) => void
  expandedTeacherId: string | null
  teacherDetailMap: Record<string, TeacherDetail>
  teacherDetailLoading: string | null
  handleToggleTeacher: (id: string) => void
  teacherAttPeriod: AttPeriod
  setTeacherAttPeriod: (p: AttPeriod) => void
  teacherAttCache: Record<string, TeacherAttDetail>
  teacherAttLoading: boolean
  teacherAttCustomFrom: string
  setTeacherAttCustomFrom: (s: string) => void
  teacherAttCustomTo: string
  setTeacherAttCustomTo: (s: string) => void
  loadTeacherAtt: (id: string, period: AttPeriod, from?: string, to?: string) => Promise<void>
  showTeacherModal: boolean
  setShowTeacherModal: (b: boolean) => void
  teacherForm: { name: string; email: string; phone: string; class_id: string; subject: string }
  setTeacherForm: (fn: (prev: AdminTeachersPanelProps["teacherForm"]) => AdminTeachersPanelProps["teacherForm"]) => void
  teacherErr: string
  teacherLoading: boolean
  teacherResult: { email: string; temp_password: string } | null
  setTeacherResult: (r: { email: string; temp_password: string } | null) => void
  handleInviteTeacher: (e: React.FormEvent) => void
  showBulkTeacher: boolean
  setShowBulkTeacher: (b: boolean) => void
  bulkTeacherRows: Array<{ name: string; email: string; phone?: string }>
  setBulkTeacherRows: (rows: Array<{ name: string; email: string; phone?: string }>) => void
  bulkTeacherResults: BulkTeacherResult[]
  setBulkTeacherResults: (r: BulkTeacherResult[]) => void
  bulkTeacherLoading: boolean
  handleBulkTeacherImport: () => void
  editTeacher: TeacherRow | null
  setEditTeacher: (t: TeacherRow | null) => void
  editTeacherForm: { name: string; email: string; phone: string; class_id: string; subject: string }
  setEditTeacherForm: (fn: (prev: AdminTeachersPanelProps["editTeacherForm"]) => AdminTeachersPanelProps["editTeacherForm"]) => void
  editAssignments: Array<{ class_id: string; subjects: string[] }>
  setEditAssignments: (fn: (prev: Array<{ class_id: string; subjects: string[] }>) => Array<{ class_id: string; subjects: string[] }>) => void
  editTeacherErr: string
  editTeacherLoading: boolean
  handleEditTeacher: (e: React.FormEvent) => void
  confirmRemove: { id: string; name: string } | null
  setConfirmRemove: (v: { id: string; name: string } | null) => void
  handleRemove: () => void
  removeLoading: boolean
}

export default function AdminTeachersPanel({
  teachers, filteredTeachers, loadingTeachers, classes,
  searchTeachers, setSearchTeachers,
  selectedTeacherIds, setSelectedTeacherIds,
  showTeacherBulkActions, setShowTeacherBulkActions,
  teacherBulkClass, setTeacherBulkClass, teacherBulkActionLoading, handleTeacherBulkAction,
  expandedTeacherId, teacherDetailMap, teacherDetailLoading, handleToggleTeacher,
  teacherAttPeriod, setTeacherAttPeriod, teacherAttCache, teacherAttLoading,
  teacherAttCustomFrom, setTeacherAttCustomFrom, teacherAttCustomTo, setTeacherAttCustomTo, loadTeacherAtt,
  showTeacherModal, setShowTeacherModal, teacherForm, setTeacherForm,
  teacherErr, teacherLoading, teacherResult, setTeacherResult, handleInviteTeacher,
  showBulkTeacher, setShowBulkTeacher, bulkTeacherRows, setBulkTeacherRows,
  bulkTeacherResults, setBulkTeacherResults, bulkTeacherLoading, handleBulkTeacherImport,
  editTeacher, setEditTeacher, editTeacherForm, setEditTeacherForm,
  editAssignments, setEditAssignments, editTeacherErr, editTeacherLoading, handleEditTeacher,
  confirmRemove, setConfirmRemove, handleRemove, removeLoading,
}: AdminTeachersPanelProps) {
  const teacherPager = usePagedRows(filteredTeachers, searchTeachers)
  const pageIds = teacherPager.pageRows.map(t => t.id)
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selectedTeacherIds.has(id))
  const selectedCount = filteredTeachers.filter(t => selectedTeacherIds.has(t.id)).length
  const selectedOffPage = selectedCount - pageIds.filter(id => selectedTeacherIds.has(id)).length
  const csvTeacherRef = useRef<HTMLInputElement>(null)

  return (
    <div className="w-full">
      <SectionHeader
        title="Teachers"
        sub={`${teachers.length} teacher${teachers.length !== 1 ? "s" : ""}`}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setBulkTeacherResults([]); setBulkTeacherRows([]); setShowBulkTeacher(true) }}
              className="h-8 text-xs rounded-lg gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Bulk Import
            </Button>
            <Button size="sm" onClick={() => { setTeacherForm(() => ({ name:"",email:"",phone:"",class_id:"",subject:"" })); setShowTeacherModal(true) }}
              style={{ background: "var(--ts-green)", color: "white" }} className="h-8 text-xs rounded-lg gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Invite Teacher
            </Button>
          </div>
        }
      />

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={searchTeachers} onChange={e => setSearchTeachers(e.target.value)}
          placeholder="Search teachers…" className="pl-8 h-8 text-sm rounded-lg" />
      </div>

      {/* Teacher bulk actions bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-border bg-muted/60 flex-wrap">
          <span className="text-xs font-semibold text-foreground mr-1">
            {selectedCount} selected{selectedOffPage > 0 ? ` (${selectedOffPage} on other pages)` : ""}
          </span>
          <button onClick={() => setShowTeacherBulkActions(s => !s)}
            className="text-xs text-ts-green font-medium hover:underline">{showTeacherBulkActions ? "Hide actions" : "Show actions"}</button>
          {showTeacherBulkActions && (
            <>
              <div className="flex items-center gap-1 ml-2">
                <select value={teacherBulkClass} onChange={e => setTeacherBulkClass(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none">
                  <option value="">Assign to class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{clsLabel(c)}</option>)}
                </select>
                <Button size="sm" disabled={!teacherBulkClass || teacherBulkActionLoading}
                  onClick={() => handleTeacherBulkAction("class")}
                  className="h-7 text-xs rounded-md px-2" style={{ background: "var(--ts-green)", color: "white" }}>
                  {teacherBulkActionLoading ? "…" : "Apply"}
                </Button>
              </div>
              <Button size="sm" disabled={teacherBulkActionLoading}
                onClick={() => {
                  const offPage = selectedOffPage > 0 ? `, including ${selectedOffPage} not on this page` : ""
                  if (confirm(`Delete ${selectedCount} teacher(s)${offPage}? This cannot be undone.`)) handleTeacherBulkAction("delete")
                }}
                className="h-7 text-xs rounded-md px-2 bg-red-500 hover:bg-red-600 text-white ml-auto">
                {teacherBulkActionLoading ? "…" : `Delete ${selectedCount}`}
              </Button>
            </>
          )}
          <button onClick={() => setSelectedTeacherIds(() => new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Summary stats bar */}
      {!loadingTeachers && teachers.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total", value: teachers.length, color: "#534AB7", icon: <Users className="w-3.5 h-3.5" /> },
            { label: "Active", value: teachers.filter(t => t.is_active).length, color: "#639922", icon: <CheckCircle className="w-3.5 h-3.5" /> },
            { label: "Inactive", value: teachers.filter(t => !t.is_active).length, color: "#6b7280", icon: <UserX className="w-3.5 h-3.5" /> },
            { label: "Unassigned", value: teachers.filter(t => !t.subject_assignments?.length).length, color: "#f59e0b", icon: <AlertCircle className="w-3.5 h-3.5" /> },
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

      {loadingTeachers ? (
        <SkeletonList count={5} lines={2} showAvatar />
      ) : filteredTeachers.length === 0 ? (
        <Empty
          icon={<Users className="w-6 h-6" />}
          title="No teachers yet"
          body="Invite teachers to your school. They'll receive login credentials to access their class dashboard."
          action={<Button size="sm" onClick={() => setShowTeacherModal(true)} style={{ background: "var(--ts-green)", color: "white" }} className="text-xs h-8 rounded-lg gap-1">
            <Plus className="w-3.5 h-3.5" /> Invite your first teacher
          </Button>}
        />
      ) : (
        <>
        {pageAllSelected && selectedCount < filteredTeachers.length && (
          <p role="status" className="mb-3 px-3 py-2 rounded-lg bg-muted/60 text-xs text-foreground">
            All {pageIds.length} teachers on this page are selected.{" "}
            <button className="font-semibold text-ts-blue hover:underline"
              onClick={() => setSelectedTeacherIds(() => new Set(filteredTeachers.map(t => t.id)))}>
              Select all {filteredTeachers.length} matching teachers
            </button>
          </p>
        )}
        <div id="teachers-table" tabIndex={-1} aria-label="Teachers list" className="skillio-card rounded-xl overflow-x-auto scroll-mt-4 focus:outline-none">
          <table className="w-full text-sm border-collapse">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "200px" }} />
              <col style={{ width: "210px" }} />
              <col style={{ width: "115px" }} />
              <col />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--muted)" }}>
                <th className="px-4 py-3">
                  <input type="checkbox" aria-label="Select all teachers on this page"
                    checked={pageAllSelected}
                    onChange={e => setSelectedTeacherIds(prev => {
                      const next = new Set(prev)
                      pageIds.forEach(id => { if (e.target.checked) next.add(id); else next.delete(id) })
                      return next
                    })}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-green-600"
                  />
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Class · Subject</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {teacherPager.pageRows.map(t => {
                const checked = selectedTeacherIds.has(t.id)
                const isExpanded = expandedTeacherId === t.id
                const detail = teacherDetailMap[t.id]
                const isLoadingDetail = teacherDetailLoading === t.id
                const joinedDate = t.created_at ? new Date(t.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : null
                return (
                  <>
                    <tr key={t.id} onClick={() => setSelectedTeacherIds(prev => { const next = new Set(prev); checked ? next.delete(t.id) : next.add(t.id); return next })}
                      className={`border-t border-border transition-colors cursor-pointer select-none ${checked ? "bg-green-50/60 dark:bg-green-900/10" : isExpanded ? "bg-muted/40" : "hover:bg-muted/30"}`}>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={checked} aria-label={`Select ${t.name}`}
                          onChange={e => setSelectedTeacherIds(prev => {
                            const next = new Set(prev)
                            e.target.checked ? next.add(t.id) : next.delete(t.id)
                            return next
                          })}
                          className="w-3.5 h-3.5 rounded cursor-pointer accent-green-600"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <UserPhoto path={t.photo_url}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-border"
                            fallback={
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                                style={{ background: "linear-gradient(135deg,#639922,#10b981)" }}>
                                {t.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                            } />
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-sm truncate">{t.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {joinedDate && <span className="text-[10px] text-muted-foreground">Joined {joinedDate}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">{t.email}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">{t.phone ?? <span className="opacity-40">—</span>}</td>
                      <td className="px-4 py-3.5">
                        {t.subject_assignments?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.subject_assignments.map((a, i) => (
                              <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] px-2 py-0.5 rounded-full font-medium"
                                style={{ background: "rgba(83,74,183,0.1)", color: "#534AB7" }}>
                                <span>{a.class_label}</span>
                                <span className="opacity-40">·</span>
                                <span>{a.subject}</span>
                              </span>
                            ))}
                          </div>
                        ) : t.class_label ? (
                          <span className="text-xs text-muted-foreground">{t.class_label}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${t.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${t.is_active ? "bg-green-500" : "bg-muted-foreground/50"}`} />
                          {t.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => {
                              setEditTeacher(t)
                              setEditTeacherForm(() => ({ name: t.name, email: t.email, phone: t.phone ?? "", class_id: "", subject: "" }))
                              const grouped: Record<string, string[]> = {}
                              for (const a of (t.subject_assignments ?? [])) {
                                const cid = a.class_id ?? classes.find(c => (clsLabel(c)) === a.class_label)?.id ?? ""
                                if (!cid) continue
                                grouped[cid] = [...(grouped[cid] ?? []), a.subject]
                              }
                              setEditAssignments(() => Object.entries(grouped).map(([class_id, subjects]) => ({ class_id, subjects })))
                            }}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-ts-green hover:bg-muted transition-colors" title="Edit teacher" aria-label="Edit teacher"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setConfirmRemove({ id: t.id, name: t.name })}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remove teacher" aria-label="Remove teacher">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleToggleTeacher(t.id)} title="View details" aria-label="View teacher details"
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-[#534AB7] hover:bg-muted transition-colors">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${t.id}-detail`} className="border-t border-border bg-muted/20">
                        <td />
                        <td colSpan={6} className="px-4 py-4">
                          {isLoadingDetail ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading teacher details…
                            </div>
                          ) : detail ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-lg border border-border bg-card px-3 py-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <Activity className="w-3 h-3" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold">Last Login</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {detail.last_login ? new Date(detail.last_login).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never"}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{detail.sessions_this_month} sessions this month</p>
                                </div>
                                <div className="rounded-lg border border-border bg-card px-3 py-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <BookMarked className="w-3 h-3" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold">Content Created</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">{detail.modules_count} modules</p>
                                  <p className="text-[10px] text-muted-foreground">{detail.quizzes_count} quizzes · {detail.challenges_count} challenges</p>
                                </div>
                                <div className="rounded-lg border border-border bg-card px-3 py-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <GraduationCap className="w-3 h-3" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold">Students</span>
                                  </div>
                                  <p className="text-sm font-semibold text-foreground">{detail.total_students} total</p>
                                  <p className="text-[10px] text-muted-foreground">across {detail.class_details.length} class{detail.class_details.length !== 1 ? "es" : ""}</p>
                                </div>
                                <div className="rounded-lg border border-border bg-card px-3 py-2">
                                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <School className="w-3 h-3" />
                                    <span className="text-[10px] uppercase tracking-wider font-semibold">Classes</span>
                                  </div>
                                  {detail.class_details.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {detail.class_details.map((cd, i) => (
                                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                          {cd.label} ({cd.student_count})
                                        </span>
                                      ))}
                                    </div>
                                  ) : <p className="text-sm text-muted-foreground/50">—</p>}
                                </div>
                              </div>
                              {/* Attendance panel */}
                              <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
                                  <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Login Attendance</span>
                                </div>
                                <div className="px-4 pt-3 pb-1">
                                  <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                                    {(["today", "week", "month", "year", "custom"] as const).map(p => (
                                      <button key={p}
                                        onClick={() => { setTeacherAttPeriod(p); if (p !== "custom") void loadTeacherAtt(t.id, p) }}
                                        className={`text-[10px] px-2.5 py-1 rounded-md font-semibold capitalize transition-all ${teacherAttPeriod === p ? "bg-white dark:bg-neutral-800 text-[#534AB7] shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                                      >{p}</button>
                                    ))}
                                  </div>
                                </div>
                                {teacherAttPeriod === "custom" && (
                                  <div className="px-4 pb-3 space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <p className="text-[10px] text-muted-foreground mb-1 font-medium">From</p>
                                        <DatePicker value={teacherAttCustomFrom} onChange={setTeacherAttCustomFrom} placeholder="Start date" max={teacherAttCustomTo || undefined} />
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground mb-1 font-medium">To</p>
                                        <DatePicker value={teacherAttCustomTo} onChange={setTeacherAttCustomTo} placeholder="End date" min={teacherAttCustomFrom || undefined} />
                                      </div>
                                    </div>
                                    <button disabled={!teacherAttCustomFrom || !teacherAttCustomTo}
                                      onClick={() => void loadTeacherAtt(t.id, "custom", teacherAttCustomFrom, teacherAttCustomTo)}
                                      className="w-full text-xs py-1.5 rounded-lg bg-[#534AB7] text-white disabled:opacity-40 hover:bg-[#4338a3] transition-colors font-semibold">
                                      Load Attendance
                                    </button>
                                  </div>
                                )}
                                <div className="px-4 pb-4 pt-2">
                                  {(() => {
                                    const attKey = teacherAttPeriod === "custom"
                                      ? `${t.id}_custom_${teacherAttCustomFrom}_${teacherAttCustomTo}`
                                      : `${t.id}_${teacherAttPeriod}`
                                    const attData = teacherAttCache[attKey]
                                    if (teacherAttLoading) return (
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                                      </div>
                                    )
                                    if (!attData) return (
                                      <p className="text-xs text-muted-foreground/40 py-3 text-center">Select a period to view attendance</p>
                                    )
                                    const fmtDur = (m: number) => { const h = Math.floor(m / 60); const min = m % 60; return h > 0 ? (min > 0 ? `${h}h ${min}m` : `${h}h`) : `${m}m` }
                                    const pct = attData.attendance_pct
                                    const pctColor = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444"
                                    return (
                                      <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-2">
                                          <div className="rounded-lg bg-card border border-border px-3 py-2 text-center">
                                            <p className="text-base font-bold text-foreground leading-tight">
                                              {attData.login_days}<span className="text-[10px] font-normal text-muted-foreground">/{attData.total_days}</span>
                                            </p>
                                            <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">Days logged</p>
                                          </div>
                                          <div className="rounded-lg bg-card border border-border px-3 py-2 text-center">
                                            <p className="text-base font-bold leading-tight" style={{ color: pctColor }}>{pct}%</p>
                                            <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">Attendance</p>
                                          </div>
                                          <div className="rounded-lg bg-card border border-border px-3 py-2 text-center">
                                            <p className="text-base font-bold text-foreground leading-tight">{attData.total_hours}h</p>
                                            <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">Total hours</p>
                                          </div>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                          <div className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${Math.min(pct, 100)}%`, background: pctColor }} />
                                        </div>
                                        {attData.sessions.length === 0 ? (
                                          <p className="text-xs text-muted-foreground/40 text-center py-2">No sessions in this period</p>
                                        ) : (
                                          <div className="rounded-lg border border-border overflow-hidden">
                                            <div className="max-h-44 overflow-y-auto divide-y divide-border">
                                              {attData.sessions.slice(0, 15).map((sess, i) => {
                                                const loginStr = sess.login_at ? new Date(sess.login_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"
                                                const logoutStr = sess.logout_at ? new Date(sess.logout_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null
                                                return (
                                                  <div key={i} className={`flex items-center gap-3 px-3 py-2 text-xs ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                                                    <span className="shrink-0 font-semibold text-foreground w-12">
                                                      {new Date(sess.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                                    </span>
                                                    <span className="text-muted-foreground">{loginStr}</span>
                                                    <span className="text-muted-foreground/30 text-[10px]">→</span>
                                                    <span className="text-muted-foreground flex-1">
                                                      {logoutStr ?? <span className="text-green-500 text-[10px] font-semibold">Clocked In</span>}
                                                    </span>
                                                    {sess.duration_minutes > 0 && (
                                                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                                        {fmtDur(sess.duration_minutes)}
                                                      </span>
                                                    )}
                                                  </div>
                                                )
                                              })}
                                            </div>
                                            {attData.sessions.length > 15 && (
                                              <div className="px-3 py-1.5 bg-muted/30 border-t border-border text-center">
                                                <p className="text-[10px] text-muted-foreground">+{attData.sessions.length - 15} more sessions</p>
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
                            <p className="text-xs text-muted-foreground/60">Could not load details.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
        <ListPager {...teacherPager} noun="teachers" anchorId="teachers-table" />
        </>
      )}

      {/* Invite teacher modal */}
      {showTeacherModal && (
        <Modal onClose={() => setShowTeacherModal(false)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { if (!teacherResult) setShowTeacherModal(false) }} />
          <div className="relative bg-card rounded-xl w-full max-w-sm p-6 border border-border">
            <button onClick={() => setShowTeacherModal(false)} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-semibold mb-4">Invite Teacher</h3>
            {teacherResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" /> Teacher account created!
                </div>
                <p className="text-xs text-muted-foreground">Share these credentials with the teacher:</p>
                <div className="bg-muted rounded-lg p-3 space-y-2 text-sm font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Email</span>
                    <span className="text-foreground">{teacherResult.email}<CopyBtn text={teacherResult.email} /></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Temp Password</span>
                    <span className="text-foreground font-bold">{teacherResult.temp_password}<CopyBtn text={teacherResult.temp_password} /></span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">The teacher should change their password after first login.</p>
                <Button
                  onClick={() => downloadTeacherCredential(teacherForm.name, teacherResult.email, teacherResult.temp_password)}
                  variant="outline" className="w-full h-9 text-sm rounded-lg gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download as Excel
                </Button>
                <Button onClick={() => { setShowTeacherModal(false); setTeacherResult(null) }} className="w-full h-9 text-sm rounded-lg" style={{ background: "var(--ts-green)", color: "white" }}>Done</Button>
              </div>
            ) : (
              <form onSubmit={handleInviteTeacher} className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Full Name *</Label>
                  <Input value={teacherForm.name} onChange={e => setTeacherForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Teacher's full name" className="h-9 text-sm rounded-lg" required />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Email *</Label>
                  <Input type="email" value={teacherForm.email} onChange={e => setTeacherForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="teacher@school.edu" className="h-9 text-sm rounded-lg" required />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Phone</Label>
                  <Input value={teacherForm.phone} onChange={e => setTeacherForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="10-digit mobile number" className="h-9 text-sm rounded-lg" />
                </div>
                <div className="border border-border rounded-lg p-3 space-y-2.5 bg-muted/30">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Class Assignment (optional)</p>
                  <div>
                    <Label className="text-xs mb-1.5 block">Class</Label>
                    <select value={teacherForm.class_id} onChange={e => setTeacherForm(f => ({ ...f, class_id: e.target.value }))}
                      className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">— No class yet —</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{clsLabel(c)}</option>)}
                    </select>
                  </div>
                  {teacherForm.class_id && (
                    <div>
                      <Label className="text-xs mb-1.5 block">Subject</Label>
                      <Input value={teacherForm.subject} onChange={e => setTeacherForm(f => ({ ...f, subject: e.target.value }))}
                        placeholder="e.g. CT & AI, Maths, Science" className="h-9 text-sm rounded-lg" />
                      <p className="text-[10px] text-muted-foreground mt-1">Leave blank to assign as the primary teacher for the class.</p>
                    </div>
                  )}
                </div>
                {teacherErr && <p className="text-xs" style={{ color: "var(--ts-red)" }}>{teacherErr}</p>}
                <Button type="submit" disabled={teacherLoading} className="w-full h-9 text-sm rounded-lg mt-1" style={{ background: "var(--ts-green)", color: "white" }}>
                  {teacherLoading ? <><Spinner /> Creating…</> : "Create Account"}
                </Button>
              </form>
            )}
          </div>
        </div></Modal>
      )}

      {/* Bulk import teachers modal */}
      {showBulkTeacher && (
        <Modal onClose={() => !bulkTeacherLoading && setShowBulkTeacher(false)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !bulkTeacherLoading && setShowBulkTeacher(false)} />
          <div className="relative bg-card rounded-xl w-full max-w-md p-6 border border-border max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowBulkTeacher(false)} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-semibold mb-1">
              {bulkTeacherResults.length > 0 ? "Import Complete" : "Bulk Import Teachers"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {bulkTeacherResults.length > 0
                ? `${bulkTeacherResults.filter(r => !r.error).length} of ${bulkTeacherResults.length} teachers imported successfully.${bulkTeacherResults.some(r => r.error) ? " Download the sheet to see credentials." : " Download the sheet to share login credentials."}`
                : "Upload a CSV or Excel file with columns: Name, Email, Phone (optional)"
              }
            </p>
            {bulkTeacherResults.length > 0 ? (
              <div className="space-y-3">
                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {bulkTeacherResults.map((r, i) => (
                    <div key={i} className={`text-xs p-2 rounded-lg ${r.error ? "bg-red-50 dark:bg-red-900/20 text-red-600" : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"}`}>
                      <span className="font-medium">{r.name}</span>
                      {r.error ? ` — ${r.error}` : ` — ${r.email} / ${r.temp_password}`}
                    </div>
                  ))}
                </div>
                {bulkTeacherResults.some(r => !r.error) && (
                  <Button onClick={() => downloadBulkTeacherCredentials(bulkTeacherResults)}
                    variant="outline" className="w-full h-9 text-sm rounded-lg gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download all credentials as Excel
                  </Button>
                )}
                <Button onClick={() => setShowBulkTeacher(false)} className="w-full h-9 text-sm rounded-lg" style={{ background: "var(--ts-green)", color: "white" }}>Done</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">CSV Format</p>
                  <p>Row 1 (header): <span className="font-mono">Name,Email,Phone</span></p>
                  <p>Row 2+: <span className="font-mono">Priya Sharma,priya@school.edu,9876543210</span></p>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">File * <span className="text-muted-foreground font-normal">(CSV or Excel)</span></Label>
                  <input type="file" accept=".csv,.xlsx,.xls" ref={csvTeacherRef} className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return
                      setBulkTeacherRows(await parseTeacherFile(file))
                    }}
                  />
                  <button type="button" onClick={() => csvTeacherRef.current?.click()}
                    className="w-full h-9 rounded-lg border border-dashed border-input flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-foreground/40 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {bulkTeacherRows.length > 0 ? `${bulkTeacherRows.length} teachers loaded` : "Choose CSV or Excel file"}
                  </button>
                </div>
                {bulkTeacherRows.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-muted/30">
                    {bulkTeacherRows.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-border last:border-0 text-xs">
                        <span className="font-medium text-foreground">{r.name}</span>
                        <span className="text-muted-foreground">{r.email}</span>
                        {r.phone && <span className="text-muted-foreground">{r.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <Button onClick={handleBulkTeacherImport} disabled={!bulkTeacherRows.length || bulkTeacherLoading}
                  className="w-full h-9 text-sm rounded-lg" style={{ background: "var(--ts-green)", color: "white" }}>
                  {bulkTeacherLoading ? <><Spinner /> Importing…</> : `Import ${bulkTeacherRows.length} teacher${bulkTeacherRows.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            )}
          </div>
        </div></Modal>
      )}

      {/* Edit teacher modal */}
      {editTeacher && (
        <Modal onClose={() => !editTeacherLoading && setEditTeacher(null)}><div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !editTeacherLoading && setEditTeacher(null)} />
          <div className="relative bg-card rounded-xl w-full max-w-sm p-6 border border-border max-h-[90vh] overflow-y-auto">
            <button onClick={() => setEditTeacher(null)} className="absolute top-4 right-4 text-muted-foreground" aria-label="Close"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-semibold mb-1">Edit Teacher</h3>
            <p className="text-xs text-muted-foreground mb-4">{editTeacher.email}</p>
            <form onSubmit={handleEditTeacher} className="space-y-3">
              <div>
                <Label className="text-xs mb-1.5 block">Full Name *</Label>
                <Input value={editTeacherForm.name} onChange={e => setEditTeacherForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Teacher's full name" className="h-9 text-sm rounded-lg" required />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Email</Label>
                <Input type="email" value={editTeacherForm.email} onChange={e => setEditTeacherForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="teacher@school.edu" className="h-9 text-sm rounded-lg" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Phone</Label>
                <Input value={editTeacherForm.phone} onChange={e => setEditTeacherForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="10-digit mobile number" className="h-9 text-sm rounded-lg" />
              </div>
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Class Assignments</p>
                <p className="text-[10px] text-muted-foreground">Check each class this teacher teaches and pick a subject.</p>
                {classes.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No classes yet — create classes first.</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {classes.sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section)).map(c => {
                      const assigned = editAssignments.find(a => a.class_id === c.id)
                      const isChecked = !!assigned
                      const selectedSubjects = assigned?.subjects ?? []
                      return (
                        <div key={c.id} className={`rounded-lg border transition-colors ${isChecked ? "border-[#534AB7]/40 bg-[#534AB7]/5" : "border-border bg-background"}`}>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setEditAssignments(prev => [...prev, { class_id: c.id, subjects: [] }])
                                } else {
                                  setEditAssignments(prev => prev.filter(a => a.class_id !== c.id))
                                }
                              }}
                              className="rounded accent-[#534AB7] w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold text-foreground truncate block" title={clsLabel(c)}>{clsLabel(c)}</span>
                            </div>
                            {selectedSubjects.length > 0 && (
                              <div className="flex flex-wrap gap-1 justify-end max-w-[160px]">
                                {selectedSubjects.map(s => (
                                  <span key={s} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                    style={{ background: "rgba(83,74,183,0.15)", color: "#534AB7" }}>
                                    {s}
                                    <button type="button"
                                      onClick={() => setEditAssignments(prev => prev.map(a => a.class_id === c.id ? { ...a, subjects: a.subjects.filter(x => x !== s) } : a))}
                                      className="ml-0.5 hover:text-red-500 transition-colors leading-none">×</button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {isChecked && (
                            <div className="px-3 pb-2.5 pl-8">
                              <MultiSelectDropdown
                                options={c.subjects?.length > 0 ? c.subjects : ["CT & AI", "Maths", "Science", "English", "Social Studies"]}
                                selected={selectedSubjects}
                                onChange={picked => setEditAssignments(prev => prev.map(a => a.class_id === c.id ? { ...a, subjects: picked } : a))}
                                placeholder="Select subjects…"
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {editAssignments.length > 0 && (
                  <button type="button" onClick={() => setEditAssignments(() => [])} className="text-[11px] text-red-500 hover:underline mt-1">
                    Clear all assignments
                  </button>
                )}
              </div>
              {editTeacherErr && <p className="text-xs" style={{ color: "var(--ts-red)" }}>{editTeacherErr}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setEditTeacher(null)} className="flex-1 h-9 text-sm rounded-lg">Cancel</Button>
                <Button type="submit" disabled={editTeacherLoading} className="flex-1 h-9 text-sm rounded-lg" style={{ background: "var(--ts-green)", color: "white" }}>
                  {editTeacherLoading ? <><Spinner /> Saving…</> : "Save Changes"}
                </Button>
              </div>
            </form>
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
