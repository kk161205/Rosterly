import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { maintenanceService } from '@/features/assets/services/maintenanceService'
import { RaiseTicketDialog, PRIORITIES } from '@/features/assets/components/actions/AssetActionDialogs'
import { ASSETS_KEY } from '@/features/assets/hooks/useAssets'
import type { MaintenanceTicket, TicketPriority, TicketStatus } from '@/features/assets/types/assets'
import { useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { INBOX_KEY } from '@/features/inbox/hooks/useInbox'
import { useUrlFilters } from '@/lib/useUrlFilters'
import { getErrorMessage } from '@/lib/errors'
import { formatAge, formatDate, humanize } from '@/lib/format'
import {
  Alert,
  Button,
  DetailRow,
  EmptyState,
  ErrorState,
  FilterTabs,
  PageHeader,
  Pagination,
  RowButton,
  SelectField,
  SidePanel,
  Skeleton,
  Status,
  Table,
  Td,
  Th,
  THead,
  Tr,
  cn,
} from '@/ui'

const PAGE_SIZE = 20
const TICKETS_KEY = ['maintenance'] as const
const STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed']
type View = 'table' | 'board'
type StatusTab = 'active' | TicketStatus | 'all'

const priorityClass: Record<string, string> = {
  critical: 'text-status-bad font-medium',
  high: 'text-status-warn font-medium',
  medium: 'text-ink',
  low: 'text-muted',
}

/** Priority is a word (never colour alone), stronger for high and critical. */
const Priority: React.FC<{ value: string }> = ({ value }) => (
  <span className={cn('text-body', priorityClass[value] ?? 'text-ink')}>{humanize(value)}</span>
)

/**
 * Maintenance (§5.10): IT's working queue. Table by default with a board
 * toggle; the side panel changes status, priority and assignee. Everyone else
 * sees the tickets they raised and can raise one for a device they hold.
 */
export const MaintenanceTicketsPage: React.FC = () => {
  const { user, can } = useCurrentUser()
  const canUpdate = can('maintenance_ticket:update')
  const { params, update } = useUrlFilters()
  const view = (params.get('view') as View) || 'table'
  const tab = (params.get('status') as StatusTab) || 'active'
  const priority = params.get('priority') ?? ''
  const mine = params.get('mine') === '1'
  const page = Number(params.get('page') ?? '1')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [raising, setRaising] = useState(false)


  // The board shows every status as a column, so it loads one large page
  const filters = {
    status: view === 'table' && tab !== 'active' && tab !== 'all' ? (tab as TicketStatus) : undefined,
    priority: (priority || undefined) as TicketPriority | undefined,
    assigned_to: mine && user ? user.id : undefined,
    page: view === 'board' ? 1 : page,
    page_size: view === 'board' ? 100 : tab === 'active' ? 100 : PAGE_SIZE,
  }
  const list = useQuery({
    queryKey: [...TICKETS_KEY, filters],
    queryFn: () => maintenanceService.list(filters),
    placeholderData: keepPreviousData,
  })

  // "Active" (open + in progress) is the default working view; filtered client-side from one page
  const all = list.data?.items ?? []
  const items = view === 'table' && tab === 'active' ? all.filter((t) => t.status === 'open' || t.status === 'in_progress') : all
  const selected = all.find((t) => t.id === selectedId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Maintenance"
        description={
          canUpdate || can('maintenance_ticket:read')
            ? 'Repairs and service issues, from report to resolved.'
            : 'Tickets you’ve raised for your devices, and their progress.'
        }
        actions={
          <Button variant="primary" onClick={() => setRaising(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Raise ticket
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {view === 'table' && (
          <FilterTabs
            label="Filter by status"
            value={tab}
            onChange={(v) => update({ status: v === 'active' ? null : v })}
            tabs={[
              { value: 'active', label: 'Active' },
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'closed', label: 'Closed' },
              { value: 'all', label: 'All' },
            ]}
          />
        )}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <SelectField
              label="Priority"
              hideLabel
              className="w-44"
              options={[{ value: '', label: 'Any priority' }, ...PRIORITIES]}
              value={priority}
              onChange={(e) => update({ priority: e.target.value })}
            />
            {canUpdate && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body text-ink">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-navy"
                  checked={mine}
                  onChange={(e) => update({ mine: e.target.checked ? '1' : null })}
                />
                Assigned to me
              </label>
            )}
          </div>
          <FilterTabs
            label="View"
            className="shrink-0 border-b-0"
            value={view}
            onChange={(v) => update({ view: v === 'table' ? null : v })}
            tabs={[
              { value: 'table', label: 'Table' },
              { value: 'board', label: 'Board' },
            ]}
          />
        </div>
      </div>

      {list.isLoading ? (
        <div className="flex flex-col gap-4" aria-label="Loading tickets">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, 'Tickets could not be loaded.')} onRetry={() => list.refetch()} />
      ) : view === 'board' ? (
        <TicketBoard tickets={items} canMove={canUpdate} onOpen={setSelectedId} />
      ) : items.length === 0 ? (
        <EmptyState
          title={tab === 'active' ? 'No open tickets' : 'No tickets here'}
          description={
            tab === 'active'
              ? 'Nothing is waiting for repair. New tickets appear here as soon as they’re raised.'
              : 'Try another status or priority.'
          }
        />
      ) : (
        <div className={cn(list.isFetching && 'opacity-70 transition-opacity')}>
          <Table label="Tickets" className="hidden md:block">
            <THead>
              <Th>Issue</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
              <Th>Assigned to</Th>
              <Th>Opened</Th>
            </THead>
            <tbody>
              {items.map((t) => (
                <Tr key={t.id} onClick={() => setSelectedId(t.id)} selected={t.id === selectedId}>
                  <Td className="max-w-md">
                    <RowButton onClick={() => setSelectedId(t.id)} label={`Open ticket: ${t.issue_description}`}>
                      <span className="line-clamp-2 font-medium text-ink">{t.issue_description}</span>
                      <span className="text-meta text-muted">
                        <span className="font-mono">{t.asset_tag}</span>
                        {t.asset_name && ` · ${t.asset_name}`}
                      </span>
                    </RowButton>
                  </Td>
                  <Td>
                    <Priority value={t.priority} />
                  </Td>
                  <Td>
                    <Status value={t.status} />
                  </Td>
                  <Td className={cn('whitespace-nowrap', t.assignee_name ? 'text-ink' : 'text-muted')}>{t.assignee_name ?? 'Unassigned'}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(t.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <ul className="m-0 list-none border-t border-ink p-0 md:hidden" aria-label="Tickets">
            {items.map((t) => (
              <li key={t.id} className="border-b border-line-soft">
                <button type="button" onClick={() => setSelectedId(t.id)} className="flex w-full flex-col gap-1 py-3 text-left">
                  <span className="line-clamp-2 text-body font-medium text-ink">{t.issue_description}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted">
                    <Status value={t.status} />
                    <Priority value={t.priority} />
                    <span className="font-mono">{t.asset_tag}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {tab !== 'active' && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={(p) => update({ page: String(p) })} />
          )}
        </div>
      )}

      <TicketPanel ticket={selected} canUpdate={canUpdate} onClose={() => setSelectedId(null)} />
      <RaiseTicketDialog open={raising} onOpenChange={setRaising} />
    </div>
  )
}

// ---------------------------------------------------------------- board

const TicketBoard: React.FC<{ tickets: MaintenanceTicket[]; canMove: boolean; onOpen: (id: string) => void }> = ({
  tickets,
  canMove,
  onOpen,
}) => {
  const queryClient = useQueryClient()
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<TicketStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const move = async (id: string, status: TicketStatus) => {
    const ticket = tickets.find((t) => t.id === id)
    if (!ticket || ticket.status === status) return
    setError(null)
    try {
      await maintenanceService.update(id, { status })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TICKETS_KEY }),
        queryClient.invalidateQueries({ queryKey: INBOX_KEY }),
      ])
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      {canMove ? (
        <p className="text-meta text-muted">
          {/* Dragging needs a pointer; phones and keyboards change status from the ticket */}
          <span className="hidden md:inline">Drag a card to another column, or open a ticket to change its status.</span>
          <span className="md:hidden">Open a ticket to change its status.</span>
        </p>
      ) : (
        <p className="text-meta text-muted">Open a ticket to see its details.</p>
      )}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((status) => {
          const column = tickets.filter((t) => t.status === status)
          return (
            <section
              key={status}
              aria-label={humanize(status)}
              onDragOver={(e) => {
                if (!canMove || !dragId) return
                e.preventDefault()
                setOver(status)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                if (dragId) void move(dragId, status)
                setDragId(null)
              }}
              className={cn('flex min-h-40 flex-col rounded-card transition-colors', over === status && 'bg-navy-tint')}
            >
              <h2 className="flex items-baseline justify-between border-b border-ink pb-2 text-section text-ink">
                {humanize(status)}
                <span className="text-micro font-normal tabular-nums text-muted">{column.length}</span>
              </h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {column.map((t) => (
                  <li
                    key={t.id}
                    draggable={canMove}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn('border-b border-line-soft', canMove && 'cursor-grab active:cursor-grabbing', dragId === t.id && 'opacity-50')}
                  >
                    <button type="button" onClick={() => onOpen(t.id)} className="flex w-full flex-col gap-1.5 px-1 py-3 text-left hover:bg-row-hover">
                      <span className="line-clamp-3 text-body text-ink">{t.issue_description}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-meta text-muted">
                        <span className="font-mono">{t.asset_tag}</span>
                        <span aria-hidden="true">·</span>
                        <Priority value={t.priority} />
                      </span>
                      <span className="text-meta text-muted">{t.assignee_name ?? 'Unassigned'} · {formatAge(t.created_at)} ago</span>
                    </button>
                  </li>
                ))}
                {column.length === 0 && <li className="py-3 text-meta text-muted">None</li>}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- panel

const TicketPanel: React.FC<{ ticket: MaintenanceTicket | null; canUpdate: boolean; onClose: () => void }> = ({
  ticket,
  canUpdate,
  onClose,
}) => {
  const queryClient = useQueryClient()
  const assignees = useQuery({ queryKey: ['ticket-assignees'], queryFn: maintenanceService.assignees, enabled: canUpdate && Boolean(ticket) })
  const [status, setStatus] = useState<string>('')
  const [priority, setPriority] = useState<string>('')
  const [assignee, setAssignee] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticket) return
    setStatus(ticket.status)
    setPriority(ticket.priority)
    setAssignee(ticket.assigned_to ?? '')
    setError(null)
  }, [ticket])

  if (!ticket) return null
  const dirty = status !== ticket.status || priority !== ticket.priority || assignee !== (ticket.assigned_to ?? '')

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await maintenanceService.update(ticket.id, {
        ...(status !== ticket.status ? { status: status as TicketStatus } : {}),
        ...(priority !== ticket.priority ? { priority: priority as TicketPriority } : {}),
        ...(assignee !== (ticket.assigned_to ?? '') ? { assigned_to: assignee || null } : {}),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TICKETS_KEY }),
        queryClient.invalidateQueries({ queryKey: ASSETS_KEY }),
        queryClient.invalidateQueries({ queryKey: INBOX_KEY }),
      ])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Ticket"
      description={`${ticket.asset_tag ?? ''}${ticket.asset_name ? ` · ${ticket.asset_name}` : ''}`}
      footer={
        canUpdate && (
          <Button variant="primary" className="flex-1" disabled={!dirty} isLoading={busy} onClick={save}>
            Save changes
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <p className="border-l-2 border-line pl-4 text-lead text-ink">{ticket.issue_description}</p>
        {error && <Alert>{error}</Alert>}
        {canUpdate ? (
          <div className="flex flex-col gap-5">
            <SelectField
              label="Status"
              options={STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            />
            <SelectField label="Priority" options={PRIORITIES} value={priority} onChange={(e) => setPriority(e.target.value)} />
            <SelectField
              label="Assigned to"
              options={[{ value: '', label: 'Unassigned' }, ...(assignees.data ?? []).map((a) => ({ value: a.id, label: a.full_name }))]}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>
        ) : (
          <dl className="m-0">
            <DetailRow label="Status">
              <Status value={ticket.status} />
            </DetailRow>
            <DetailRow label="Priority">
              <Priority value={ticket.priority} />
            </DetailRow>
            <DetailRow label="Assigned to">{ticket.assignee_name ?? 'Unassigned'}</DetailRow>
          </dl>
        )}
        <dl className="m-0">
          <DetailRow label="Asset">
            <Link to={`/assets/${ticket.asset_id}`} className="text-navy underline decoration-control underline-offset-4">
              {ticket.asset_name ?? ticket.asset_tag ?? 'Open asset'}
            </Link>
          </DetailRow>
          <DetailRow label="Reported by">{ticket.reporter_name ?? '—'}</DetailRow>
          <DetailRow label="Opened">{formatDate(ticket.created_at)}</DetailRow>
          {ticket.resolved_at && <DetailRow label="Resolved">{formatDate(ticket.resolved_at)}</DetailRow>}
        </dl>
      </div>
    </SidePanel>
  )
}
