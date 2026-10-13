import { useState, useEffect, type ChangeEvent } from "react"
import { Loader2, Plus, Copy, X, ChevronLeft, ChevronDown, Upload, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import {
  getMyQuizzesForClass, createQuiz, deleteQuiz, getQuizResults, updateQuizDeadline,
  type Quiz,
} from "@/lib/studentApi"

type TimetableSlot = {
  day: string; period: number; subject: string
  teacher_id: string | null; teacher_name: string | null
  start_time: string; end_time: string
}

type TeacherClass = {
  id: string; grade: number; section: string; name: string | null
  subjects: string[]; timetable: TimetableSlot[]
  timetable_updated_by_name: string | null; timetable_updated_at: string | null
}

interface Props {
  ttClasses: TeacherClass[]
  setView: (v: string) => void
}

export function TeacherQuizzesPanel({ ttClasses, setView }: Props) {
  const [quizClassId,       setQuizClassId]       = useState(() => ttClasses[0]?.id ?? "")
  const [showQuizCreator,   setShowQuizCreator]   = useState(false)
  const [quizCreatorTab,    setQuizCreatorTab]    = useState<"manual" | "paste" | "ai">("manual")
  const [newQuizTitle,      setNewQuizTitle]      = useState("")
  const [newQuizDeadline,   setNewQuizDeadline]   = useState("")
  const [newQuizShuffle,    setNewQuizShuffle]    = useState(false)
  const [newQuizQuestions,  setNewQuizQuestions]  = useState([{ q: "", options: ["", "", "", ""], correct: 0 }])
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null)
  const [editingDeadlineVal, setEditingDeadlineVal] = useState("")
  const [deadlineUpdating,  setDeadlineUpdating]  = useState(false)
  const [pasteText,         setPasteText]         = useState("")
  const [pasteError,        setPasteError]        = useState("")
  const [parsedQuestions,   setParsedQuestions]   = useState<Array<{ q: string; options: string[]; correct: number }>>([])
  const [showFormatHelper,  setShowFormatHelper]  = useState(false)
  const [fileLoading,       setFileLoading]       = useState(false)
  const [pushedToast,       setPushedToast]       = useState<string | null>(null)
  const [quizzes,           setQuizzes]           = useState<Quiz[]>([])
  const [quizzesLoading,    setQuizzesLoading]    = useState(false)
  const [quizError,         setQuizError]         = useState("")
  const [quizSaving,        setQuizSaving]        = useState(false)
  const [selectedQuizId,    setSelectedQuizId]    = useState<string | null>(null)
  const [quizResultsData,   setQuizResultsData]   = useState<Array<{
    student_name: string; attempt_count: number
    best_score: number; best_percentage: number
    latest_percentage: number; latest_submitted_at: string
  }>>([])
  const [quizResultsLoading, setQuizResultsLoading] = useState(false)
  const [innerView, setInnerView] = useState<"list" | "results">("list")

  useEffect(() => {
    if (!quizClassId) return
    setQuizzesLoading(true)
    getMyQuizzesForClass(quizClassId).then(res => {
      setQuizzesLoading(false)
      if ("error" in res) return
      setQuizzes(res.quizzes)
    })
  }, [quizClassId])

  function resetQuizCreator() {
    setShowQuizCreator(false)
    setNewQuizTitle("")
    setNewQuizDeadline("")
    setNewQuizShuffle(false)
    setNewQuizQuestions([{ q: "", options: ["", "", "", ""], correct: 0 }])
    setQuizCreatorTab("manual")
    setPasteText("")
    setParsedQuestions([])
    setPasteError("")
    setQuizError("")
    setShowFormatHelper(false)
  }

  function addQuizQuestion() {
    if (newQuizQuestions.length >= 20) return
    setNewQuizQuestions(q => [...q, { q: "", options: ["", "", "", ""], correct: 0 }])
  }

  function duplicateQuestion(idx: number) {
    if (newQuizQuestions.length >= 20) return
    setNewQuizQuestions(qs => {
      const copy = { ...qs[idx], options: [...qs[idx].options] }
      const next = [...qs]; next.splice(idx + 1, 0, copy); return next
    })
  }

  function removeQuestion(idx: number) {
    if (newQuizQuestions.length <= 1) return
    setNewQuizQuestions(qs => qs.filter((_, i) => i !== idx))
  }

  function updateQuestion(idx: number, value: string) {
    setNewQuizQuestions(qs => qs.map((q, i) => i === idx ? { ...q, q: value } : q))
  }

  function updateOption(qIdx: number, oIdx: number, value: string) {
    setNewQuizQuestions(qs => qs.map((q, i) => i === qIdx ? { ...q, options: q.options.map((o, j) => j === oIdx ? value : o) } : q))
  }

  function setCorrect(qIdx: number, oIdx: number) {
    setNewQuizQuestions(qs => qs.map((q, i) => i === qIdx ? { ...q, correct: oIdx } : q))
  }

  function parseFromText(text: string) {
    setPasteError(""); setParsedQuestions([])
    if (!text.trim()) { setPasteError("Paste your questions first."); return }
    const blocks = text.split(/\n\s*\n/).filter(b => b.trim())
    const result: Array<{ q: string; options: string[]; correct: number }> = []
    for (let bi = 0; bi < blocks.length; bi++) {
      const lines = blocks[bi].split("\n").map(l => l.trim()).filter(l => l)
      if (lines.length < 3) continue
      const qText = lines[0].replace(/^\d+[\.\)]\s*/, "").trim()
      if (!qText) continue
      const options: string[] = []
      let correct = 0
      for (let li = 1; li < lines.length && options.length < 4; li++) {
        const line = lines[li]
        const stripped = line.replace(/^[a-dA-D1-4][\.\)]\s*/, "").trim()
        const isCorrect = stripped.endsWith("*")
        const optText = stripped.replace(/\s*\*\s*$/, "").trim()
        if (optText) { if (isCorrect) correct = options.length; options.push(optText) }
      }
      if (options.length < 2) {
        setPasteError(`Question ${bi + 1}: Need at least 2 options. Mark the correct one with * at the end.`)
        return
      }
      while (options.length < 4) options.push("")
      result.push({ q: qText, options, correct })
    }
    if (result.length === 0) { setPasteError("Could not parse any questions. Check the format example."); return }
    if (result.length > 20) { setPasteError(`Too many questions (${result.length}). Maximum 20 per quiz.`); return }
    setParsedQuestions(result)
  }

  function parsePasteText() { parseFromText(pasteText) }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileLoading(true); setPasteError(""); setParsedQuestions([])
    try {
      let text = ""
      if (file.name.toLowerCase().endsWith(".txt")) {
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsText(file)
        })
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        const mammoth = await import("mammoth")
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        text = result.value
      }
      if (text.trim()) { setPasteText(text); parseFromText(text) }
      else { setPasteError("Could not read the file. Make sure it contains questions in the required format.") }
    } catch {
      setPasteError("Failed to read the file. Try copying and pasting the text manually.")
    }
    setFileLoading(false)
    e.target.value = ""
  }

  function applyParsedQuestions() {
    setNewQuizQuestions(parsedQuestions)
    setQuizCreatorTab("manual"); setPasteText(""); setParsedQuestions([]); setPasteError("")
  }

  async function handleSaveQuiz() {
    if (!quizClassId) { setQuizError("Select a class before creating a quiz."); return }
    if (!newQuizTitle.trim()) { setQuizError("Quiz title is required."); return }
    const incomplete = newQuizQuestions.find(q => !q.q.trim() || q.options.filter(o => o.trim()).length < 2)
    if (incomplete) { setQuizError("All questions need text and at least 2 options filled in."); return }
    setQuizError(""); setQuizSaving(true)
    const res = await createQuiz({
      title: newQuizTitle.trim(), class_id: quizClassId,
      deadline: newQuizDeadline || null, shuffle_on_retry: newQuizShuffle,
      questions: newQuizQuestions.map(q => ({
        text: q.q, options: q.options.filter(o => o.trim()) as [string, string, string, string],
        correct_index: q.correct,
      })),
    })
    setQuizSaving(false)
    if ("error" in res) { setQuizError(res.error || "Failed to save quiz. Please try again."); return }
    setQuizzes(qs => [res.quiz, ...qs])
    resetQuizCreator()
    setPushedToast(`Quiz "${res.quiz.title}" pushed to students! 🚀`)
    setTimeout(() => setPushedToast(null), 3500)
  }

  async function handleUpdateDeadline(quizId: string) {
    setDeadlineUpdating(true)
    const res = await updateQuizDeadline(quizId, editingDeadlineVal || null)
    setDeadlineUpdating(false)
    if ("error" in res) return
    setQuizzes(qs => qs.map(q => q._id === quizId ? { ...q, deadline: res.quiz.deadline } : q))
    setEditingDeadlineId(null); setEditingDeadlineVal("")
  }

  async function handleDeleteQuiz(id: string) {
    if (!confirm("Delete this quiz? Students will no longer see it.")) return
    const res = await deleteQuiz(id)
    if ("error" in res) { setQuizError(res.error || "Failed to delete quiz. Please try again."); return }
    setQuizzes(qs => qs.filter(q => q._id !== id))
  }

  async function handleViewQuizResults(quizId: string) {
    setSelectedQuizId(quizId)
    setInnerView("results")
    setQuizResultsLoading(true)
    const res = await getQuizResults(quizId)
    setQuizResultsLoading(false)
    if ("error" in res) return
    setQuizResultsData(res.results)
  }

  const sortedClasses = [...ttClasses].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))

  if (innerView === "results") {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => setInnerView("list")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to quizzes
        </button>
        <h1 className="text-base font-medium text-foreground">
          Results — {quizzes.find(q => q._id === selectedQuizId)?.title ?? ""}
        </h1>
        {quizResultsLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading results…
          </div>
        ) : quizResultsData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm font-semibold text-foreground">No submissions yet</p>
            <p className="text-xs text-muted-foreground">Results will appear here once students attempt the quiz.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl overflow-hidden border overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b">
                  {["Student", "Attempts", "Best Score", "Latest Score", "Last Submitted"].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...quizResultsData].sort((a, b) => b.best_percentage - a.best_percentage).map((r, i) => (
                  <tr key={i} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-xs text-foreground font-medium">{r.student_name}</td>
                    <td className="px-4 py-2.5 text-xs text-foreground font-semibold">{r.attempt_count}/10</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.best_percentage === 100 ? "bg-emerald-100 text-emerald-700" : r.best_percentage >= 80 ? "bg-sky-100 text-sky-700" : r.best_percentage >= 60 ? "bg-amber-100 text-amber-700" : "bg-red-50 text-red-500"}`}>
                        {r.best_percentage}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.latest_percentage >= r.best_percentage ? "text-green-600" : "text-amber-600"}`}>
                        {r.latest_percentage}% {r.latest_percentage > r.best_percentage ? "↑" : r.latest_percentage < r.best_percentage ? "↓" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(r.latest_submitted_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {pushedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}>
          {pushedToast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-base font-medium text-foreground">Quizzes</h1>
        {quizClassId && (
          <Button size="sm" className="gap-1 rounded-full text-xs text-white border-0" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}
            onClick={() => { if (showQuizCreator) { resetQuizCreator() } else { setShowQuizCreator(true) } }}>
            <Plus className="w-3.5 h-3.5" /> Create Quiz
          </Button>
        )}
      </div>

      {sortedClasses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sortedClasses.map(cls => (
            <button key={cls.id}
              onClick={() => { setQuizClassId(cls.id); setShowQuizCreator(false) }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer"
              style={quizClassId === cls.id
                ? { background: "linear-gradient(135deg,#534AB7,#7970D6)", color: "white", borderColor: "transparent" }
                : { background: "transparent", color: "var(--muted-foreground)", borderColor: "var(--border)" }}>
              {cls.name ?? `Grade ${cls.grade}-${cls.section}`}
            </button>
          ))}
        </div>
      )}

      {!quizClassId && sortedClasses.length > 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <p className="text-2xl">📋</p>
          <p className="text-sm font-semibold text-foreground">Select a class to view its quizzes</p>
          <p className="text-xs text-muted-foreground">Click a class above to load quizzes for it.</p>
        </div>
      )}
      {!quizClassId && sortedClasses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <p className="text-xs text-muted-foreground">No classes assigned to you yet.</p>
        </div>
      )}

      {/* ── Quiz Creator ── */}
      {showQuizCreator && quizClassId && (
        <div className="skillio-card p-5 border-2 border-purple-200">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Create Quiz for <span style={{ color: "#534AB7" }}>{ttClasses.find(c => c.id === quizClassId)?.name ?? quizClassId}</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Quiz title *</label>
              <Input className="h-9 text-sm" placeholder="e.g. Chapter 2 — Loops Quiz" value={newQuizTitle} onChange={e => setNewQuizTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Deadline (optional)</label>
              <DatePicker withTime value={newQuizDeadline} onChange={d => setNewQuizDeadline(d)} min={new Date().toISOString().slice(0, 10)} placeholder="Pick date & time" />
            </div>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <input type="checkbox" id="shuffle-retry" checked={newQuizShuffle} onChange={e => setNewQuizShuffle(e.target.checked)} className="accent-purple-600 w-3.5 h-3.5" />
            <label htmlFor="shuffle-retry" className="text-xs text-muted-foreground cursor-pointer">Shuffle questions on each re-attempt</label>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">10 attempts per student</span>
          </div>

          <div className="flex gap-1 mb-4 p-1 rounded-[10px] bg-muted">
            {(["manual", "paste", "ai"] as const).map(tab => (
              <button key={tab} onClick={() => setQuizCreatorTab(tab)}
                className="flex-1 text-[11px] font-semibold py-1.5 rounded-[8px] transition-all cursor-pointer"
                style={quizCreatorTab === tab
                  ? { background: "var(--card)", color: "#534AB7", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
                  : { color: "var(--muted-foreground)" }}>
                {tab === "manual" ? "✏️ Manual" : tab === "paste" ? "📋 Paste" : "🤖 AI Generate"}
              </button>
            ))}
          </div>

          {/* Manual tab */}
          {quizCreatorTab === "manual" && (
            <div className="flex flex-col gap-3">
              {newQuizQuestions.map((q, qi) => (
                <div key={qi} className="border rounded-[10px] p-3 flex flex-col gap-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold" style={{ color: "#534AB7" }}>Question {qi + 1}</p>
                    <div className="flex items-center gap-1">
                      {newQuizQuestions.length < 20 && (
                        <button onClick={() => duplicateQuestion(qi)} title="Duplicate question"
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                      {newQuizQuestions.length > 1 && (
                        <button onClick={() => removeQuestion(qi)} title="Remove question"
                          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <Input className="h-8 text-xs" placeholder="Enter question text" value={q.q} onChange={e => updateQuestion(qi, e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input type="radio" name={`correct-${qi}`} checked={q.correct === oi} onChange={() => setCorrect(qi, oi)} className="accent-purple-600 flex-shrink-0" />
                        <Input className="h-7 text-xs flex-1" placeholder={`Option ${oi + 1}`} value={opt} onChange={e => updateOption(qi, oi, e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Select the correct answer with the radio button</p>
                </div>
              ))}
              {quizError && <p className="text-xs text-red-500">{quizError}</p>}
              <div className="flex gap-2 flex-wrap items-center">
                {newQuizQuestions.length < 20 && (
                  <Button size="sm" variant="outline" className="text-xs rounded-full" onClick={addQuizQuestion}>
                    <Plus className="w-3 h-3 mr-1" /> Add Question
                  </Button>
                )}
                <span className="text-[10px] text-muted-foreground">{newQuizQuestions.length}/20</span>
                <div className="flex gap-2 ml-auto">
                  <Button size="sm" className="text-xs rounded-full text-white border-0" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }} onClick={handleSaveQuiz} disabled={quizSaving}>
                    {quizSaving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Saving…</> : "Save & Push to Class"}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs rounded-full" onClick={resetQuizCreator}>Cancel</Button>
                </div>
              </div>
            </div>
          )}

          {/* Paste tab */}
          {quizCreatorTab === "paste" && (
            <div className="flex flex-col gap-3">
              <div className="rounded-[10px] border overflow-hidden">
                <button onClick={() => setShowFormatHelper(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors cursor-pointer">
                  <span>Format — paste questions like this:</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${showFormatHelper ? "rotate-180" : ""}`} />
                </button>
                {showFormatHelper && (
                  <div className="border-t px-3 pb-3 pt-2 bg-muted/30 text-[11px] font-mono text-muted-foreground leading-relaxed">
                    <p>1. What is a variable?</p>
                    <p>a) A container for data <strong style={{ color: "#534AB7" }}>*</strong></p>
                    <p>b) A loop</p>
                    <p>c) A function</p>
                    <p>d) None of the above</p>
                    <p className="mt-2 font-sans font-medium" style={{ color: "#534AB7" }}>Add * at the end of the correct option. Separate questions with a blank line.</p>
                  </div>
                )}
              </div>
              <label className="flex flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed p-5 cursor-pointer transition-colors hover:border-purple-400 hover:bg-purple-50/30" style={{ borderColor: "rgba(83,74,183,0.3)" }}>
                <input type="file" accept=".txt,.docx" className="hidden" onChange={handleFileUpload} disabled={fileLoading} />
                {fileLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#534AB7" }} /><p className="text-xs text-muted-foreground">Reading file…</p></>
                ) : (
                  <>
                    <Upload className="w-5 h-5" style={{ color: "#534AB7" }} />
                    <div className="text-center">
                      <p className="text-xs font-semibold text-foreground">Upload .txt or .docx file</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Questions are extracted and the file is not stored</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground">.txt · .docx</span>
                  </>
                )}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted-foreground font-medium">or paste directly</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <textarea
                className="w-full min-h-[150px] text-xs font-mono border rounded-[10px] p-3 bg-background resize-y focus:outline-none focus:ring-2 focus:ring-purple-300"
                placeholder={"1. What is a variable?\na) A container for data *\nb) A loop\nc) A function\nd) None of the above"}
                value={pasteText}
                onChange={e => { setPasteText(e.target.value); setParsedQuestions([]); setPasteError("") }}
              />
              {pasteError && <p className="text-xs text-red-500">{pasteError}</p>}
              {parsedQuestions.length > 0 && (
                <div className="rounded-[10px] border border-green-200 bg-green-50 p-3 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-green-700">✅ {parsedQuestions.length} question{parsedQuestions.length > 1 ? "s" : ""} parsed successfully!</p>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                    {parsedQuestions.map((pq, i) => (
                      <p key={i} className="text-[11px] text-green-800 leading-snug">
                        {i + 1}. {pq.q} <span className="text-green-600">→ correct: {pq.options[pq.correct]}</span>
                      </p>
                    ))}
                  </div>
                  <Button size="sm" className="text-xs rounded-full text-white border-0 w-fit" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }} onClick={applyParsedQuestions}>
                    Use these questions → Edit manually
                  </Button>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                {parsedQuestions.length === 0 && (
                  <Button size="sm" className="text-xs rounded-full text-white border-0" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }} onClick={parsePasteText} disabled={fileLoading}>
                    Parse Questions
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-xs rounded-full" onClick={resetQuizCreator}>Cancel</Button>
              </div>
            </div>
          )}

          {/* AI tab */}
          {quizCreatorTab === "ai" && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{ background: "rgba(83,74,183,0.12)" }}>🤖</div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI Quiz Generator</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">Type a topic → Claude generates questions instantly. Coming in the next phase!</p>
              </div>
              <span className="text-[11px] font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(83,74,183,0.1)", color: "#534AB7" }}>🚀 Coming Soon</span>
              <Button size="sm" variant="outline" className="text-xs rounded-full mt-1" onClick={() => setQuizCreatorTab("paste")}>Try Paste instead →</Button>
            </div>
          )}
        </div>
      )}

      {/* ── Quiz list ── */}
      {quizClassId && (quizzesLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading quizzes…
        </div>
      ) : quizzes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <p className="text-sm font-semibold text-foreground">No quizzes for this class yet</p>
          <p className="text-xs text-muted-foreground">Click "Create Quiz" to build and push your first quiz.</p>
        </div>
      ) : quizzes.map(quiz => {
        const isExpired = quiz.deadline ? new Date() > new Date(quiz.deadline) : false
        const deadlineLabel = quiz.deadline
          ? isExpired
            ? `Closed ${new Date(quiz.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
            : `Closes ${new Date(quiz.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
          : "No deadline"
        return (
          <div key={quiz._id} className="skillio-card p-4 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between mb-2 gap-2">
              <p className="text-xs font-semibold text-foreground">{quiz.title}</p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">{quiz.questions.length} Q</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${isExpired ? "bg-red-50 text-red-500" : quiz.deadline ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                  {deadlineLabel}
                </span>
              </div>
            </div>
            {editingDeadlineId === quiz._id ? (
              <div className="flex flex-col gap-2 mb-3">
                <DatePicker withTime value={editingDeadlineVal} onChange={d => setEditingDeadlineVal(d)} min={new Date().toISOString().slice(0, 10)} placeholder="Pick new deadline" className="w-full" />
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs rounded-full text-white border-0 px-3" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}
                    disabled={deadlineUpdating} onClick={() => handleUpdateDeadline(quiz._id)}>
                    {deadlineUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save deadline"}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs rounded-full px-3"
                    onClick={() => { setEditingDeadlineId(null); setEditingDeadlineVal("") }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">
                Created {new Date(quiz.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {quiz.shuffle_on_retry && <span className="ml-2 text-[10px]" style={{ color: "#534AB7" }}>· shuffle on retry</span>}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="text-xs rounded-full" onClick={() => handleViewQuizResults(quiz._id)}>View results</Button>
              <Button size="sm" variant="outline" className="text-xs rounded-full gap-1"
                onClick={() => { setEditingDeadlineId(quiz._id); setEditingDeadlineVal(quiz.deadline ? new Date(quiz.deadline).toISOString().slice(0, 16) : "") }}>
                <Pencil className="w-3 h-3" />Edit deadline
              </Button>
              <Button size="sm" variant="outline" className="text-xs rounded-full text-red-500 hover:text-red-600" onClick={() => handleDeleteQuiz(quiz._id)}>
                <Trash2 className="w-3 h-3 mr-1" />Delete
              </Button>
            </div>
          </div>
        )
      }))}
    </div>
  )
}
