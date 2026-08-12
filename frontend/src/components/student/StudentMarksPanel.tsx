import { useState, useEffect } from "react"
import { Loader2, ChevronRight, FileSpreadsheet } from "lucide-react"
import { getMyResults, downloadMyReportCard, type StudentExamResult } from "@/lib/marksApi"
import { ErrorCard } from "@/components/ui/ErrorCard"

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

const EXAM_TYPE_LABELS: Record<string, string> = {
  unit_test: "Unit Test",
  mid_term: "Mid-Term",
  final: "Final",
  practical: "Practical",
  other: "Other",
}

export function StudentMarksPanel() {
  const [exams,     setExams]     = useState<StudentExamResult[]>([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [rcLoading, setRcLoading] = useState(false)
  const [rcErr,     setRcErr]     = useState("")

  function load() {
    setLoading(true); setLoadError(null)
    getMyResults().then(res => {
      if ("error" in res) { setLoadError(res.error) } else { setExams(res.exams) }
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-foreground">My Marks</h2>
        {!loading && exams.length > 0 && (
          <button
            disabled={rcLoading}
            onClick={async () => {
              setRcLoading(true); setRcErr("")
              const err = await downloadMyReportCard()
              setRcLoading(false)
              if (err) setRcErr(err.error)
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors font-medium disabled:opacity-50"
          >
            {rcLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
            Download Report Card
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-5">Your exam results across all subjects</p>
      {rcErr && <p className="text-xs text-red-500 mb-3">{rcErr}</p>}

      {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center py-12"><Loader2 className="w-4 h-4 animate-spin" />Loading marks…</div>}
      {!loading && loadError && <ErrorCard message={loadError} onRetry={load} />}
      {!loading && !loadError && exams.length === 0 && (
        <div className="text-center py-16 border border-dashed rounded-2xl">
          <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No marks yet</p>
          <p className="text-xs text-muted-foreground mt-1">Your teacher hasn't recorded any exam marks yet.</p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {exams.map(exam => {
          const isOpen = expanded === exam.exam_id
          const pctColor = exam.overall_pct !== null
            ? exam.overall_pct >= 75 ? "text-emerald-600" : exam.overall_pct >= 50 ? "text-yellow-600" : "text-red-500"
            : "text-muted-foreground"
          return (
            <div key={exam.exam_id} className="rounded-xl border border-border overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : exam.exam_id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: "rgba(83,74,183,0.1)" }}>📝</div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{exam.title}</p>
                    <p className="text-[11px] text-muted-foreground">{EXAM_TYPE_LABELS[exam.exam_type] ?? exam.exam_type} · {new Date(exam.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {exam.overall_pct !== null ? (
                    <>
                      <span className={`text-sm font-bold ${pctColor}`}>{exam.overall_pct}%</span>
                      <GradeBadge grade={exam.overall_grade} />
                    </>
                  ) : <span className="text-xs text-muted-foreground">Pending</span>}
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border px-4 py-3 bg-muted/20">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {exam.subjects.map(sr => (
                      <div key={sr.subject} className="bg-card rounded-xl p-2.5 border border-border">
                        <p className="text-[11px] font-medium text-muted-foreground truncate">{sr.subject}</p>
                        {sr.is_absent ? (
                          <p className="text-sm font-bold text-red-500 mt-0.5">Absent</p>
                        ) : sr.marks_obtained !== null ? (
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-sm font-bold text-foreground">{sr.marks_obtained}<span className="text-[11px] font-normal text-muted-foreground">/{sr.max_marks}</span></span>
                            <GradeBadge grade={sr.grade} />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">—</p>
                        )}
                      </div>
                    ))}
                  </div>
                  {exam.total_max > 0 && (
                    <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Total: <strong className="text-foreground">{exam.total_obtained}/{exam.total_max}</strong></span>
                      {exam.overall_pct !== null && <span>Percentage: <strong className={pctColor}>{exam.overall_pct}%</strong></span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
