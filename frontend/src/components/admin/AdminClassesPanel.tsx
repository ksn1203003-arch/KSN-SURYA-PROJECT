import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, BookOpen, Trash2, X } from "lucide-react"
import { Modal, Spinner, SectionHeader, Empty } from "./adminComponents"
import { clsLabel, clsCompact } from "./adminShared"
import type { ClassRow } from "./adminTypes"

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
  confirmDeleteClass, setConfirmDeleteClass, handleDeleteClass, deleteClassLoading,
}: AdminClassesPanelProps) {
  return (
    <div className="w-full">
      <SectionHeader
        title="Classes"
        sub={`${classes.length} class${classes.length !== 1 ? "es" : ""} in your school`}
        action={
          <Button size="sm" onClick={() => { setAddClassErr(""); setShowAddClass(true) }}
            style={{ background: "var(--ts-blue)", color: "white" }} className="h-8 text-xs rounded-lg gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Class
          </Button>
        }
      />

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
        <div className="skillio-card rounded-xl overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "120px" }} />
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
            <p className="text-xs text-muted-foreground mb-4">Update name and subjects for this class.</p>
            <form onSubmit={handleEditClass} className="space-y-4">
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
              {editClassErr && <p className="text-xs" style={{ color: "var(--ts-red)" }}>{editClassErr}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditClass(null)} className="flex-1 h-9 text-sm rounded-lg">Cancel</Button>
                <Button type="submit" disabled={editClassLoading} className="flex-1 h-9 text-sm rounded-lg"
                  style={{ background: "var(--ts-blue)", color: "white" }}>
                  {editClassLoading ? <><Spinner /> Saving…</> : "Save Changes"}
                </Button>
              </div>
            </form>
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
