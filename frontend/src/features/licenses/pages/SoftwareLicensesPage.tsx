import React, { useState } from 'react'
import { Plus, Edit2 } from 'lucide-react'
import {
  PageHeader,
  Button,
  Table,
  THead,
  Th,
  Tr,
  Td,
  RowButton,
  Pagination,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/ui'
import { useCurrentUser, hasPermission } from '@/features/auth/hooks/useCurrentUser'
import { useLicenses } from '@/features/licenses/hooks/useLicenses'
import { LicenseSummaryCards } from '@/features/licenses/components/LicenseSummaryCards'
import {
  computeLicenseMetrics,
  getUtilizationTone,
} from '@/features/licenses/lib/licenseCalculations'
import type { LicenseItem } from '@/features/licenses/types/licenses'

export const SoftwareLicensesPage: React.FC = () => {
  const { user } = useCurrentUser()
  const canManage = hasPermission(user, 'software_license:create') || hasPermission(user, 'software_license:update')

  const [page, setPage] = useState(1)
  const pageSize = 25
  const [selectedLicense, setSelectedLicense] = useState<LicenseItem | null>(null)

  const { data, isLoading, isError, error, refetch } = useLicenses(page, pageSize)

  const items = data?.items || []
  const total = data?.total || 0
  const metrics = computeLicenseMetrics(items)

  const handleOpenAdd = () => {
    // Modal will be wired in Commit 24
  }

  const handleOpenEdit = (_license: LicenseItem) => {
    // Modal will be wired in Commit 24
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Software Licences"
        description="Track entitled seat allocations, renewal timelines, and device license holders."
        actions={
          canManage && (
            <Button variant="primary" onClick={handleOpenAdd}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Add Licence
            </Button>
          )
        }
      />

      <LicenseSummaryCards metrics={metrics} />

      {isLoading ? (
        <div className="flex flex-col gap-3 py-6" aria-label="Loading software licenses">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load software licenses.'}
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No software licences configured"
          description="Register software licenses and track seat utilization against your employee assets."
          action={
            canManage ? (
              <Button variant="secondary" onClick={handleOpenAdd}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add your first licence
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Table label="Software licences">
            <THead>
              <Th>Licence Name</Th>
              <Th>Vendor</Th>
              <Th>Seat Allocation</Th>
              <Th>Cost / Seat</Th>
              <Th>Renewal Date</Th>
              {canManage && <Th className="text-right">Actions</Th>}
            </THead>
            <tbody>
              {items.map((lic) => {
                const tone = getUtilizationTone(lic.seats_used, lic.total_seats)
                const percentage =
                  lic.total_seats > 0
                    ? Math.min(100, Math.round((lic.seats_used / lic.total_seats) * 100))
                    : 0

                const renewalString = lic.renewal_date
                  ? new Date(lic.renewal_date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Perpetual / Ongoing'

                const costString =
                  lic.cost_per_seat != null
                    ? `₹${Number(lic.cost_per_seat).toLocaleString('en-IN')}`
                    : '—'

                return (
                  <Tr
                    key={lic.id}
                    onClick={() => setSelectedLicense(lic)}
                    selected={selectedLicense?.id === lic.id}
                    className="cursor-pointer hover:bg-row-hover"
                  >
                    <Td>
                      <RowButton
                        label={`View seat holders for ${lic.name}`}
                        onClick={() => setSelectedLicense(lic)}
                      >
                        <span className="font-medium text-ink">{lic.name}</span>
                        <span className="text-micro text-muted">Click to view seat holders</span>
                      </RowButton>
                    </Td>
                    <Td className="text-muted">{lic.vendor}</Td>
                    <Td>
                      <div className="flex flex-col gap-1.5 min-w-36">
                        <div className="flex items-center justify-between text-meta">
                          <span className="font-mono font-medium text-ink">
                            {lic.seats_used} / {lic.total_seats}
                          </span>
                          <span
                            className={`font-mono text-micro ${
                              tone === 'warn' || tone === 'bad' ? 'font-semibold text-status-warn' : 'text-muted'
                            }`}
                          >
                            {percentage}%
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-ground">
                          <div
                            className={`h-full transition-all duration-300 ${
                              tone === 'bad'
                                ? 'bg-status-bad'
                                : tone === 'warn'
                                ? 'bg-status-warn'
                                : 'bg-navy'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </Td>
                    <Td className="font-mono text-ink">{costString}</Td>
                    <Td className="text-muted">{renewalString}</Td>
                    {canManage && (
                      <Td className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenEdit(lic)
                          }}
                        >
                          <Edit2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          Edit
                        </Button>
                      </Td>
                    )}
                  </Tr>
                )
              })}
            </tbody>
          </Table>

          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
