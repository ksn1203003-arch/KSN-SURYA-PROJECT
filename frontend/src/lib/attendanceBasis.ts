// ─────────────────────────────────────────────────────────────────────────────
// attendanceBasis.ts
// Wording and checks for "what is this attendance number counted from?".
// The backend counts attendance only from the class's stored school-year start date and answers
// with `counted_from` (YYYY-MM-DD | null) and `counted_class_label`. Every screen that shows an
// attendance number builds its caption here so the wording can never drift between screens.
// Exports: formatCountedDate(), istTodayYmd(), attendanceBasisLabel(), isAttendanceCacheUsable()
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const IST_OFFSET_MINUTES = 330

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

// Splits a real calendar date written as YYYY-MM-DD into numbers; null when it is not one
// (wrong shape, month 13, 31 Feb, ...). Never builds a Date, so no time zone can shift the day.
function parseYmd(value: string): { year: number; month: number; day: number } | null {
  const match = YMD_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

// "2026-08-01" -> "1 Aug 2026". Anything that is not a real YYYY-MM-DD is returned unchanged.
export function formatCountedDate(ymd: string): string {
  const parts = parseYmd(ymd)
  if (!parts) return ymd
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`
}

// Today's calendar date in India (IST, UTC+5:30) as YYYY-MM-DD, whatever the device's own time zone is.
export function istTodayYmd(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000)
  const year = String(shifted.getUTCFullYear()).padStart(4, "0")
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// The one-line caption shown next to an attendance number.
export function attendanceBasisLabel(args: {
  countedFrom: string | null | undefined
  className?: string | null
  todayYmd: string
}): string {
  const { countedFrom, className, todayYmd } = args
  if (typeof countedFrom !== "string" || parseYmd(countedFrom) === null) return "All recorded sheets"
  const date = formatCountedDate(countedFrom)
  // Both sides are zero-padded YYYY-MM-DD, so a plain string comparison orders them correctly.
  if (countedFrom > todayYmd) return `Counting starts on ${date}, so nothing is counted yet.`
  return className ? `${className}, counted from ${date}` : `Counted from ${date}`
}

// A copy of an attendance response saved in the browser before `counted_from` existed has no such
// key and must be thrown away, not shown: it would carry the old, wrongly counted numbers.
// A saved copy that has the key (a date, or null for "all sheets") is fine.
export function isAttendanceCacheUsable(cached: unknown): boolean {
  if (typeof cached !== "object" || cached === null || Array.isArray(cached)) return false
  if (!Object.prototype.hasOwnProperty.call(cached, "counted_from")) return false
  const value: unknown = Reflect.get(cached, "counted_from")
  return value === null || typeof value === "string"
}
