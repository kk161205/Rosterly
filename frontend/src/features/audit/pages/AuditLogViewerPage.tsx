import React, { useState } from 'react'
import {
  PageHeader,
  Table,
  THead,
  Th,
  Tr,
  Td,
  RowButton,
  Pagination,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  SelectField,
  TextField,
} from '@/ui'
import { useAuditLogs } from '@/features/audit/hooks/useAuditLogs'
import { AuditActionChip } from '@/features/audit/components/AuditActionChip'
import { AuditDiffDrawer } from '@/features/audit/components/AuditDiffDrawer'
import { exportAuditCsv } from '@/features/audit/lib/exportAuditCsv'
import { Download } from 'lucide-react'
import type { AuditLogItem } from '@/features/audit/types/audit'

const ACTION_OPTIONS = [
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'force_logout', label: 'Force logout' },
  { value: 'role_assigned', label: 'Role assigned' },
]

const ENTITY_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'asset', label: 'Asset' },
  { value: 'request', label: 'Request' },
  { value: 'role', label: 'Role' },
  { value: 'license', label: 'Software License' },
  { value: 'approval_chain', label: 'Approval Chain' },
  { value: 'leave_request', label: 'Leave Request' },
]

export const AuditLogViewerPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const pageSize = 25
  const [actionFilter, setActionFilter] = useState<string>('')
  const [entityFilter, setEntityFilter] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null)

  const { data, isLoading, isError, error, refetch } = useAuditLogs({
    action: actionFilter || undefined,
    entity_type: entityFilter || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    page,
    page_size: pageSize,
  })

  const items = data?.items || []
  const total = data?.total || 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit Log"
        description="System-wide activity stream for compliance, security review, and data change inspection."
        actions={
          items.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportAuditCsv(items)}
            >
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Export Audit CSV
            </Button>
          )
        }
      />

      {/* Filter toolbar */}
      <div className="grid grid-cols-1 gap-4 rounded-card border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Action"
          placeholder="All actions"
          options={ACTION_OPTIONS}
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value)
            setPage(1)
          }}
        />

        <SelectField
          label="Entity Type"
          placeholder="All entities"
          options={ENTITY_OPTIONS}
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value)
            setPage(1)
          }}
        />

        <TextField
          label="From date"
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value)
            setPage(1)
          }}
        />

        <TextField
          label="To date"
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 py-6" aria-label="Loading audit logs">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load audit logs.'}
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No audit events found"
          description="Try clearing or broadening your search filters to find historical activity."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Table label="Audit events">
            <THead>
              <Th>Timestamp</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Target Resource</Th>
              <Th>Client IP</Th>
            </THead>
            <tbody>
              {items.map((log) => {
                const dateObj = new Date(log.created_at)
                const formattedDate = dateObj.toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
                const formattedTime = dateObj.toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })

                return (
                  <Tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    selected={selectedLog?.id === log.id}
                    className="cursor-pointer hover:bg-row-hover"
                  >
                    <Td className="whitespace-nowrap font-mono text-micro text-muted">
                      <RowButton
                        label={`View audit log details for ${log.action} on ${log.entity_type}`}
                        onClick={() => setSelectedLog(log)}
                      >
                        <span>{formattedDate} {formattedTime}</span>
                      </RowButton>
                    </Td>
                    <Td>
                      {log.actor ? (
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-ground text-micro font-medium text-ink">
                            {log.actor.full_name.charAt(0).toUpperCase()}
                          </span>
                          <div className="flex flex-col">
                            <span className="text-body font-medium text-ink">{log.actor.full_name}</span>
                            <span className="text-micro text-muted">{log.actor.email}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-micro text-muted">System (automated)</span>
                      )}
                    </Td>
                    <Td>
                      <AuditActionChip action={log.action} />
                    </Td>
                    <Td className="font-mono text-micro text-ink">
                      <span className="mr-1.5 font-semibold uppercase text-muted">{log.entity_type}</span>
                      <span title={log.entity_id}>{log.entity_id.slice(0, 8)}…</span>
                    </Td>
                    <Td className="font-mono text-micro text-muted">
                      {log.ip_address}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
          />
        </div>
      )}

      <AuditDiffDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  )
}
