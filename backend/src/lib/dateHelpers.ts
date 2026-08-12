const IST_TZ = "Asia/Kolkata"

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST_TZ })
}

export function weekStartIST(): string {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: IST_TZ }))
  const day = ist.getDay()
  ist.setDate(ist.getDate() - (day === 0 ? 6 : day - 1))
  return ist.toLocaleDateString("en-CA", { timeZone: IST_TZ })
}

// Month is 1-indexed (1=Jan … 12=Dec). Defaults to June (6) for CBSE/ICSE year start.
// Override with ACADEMIC_YEAR_START_MONTH env var (e.g. "4" for April, for state boards).
export function academicYearStartIST(): string {
  const startMonth = Math.min(12, Math.max(1, parseInt(process.env.ACADEMIC_YEAR_START_MONTH ?? "6", 10) || 6))
  const ist  = new Date(new Date().toLocaleString("en-US", { timeZone: IST_TZ }))
  const year = ist.getMonth() + 1 >= startMonth ? ist.getFullYear() : ist.getFullYear() - 1
  const mm   = String(startMonth).padStart(2, "0")
  return `${year}-${mm}-01`
}
