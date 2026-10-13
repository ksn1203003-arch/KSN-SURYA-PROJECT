// ─────────────────────────────────────────────────────────────────────────────
// components/teacher/CertificateCompletionPanel.tsx — "Who has completed" panel on the
// Certificates screen (teacher and admin). Certificates are never created automatically:
// the teacher picks a subject, sees who completed every lesson, ticks students, chooses a
// template, confirms, and only then are certificates issued.
// Loads data only when a class/subject is chosen — no polling.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react"
import { Loader2, CheckCircle2, RotateCcw, Award } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SkeletonList } from "@/components/SkeletonCard"
import {
  getCompletionSubjects, getSubjectCompletion, issueCompletionCertificates,
  type SubjectCompletion, type SubjectCompletionStudent, type CertTemplateKey,
} from "@/lib/studentApi"

const TEMPLATES: ReadonlyArray<{ key: CertTemplateKey; icon: string; label: string }> = [
  { key: "course_completion",       icon: "🎓", label: "Course Completion" },
  { key: "academic_excellence",     icon: "⭐", label: "Academic Excellence" },
  { key: "outstanding_achievement", icon: "🏆", label: "Outstanding Achievement" },
]

interface Props {
  classId: string
  /** Called after certificates were issued, so the certificate lists below can refresh */
  onIssued: () => void
  /** Bump after a certificate is revoked elsewhere on the screen, so completion is re-read */
  refreshKey?: number
}

