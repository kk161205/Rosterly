/**
 * Display formatting shared by every page. Amounts are Indian rupees (₹) —
 * the approval cost threshold and seeded data are in INR. The API sends money
 * as decimal strings (Pydantic Decimal), so every formatter accepts strings.
 */
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? inr.format(n) : '—'
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const shortDateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
// Some ICU versions abbreviate September as "Sept"; keep every month to three letters
const threeLetter = (s: string) => s.replace('Sept', 'Sep')

/** "2026-06-08" is a calendar date (local midnight); anything else is an instant. */
const toDate = (value: string | Date): Date =>
  typeof value !== 'string' ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalDate(value) : new Date(value)

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = toDate(value)
  return Number.isNaN(d.getTime()) ? '—' : threeLetter(dateFmt.format(d))
}

/** "12 Oct" for this year, "12 Oct 2025" otherwise. */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return '—'
  return threeLetter(d.getFullYear() === new Date().getFullYear() ? shortDateFmt.format(d) : dateFmt.format(d))
}

/** "just now", "5m", "3h", "2d" — compact age for lists. */
export function formatAge(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  const minutes = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

/** Days from today until a date (negative when past). */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

/** "Asset request" from "asset_request". */
export function humanize(value: string | null | undefined): string {
  if (!value) return ''
  const s = value.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** A span of hours: "under 1 h", "6 h" under two days, "3.5 days" after. */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—'
  if (hours < 1) return 'under 1 h'
  if (hours < 48) return `${Math.round(hours)} h`
  return `${(hours / 24).toFixed(1)} days`
}

/**
 * A date as YYYY-MM-DD in the viewer's own timezone. Use this, not
 * toISOString(), which is UTC — in India it gives yesterday before 05:30.
 */
export function localISODate(value: Date = new Date()): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parses a YYYY-MM-DD date as local midnight (new Date('2026-06-08') would be UTC). */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
