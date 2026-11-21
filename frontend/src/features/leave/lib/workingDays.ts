import { localISODate, parseLocalDate } from '@/lib/format'

/**
 * Working days from start to end (both inclusive): Monday–Friday, not company
 * holidays. Dates are YYYY-MM-DD and read in local time. Mirrors the server.
 */
export function workingDays(start: string, end: string, holidays: Iterable<string> = []): number {
  if (!start || !end || start > end) return 0
  const off = new Set(holidays)
  let count = 0
  for (const d = parseLocalDate(start); localISODate(d) <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay()
    if (day !== 0 && day !== 6 && !off.has(localISODate(d))) count++
  }
  return count
}