function canIssueTo(s: SubjectCompletionStudent): boolean {
  return s.completed && (!s.certificate || s.certificate.status === "revoked")
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export function CertificateCompletionPanel({ classId, onIssued, refreshKey = 0 }: Props) {
  const [subjects, setSubjects]               = useState<string[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [subjectsError, setSubjectsError]     = useState("")
  const [subject, setSubject]                 = useState<string | null>(null)
  // The class the chosen subject belongs to — avoids asking for the old subject in a new class
  const [subjectClassId, setSubjectClassId]   = useState("")
  const [subjectsReload, setSubjectsReload]   = useState(0)
  const issueButtonRef   = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const [data, setData]                       = useState<SubjectCompletion | null>(null)
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState("")
  const [selected, setSelected]               = useState<Set<string>>(new Set())
  const [template, setTemplate]               = useState<CertTemplateKey | null>(null)
  const [confirming, setConfirming]           = useState(false)
  const [issuing, setIssuing]                 = useState(false)
  const [result, setResult]                   = useState<{ issued: number; skipped: Array<{ name: string; reason: string }> } | null>(null)
  const [reloadKey, setReloadKey]             = useState(0)

  // Subjects this teacher may certify in the chosen class
  useEffect(() => {
    let cancelled = false
    setSubjects([]); setSubject(null); setSubjectClassId(""); setData(null); setSubjectsError(""); setResult(null)
    setSubjectsLoading(true)
    getCompletionSubjects(classId).then(res => {
      if (cancelled) return
      setSubjectsLoading(false)
      if ("error" in res) { setSubjectsError(res.error); return }
      setSubjects(res.subjects)
      if (res.subjects.length > 0) { setSubject(res.subjects[0]); setSubjectClassId(classId) }
    })
    return () => { cancelled = true }
  }, [classId, subjectsReload])

  // Completion for the chosen subject
  useEffect(() => {
    if (!subject || subjectClassId !== classId) return
    let cancelled = false
    setLoading(true); setError(""); setSelected(new Set()); setConfirming(false)
    getSubjectCompletion(classId, subject).then(res => {
      if (cancelled) return
      setLoading(false)
      if ("error" in res) { setError(res.error); setData(null); return }
      setData(res)
    })
    return () => { cancelled = true }
  }, [classId, subject, subjectClassId, reloadKey, refreshKey])

  // Keyboard focus follows the confirmation step instead of falling back to the page top
  useEffect(() => {
    if (confirming) confirmButtonRef.current?.focus()
  }, [confirming])

  const ready     = data?.students.filter(canIssueTo) ?? []
  const certified = data?.students.filter(s => s.certificate?.status === "active").length ?? 0
  const completedCount = data?.students.filter(s => s.completed).length ?? 0
  const templateLabel = TEMPLATES.find(t => t.key === template)?.label ?? ""

  function toggle(id: string, on: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
    setConfirming(false)
  }

  async function issue() {
    if (!subject || !template || selected.size === 0) return
    setIssuing(true); setError("")
    const res = await issueCompletionCertificates({ class_id: classId, subject, student_ids: [...selected], cert_template: template })
    setIssuing(false)
    setConfirming(false)
    if ("error" in res) { setError(res.error); return }
    issueButtonRef.current?.focus()
    setResult({ issued: res.issued, skipped: res.skipped.map(s => ({ name: s.name, reason: s.reason })) })
    setSelected(new Set())
    setReloadKey(k => k + 1)
    if (res.issued > 0) onIssued()
  }

  return (
    <section className="skillio-card overflow-hidden" aria-labelledby="completion-heading">
      <div className="px-4 py-3 bg-muted/30 border-b flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-ts-purple" aria-hidden="true" />
          <h2 id="completion-heading" className="text-sm font-bold text-foreground">Who has completed a subject</h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A student completes a subject when they have marked every lesson in every module as done. Choose who should get a certificate — nothing is issued automatically.
        </p>
        {subjects.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Subject">
            {subjects.map(s => (
              <button key={s} type="button" aria-pressed={subject === s}
                onClick={() => { setSubject(s); setSubjectClassId(classId); setResult(null) }}
                className={`text-xs font-semibold px-3 py-2.5 rounded-full border transition-colors cursor-pointer ${subject === s ? "bg-ts-purple text-white border-transparent" : "text-muted-foreground border-border hover:bg-muted"}`}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        {subjectsLoading && <SkeletonList count={2} lines={1} />}

        {!subjectsLoading && subjectsError && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <span className="text-xs text-destructive">{subjectsError}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs rounded-[20px] gap-1" onClick={() => setSubjectsReload(k => k + 1)}>
              <RotateCcw className="w-3 h-3" aria-hidden="true" />Try again
            </Button>
          </div>
        )}

        {!subjectsLoading && !subjectsError && subjects.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No subjects here that you are assigned to teach and that have lessons. If you teach a subject in this class,
            ask your school admin to add you as its subject teacher (Admin → Classes); completion then shows up here.
          </p>
        )}

        {subject && loading && <SkeletonList count={4} lines={1} showAvatar />}

        {subject && !loading && error && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <span className="text-xs text-destructive">{error}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs rounded-[20px] gap-1" onClick={() => setReloadKey(k => k + 1)}>
              <RotateCcw className="w-3 h-3" aria-hidden="true" />Try again
            </Button>
          </div>
        )}

        {result && (
          <div role="status" className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs">
            <p className="font-semibold text-green-700 dark:text-green-400">
              <CheckCircle2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />
              {result.issued} certificate{result.issued !== 1 ? "s" : ""} issued.
            </p>
            {result.skipped.length > 0 && (
              <ul className="mt-1 text-muted-foreground list-disc pl-5">
                {result.skipped.map((s, i) => <li key={i}>{s.name || "A student"} — {s.reason}</li>)}
              </ul>
            )}
          </div>
        )}

        {subject && !loading && !error && data && (
          <>
            {data.empty_modules.length > 0 && (
              <p className="text-[11px] rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-700 dark:text-amber-400">
                {data.empty_modules.length === 1 ? `Module "${data.empty_modules[0]}" has` : `${data.empty_modules.length} modules have`} no lessons yet,
                so nobody can complete {subject} until lessons are added or the empty module is removed.
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              {completedCount} of {data.students.length} completed · {certified} already certified · {ready.length} ready for a certificate
            </p>

            {data.students.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No students in this class yet.</p>
            ) : (
              <div className="border rounded-[8px] divide-y divide-border max-h-80 overflow-y-auto">
                {ready.length > 1 && (
                  <label className="flex items-center gap-2.5 px-3 py-2 bg-muted/20 cursor-pointer text-[11px] font-semibold text-foreground">
                    <input type="checkbox" className="rounded"
                      checked={selected.size === ready.length}
                      onChange={e => { setSelected(e.target.checked ? new Set(ready.map(s => s.student_id)) : new Set()); setConfirming(false) }} />
                    Select everyone who is ready ({ready.length})
                  </label>
                )}
                {data.students.map(s => {
                  const eligible = canIssueTo(s)
                  const pct = s.total > 0 ? Math.round((s.viewed / s.total) * 100) : 0
                  return (
                    <label key={s.student_id} className={`flex items-center gap-2.5 px-3 py-2 ${eligible ? "cursor-pointer hover:bg-muted/30" : "cursor-default"}`}>
                      <input type="checkbox" className="rounded" disabled={!eligible}
                        aria-label={eligible ? `Select ${s.name}`
                          : s.certificate?.status === "active" ? `${s.name} — already certified`
                          : `${s.name} — ${s.viewed} of ${s.total} lessons done`}
                        checked={selected.has(s.student_id)} onChange={e => toggle(s.student_id, e.target.checked)} />
                      <span className="text-xs text-foreground flex-1 min-w-0 truncate">{s.name}</span>
                      <span className="hidden sm:block w-24 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                        <span className="block h-full rounded-full bg-ts-purple" style={{ width: `${pct}%` }} />
                      </span>
                      {s.certificate?.status === "active" ? (
                        <span className="text-[10px] font-semibold text-green-700 dark:text-green-400 shrink-0">Certified {formatDate(s.certificate.issued_at)}</span>
                      ) : s.completed ? (
                        <span className="text-[10px] font-semibold text-ts-purple shrink-0">
                          Completed{s.certificate?.status === "revoked" ? " · previous certificate revoked" : ""}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground shrink-0">{s.viewed}/{s.total} lessons</span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}

            {ready.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground" id="template-label">Certificate template</p>
                <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="template-label">
                  {TEMPLATES.map(t => (
                    <button key={t.key} type="button" aria-pressed={template === t.key}
                      onClick={() => { setTemplate(t.key); setConfirming(false) }}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-[10px] border text-center transition-colors cursor-pointer ${template === t.key ? "bg-ts-purple text-white border-ts-purple" : "border-border text-muted-foreground hover:bg-muted"}`}>
                      <span className="text-lg" aria-hidden="true">{t.icon}</span>
                      <span className="text-[10px] font-semibold leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>

                {!confirming ? (
                  <Button ref={issueButtonRef} size="sm" className="w-fit text-xs rounded-[20px] text-white border-0 bg-ts-purple hover:bg-ts-purple/90"
                    disabled={selected.size === 0 || !template}
                    onClick={() => setConfirming(true)}>
                    Issue certificates ({selected.size})
                  </Button>
                ) : (
                  <div role="alertdialog" aria-label="Confirm issuing certificates" className="flex items-center justify-between gap-2 flex-wrap rounded-lg border border-ts-purple/30 bg-ts-purple/5 px-3 py-2">
                    <p className="text-xs text-foreground">
                      Issue <strong>"{templateLabel}"</strong> for <strong>{subject}</strong> to <strong>{selected.size}</strong> student{selected.size !== 1 ? "s" : ""}?
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs rounded-[20px]" disabled={issuing} onClick={() => { setConfirming(false); setTimeout(() => issueButtonRef.current?.focus(), 0) }}>Cancel</Button>
                      <Button ref={confirmButtonRef} size="sm" className="h-7 text-xs rounded-[20px] text-white border-0 bg-ts-purple hover:bg-ts-purple/90" disabled={issuing} onClick={issue}>
                        {issuing ? <><Loader2 className="w-3 h-3 animate-spin mr-1" aria-hidden="true" />Issuing…</> : "Confirm"}
                      </Button>
                    </div>
                  </div>
                )}
                {(selected.size === 0 || !template) && !confirming && (
                  <p className="text-[11px] text-muted-foreground">
                    {selected.size === 0 ? "Tick at least one student who has completed the subject." : "Choose a template to continue."}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
