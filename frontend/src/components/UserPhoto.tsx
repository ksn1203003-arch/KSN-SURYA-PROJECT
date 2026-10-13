import type { ReactNode } from "react"
import { useUserPhoto } from "@/lib/userPhoto"

interface UserPhotoProps {
  /** Photo address from a people list (`photo_url`), or null when the person has no photo */
  path: string | null | undefined
  /** Usually "" — the person's name is already written next to the photo */
  alt?: string
  className?: string
  /** Shown while the picture loads and when there is none — usually initials */
  fallback: ReactNode
}

/** A person's profile photo, fetched only when it is on screen; initials until then. */
export function UserPhoto({ path, alt = "", className, fallback }: UserPhotoProps) {
  const src = useUserPhoto(path)
  // display:contents keeps the fallback's own layout while hiding the initials from screen readers
  if (!src) return <span aria-hidden="true" className="contents">{fallback}</span>
  return <img src={src} alt={alt} className={className} />
}
