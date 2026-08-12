import { useState, useEffect } from "react"
import { Loader2, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorCard } from "@/components/ui/ErrorCard"
import { getStudentHomework, submitHomework, type HomeworkWithSubmission } from "@/lib/homeworkApi"

export function StudentHomeworkPanel() {
  const [homework,  setHomework]  = useState<HomeworkWithSubmission[]>([])
  const [loaded,    setLoaded]    = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected,  setSelected]  = useState<HomeworkWithSubmission | null>(null)
  const [answer,    setAnswer]    = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg,  setSubmitMsg]  = useState("")
  const [submitErr,  setSubmitErr]  = useState("")

  function load() {
    setLoaded(false); setLoadError(null)
    getStudentHomework().then(res => {
      if ("error" in res) { setLoadError(res.error); } else { setHomework(res.homework) }
      setLoaded(true)
    })
  }

  useEffect(() => { load() }, [])

  function openHomework(hw: HomeworkWithSubmission) {
    setSelected(hw)
    setAnswer(hw.submission?.answer_text ?? "")
    setSubmitMsg(""); setSubmitErr("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !answer.trim()) { setSubmitErr("Please write your answer before submitting."); return }
    setSubmitting(true); setSubmitMsg(""); setSubmitErr("")
    const res = await submitHomework(selected._id, answer)
    setSubmitting(false)
    if ("error" in res) { setSubmitErr(res.error); return }
    setSubmitMsg("Submitted successfully!")
    setHomework(prev => prev.map(h => h._id === selected._id ? { ...h, submission: res.submission } : h))
    setSelected(prev => prev ? { ...prev, submission: res.submission } : prev)
  }

  const isPastDue = (hw: HomeworkWithSubmission) => new Date(hw.due_date) < new Date()

  if (!loaded) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  if (loadError) return <ErrorCard message={loadError} onRetry={load} />

  if (homework.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <ClipboardList className="w-10 h-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No homework assigned yet.</p>
    </div>
  )

  return (
    <div className="flex gap-5 h-full min-h-[500px]">
      {/* Left — homework list */}
      <div className="w-60 shrink-0 flex flex-col gap-2">
        <p className="text-xs font-bold text-muted-foreground mb-1">YOUR HOMEWORK</p>
        {homework.map(hw => (
          <div key={hw._id} onClick={() => openHomework(hw)}
            className={`p-2.5 rounded-xl border cursor-pointer transition-all ${selected?._id === hw._id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{hw.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{hw.subject} · Due {new Date(hw.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
              </div>
              {hw.submission ? (
                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">Done</span>
              ) : isPastDue(hw) ? (
                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600">Late</span>
              ) : (
                <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">Pending</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Right — detail / answer form */}
      <div className="flex-1 min-w-0 rounded-xl border border-border p-4">
        {!selected && (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Select a homework to open it.</div>
        )}
        {selected && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">{selected.title}</h3>
              <p className="text-xs text-muted-foreground">{selected.subject} · Due {new Date(selected.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              {selected.description && <p className="text-xs text-foreground mt-2 whitespace-pre-wrap p-3 bg-muted/30 rounded-lg">{selected.description}</p>}
            </div>

            {selected.submission?.feedback && (
              <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Teacher Feedback</p>
                <p className="text-xs text-foreground">{selected.submission.feedback}</p>
                {selected.submission.marks !== null && (
                  <p className="text-xs font-bold text-emerald-600 mt-1">Marks: {selected.submission.marks}</p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="text-xs font-medium text-muted-foreground">Your Answer</label>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)}
                placeholder="Write your answer here…" rows={6}
                className="w-full text-sm rounded-xl px-3 py-2.5 border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
              {submitErr && <p className="text-xs text-red-500">{submitErr}</p>}
              {submitMsg && <p className="text-xs text-emerald-600">{submitMsg}</p>}
              <Button type="submit" disabled={submitting || !answer.trim()} className="h-8 text-xs rounded-xl w-fit">
                {submitting ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Submitting…</> : selected.submission ? "Update Submission" : "Submit Homework"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
