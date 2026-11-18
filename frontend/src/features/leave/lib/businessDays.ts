/**
 * Calculates number of business days (Monday-Friday) between two dates inclusive.
 */
export function calculateBusinessDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 0

  const start = new Date(startDateStr)
  const end = new Date(endDateStr)

  if (start.getTime() > end.getTime()) return 0

  let count = 0
  const cur = new Date(start)

  while (cur.getTime() <= end.getTime()) {
    const dayOfWeek = cur.getDay()
    // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
    cur.setDate(cur.getDate() + 1)
  }

  return count
}
