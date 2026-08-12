import { useState, useEffect } from "react"
import { Loader2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SkeletonList } from "@/components/SkeletonCard"
import { getTeacherClasses } from "@/lib/userApi"
import { getHomework, createHomework, deleteHomework, getHomeworkSubmissions, giveFeedback, type HomeworkItem, type HomeworkSubmission as HWSub } from "@/lib/homeworkApi"

export function TeacherHomeworkPanel({ initialClassId }: { initialClassId: string }) {
  const [classes,   setClasses]   = useState<Array<{ _id: string; name: string; grade: number; section: string }>>([])
  const [classId,   setClassId]   = useState(initialClassId)
  const [homework,  setHomework]  = useState<HomeworkItem[]>([])
  const [hwLoaded,  setHwLoaded]  = useState(false)
  const [selected,  setSelected]  = useState<HomeworkItem | null>(null)
  const [subs,      setSubs]      = useState<HWSub[]>([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating,  setCreating]  = useState(false)
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [apiErr,    setApiErr]    = useState("")
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackMarks, setFeedbackMarks] = useState("")
  const [savingFeedback, setSavingFeedback] = useState(false)

  const [form, setForm] = useState({ subject: "", title: "", description: "", due_date: new Date().toISOString().split("T")[0] })

  useEffect(() => {
    getTeacherClasses().then(res => {
      if (!("error" in res)) {
        setClasses(res.classes)
        if (!classId && res.classes.length > 0) setClassId(res.classes[0]._id)
      }
    })
  }, [])

  useEffect(() => {
    if (!classId) return
    setHomework([]); setHwLoaded(false); setSelected(null); setSubs([])
    getHomework(classId).then(res => {
      if (!("error" in res)) setHomework(res.homework)
      setHwLoaded(true)
    })
  }, [classId])

  async function loadSubmissions(hw: HomeworkItem) {
    setSelected(hw); setSubsLoading(true); setSubs([])
    const res = await getHomeworkSubmissions(hw._id)
    if (!("error" in res)) setSubs(res.submissions)
    setSubsLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subject.trim() || !form.title.trim() || !form.due_date) { setApiErr("Subject, title, and due date are required"); return }
    setCreating(true); setApiErr("")
    const res = await createHomework({ class_id: classId, ...form })
    setCreating(false)
    if ("error" in res) { setApiErr(res.error); return }
    setHomework(prev => [res.homework, ...prev])
    setShowCreate(false)
    setForm({ subject: "", title: "", description: "", due_date: new Date().toISOString().split("T")[0] })
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this homework and all submissions?")) return
    setDeleting(id)
    const res = await deleteHomework(id)
    if (!("error" in res)) {
      setHomework(prev => prev.filter(h => h._id !== id))
      if (selected?._id === id) { setSelected(null); setSubs([]) }
    }
    setDeleting(null)
  }

  async function handleFeedback(subId: string) {
    setSavingFeedback(true)
    const res = await giveFeedback(subId, feedbackText, feedbackMarks.trim() !== "" ? Number(feedbackMarks) : null)
    setSavingFeedback(false)
    if (!("error" in res)) {
      setSubs(prev => prev.map(s => s._id === subId ? { ...s, feedback: feedbackText, marks: feedbackMarks !== "" ? Number(feedbackMarks) : null } : s))
      setFeedbackId(null)
    }
  }

  const classLabel = (id: string) => { const c = classes.find(x => x._id === id); return c ? (c.name || `${c.grade}${c.section}`) : "" }

  return (
    <div className="flex gap-5 h-full min-h-[500px]">
      {/* Left col — homework list */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Homework</h2>
          <Button onClick={() => { setShowCreate(true); setApiErr("") }} className="h-7 text-xs rounded-lg px-3">+ New</Button>
        </div>

        {/* Class tabs */}
        {classes.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {classes.map(c => (
              <button key={c._id} onClick={() => setClassId(c._id)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${classId === c._id ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                {c.name || `${c.grade}${c.section}`}
              </button>
            ))}
          </div>
        )}

        {!hwLoaded && <SkeletonList count={3} lines={2} />}
        {hwLoaded && homework.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-xl">No homework yet.<br/>Click + New to create one.</div>}
        <div className="flex flex-col gap-1.5 overflow-y-auto">
          {homework.map(hw => (
            <div key={hw._id} onClick={() => loadSubmissions(hw)}
              className={`flex items-start justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${selected?._id === hw._id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">{hw.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{hw.subject} · Due {new Date(hw.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); handleDelete(hw._id) }} disabled={deleting === hw._id}
                className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors ml-1 shrink-0">
                {deleting === hw._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right col — submissions */}
      <div className="flex-1 min-w-0 rounded-xl border border-border p-4">
        {!selected && <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Select a homework to view submissions</div>}
        {selected && (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">{selected.title}</h3>
              <p className="text-xs text-muted-foreground">{selected.subject} · Class {classLabel(selected.class_id)} · Due {new Date(selected.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              {selected.description && <p className="text-xs text-foreground mt-1 whitespace-pre-wrap">{selected.description}</p>}
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">SUBMISSIONS ({subs.length})</p>
              {subsLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-4"><Loader2 className="w-3 h-3 animate-spin" />Loading submissions…</div>}
              {!subsLoading && subs.length === 0 && <p className="text-xs text-muted-foreground">No submissions yet.</p>}
              <div className="flex flex-col gap-3">
                {subs.map(sub => (
                  <div key={sub._id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-foreground">{sub.student_name}</p>
                      <span className="text-[10px] text-muted-foreground">{new Date(sub.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap mb-2 bg-muted/30 rounded-lg p-2">{sub.answer_text}</p>
                    {feedbackId === sub._id ? (
                      <div className="flex flex-col gap-2 mt-2">
                        <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                          placeholder="Write feedback…" rows={2}
                          className="w-full text-xs rounded-lg px-2 py-1.5 border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary/50" />
                        <div className="flex items-center gap-2">
                          <input type="number" value={feedbackMarks} onChange={e => setFeedbackMarks(e.target.value)}
                            placeholder="Marks (opt)" min={0}
                            className="w-24 h-7 text-xs rounded-lg border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                          <button onClick={() => handleFeedback(sub._id)} disabled={savingFeedback}
                            className="text-xs px-3 py-1 rounded-lg bg-primary text-white font-medium disabled:opacity-50">
                            {savingFeedback ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setFeedbackId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        {sub.feedback && <p className="text-[11px] text-muted-foreground italic flex-1">"{sub.feedback}"</p>}
                        {sub.marks !== null && <span className="text-[11px] font-semibold text-emerald-600">{sub.marks} pts</span>}
                        <button onClick={() => { setFeedbackId(sub._id); setFeedbackText(sub.feedback ?? ""); setFeedbackMarks(sub.marks !== null ? String(sub.marks) : "") }}
                          className="text-[11px] text-primary hover:underline shrink-0">
                          {sub.feedback ? "Edit feedback" : "Give feedback"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Homework modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm p-5" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Create Homework</h3>
              <button onClick={() => { setShowCreate(false); setApiErr("") }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            {apiErr && <div className="mb-3 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(226,75,74,0.08)", color: "#E24B4A", border: "1px solid rgba(226,75,74,0.2)" }}>{apiErr}</div>}
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject *</label>
                <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Mathematics" className="h-8 text-sm rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Title *</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Homework title" className="h-8 text-sm rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Instructions for students…" rows={3}
                  className="w-full text-sm rounded-lg px-3 py-2 border border-border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date *</label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-8 text-sm rounded-lg" />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => { setShowCreate(false); setApiErr("") }} className="text-xs px-4 py-2 rounded-xl border border-border hover:bg-muted">Cancel</button>
                <Button type="submit" disabled={creating} className="h-8 text-xs rounded-xl">
                  {creating ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Creating…</> : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
