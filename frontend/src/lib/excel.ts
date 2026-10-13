// ─────────────────────────────────────────────────────────────────────────────
// lib/excel.ts — Loads the Excel library (xlsx) only when a user actually exports
// or imports a spreadsheet. It is several hundred KB, so it must never be part of
// the code every user downloads when the app opens.
// ─────────────────────────────────────────────────────────────────────────────
export type XlsxModule = typeof import("xlsx")

let xlsxPromise: Promise<XlsxModule> | null = null

export function loadXlsx(): Promise<XlsxModule> {
  if (!xlsxPromise) {
    // A failed load (e.g. offline) must not be remembered — the next click tries again
    xlsxPromise = import("xlsx").catch(err => { xlsxPromise = null; throw err })
  }
  return xlsxPromise
}

export const EXCEL_LOAD_ERROR = "Could not prepare the Excel file. Please check your connection and try again."
export const EXCEL_SAVE_ERROR = "Could not save the Excel file. Please try again."

const exporting = new Set<string>()

/**
 * Builds and saves a spreadsheet. Repeat clicks on the same export while the library
 * is still loading are ignored, so a slow connection never produces duplicate files;
 * a different export (key) still goes ahead. A loading problem and a saving problem
 * get their own message.
 */
export async function withXlsx(key: string, task: (XLSX: XlsxModule) => void): Promise<void> {
  if (exporting.has(key)) return
  exporting.add(key)
  try {
    let XLSX: XlsxModule
    try {
      XLSX = await loadXlsx()
    } catch {
      alert(EXCEL_LOAD_ERROR)
      return
    }
    try {
      task(XLSX)
    } catch {
      alert(EXCEL_SAVE_ERROR)
    }
  } finally {
    exporting.delete(key)
  }
}
