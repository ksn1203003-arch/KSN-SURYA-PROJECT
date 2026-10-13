import { useState } from "react"
import { Loader2, Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { SkeletonList } from "@/components/SkeletonCard"
import { LessonFileTypeIcon, LessonLinkTypeIcon } from "@/components/LessonItemTypeIcon"
import { SubjectIcon, getSubjectMeta } from "@/pages/TeacherDashboard"
import { markItemViewed, unmarkItemViewed, formatFileSize, type LessonModule, type ModuleItem } from "@/lib/moduleApi"
import { type DashboardSummary } from "@/lib/studentApi"

type StatusFilter = "all" | "viewed" | "remaining"
type PendingAction = { item: ModuleItem; kind: "mark" | "undo" } | null

interface StudentLessonsItemsPanelProps {
  lessonSubject: string
  sModules: LessonModule[]
  sModulesLoading: boolean
  sViewedIds: string[]
  setSViewedIds: (updater: (ids: string[]) => string[]) => void
  selectedModuleId: string | null
  setSelectedModuleId: (id: string) => void
  itemSearchQuery: string
  setItemSearchQuery: (q: string) => void
  itemStatusFilter: StatusFilter
  setItemStatusFilter: (f: StatusFilter) => void
  markingDoneId: string | null
  setMarkingDoneId: (id: string | null) => void
  setSViewerItem: (item: ModuleItem) => void
  setDashSummary: (updater: (prev: DashboardSummary | null) => DashboardSummary | null) => void
}

// The per-subject "Modules Overview + items" two-pane panel shown inside the
// Lessons view. Identical for every subject — lessonSubject is just a label
// used for the empty state, there is no per-subject branching here.
export function StudentLessonsItemsPanel({
  lessonSubject, sModules, sModulesLoading, sViewedIds, setSViewedIds,
  selectedModuleId, setSelectedModuleId, itemSearchQuery, setItemSearchQuery,
  itemStatusFilter, setItemStatusFilter, markingDoneId, setMarkingDoneId,
  setSViewerItem, setDashSummary,
}: StudentLessonsItemsPanelProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  if (sModulesLoading) return <SkeletonList count={3} lines={2} />

  if (sModules.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 gap-3 text-center">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${getSubjectMeta(lessonSubject).gradient} opacity-30`}>
          <SubjectIcon name={lessonSubject} size={26} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">No modules yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Your teacher hasn't uploaded any content for <span className="font-medium text-foreground">{lessonSubject}</span> yet.
          </p>
        </div>
      </div>
    )
  }

  const selectedModule = sModules.find(m => m._id === selectedModuleId) ?? sModules[0]
  const query = itemSearchQuery.trim().toLowerCase()
  const visibleItems = selectedModule.items.filter(item => {
    const viewed = sViewedIds.includes(item._id)
    if (itemStatusFilter === "viewed" && !viewed) return false
    if (itemStatusFilter === "remaining" && viewed) return false
    if (query && !item.label.toLowerCase().includes(query)) return false
    return true
  })
  const viewedInModule    = selectedModule.items.filter(i => sViewedIds.includes(i._id)).length
  const remainingInModule = selectedModule.items.length - viewedInModule

  async function handleMarkDone(item: ModuleItem) {
    setMarkingDoneId(item._id)
    setSViewedIds(ids => [...ids, item._id])
    // The server records today's activity as part of marking the item viewed — no separate ping
    await markItemViewed(selectedModule._id, item._id)
    setDashSummary(prev => {
      if (!prev) return prev
      return {
        ...prev,
        modules_completed: prev.modules_completed + 1,
        module_progress: prev.module_progress.map(p =>
          p.subject === selectedModule.subject
            ? { ...p, completed: Math.min(p.completed + 1, p.total) }
            : p
        ),
      }
    })
    setMarkingDoneId(null)
  }

  async function handleUndo(item: ModuleItem) {
    setMarkingDoneId(item._id)
    setSViewedIds(ids => ids.filter(id => id !== item._id))
    await unmarkItemViewed(selectedModule._id, item._id)
    setDashSummary(prev => {
      if (!prev) return prev
      return {
        ...prev,
        modules_completed: Math.max(prev.modules_completed - 1, 0),
        module_progress: prev.module_progress.map(p =>
          p.subject === selectedModule.subject
            ? { ...p, completed: Math.max(p.completed - 1, 0) }
            : p
        ),
      }
    })
    setMarkingDoneId(null)
  }

  function confirmPendingAction() {
    if (!pendingAction) return
    const { item, kind } = pendingAction
    setPendingAction(null)
    if (kind === "mark") handleMarkDone(item)
    else handleUndo(item)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
      {/* ── Left: Modules Overview ──────────────────────────────── */}
      <div className="skillio-card p-3 flex flex-col gap-1 md:max-h-[560px] md:overflow-y-auto">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide px-2 pb-2">Modules Overview</p>
        {sModules.map((mod, idx) => {
          const viewedCount = mod.items.filter(i => sViewedIds.includes(i._id)).length
          const isSelected = mod._id === selectedModule._id
          return (
            <button key={mod._id}
              onClick={() => { setSelectedModuleId(mod._id); setItemSearchQuery(""); setItemStatusFilter("all") }}
              className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${isSelected ? "bg-ts-purple/10" : "hover:bg-muted/40"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-semibold ${isSelected ? "text-ts-purple" : "text-muted-foreground"}`}>Module {idx + 1}</span>
                <span className="text-[10px] font-bold text-muted-foreground shrink-0">{viewedCount}/{mod.items.length}</span>
              </div>
              <p className={`text-xs font-bold mt-0.5 truncate ${isSelected ? "text-ts-purple" : "text-foreground"}`}>{mod.title}</p>
            </button>
          )
        })}
      </div>

      {/* ── Right: selected module's items ──────────────────────── */}
      <div className="skillio-card p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground truncate">{selectedModule.title}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={itemSearchQuery}
            onChange={e => setItemSearchQuery(e.target.value)}
            placeholder="Search lessons or files…"
            aria-label="Search lessons or files"
            className="w-full pl-9 pr-3 py-2 rounded-full border border-border bg-background text-xs placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: "#534AB7" }}
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2">
          {([
            { key: "all" as const, label: "All", count: selectedModule.items.length },
            { key: "viewed" as const, label: "Viewed", count: viewedInModule },
            { key: "remaining" as const, label: "Remaining", count: remainingInModule },
          ]).map(chip => (
            <button key={chip.key}
              onClick={() => setItemStatusFilter(chip.key)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${itemStatusFilter === chip.key ? "text-white" : "text-muted-foreground bg-muted hover:bg-muted/70"}`}
              style={itemStatusFilter === chip.key ? { background: "linear-gradient(135deg,#534AB7,#378ADD)" } : {}}>
              {chip.label} ({chip.count})
            </button>
          ))}
        </div>

        {/* Items */}
        {selectedModule.items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-xs text-muted-foreground">No items in this module yet.</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="py-10 text-center flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {query ? <>No items match &ldquo;{itemSearchQuery}&rdquo;.</> : "Nothing here yet."}
            </p>
            {(query || itemStatusFilter !== "all") && (
              <button
                onClick={() => { setItemSearchQuery(""); setItemStatusFilter("all") }}
                className="text-[11px] font-semibold text-ts-purple hover:underline">
                Clear search &amp; filters
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {visibleItems.map(item => {
              const viewed = sViewedIds.includes(item._id)
              const marking = markingDoneId === item._id
              return (
                <div key={item._id} className="flex items-center gap-3 py-3.5 group">
                  <button
                    className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    onClick={() => setSViewerItem(item)}>
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: viewed ? "rgba(99,153,34,0.12)" : "rgba(83,74,183,0.1)", color: viewed ? "#639922" : "#534AB7" }}>
                      {item.type === "file"
                        ? <LessonFileTypeIcon fileType={item.file_type} className="w-4 h-4" />
                        : <LessonLinkTypeIcon linkType={item.link_type} className="w-4 h-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate group-hover:text-ts-purple transition-colors">{item.label}</p>
                      {item.type === "file" && item.file_size && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.file_type?.toUpperCase()} · {formatFileSize(item.file_size)}</p>
                      )}
                      {item.type === "link" && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.link_url}</p>
                      )}
                    </div>
                  </button>
                  {viewed ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full text-white"
                        style={{ background: "#639922" }}>
                        <Check className="w-3 h-3" /> Done
                      </span>
                      <button
                        disabled={marking}
                        onClick={() => setPendingAction({ item, kind: "undo" })}
                        className="text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50">
                        {marking ? <Loader2 className="w-3 h-3 animate-spin" /> : "Undo"}
                      </button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      disabled={marking}
                      onClick={() => setPendingAction({ item, kind: "mark" })}
                      className="rounded-full text-[10px] h-7 px-3 font-semibold shrink-0 cursor-pointer"
                      variant="outline">
                      {marking ? <Loader2 className="w-3 h-3 animate-spin" /> : "Mark Done"}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Shared confirm dialog for both Mark Done and Undo */}
      <AlertDialog open={pendingAction !== null} onOpenChange={open => { if (!open) setPendingAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === "mark" ? "Mark this as done?" : "Undo this item?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === "mark"
                ? <>Mark <span className="font-medium text-foreground">{pendingAction.item.label}</span> as done. You can undo this later if you need to.</>
                : <>This will move <span className="font-medium text-foreground">{pendingAction?.item.label}</span> back to Remaining.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingAction}>
              {pendingAction?.kind === "mark" ? "Yes, mark done" : "Yes, undo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
