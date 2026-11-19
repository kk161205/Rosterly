import React from 'react'
import type { LicenseSummaryMetrics } from '@/features/licenses/lib/licenseCalculations'

export const LicenseSummaryCards: React.FC<{ metrics: LicenseSummaryMetrics }> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="region" aria-label="License summary statistics">
      <div className="flex flex-col gap-1 border-t-2 border-ink pt-3">
        <span className="text-meta font-medium text-muted">Total Licences</span>
        <span className="font-display text-metric text-ink">{metrics.totalLicenses}</span>
        <span className="text-micro text-muted">Active enterprise contracts</span>
      </div>

      <div className="flex flex-col gap-1 border-t-2 border-ink pt-3">
        <span className="text-meta font-medium text-muted">Entitled Seats</span>
        <span className="font-display text-metric text-ink">{metrics.totalSeats}</span>
        <span className="text-micro text-muted">Total purchased capacity</span>
      </div>

      <div className="flex flex-col gap-1 border-t-2 border-ink pt-3">
        <span className="text-meta font-medium text-muted">Seats Assigned</span>
        <span className="font-display text-metric text-ink">{metrics.totalSeatsUsed}</span>
        <span className="text-micro text-muted">Active device/user allocations</span>
      </div>

      <div className="flex flex-col gap-1 border-t-2 border-ink pt-3">
        <span className="text-meta font-medium text-muted">Utilisation Rate</span>
        <span
          className={`font-display text-metric ${
            metrics.utilizationPercent >= 90 ? 'text-status-warn' : 'text-ink'
          }`}
        >
          {metrics.utilizationPercent}%
        </span>
        <span className="text-micro text-muted">
          {metrics.utilizationPercent >= 90
            ? 'Action needed: capacity near ceiling'
            : 'Within healthy allocation bounds'}
        </span>
      </div>
    </div>
  )
}
