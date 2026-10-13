// ─────────────────────────────────────────────────────────────────────────────
// lib/userPhoto.ts — Profile photos are stored on the user record as a small
// data URL (≤150 KB). Lists of people never carry the picture itself: they carry
// a short address (`/api/photos/<id>?v=<version>`) and the browser asks for each
// picture only when it is shown. The version changes when the photo changes.
// ─────────────────────────────────────────────────────────────────────────────

// Only plain raster images are accepted and served. SVG is refused because an
// SVG file can carry script.
export const PHOTO_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/

// Largest stored data URL (characters). About 110 KB of image after decoding.
export const MAX_PHOTO_DATA_URL_LENGTH = 150_000

// Database projection that works out the photo version without reading the photo
// out of the database: null when the user has no photo, otherwise the time it
// was last changed in milliseconds (0 for photos saved before that time was kept).
export const PHOTO_VERSION_PROJECTION = {
  photo_v: {
    $cond: [
      { $gt: [{ $strLenBytes: { $ifNull: ["$profile_photo_url", ""] } }, 0] },
      { $ifNull: [{ $toLong: "$profile_photo_updated_at" }, 0] },
      null,
    ],
  },
} as const

export function photoPath(userId: string, version: number | null | undefined): string | null {
  if (version === null || version === undefined) return null
  return `/api/photos/${userId}?v=${version}`
}

export interface DecodedPhoto { contentType: string; body: Buffer }

// The first bytes of each allowed picture type ("magic bytes")
function bytesMatchType(contentType: string, body: Buffer): boolean {
  switch (contentType) {
    case "image/png":  return body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case "image/jpeg": return body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
    case "image/gif":  return body.subarray(0, 4).toString("latin1") === "GIF8"
    case "image/webp": return body.subarray(0, 4).toString("latin1") === "RIFF" && body.subarray(8, 12).toString("latin1") === "WEBP"
    default:           return false
  }
}

/** The picture inside a stored data URL, or null when it is not a real PNG/JPEG/WebP/GIF. */
export function decodePhoto(dataUrl: string | null | undefined): DecodedPhoto | null {
  if (!dataUrl) return null
  const match = PHOTO_DATA_URL.exec(dataUrl)
  if (!match) return null
  const body = Buffer.from(match[2], "base64")
  if (!bytesMatchType(match[1], body)) return null
  return { contentType: match[1], body }
}
