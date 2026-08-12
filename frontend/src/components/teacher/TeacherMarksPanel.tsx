import { useState, useEffect } from "react"
import { Loader2, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SkeletonList } from "@/components/SkeletonCard"
import { getTeacherClasses } from "@/lib/userApi"
import { getExams, createExam, deleteExam, getExamResults, saveMarks, downloadReportCard, type ExamDefinition as ExamDef, type ExamResultRow } from "@/lib/marksApi"

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-xs text-muted-foreground">—</span>
  const color =
    grade === "A+" ? "bg-emerald-100 text-emerald-700" :
    grade === "A"  ? "bg-teal-100 text-teal-700" :
    grade === "B+" ? "bg-blue-100 text-blue-700" :
    grade === "B"  ? "bg-sky-100 text-sky-700" :
    grade === "C"  ? "bg-yellow-100 text-yellow-700" :
    grade === "D"  ? "bg-orange-100 text-orange-700" :
                     "bg-red-100 text-red-700"
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${color}`}>{grade}</span>
}

export function TeacherMarksPanel({ initialClassId }: { initialClassId: string }) {
  const [classes, setClasses]   = useState<Array<{ _id: string; name: string; grade: number; section: string }>>([])
  const [classId, setClassId]   = useState(initialClassId)
  const [exams, setExams]       = useState<ExamDef[]>([])
  const [examsLoaded, setExamsLoaded] = useState(false)
  const [selectedExam, setSelectedExam] = useState<ExamDef | null>(null)
  const [rows, setRows]         = useState<ExamResultRow[]>([])
  const [marksInput, setMarksInput] = useState<Record<string, Record<string, string>>>({})
  const [absentInput, setAbsentInput] = useState<Record<string, Record<string, boolean>>>({})
  const [gridLoading, setGridLoading] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState("")
  const [apiErr, setApiErr]     = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [cTitle, setCTitle]     = useState("")
  const [cType, setCType]       = useState("unit_test")
  const [cDate, setCDate]       = useState(new Date().toISOString().split("T")[0])
  const [cSubjects, setCSubjects] = useState([{ name: "", max_marks: 100 }])
  const [deleting, setDeleting] = useState<string | null>(null)
  const [rcLoading, setRcLoading] = useState<string | null>(null)
  const [rcErr, setRcErr] = useState("")

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
    setExams([]); setExamsLoaded(false); setSelectedExam(null); setRows([])
    getExams(classId).then(res => {
      if (!("error" in res)) setExams(res.exams)
      setExamsLoaded(true)
    })
  }, [classId])

  useEffect(() => {
    if (!selectedExam) return
    setGridLoading(true); setRows([])
    getExamResults(selectedExam._id).then(res => {
      if (!("error" in res)) {
        setRows(res.rows)
        const nm: Record<string, Record<string, string>>  = {}
        const na: Record<string, Record<string, boolean>> = {}
        for (const row of res.rows) {
          nm[row.student_id] = {}; na[row.student_id] = {}
          for (const sr of row.subjects) {
            nm[row.student_id][sr.subject] = sr.marks_obtained !== null ? String(sr.marks_obtained) : ""
            na[row.student_id][sr.subject] = sr.is_absent
          }
        }
        setMarksInput(nm); setAbsentInput(na)
      }
      setGridLoading(false)
    })
  }, [selectedExam])

  const handleSaveMarks = async () => {
    if (!selectedExam) return
    setSaving(true); setApiErr(""); setSaveMsg("")
    const entries = rows.flatMap(row =>
      selectedExam.subjects.map(sub => ({
        student_id:     row.student_id,
        subject:        sub.name,
        marks_obtained: absentInput[row.student_id]?.[sub.name] ? null :
                        marksInput[row.student_id]?.[sub.name] !== ""
                          ? Number(marksInput[row.student_id]?.[sub.name] ?? 0)
                          : null,
        is_absent:      absentInput[row.student_id]?.[sub.name] ?? false,
      }))
    )
    const res = await saveMarks(selectedExam._id, entries)
    if ("error" in res) { setApiErr(res.error) }
    else { setSaveMsg("Marks saved!"); setTimeout(() => setSaveMsg(""), 3000) }
    setSaving(false)
  }

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cTitle.trim() || !cDate || !classId) return
    if (cSubjects.some(s => !s.name.trim() || s.max_marks < 1)) { setApiErr("Each subject needs a name and max marks ≥ 1"); return }
    setCreating(true); setApiErr("")
    const res = await createExam({ class_id: classId, title: cTitle.trim(), exam_type: cType, date: cDate, subjects: cSubjects.filter(s => s.name.trim()) })
    if ("error" in res) { setApiErr(res.error) }
    else {
      setExams(prev => [res.exam, ...prev])
      setShowCreate(false); setCTitle(""); setCType("unit_test"); setCDate(new Date().toISOString().split("T")[0]); setCSubjects([{ name: "", max_marks: 100 }])
    }
    setCreating(false)
  }

  const handleDeleteExam = async (examId: string) => {
    setDeleting(examId)
    const res = await deleteExam(examId)
    if (!("error" in res)) {
      setExams(prev => prev.filter(e => e._id !== examId))
      if (selectedExam?._id === examId) setSelectedExam(null)
    }
    setDeleting(null)
  }

  const EXAM_TYPE_LABELS: Record<string, string> = { unit_test: "Unit Test", mid_term: "Mid-Term", final: "Final", practical: "Practical", other: "Other" }

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-foreground">Marks & Grades</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Record exam marks for your students</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setApiErr("") }} className="h-8 text-xs gap-1 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Create Exam
        </Button>
      </div>

      {/* Class selector */}
      {classes.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {classes.map(c => (
            <button key={c._id} onClick={() => setClassId(c._id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${classId === c._id ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:border-primary/50"}`}>
              {c.name || `Class ${c.grade}${c.section}`}
            </button>
          ))}
        </div>
      )}

      {apiErr && <div className="mb-3 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(226,75,74,0.08)", color: "#E24B4A", border: "1px solid rgba(226,75,74,0.2)" }}>{apiErr}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Exam list */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Exams</p>
          {!examsLoaded && <SkeletonList count={3} lines={2} />}
          {examsLoaded && exams.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-xl">
              No exams yet. Create your first exam to get started.
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {exams.map(exam => (
              <div key={exam._id} onClick={() => setSelectedExam(exam)}
                className={`flex items-start justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${selectedExam?._id === exam._id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{exam.title}</p>
                  <p className="text-[11px] text-muted-foreground">{EXAM_TYPE_LABELS[exam.exam_type] ?? exam.exam_type} · {new Date(exam.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDeleteExam(exam._id) }} disabled={deleting === exam._id} className="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors ml-1 shrink-0">
                  {deleting === exam._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Marks grid */}
        <div>
          {!selectedExam && (
            <div className="flex items-center justify-center h-40 text-xs text-muted-foreground border border-dashed rounded-xl">
              Select an exam to enter marks
            </div>
          )}
          {selectedExam && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold">{selectedExam.title}</p>
                  <p className="text-[11px] text-muted-foreground">{selectedExam.subjects.map(s => `${s.name} (/${s.max_marks})`).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {saveMsg && <span className="text-xs text-emerald-600 font-medium">{saveMsg}</span>}
                  <Button onClick={handleSaveMarks} disabled={saving || gridLoading} className="h-7 text-xs rounded-lg">
                    {saving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Saving…</> : "Save Marks"}
                  </Button>
                </div>
              </div>

              {gridLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading students…</div>}
              {!gridLoading && rows.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-xl">No students in this class.</div>}
              {!gridLoading && rows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[140px]">Student</th>
                        {selectedExam.subjects.map(sub => (
                          <th key={sub.name} className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[90px]">
                            <div>{sub.name}</div>
                            <div className="text-[10px] font-normal">/{sub.max_marks}</div>
                          </th>
                        ))}
                        <th className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[70px]">Total</th>
                        <th className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[55px]">Grade</th>
                        <th className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[100px]">Report Card</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, ri) => {
                        const inputs = marksInput[row.student_id] ?? {}
                        const absents = absentInput[row.student_id] ?? {}
                        const validSubs = selectedExam.subjects.filter(s => !absents[s.name] && inputs[s.name] !== "")
                        const tot = validSubs.reduce((acc, s) => acc + (Number(inputs[s.name]) || 0), 0)
                        const maxTot = validSubs.reduce((acc, s) => acc + s.max_marks, 0)
                        const pct = maxTot > 0 ? Math.round((tot / maxTot) * 100) : null
                        return (
                          <tr key={row.student_id} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                            <td className={`px-3 py-1.5 font-medium sticky left-0 z-10 ${ri % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>{row.student_name}</td>
                            {selectedExam.subjects.map(sub => {
                              const absent = absents[sub.name] ?? false
                              return (
                                <td key={sub.name} className="px-1.5 py-1 text-center">
                                  {absent ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <span className="text-[11px] text-red-500 font-bold">AB</span>
                                      <input type="checkbox" checked className="w-3 h-3 accent-red-500"
                                        onChange={() => setAbsentInput(prev => ({ ...prev, [row.student_id]: { ...(prev[row.student_id] ?? {}), [sub.name]: false } }))} />
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-0.5">
                                      <input type="number" min={0} max={sub.max_marks} value={inputs[sub.name] ?? ""}
                                        onChange={e => setMarksInput(prev => ({ ...prev, [row.student_id]: { ...(prev[row.student_id] ?? {}), [sub.name]: e.target.value } }))}
                                        className="w-14 h-7 text-center text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 px-1"
                                        placeholder="—" />
                                      <button title="Mark absent" onClick={() => setAbsentInput(prev => ({ ...prev, [row.student_id]: { ...(prev[row.student_id] ?? {}), [sub.name]: true } }))}
                                        className="p-0.5 rounded text-muted-foreground hover:text-red-500 transition-colors">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                            <td className="px-2 py-1 text-center font-semibold">{maxTot > 0 ? `${tot}/${maxTot}` : "—"}</td>
                            <td className="px-2 py-1 text-center"><GradeBadge grade={pct !== null ? (pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B+" : pct >= 60 ? "B" : pct >= 50 ? "C" : pct >= 40 ? "D" : "F") : null} /></td>
                            <td className="px-2 py-1 text-center">
                              <button
                                disabled={rcLoading === row.student_id}
                                onClick={async () => {
                                  setRcLoading(row.student_id); setRcErr("")
                                  const err = await downloadReportCard(row.student_id)
                                  setRcLoading(null)
                                  if (err) setRcErr(err.error)
                                }}
                                className="text-[11px] px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50 font-medium"
                              >
                                {rcLoading === row.student_id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Download"}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {rcErr && <p className="text-xs text-red-500 mt-2 px-1">{rcErr}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Create Exam modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-5" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Create Exam</h3>
              <button onClick={() => { setShowCreate(false); setApiErr("") }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            {apiErr && <div className="mb-3 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(226,75,74,0.08)", color: "#E24B4A", border: "1px solid rgba(226,75,74,0.2)" }}>{apiErr}</div>}
            <form onSubmit={handleCreateExam} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium">Exam title</Label>
                <Input value={cTitle} onChange={e => setCTitle(e.target.value)} placeholder="e.g. Unit Test 1" className="h-8 text-xs" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-medium">Type</Label>
                  <select value={cType} onChange={e => setCType(e.target.value)} className="h-8 text-xs border border-border rounded-lg bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary/50">
                    <option value="unit_test">Unit Test</option>
                    <option value="mid_term">Mid-Term</option>
                    <option value="final">Final</option>
                    <option value="practical">Practical</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-medium">Date</Label>
                  <Input type="date" value={cDate} onChange={e => setCDate(e.target.value)} className="h-8 text-xs" required />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-medium">Subjects & max marks</Label>
                  <button type="button" onClick={() => setCSubjects(prev => [...prev, { name: "", max_marks: 100 }])} className="text-[11px] text-primary hover:underline">+ Add subject</button>
                </div>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {cSubjects.map((s, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <Input value={s.name} onChange={e => setCSubjects(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Subject name" className="h-7 text-xs flex-1" />
                      <input type="number" min={1} value={s.max_marks} onChange={e => setCSubjects(prev => prev.map((x, j) => j === i ? { ...x, max_marks: Number(e.target.value) } : x))}
                        className="w-14 h-7 text-xs border border-border rounded-lg bg-background text-center focus:outline-none focus:ring-1 focus:ring-primary/50" />
                      {cSubjects.length > 1 && (
                        <button type="button" onClick={() => setCSubjects(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={creating} className="h-8 text-xs rounded-xl mt-1">
                {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Creating…</> : "Create Exam"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
