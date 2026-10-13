import { FileText, Presentation, FileType2, Video, Image, FolderOpen, CirclePlay, Link2 } from "lucide-react"
import type { LinkType } from "@/lib/moduleApi"

// Shared icon language for lesson items — used on both the teacher's module
// list (TeacherDashboard.tsx) and the student's Lessons view
// (StudentLessonsItemsPanel.tsx) so a file/link always looks the same
// everywhere it appears. Real Lucide icons instead of emoji: consistent
// rendering across every OS/browser, matching the rest of the app's icon set.
export function LessonFileTypeIcon({ fileType, className }: { fileType: string | null; className?: string }) {
  if (fileType === "pdf") return <FileText className={className} />
  if (fileType === "pptx" || fileType === "ppt") return <Presentation className={className} />
  if (fileType === "docx" || fileType === "doc") return <FileType2 className={className} />
  if (fileType === "mp4" || fileType === "webm") return <Video className={className} />
  if (fileType && ["jpg", "jpeg", "png", "webp", "gif"].includes(fileType)) return <Image className={className} />
  return <FileText className={className} />
}

export function LessonLinkTypeIcon({ linkType, className }: { linkType: LinkType | null; className?: string }) {
  if (linkType === "gdrive") return <FolderOpen className={className} />
  if (linkType === "youtube") return <CirclePlay className={className} />
  return <Link2 className={className} />
}
