import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  User, BookOpen, BarChart2, Award, CalendarCheck, LogOut, type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getChildProfile, getChildAttendance, getChildProgress, getChildMarks, getChildCertificates,
  type ChildProfile, type ChildClass, type ChildTeacher, type ChildAttendance,
  type ModuleProgress, type ChildExamResult, type ChildCertificate,
} from "@/lib/parentApi"

type View = "overview" | "progress" | "marks" | "attendance" | "certificates"

const NAV_ITEMS: Array<{ label: string; icon: LucideIcon; view: View }> = [
  { label: "Overview",      icon: User,          view: "overview" },
  { label: "Lessons",       icon: BookOpen,       view: "progress" },
  { label: "Marks",         icon: BarChart2,      view: "marks" },
  { label: "Attendance",    icon: CalendarCheck,  view: "attendance" },
  { label: "Certificates",  icon: Award,          view: "certificates" },
]

export function ParentDashboard() {
  const { signOut } = useAuth()
  const [view, setView] = useState<View>("overview")

  const [profile, setProfile] = useState<{ child: ChildProfile; class: ChildClass | null; teachers: ChildTeacher[] } | null>(null)
  const [attendance, setAttendance] = useState<ChildAttendance | null>(null)
  const [progress, setProgress] = useState<ModuleProgress[]>([])
  const [marks, setMarks] = useState<ChildExamResult[]>([])
  const [certificates, setCertificates] = useState<ChildCertificate[]>([])

  const [profileLoaded, setProfileLoaded] = useState(false)
  const [attendanceLoaded, setAttendanceLoaded] = useState(false)
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [marksLoaded, setMarksLoaded] = useState(false)
  const [certsLoaded, setCertsLoaded] = useState(false)

  const [error, setError] = useState("")

  useEffect(() => {
    if (profileLoaded) return
    getChildProfile().then(res => {
      if ("error" in res) { setError(res.error); return }
      setProfile(res)
      setProfileLoaded(true)
    })
  }, [profileLoaded])

  useEffect(() => {
    if (view !== "attendance" || attendanceLoaded) return
    getChildAttendance().then(res => {
      if (!("error" in res)) { setAttendance(res); setAttendanceLoaded(true) }
    })
  }, [view, attendanceLoaded])

  useEffect(() => {
    if (view !== "progress" || progressLoaded) return
    getChildProgress().then(res => {
      if (!("error" in res)) { setProgress(res.modules); setProgressLoaded(true) }
    })
  }, [view, progressLoaded])

  useEffect(() => {
    if (view !== "marks" || marksLoaded) return
    getChildMarks().then(res => {
      if (!("error" in res)) { setMarks(res.exams); setMarksLoaded(true) }
    })
  }, [view, marksLoaded])

  useEffect(() => {
    if (view !== "certificates" || certsLoaded) return
    getChildCertificates().then(res => {
      if (!("error" in res)) { setCertificates(res.certificates); setCertsLoaded(true) }
    })
  }, [view, certsLoaded])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive font-medium">{error}</p>
          <Button variant="outline" onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    )
  }

  const child = profile?.child
  const cls   = profile?.class

  return (
    <DashboardLayout
      role="parent"
      navItems={NAV_ITEMS.map(n => ({
        label: n.label,
        path:  n.view,
        icon:  <n.icon className="w-5 h-5" />,
        onClick: () => setView(n.view),
      }))}
      activeView={view}
      userName={child?.name ?? "Parent"}
    >
      {/* ── Overview ── */}
      {view === "overview" && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Child Overview</h1>

          {!profileLoaded ? (
            <div className="animate-pulse space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-xl" />)}
            </div>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><User className="w-5 h-5" /> Student Profile</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-muted-foreground">Name</p><p className="font-semibold">{child?.name}</p></div>
                  <div><p className="text-muted-foreground">Class</p><p className="font-semibold">{cls ? (cls.name || `Class ${cls.grade}${cls.section}`) : "—"}</p></div>
                  <div><p className="text-muted-foreground">Subjects</p><p className="font-semibold">{cls?.subjects?.join(", ") ?? "—"}</p></div>
                </CardContent>
              </Card>

              {(profile?.teachers?.length ?? 0) > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Teachers</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {profile!.teachers.map(t => (
                      <div key={t._id} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {t.name[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.email}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Lesson Progress ── */}
      {view === "progress" && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Lesson Progress</h1>
          {!progressLoaded ? (
            <div className="animate-pulse space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-xl" />)}</div>
          ) : progress.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No lessons have been uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {progress.map(m => (
                <Card key={m.module_id.toString()}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{m.title}</p>
                        <p className="text-xs text-muted-foreground">{m.subject}</p>
                      </div>
                      <span className="text-sm font-bold">{m.percentage}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${m.percentage}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{m.viewed_items} of {m.total_items} items viewed</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Marks ── */}
      {view === "marks" && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Exam Results</h1>
          {!marksLoaded ? (
            <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-xl" />)}</div>
          ) : marks.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No exam results available yet.</p>
          ) : (
            <div className="space-y-4">
              {marks.map(exam => (
                <Card key={exam.exam_id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{exam.title}</CardTitle>
                      {exam.overall_pct !== null && (
                        <Badge variant={exam.overall_pct >= 75 ? "default" : exam.overall_pct >= 50 ? "secondary" : "destructive"}>
                          {exam.overall_pct}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(exam.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {exam.subjects.map(s => (
                        <div key={s.subject} className="bg-muted/50 rounded-lg p-2 text-sm">
                          <p className="text-muted-foreground text-xs">{s.subject}</p>
                          {s.is_absent ? (
                            <p className="font-bold text-destructive">Absent</p>
                          ) : s.marks_obtained !== null ? (
                            <p className="font-bold">{s.marks_obtained}/{s.max_marks}</p>
                          ) : (
                            <p className="text-muted-foreground">—</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Attendance ── */}
      {view === "attendance" && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Attendance</h1>
          {!attendanceLoaded ? (
            <div className="animate-pulse space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-muted rounded-xl" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Attendance Rate", value: attendance?.rate !== null ? `${attendance?.rate}%` : "N/A", color: (attendance?.rate ?? 0) >= 75 ? "text-green-600" : "text-orange-500" },
                  { label: "Present", value: attendance?.present ?? 0, color: "text-green-600" },
                  { label: "Late",    value: attendance?.late ?? 0,    color: "text-orange-500" },
                  { label: "Absent",  value: attendance?.absent ?? 0,  color: "text-red-500" },
                ].map(stat => (
                  <Card key={stat.label}>
                    <CardContent className="pt-4 text-center">
                      <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {(attendance?.records.length ?? 0) === 0 && (
                <p className="text-muted-foreground text-center py-12">No attendance records found.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Certificates ── */}
      {view === "certificates" && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Certificates</h1>
          {!certsLoaded ? (
            <div className="animate-pulse space-y-3">{[1,2].map(i => <div key={i} className="h-16 bg-muted rounded-xl" />)}</div>
          ) : certificates.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No certificates earned yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {certificates.map(cert => (
                <Card key={cert._id}>
                  <CardContent className="pt-4 flex items-center gap-3">
                    <Award className="w-8 h-8 text-yellow-500 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">{cert.module_title}</p>
                      <p className="text-xs text-muted-foreground">{cert.subject} · {new Date(cert.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
