import { useState, useEffect, useMemo } from "react"
import { Loader2, Plus, Trash2, ChevronRight, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import {
  getActiveChallenges, createChallenge, deleteChallenge, getChallengeSubmissions,
  type CodeChallenge,
} from "@/lib/studentApi"
import { getTeacherClasses } from "@/lib/userApi"

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

interface Submission { student_name: string; code: string; language: string; submitted_at: string }

interface Props {
  ttClasses: TeacherClass[]
}

function diffColor(d: string) {
  if (d === "Easy")   return "bg-emerald-100 text-emerald-700"
  if (d === "Medium") return "bg-amber-100 text-amber-700"
  return "bg-red-100 text-red-600"
}

export function TeacherLiveCodingPanel({ ttClasses: initialClasses }: Props) {
  const [classes,            setClasses]            = useState<TeacherClass[]>(initialClasses)
  const [problemStatements,  setProblemStatements]  = useState<CodeChallenge[]>([])
  const [problemsLoading,    setProblemsLoading]    = useState(true)
  const [problemError,       setProblemError]       = useState("")
  const [showProblemModal,   setShowProblemModal]   = useState(false)
  const [newProblem,         setNewProblem]         = useState({
    title: "", difficulty: "Easy", language: "javascript",
    description: "", constraints: "", expectedOutput: "", deadline: "",
  })
  const [problemClassIds,    setProblemClassIds]    = useState<Set<string>>(new Set())
  const [submissionsMap,     setSubmissionsMap]     = useState<Record<string, Submission[]>>({})
  const [submissionsLoading, setSubmissionsLoading] = useState<Record<string, boolean>>({})
  const [expandedSubs,       setExpandedSubs]       = useState<Set<string>>(new Set())
  const [expandedCode,       setExpandedCode]       = useState<{ challengeId: string; idx: number } | null>(null)
  const [pushedToast,        setPushedToast]        = useState<string | null>(null)

  const groupedChallenges = useMemo(() => {
    const groups = new globalThis.Map<string, { ids: string[]; classIds: string[]; rep: CodeChallenge }>()
    for (const ps of problemStatements) {
      const key = ps.title ?? ps._id
      if (groups.has(key)) {
        groups.get(key)!.ids.push(ps._id)
        if (ps.class_id) groups.get(key)!.classIds.push(ps.class_id)
      } else {
        groups.set(key, { ids: [ps._id], classIds: ps.class_id ? [ps.class_id] : [], rep: ps })
      }
    }
    return Array.from(groups.values())
  }, [problemStatements])

  useEffect(() => {
    setProblemsLoading(true)
    getActiveChallenges().then(res => {
      setProblemsLoading(false)
      if (!("error" in res)) setProblemStatements(res.challenges)
    })
  }, [])

  useEffect(() => {
    if (problemStatements.length === 0) return
    loadAllSubmissions(problemStatements)
  }, [problemStatements])

  function loadAllSubmissions(challenges: CodeChallenge[]) {
    if (challenges.length === 0) return
    const loadingState: Record<string, boolean> = {}
    challenges.forEach(c => { loadingState[c._id] = true })
    setSubmissionsLoading(prev => ({ ...prev, ...loadingState }))
    challenges.forEach(c => {
      getChallengeSubmissions(c._id).then(res => {
        setSubmissionsLoading(prev => ({ ...prev, [c._id]: false }))
        if (!("error" in res)) setSubmissionsMap(prev => ({ ...prev, [c._id]: res.submissions }))
      })
    })
  }

  function refreshSubmissions() {
    setSubmissionsMap({})
    problemStatements.forEach(c => {
      getChallengeSubmissions(c._id).then(res => {
        if (!("error" in res)) setSubmissionsMap(prev => ({ ...prev, [c._id]: res.submissions }))
      })
    })
  }

  async function handleDeleteProblemGroup(ids: string[], title: string) {
    if (!confirm(`Delete "${title}"? Students will no longer see it.`)) return
    for (const id of ids) {
      const res = await deleteChallenge(id)
      if ("error" in res) { setProblemError(res.error || "Failed to delete challenge."); return }
    }
    setProblemStatements(ps => ps.filter(p => !ids.includes(p._id)))
  }

  async function handleCreateProblem(e: React.FormEvent) {
    e.preventDefault()
    if (problemClassIds.size === 0) { setProblemError("Select at least one class to push to."); return }
    setProblemError("")
    const created: CodeChallenge[] = []
    for (const classId of problemClassIds) {
      const res = await createChallenge({
        title: newProblem.title, class_id: classId,
        difficulty: newProblem.difficulty, language: newProblem.language,
        description: newProblem.description, constraints: newProblem.constraints,
        expected_output: newProblem.expectedOutput, deadline: newProblem.deadline || undefined,
      })
      if ("error" in res) { setProblemError(res.error || "Failed to create challenge."); return }
      created.push(res.challenge)
    }
    setProblemStatements(ps => [...created, ...ps])
    setNewProblem({ title: "", difficulty: "Easy", language: "javascript", description: "", constraints: "", expectedOutput: "", deadline: "" })
    setProblemClassIds(new Set())
    setShowProblemModal(false)
    const classCount = created.length
    setPushedToast(`"${created[0].title}" pushed to ${classCount} class${classCount > 1 ? "es" : ""}! 🚀`)
    setTimeout(() => setPushedToast(null), 3500)
  }

  function handleOpenModal() {
    if (classes.length === 0) {
      getTeacherClasses().then(res => {
        if (!("error" in res)) {
          setClasses(res.classes)
          setProblemClassIds(new Set(res.classes.map((c: TeacherClass) => c.id)))
        }
      })
    } else {
      setProblemClassIds(new Set(classes.map(c => c.id)))
    }
    setShowProblemModal(p => !p)
  }

  return (
    <div className="flex flex-col gap-4">
      {pushedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}>
          {pushedToast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-medium text-foreground">Problem Statements</h1>
          <p className="text-xs text-muted-foreground">Create and push coding challenges to your students</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1 rounded-full text-xs" onClick={refreshSubmissions}>
            <RotateCcw className="w-3 h-3" /> Refresh
          </Button>
          <Button size="sm" className="gap-1 rounded-full text-xs text-white border-0" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }} onClick={handleOpenModal}>
            <Plus className="w-3.5 h-3.5" /> Create New Problem
          </Button>
        </div>
      </div>

      {/* Create Problem form */}
      {showProblemModal && (
        <div className="skillio-card p-5 border-2 border-purple-200">
          <h3 className="text-sm font-semibold text-foreground mb-4">New Problem Statement</h3>
          <form onSubmit={handleCreateProblem} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
                <Input className="h-9 text-sm" required placeholder="e.g. Sum of Two Numbers" value={newProblem.title} onChange={e => setNewProblem(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Deadline</label>
                <DatePicker value={newProblem.deadline} onChange={d => setNewProblem(p => ({ ...p, deadline: d }))} min={new Date().toISOString().slice(0, 10)} placeholder="Pick a deadline" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Difficulty</label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" style={{ colorScheme: "light dark" }} value={newProblem.difficulty} onChange={e => setNewProblem(p => ({ ...p, difficulty: e.target.value }))}>
                  {["Easy", "Medium", "Hard"].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Language</label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" style={{ colorScheme: "light dark" }} value={newProblem.language} onChange={e => setNewProblem(p => ({ ...p, language: e.target.value }))}>
                  {[{ label: "JavaScript", value: "javascript" }, { label: "Python", value: "python" }, { label: "HTML", value: "html" }].map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description *</label>
              <textarea required className="w-full text-xs p-2 rounded-lg resize-y bg-background focus:outline-none focus:ring-1 focus:ring-primary border" rows={3} placeholder="Describe the problem..." value={newProblem.description} onChange={e => setNewProblem(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Constraints</label>
              <textarea className="w-full text-xs p-2 rounded-lg resize-y bg-background focus:outline-none focus:ring-1 focus:ring-primary border" rows={2} placeholder="e.g. 1 ≤ n ≤ 1000" value={newProblem.constraints} onChange={e => setNewProblem(p => ({ ...p, constraints: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Expected Output</label>
              <textarea className="w-full text-xs font-mono p-2 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y" rows={3} placeholder={"e.g.\nsum(3, 5) → 8\nsum(-1, 1) → 0"} value={newProblem.expectedOutput} onChange={e => setNewProblem(p => ({ ...p, expectedOutput: e.target.value }))} />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-muted-foreground font-medium">Push to classes *</label>
                <button type="button" className="text-[11px] font-semibold text-primary hover:underline"
                  onClick={() => {
                    const allIds = new Set(classes.map(c => c.id))
                    setProblemClassIds(problemClassIds.size === allIds.size ? new Set() : allIds)
                  }}>
                  {problemClassIds.size === classes.length && classes.length > 0 ? "Deselect all" : "Select all"}
                </button>
              </div>
              {classes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No classes assigned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {classes.map(cls => {
                    const selected = problemClassIds.has(cls.id)
                    return (
                      <button key={cls.id} type="button"
                        onClick={() => setProblemClassIds(prev => {
                          const next = new Set(prev)
                          selected ? next.delete(cls.id) : next.add(cls.id)
                          return next
                        })}
                        className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${selected ? "border-[#534AB7] bg-[#534AB7] text-white" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                        {cls.name ?? `Grade ${cls.grade}${cls.section}`}
                      </button>
                    )
                  })}
                </div>
              )}
              {problemClassIds.size > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">{problemClassIds.size} class{problemClassIds.size > 1 ? "es" : ""} selected</p>
              )}
            </div>

            {problemError && <p className="text-xs text-red-500">{problemError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="rounded-full text-xs text-white border-0" style={{ background: "linear-gradient(135deg,#534AB7,#7970D6)" }}>
                Push to {problemClassIds.size > 0 ? `${problemClassIds.size} class${problemClassIds.size > 1 ? "es" : ""}` : "Class"}
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-full text-xs" onClick={() => { setShowProblemModal(false); setProblemError("") }}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {problemError && !showProblemModal && <p className="text-xs text-red-500">{problemError}</p>}

      {problemsLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading challenges…
        </div>
      ) : problemStatements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <p className="text-sm font-semibold text-foreground">No challenges yet</p>
          <p className="text-xs text-muted-foreground">Click "New Problem" to create and push your first challenge to students.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupedChallenges.map(({ ids, classIds, rep }) => {
            const psSubs      = ids.flatMap(id => submissionsMap[id] ?? [])
            const subCount    = psSubs.length
            const isLoadingSubs = ids.some(id => submissionsLoading[id])
            const subOpen     = expandedSubs.has(rep._id)
            const toggleSubs  = () => setExpandedSubs(prev => {
              const next = new Set(prev)
              next.has(rep._id) ? next.delete(rep._id) : next.add(rep._id)
              return next
            })
            return (
              <div key={rep._id} className="skillio-card p-4 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground leading-tight">{rep.title}</h3>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${diffColor(rep.difficulty)}`}>{rep.difficulty}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">{rep.language}</span>
                  </div>
                </div>

                {classIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {classIds.map(cid => {
                      const cls = classes.find(c => c.id === cid)
                      const label = cls ? (cls.name ?? `Grade ${cls.grade}${cls.section}`) : cid.slice(-4)
                      return <span key={cid} className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#534AB7]/15 text-[#534AB7]">{label}</span>
                    })}
                  </div>
                )}

                <p className="text-xs text-muted-foreground line-clamp-2">{rep.description}</p>
                {rep.expected_output && (
                  <pre className="text-[11px] font-mono text-muted-foreground bg-muted rounded px-2 py-1 whitespace-pre-wrap">{rep.expected_output}</pre>
                )}

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Deadline: <span className="font-medium text-foreground">{rep.deadline ? new Date(rep.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No deadline"}</span></span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">✓ Live</span>
                </div>

                <div className="rounded-[10px] p-3 flex flex-col gap-2" style={{ background: "rgba(83,74,183,0.05)", border: "1px solid rgba(83,74,183,0.12)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isLoadingSubs
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-[#534AB7]" /><span className="text-[11px] text-muted-foreground">Loading submissions…</span></>
                        : <><span className="text-base font-bold text-[#534AB7] leading-none">{subCount}</span><span className="text-[11px] text-muted-foreground">{subCount === 1 ? "submission" : "submissions"}</span></>
                      }
                    </div>
                    {subCount > 0 && (
                      <button onClick={toggleSubs} className="cursor-pointer text-[10px] font-semibold text-[#534AB7] flex items-center gap-0.5 hover:underline">
                        {subOpen ? "Hide" : "View all"}
                        <ChevronRight className={`w-3 h-3 transition-transform ${subOpen ? "rotate-90" : ""}`} />
                      </button>
                    )}
                  </div>
                  {subOpen && (
                    <div className="flex flex-col gap-2 mt-1">
                      {psSubs.map((s, i) => {
                        const codeOpen = expandedCode?.challengeId === rep._id && expandedCode.idx === i
                        return (
                          <div key={i} className="rounded-lg overflow-hidden border">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: "#534AB7" }}>
                                  {s.student_name?.[0]?.toUpperCase() ?? "?"}
                                </div>
                                <span className="text-xs font-semibold text-foreground">{s.student_name}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{s.language}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">{new Date(s.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                                <button onClick={() => setExpandedCode(codeOpen ? null : { challengeId: rep._id, idx: i })}
                                  className="cursor-pointer text-[10px] font-semibold text-[#534AB7] hover:underline">
                                  {codeOpen ? "Hide code" : "View code"}
                                </button>
                              </div>
                            </div>
                            {codeOpen && (
                              <pre className="text-[11px] font-mono p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed" style={{ background: "#13111f", color: "#e2dff8", maxHeight: 200, overflowY: "auto" }}>
                                {s.code}
                              </pre>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {subCount === 0 && <p className="text-[11px] text-muted-foreground">No submissions yet.</p>}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="text-xs rounded-full h-7 px-3 text-red-500 hover:text-red-600" onClick={() => handleDeleteProblemGroup(ids, rep.title)}>
                    <Trash2 className="w-3 h-3 mr-1" />Delete
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
