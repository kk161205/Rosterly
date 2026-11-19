import type { LicenseItem } from '@/features/licenses/types/licenses'

export interface LicenseSummaryMetrics {
  totalLicenses: number
  totalSeats: number
  totalSeatsUsed: number
  utilizationPercent: number
  totalAnnualSpend: number
}

export function computeLicenseMetrics(items: LicenseItem[]): LicenseSummaryMetrics {
  const totalLicenses = items.length
  let totalSeats = 0
  let totalSeatsUsed = 0
  let totalAnnualSpend = 0

  for (const item of items) {
    totalSeats += item.total_seats || 0
    totalSeatsUsed += item.seats_used || 0
    if (item.cost_per_seat != null) {
      totalAnnualSpend += Number(item.cost_per_seat) * (item.total_seats || 0)
    }
  }

  const utilizationPercent =
    totalSeats > 0 ? Math.round((totalSeatsUsed / totalSeats) * 100) : 0

  return {
    totalLicenses,
    totalSeats,
    totalSeatsUsed,
    utilizationPercent,
    totalAnnualSpend,
  }
}

export function getUtilizationTone(seatsUsed: number, totalSeats: number): 'bad' | 'warn' | 'ok' {
  if (totalSeats <= 0) return 'ok'
  const ratio = seatsUsed / totalSeats
  if (ratio >= 1) return 'bad'
  if (ratio >= 0.9) return 'warn'
  return 'ok'
}
