import React, { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Alert, Button, DetailRow, EmptyState, ErrorState, SidePanel, Skeleton, TextField } from '@/ui'
import { LICENSES_KEY, useLicenseHolders } from '@/features/licenses/hooks/useLicenses'
import { licenseService } from '@/features/licenses/services/licenseService'
import type { LicenseItem } from '@/features/licenses/types/licenses'
import { employeeService } from '@/features/employees/services/employeeService'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney } from '@/lib/format'

interface PersonOption {
  id: string
  full_name: string
  designation: string
}

const PROVIDER_NAME: Record<string, string> = { microsoft_365: 'Microsoft 365', google_workspace: 'Google Workspace' }

/**
 * Who holds a seat. IT gives and frees seats here; seats for a licence
 * kept in step by a connected provider are changed in that provider instead.
 */
export const LicenseSeatDrawer: React.FC<{ license: LicenseItem | null; canEdit: boolean; onClose: () => void }> = ({
  license,
  canEdit,
  onClose,
}) => {
  const queryClient = useQueryClient()
  const holders = useLicenseHolders(license?.id ?? null, Boolean(license))
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    setSearch('')
    setError(null)
  }, [license?.id])

  const people = useQuery({
    queryKey: ['licence-seat-people', term],
    queryFn: async () => (await employeeService.getEmployees({ search: term, page_size: 6, status: 'active' })).items as PersonOption[],
    enabled: Boolean(license) && term.length > 1,
  })

  if (!license) return null
  const managed = license.source !== 'manual'
  const free = license.total_seats - license.seats_used
  const list = holders.data?.holders ?? []
  const holderIds = new Set(list.map((h) => h.employee_id))

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: LICENSES_KEY })
      setSearch('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <SidePanel open onOpenChange={(open) => !open && onClose()} title={license.name} description={license.vendor}>
      <div className="flex flex-col gap-6">
        <dl className="m-0">
          <DetailRow label="Seats">
            {license.seats_used} of {license.total_seats} in use{free > 0 ? ` · ${free} free` : ''}
          </DetailRow>
          <DetailRow label="Price per seat a year">{license.cost_per_seat != null ? formatMoney(license.cost_per_seat) : '—'}</DetailRow>
          <DetailRow label="Renews on">{license.renewal_date ? formatDate(license.renewal_date) : 'Not set'}</DetailRow>
          {managed && (
            <DetailRow label="Seats come from">
              {PROVIDER_NAME[license.source] ?? license.source}
              {license.last_synced_at ? ` · checked ${formatDate(license.last_synced_at)}` : ''}
            </DetailRow>
          )}
        </dl>

        {error && <Alert>{error}</Alert>}

        {canEdit && !managed && (
          <section aria-labelledby="give-seat-heading" className="flex flex-col gap-2">
            <h3 id="give-seat-heading" className="text-section text-ink">
              Give someone a seat
            </h3>
            {free <= 0 ? (
              <p className="text-body text-muted">All seats are in use. Free one below, or edit the licence to add seats.</p>
            ) : (
              <>
                <TextField
                  label="Person"
                  hideLabel
                  placeholder="Search by name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  trailing={<Search className="mr-1 h-4 w-4 text-muted" aria-hidden="true" />}
                />
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Matching people">
                  {(people.data ?? [])
                    .filter((p) => !holderIds.has(p.id))
                    .map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 rounded-card px-3 py-2 hover:bg-row-hover">
                        <span className="flex flex-col">
                          <span className="text-body font-medium text-ink">{p.full_name}</span>
                          <span className="text-meta text-muted">{p.designation}</span>
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={busy === p.id}
                          aria-label={`Give ${p.full_name} a seat`}
                          onClick={() => run(p.id, () => licenseService.assignSeat(license.id, p.id))}
                        >
                          Give seat
                        </Button>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section aria-labelledby="holders-heading" className="flex flex-col gap-2">
          <h3 id="holders-heading" className="text-section text-ink">
            Who has a seat
          </h3>
          {holders.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : holders.isError ? (
            <ErrorState message={getErrorMessage(holders.error)} onRetry={() => holders.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState title="Nobody yet" description={managed ? 'Seats appear here when they’re assigned in the provider.' : 'Give someone a seat above.'} />
          ) : (
            <ul className="m-0 list-none border-t border-ink p-0">
              {list.map((h) => (
                <li key={h.assignment_id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body font-medium text-ink">{h.full_name}</span>
                    <span className="truncate text-meta text-muted">
                      {h.email} · since {formatDate(h.assigned_at)}
                    </span>
                  </span>
                  {canEdit && h.source === 'manual' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      isLoading={busy === h.assignment_id}
                      onClick={() => run(h.assignment_id, () => licenseService.removeSeat(license.id, h.assignment_id))}
                      aria-label={`Free ${h.full_name}’s seat`}
                    >
                      Free seat
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SidePanel>
  )
}
