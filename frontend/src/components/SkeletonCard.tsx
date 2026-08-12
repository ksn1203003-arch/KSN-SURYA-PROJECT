import { cn } from "@/lib/utils"

interface SkeletonCardProps {
  lines?: number
  className?: string
  showAvatar?: boolean
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-muted",
        className
      )}
    />
  )
}

export function SkeletonCard({ lines = 3, className, showAvatar = false }: SkeletonCardProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 space-y-3", className)}>
      {showAvatar && (
        <div className="flex items-center gap-3">
          <Shimmer className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-3.5 w-2/3" />
            <Shimmer className="h-3 w-1/3" />
          </div>
        </div>
      )}
      {!showAvatar && <Shimmer className="h-4 w-1/2" />}
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  )
}

export function SkeletonList({ count = 4, ...props }: SkeletonCardProps & { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} {...props} />
      ))}
    </div>
  )
}
