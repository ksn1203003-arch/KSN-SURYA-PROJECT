import { describe, it, expect } from "vitest"
import {
  formatCountedDate, istTodayYmd, attendanceBasisLabel, isAttendanceCacheUsable,
} from "@/lib/attendanceBasis"

describe("formatCountedDate", () => {
  it("writes a date as day, short month name, year", () => {
    expect(formatCountedDate("2026-08-01")).toBe("1 Aug 2026")
    expect(formatCountedDate("2026-06-15")).toBe("15 Jun 2026")
  })

  it("handles the first and last day of the year", () => {
    expect(formatCountedDate("2026-01-01")).toBe("1 Jan 2026")
    expect(formatCountedDate("2026-12-31")).toBe("31 Dec 2026")
  })

  it("accepts 29 Feb only in a leap year", () => {
    expect(formatCountedDate("2028-02-29")).toBe("29 Feb 2028")
    expect(formatCountedDate("2027-02-29")).toBe("2027-02-29")
  })

  it("returns anything that is not a real YYYY-MM-DD unchanged", () => {
    expect(formatCountedDate("")).toBe("")
    expect(formatCountedDate("not a date")).toBe("not a date")
    expect(formatCountedDate("2026-13-01")).toBe("2026-13-01")
    expect(formatCountedDate("2026-04-31")).toBe("2026-04-31")
    expect(formatCountedDate("2026-8-1")).toBe("2026-8-1")
    expect(formatCountedDate("2026-08-01T00:00:00Z")).toBe("2026-08-01T00:00:00Z")
  })
})

describe("istTodayYmd", () => {
  it("moves to the next day after 18:30 UTC (IST is UTC+5:30)", () => {
    expect(istTodayYmd(new Date("2026-10-11T20:00:00Z"))).toBe("2026-10-12")
  })

  it("stays on the same day just before 18:30 UTC", () => {
    expect(istTodayYmd(new Date("2026-10-11T18:29:59Z"))).toBe("2026-10-11")
    expect(istTodayYmd(new Date("2026-10-11T18:30:00Z"))).toBe("2026-10-12")
  })

  it("rolls over a year end", () => {
    expect(istTodayYmd(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01")
  })

  it("defaults to the current time and returns a YYYY-MM-DD string", () => {
    expect(istTodayYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("attendanceBasisLabel", () => {
  const today = "2026-10-12"

  it("says all recorded sheets when no start date is known", () => {
    expect(attendanceBasisLabel({ countedFrom: null, todayYmd: today })).toBe("All recorded sheets")
    expect(attendanceBasisLabel({ countedFrom: undefined, className: "Class 7A", todayYmd: today }))
      .toBe("All recorded sheets")
  })

  it("treats an invalid date string like no date", () => {
    expect(attendanceBasisLabel({ countedFrom: "soon", todayYmd: today })).toBe("All recorded sheets")
    expect(attendanceBasisLabel({ countedFrom: "2026-02-30", todayYmd: today })).toBe("All recorded sheets")
    expect(attendanceBasisLabel({ countedFrom: "", todayYmd: today })).toBe("All recorded sheets")
  })

  it("names the class and the date for a past start", () => {
    expect(attendanceBasisLabel({ countedFrom: "2026-06-01", className: "Class 7A", todayYmd: today }))
      .toBe("Class 7A, counted from 1 Jun 2026")
  })

  it("leaves the class out when there is no class name", () => {
    expect(attendanceBasisLabel({ countedFrom: "2026-06-01", todayYmd: today }))
      .toBe("Counted from 1 Jun 2026")
    expect(attendanceBasisLabel({ countedFrom: "2026-06-01", className: null, todayYmd: today }))
      .toBe("Counted from 1 Jun 2026")
    expect(attendanceBasisLabel({ countedFrom: "2026-06-01", className: "", todayYmd: today }))
      .toBe("Counted from 1 Jun 2026")
  })

  it("counts a start date of today as already started", () => {
    expect(attendanceBasisLabel({ countedFrom: today, className: "Class 7A", todayYmd: today }))
      .toBe("Class 7A, counted from 12 Oct 2026")
  })

  it("says nothing is counted yet when the start is in the future", () => {
    expect(attendanceBasisLabel({ countedFrom: "2027-01-01", className: "Class 7A", todayYmd: today }))
      .toBe("Counting starts on 1 Jan 2027, so nothing is counted yet.")
    expect(attendanceBasisLabel({ countedFrom: "2026-10-13", todayYmd: today }))
      .toBe("Counting starts on 13 Oct 2026, so nothing is counted yet.")
  })
})

describe("isAttendanceCacheUsable", () => {
  it("rejects values that are not objects", () => {
    expect(isAttendanceCacheUsable(null)).toBe(false)
    expect(isAttendanceCacheUsable(undefined)).toBe(false)
    expect(isAttendanceCacheUsable("counted_from")).toBe(false)
    expect(isAttendanceCacheUsable(42)).toBe(false)
    expect(isAttendanceCacheUsable([])).toBe(false)
  })

  it("rejects an entry saved before counted_from existed", () => {
    expect(isAttendanceCacheUsable({})).toBe(false)
    expect(isAttendanceCacheUsable({ attendance_rate: 91.5, days_recorded: 12 })).toBe(false)
  })

  it("accepts an entry whose counted_from is a string or null", () => {
    expect(isAttendanceCacheUsable({ counted_from: null })).toBe(true)
    expect(isAttendanceCacheUsable({ counted_from: "2026-06-01", attendance_rate: 90 })).toBe(true)
  })

  it("rejects an entry whose counted_from has the wrong type or is undefined", () => {
    expect(isAttendanceCacheUsable({ counted_from: 20260601 })).toBe(false)
    expect(isAttendanceCacheUsable({ counted_from: undefined })).toBe(false)
    expect(isAttendanceCacheUsable({ counted_from: {} })).toBe(false)
  })

  it("does not count a key inherited from the prototype", () => {
    const inherited: object = Object.create({ counted_from: null })
    expect(isAttendanceCacheUsable(inherited)).toBe(false)
  })
})
