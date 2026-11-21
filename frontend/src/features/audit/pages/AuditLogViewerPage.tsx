import React, { useState } from 'react'
import { Download } from 'lucide-react'
import { Alert, Button, EmptyState, ErrorState, PageHeader, Pagination, RowButton, SelectField, Skeleton, Table, Td, Th, THead, Tr } from '@/ui'
import { localISODate } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { useAuditLogs } from '@/features/audit/hooks/useAuditLogs'
import { AuditDiffDrawer } from '@/features/audit/components/AuditDiffDrawer'
import { exportAuditCsv } from '@/features/audit/lib/exportAuditCsv'
import { ACTION_LABEL, actionLabel, recordLabel, whenText } from '@/features/audit/lib/labels'
import type { AuditLogFilterParams, AuditLogItem } from '@/features/audit/types/audit'

const PAGE_SIZE = 25

const ACTION_OPTIONS = Object.entries(ACTION_LABEL)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label))

const PERIODS = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
]

function fromDays(days: string): string | undefined {
  if (!days) return undefined
  const d = new Date()
  d.setDate(d.getDate() - (Number(days) - 1))
  return localISODate(d)
}

/** who did what, and when. Raw codes stay in the CSV. */
export const AuditLogViewerPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [period, setPeriod] = useState('')
  const [selected, setSelected] = useState<AuditLogItem | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const filters: AuditLogFilterParams = { action: action || undefined, from: fromDays(period) }
  const { data, isLoading, isError, error, refetch } = useAuditLogs({ ...filters, page, page_size: PAGE_SIZE })
  const items = data?.items ?? []
  const total = data?.total ?? 0

  const onExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await exportAuditCsv(filters)
    } catch (err) {
      setExportError(getErrorMessage(err, 'The export didn’t finish. Try again.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Who did what, and when. Every change in Rosterly is recorded here and can’t be edited."
        actions={
          total > 0 && (
            <Button data-guide="audit.download" variant="secondary" size="sm" onClick={onExport} disabled={exporting}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {exporting ? 'Preparing…' : 'Download CSV'}
            </Button>
          )
        }
      />

      {exportError && <Alert tone="error">{exportError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <SelectField data-guide="audit.what"
          label="What happened"
          options={[{ value: '', label: 'Anything' }, ...ACTION_OPTIONS]}
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
        />
        <SelectField data-guide="audit.when"
          label="When"
          options={PERIODS}
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3" aria-label="Loading the audit log">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <ErrorState message={getErrorMessage(error, 'Couldn’t load the audit log.')} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing recorded"
          description={action || period ? 'Nothing matches these filters. Try “Anything” or a longer period.' : 'Changes appear here as people use Rosterly.'}
        />
      ) : (
        <div className="flex flex-col">
          <Table label="Audit log">
            <THead>
              <Th>What happened</Th>
              <Th>Who</Th>
              <Th>Record</Th>
              <Th>When</Th>
              <Th className="hidden lg:table-cell">From address</Th>
            </THead>
            <tbody>
              {items.map((log) => (
                <Tr key={log.id} selected={selected?.id === log.id}>
                  <Td>
                    <RowButton label={`${actionLabel(log.action)} — open details`} onClick={() => setSelected(log)}>
                      {actionLabel(log.action)}
                    </RowButton>
                  </Td>
                  <Td>{log.actor ? log.actor.full_name : <span className="text-muted">Rosterly (automatic)</span>}</Td>
                  <Td className="text-muted">{recordLabel(log.entity_type)}</Td>
                  <Td className="whitespace-nowrap text-muted">{whenText(log.created_at)}</Td>
                  <Td className="hidden font-mono text-meta text-muted lg:table-cell">{log.ip_address}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      )}

      <AuditDiffDrawer log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
