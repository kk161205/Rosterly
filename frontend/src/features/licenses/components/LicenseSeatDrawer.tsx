import React from 'react'
import { Link } from 'react-router-dom'
import { Laptop, User, ExternalLink } from 'lucide-react'
import { SidePanel, DetailRow, Button, Skeleton, EmptyState, ErrorState } from '@/ui'
import { useLicenseHolders } from '@/features/licenses/hooks/useLicenses'
import type { LicenseItem } from '@/features/licenses/types/licenses'

interface LicenseSeatDrawerProps {
  license: LicenseItem | null
  onClose: () => void
}

export const LicenseSeatDrawer: React.FC<LicenseSeatDrawerProps> = ({ license, onClose }) => {
  const { data, isLoading, isError, error, refetch } = useLicenseHolders(
    license?.id ?? null,
    Boolean(license),
  )

  if (!license) return null

  const holders = data?.holders || []

  const formattedRenewal = license.renewal_date
    ? new Date(license.renewal_date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Perpetual / Ongoing'

  return (
    <SidePanel
      open={Boolean(license)}
      onOpenChange={(open) => !open && onClose()}
      title={license.name}
      description={`Seat allocation and hardware consumer inspector for ${license.vendor}.`}
      footer={
        <div className="flex w-full items-center justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Overview details */}
        <section className="flex flex-col rounded-card border border-line bg-ground/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-body font-semibold text-ink">{license.vendor}</span>
            <span className="font-mono text-meta font-medium text-navy">
              {license.seats_used} / {license.total_seats} seats used
            </span>
          </div>
          <DetailRow label="Cost per seat">
            {license.cost_per_seat != null ? `₹${Number(license.cost_per_seat).toLocaleString('en-IN')}` : '—'}
          </DetailRow>
          <DetailRow label="Renewal date">{formattedRenewal}</DetailRow>
        </section>

        {/* Assigned Seat Holders List */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-body font-semibold text-ink">Assigned Seat Holders</h4>
            <span className="text-meta text-muted">{holders.length} active</span>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2.5 py-2" aria-label="Loading seat holders">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : isError ? (
            <ErrorState
              message={error instanceof Error ? error.message : 'Could not load license seat holders.'}
              onRetry={() => refetch()}
            />
          ) : holders.length === 0 ? (
            <EmptyState
              title="No seat assignments"
              description="No employee devices are currently linked to this software license."
            />
          ) : (
            <div className="divide-y divide-line-soft rounded-card border border-line bg-paper">
              {holders.map((holder) => (
                <div key={holder.employee_id + holder.asset_id} className="flex flex-col gap-2 p-3 text-body">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-pill bg-ground text-micro font-medium text-ink">
                        <User className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{holder.full_name}</span>
                        <span className="text-micro text-muted">{holder.email}</span>
                      </div>
                    </div>

                    <Link
                      to={`/assets/${holder.asset_id}`}
                      className="inline-flex items-center gap-1 text-micro font-medium text-navy hover:underline focus:outline-none"
                    >
                      <span>View Asset</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 rounded bg-ground/60 px-2.5 py-1.5 text-meta">
                    <Laptop className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="font-mono text-micro font-semibold text-ink">{holder.asset_tag}</span>
                    <span className="text-muted">•</span>
                    <span className="truncate text-micro text-muted">{holder.asset_name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </SidePanel>
  )
}
