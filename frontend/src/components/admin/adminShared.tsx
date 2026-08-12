import { Megaphone, Clock, Trophy, AlertTriangle, CalendarDays } from "lucide-react"
import type { NotifType } from "@/lib/userApi"

export const clsLabel = (c: { name?: string | null; grade: number; section: string }) =>
  c.name ?? (c.grade > 0 ? `Class ${c.grade}${c.section}` : c.section)

export const clsCompact = (c: { name?: string | null; grade: number; section: string }) =>
  c.name ?? (c.grade > 0 ? `${c.grade}${c.section}` : c.section)

export const CLASS_COLORS = ["#534AB7","#378ADD","#EF9F27","#639922","#E84393","#9D59C7","#E2625A","#0EA5E9"]

export const NOTIF_TYPES: Array<{ value: NotifType; label: string; icon: React.ReactNode; color: string; desc: string }> = [
  { value: "announcement", label: "Announcement", icon: <Megaphone className="w-4 h-4" />,    color: "#534AB7", desc: "General info, school updates" },
  { value: "reminder",     label: "Reminder",     icon: <Clock className="w-4 h-4" />,         color: "#f59e0b", desc: "Deadlines, upcoming exams" },
  { value: "achievement",  label: "Achievement",  icon: <Trophy className="w-4 h-4" />,        color: "#10b981", desc: "Class awards, 100% attendance" },
  { value: "alert",        label: "Alert",        icon: <AlertTriangle className="w-4 h-4" />, color: "#EF4444", desc: "Urgent — school closed, emergency" },
  { value: "event",        label: "Event",        icon: <CalendarDays className="w-4 h-4" />,  color: "#378ADD", desc: "PTM, sports day, cultural programs" },
]

export const NOTIF_ICONS: Record<string, string> = {
  announcement: "📢", reminder: "⏰", achievement: "🏆", alert: "🚨", event: "📅",
}

export function notifTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000); const hours = Math.floor(diff / 3600000); const days = Math.floor(diff / 86400000)
  if (mins < 2) return "Just now"; if (mins < 60) return `${mins}m ago`; if (hours < 24) return `${hours}h ago`
  if (days === 1) return "Yesterday"; return `${days}d ago`
}
