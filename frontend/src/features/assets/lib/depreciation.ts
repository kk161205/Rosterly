import type { DepreciationMethod } from '@/features/assets/types/assets'

/**
 * Book value on a date, mirroring backend app/modules/assets/jobs.py
 * calculate_current_value() exactly, so the record page's trend line is the
 * same rule the nightly job applies — not an estimate:
 *  - straight_line: even to zero over useful_life_months
 *  - declining_balance: 20%/year compounded monthly, capped at useful life
 *  - none: stays at purchase cost
 * Whole calendar months elapsed, as the job counts them.
 */
const DECLINING_BALANCE_ANNUAL_RATE = 0.2

export function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()))
}

export function bookValueAt(
  purchaseCost: number,
  method: DepreciationMethod,
  usefulLifeMonths: number,
  months: number,
): number {
  if (method === 'none') return purchaseCost
  if (method === 'straight_line') {
    if (usefulLifeMonths <= 0) return purchaseCost
    const capped = Math.min(months, usefulLifeMonths)
    return Math.max(0, (purchaseCost * (usefulLifeMonths - capped)) / usefulLifeMonths)
  }
  const capped = usefulLifeMonths > 0 ? Math.min(months, usefulLifeMonths) : months
  return Math.max(0, purchaseCost * (1 - DECLINING_BALANCE_ANNUAL_RATE / 12) ** capped)
}

/** Points from purchase to the end of useful life, for a small trend line. */
export function depreciationSchedule(
  purchaseCost: number,
  method: DepreciationMethod,
  usefulLifeMonths: number,
): { month: number; value: number }[] {
  const end = Math.max(usefulLifeMonths, 1)
  const step = Math.max(1, Math.round(end / 24))
  const points: { month: number; value: number }[] = []
  for (let m = 0; m <= end; m += step) points.push({ month: m, value: bookValueAt(purchaseCost, method, usefulLifeMonths, m) })
  if (points[points.length - 1].month !== end)
    points.push({ month: end, value: bookValueAt(purchaseCost, method, usefulLifeMonths, end) })
  return points
}
