export function calculateAttendanceRate(
  present: number,
  late: number,
  total: number
): number | null {
  if (total === 0) return null
  return Math.round(((present + late * 0.5) / total) * 100 * 10) / 10
}
