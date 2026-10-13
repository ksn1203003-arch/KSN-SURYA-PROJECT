import { logger } from "../lib/logger.js"
// ─────────────────────────────────────────────────────────────────────────────
// routes/photos.ts — GET /api/photos/:id — one person's profile photo.
// Lists send only the photo address; the browser asks for a picture when it is
// shown. Who may see whose photo:
//   • staff (teacher, admin) — anyone active in their own school
//   • everyone — their own photo, and the teachers/admins of their own school
//   • a parent — also their linked child
// Anything else answers 404, the same as "no such photo", so nothing is revealed.
// ─────────────────────────────────────────────────────────────────────────────
import { Router, type Response } from "express"
import { type AuthRequest } from "../middleware/auth.js"
import { User } from "../models/User.js"
import { validateObjectId } from "../lib/validateId.js"
import { decodePhoto, PHOTO_VERSION_PROJECTION } from "../lib/userPhoto.js"

const router = Router()

const STAFF_ROLES = new Set(["teacher", "admin", "super_admin"])

interface PhotoHead { _id: unknown; role: string; photo_v: number | null }

async function viewerMaySee(req: AuthRequest, target: PhotoHead, targetId: string): Promise<boolean> {
  const role = req.userRole ?? ""
  if (STAFF_ROLES.has(role)) return true
  if (targetId === req.userId) return true
  if (STAFF_ROLES.has(target.role)) return true
  if (role === "parent") {
    const parent = await User.findOne({ _id: req.userId, school_id: req.schoolId })
      .select("linked_student_id").lean()
    return parent?.linked_student_id?.toString() === targetId
  }
  return false
}

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const id = req.params.id
  if (!validateObjectId(id, res, "user ID")) return
  if (!req.schoolId) { res.status(404).json({ error: "Photo not found" }); return }

  try {
    // First read only the role and the photo version — not the photo itself — so an
    // unchanged photo is answered with "not modified" without reading the picture.
    const head = await User.findOne({ _id: id, school_id: req.schoolId, is_active: true })
      .select({ role: 1, ...PHOTO_VERSION_PROJECTION })
      .lean<PhotoHead>()

    if (!head || head.photo_v === null || head.photo_v === undefined || !(await viewerMaySee(req, head, id))) {
      res.status(404).json({ error: "Photo not found" }); return
    }

    // The browser may keep the picture but must ask again each time (the answer is
    // a tiny "not modified" when nothing changed), so a signed-out browser on a
    // shared school computer is never shown a stored photo.
    const etag = `"p-${id}-${head.photo_v}"`
    res.setHeader("Cache-Control", "private, no-cache")
    res.setHeader("ETag", etag)
    res.setHeader("Vary", "Cookie, Authorization")
    if (req.headers["if-none-match"] === etag) { res.status(304).end(); return }

    const doc = await User.findOne({ _id: id, school_id: req.schoolId, is_active: true })
      .select("profile_photo_url").lean()
    const photo = decodePhoto(doc?.profile_photo_url)
    if (!photo) { res.removeHeader("ETag"); res.status(404).json({ error: "Photo not found" }); return }

    res.setHeader("Content-Type", photo.contentType)
    res.setHeader("Content-Length", String(photo.body.length))
    res.setHeader("Content-Disposition", "inline")
    res.end(photo.body)
  } catch (err) {
    logger.error({ err }, "[photos GET]")
    res.status(500).json({ error: "Could not load the photo" })
  }
})

export default router
