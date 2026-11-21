import React, { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, X } from 'lucide-react'
import { requestService } from '@/features/requests/services/requestService'
import { NewRequestDialog } from '@/features/requests/components/NewRequestDialog'
import type { RequestApproval, RequestStatus, RequestSummary } from '@/features/requests/types/requests'
import { roleLabel, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { INBOX_KEY } from '@/features/inbox/hooks/useInbox'
import { useUrlFilters, pageFrom } from '@/lib/useUrlFilters'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney, humanize } from '@/lib/format'
import {
  Alert,
  Button,
  DetailRow,
  Dialog,
  EmptyState,
  ErrorState,
  FilterTabs,
  PageHeader,
  Pagination,
  RowButton,
  SidePanel,
  Skeleton,
  Status,
  StatusText,
  Table,
  Td,
  TextAreaField,
  Th,
  THead,
  Tr,
  cn,
} from '@/ui'

const PAGE_SIZE = 20
const REQUESTS_KEY = ['requests', 'mine'] as const
type Tab = 'all' | RequestStatus

const TYPE_LABEL: Record<string, string> = {
  asset_request: 'Equipment',
  access_request: 'Access',
  it_ticket: 'IT help',
  other: 'Other',
}

/** "Waiting on IT admin · step 2 of 3" — where a request stands, in words (UI plan). */
function position(r: RequestSummary): React.ReactNode {
  if (r.status === 'pending')
    return (
      <span className="flex flex-col gap-0.5">
        <StatusText tone="info">Waiting on {roleLabel(r.waiting_on_role) || 'approval'}</StatusText>
        {r.total_steps > 1 && <span className="text-meta text-muted">Step {r.current_step} of {r.total_steps}</span>}
      </span>
    )
  return <Status value={r.status} />
}

/**
 * Requests: what you've asked for and where each one stands, with a
 * side panel showing the approval timeline. Approving others' requests is in
 * the Inbox.
 */
export const UnifiedRequestsPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { params, update } = useUrlFilters()
  const tab = (params.get('status') as Tab) || 'all'
  const page = pageFrom(params)
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get('id'))
  const [creating, setCreating] = useState(params.get('new') === '1')
  const { can } = useCurrentUser()
  const canFulfil = can('request:fulfil')
  const view = canFulfil && params.get('view') === 'fulfil' ? 'fulfil' : 'mine'


  const query = { status: tab === 'all' ? undefined : tab, page, page_size: PAGE_SIZE }
  const list = useQuery({
    queryKey: [...REQUESTS_KEY, view, query],
    queryFn: () =>
      view === 'fulfil'
        ? requestService.toFulfil({ ...query, status: query.status as RequestStatus | undefined })
        : requestService.mine(query),
    placeholderData: keepPreviousData,
  })
  const items = list.data?.items ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Requests"
        description="Ask for equipment, access or IT help, and follow each request to a decision."
        actions={
          <Button data-guide="requests.new" variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New request
          </Button>
        }
      />

      {canFulfil && (
        <FilterTabs data-guide="requests.whose"
          label="Whose requests"
          value={view}
          onChange={(v) => update({ view: v === 'fulfil' ? 'fulfil' : null, status: null, page: null })}
          tabs={[
            { value: 'mine', label: 'My requests' },
            { value: 'fulfil', label: 'To fulfil' },
          ]}
        />
      )}

      <FilterTabs data-guide="requests.status"
        label="Filter by status"
        value={tab}
        onChange={(v) => update({ status: v === 'all' ? null : v })}
        tabs={
          view === 'fulfil'
            ? [
                { value: 'all', label: 'To do' },
                { value: 'approved', label: 'Not started' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'completed', label: 'Done' },
              ]
            : [
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Waiting' },
                { value: 'approved', label: 'Approved' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'completed', label: 'Done' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'cancelled', label: 'Cancelled' },
              ]
        }
      />

      {list.isLoading ? (
        <div className="flex flex-col gap-4" aria-label="Loading requests">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, 'Your requests could not be loaded.')} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={view === 'fulfil' ? 'Nothing to fulfil' : tab === 'all' ? 'No requests yet' : 'Nothing here'}
          description={
            view === 'fulfil'
              ? 'Approved requests for your team appear here.'
              : tab === 'all'
                ? 'When you need equipment, access or IT help, ask here and follow it to a decision.'
                : 'Try another status.'
          }
          action={
            tab === 'all' && view === 'mine' ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                New request
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn(list.isFetching && 'opacity-70 transition-opacity')}>
          <Table label="Your requests" className="hidden md:block">
            <THead>
              <Th>Request</Th>
              <Th>Where it stands</Th>
              <Th>Submitted</Th>
            </THead>
            <tbody>
              {items.map((r) => (
                <Tr key={r.id} onClick={() => setSelectedId(r.id)} selected={r.id === selectedId}>
                  <Td className="max-w-lg">
                    <RowButton onClick={() => setSelectedId(r.id)} label={`Open request: ${r.title}`}>
                      <span className="font-medium text-ink">{r.title}</span>
                      <span className="text-meta text-muted">
                        {view === 'fulfil' && r.requester_name ? `${r.requester_name} · ` : ''}
                        {TYPE_LABEL[r.request_type]}
                        {r.estimated_cost !== null && ` · ${formatMoney(r.estimated_cost)}`}
                      </span>
                    </RowButton>
                  </Td>
                  <Td>{position(r)}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(r.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <ul className="m-0 list-none border-t border-ink p-0 md:hidden" aria-label="Your requests">
            {items.map((r) => (
              <li key={r.id} className="border-b border-line-soft">
                <button type="button" onClick={() => setSelectedId(r.id)} className="flex w-full flex-col gap-1.5 py-3 text-left">
                  <span className="text-body font-medium text-ink">{r.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted">
                    {position(r)}
                    <span>{formatDate(r.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={(p) => update({ page: String(p) })} />
        </div>
      )}

      <RequestPanel id={selectedId} canFulfil={view === 'fulfil'} onClose={() => setSelectedId(null)} />
      <NewRequestDialog
        open={creating}
        onOpenChange={(o) => {
          setCreating(o)
          if (!o && params.get('new')) update({ new: null })
        }}
        onCreated={async (created) => {
          setCreating(false)
          await queryClient.invalidateQueries({ queryKey: REQUESTS_KEY })
          await queryClient.invalidateQueries({ queryKey: INBOX_KEY })
          setSelectedId(created.id)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- detail panel

function stepLine(a: RequestApproval): { title: string; detail: string | null; tone: string; icon: React.ReactNode } {
  const role = roleLabel(a.approver_role_name) || 'Approver'
  if (a.status === 'approved')
    return {
      title: `${a.approver_name ?? role} approved`,
      detail: a.decision_at ? `${role} · ${formatDate(a.decision_at)}` : role,
      tone: 'bg-status-ok text-paper',
      icon: <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />,
    }
  if (a.status === 'rejected')
    return {
      title: `${a.approver_name ?? role} rejected`,
      detail: a.decision_at ? `${role} · ${formatDate(a.decision_at)}` : role,
      tone: 'bg-status-bad text-paper',
      icon: <X className="h-3 w-3" strokeWidth={3} aria-hidden="true" />,
    }
  if (a.status === 'skipped') return { title: `${role} — skipped`, detail: a.comments, tone: 'bg-line', icon: null }
  return { title: role, detail: 'Waiting', tone: 'border-2 border-control bg-paper', icon: null }
}

const RequestPanel: React.FC<{ id: string | null; canFulfil?: boolean; onClose: () => void }> = ({ id, canFulfil = false, onClose }) => {
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['requests', 'detail', id], queryFn: () => requestService.get(id!), enabled: Boolean(id) })
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moving, setMoving] = useState<'in_progress' | 'completed' | null>(null)
  const [note, setNote] = useState('')
  // A different request opened: start clean.
  useEffect(() => {
    setConfirming(false)
    setError(null)
    setMoving(null)
    setNote('')
  }, [id])

  if (!id) return null
  const r = detail.data
  const approvals = (r?.approvals ?? []).slice().sort((a, b) => a.step_order - b.step_order)

  const cancel = async () => {
    setBusy(true)
    setError(null)
    try {
      await requestService.cancel(id)
      setConfirming(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['requests'] }),
        queryClient.invalidateQueries({ queryKey: INBOX_KEY }),
      ])
    } catch (err) {
      setError(getErrorMessage(err))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={r?.title ?? 'Request'}
      description={r ? `${TYPE_LABEL[r.request_type]} · submitted ${formatDate(r.created_at)}` : undefined}
      footer={
        canFulfil && r && (r.status === 'approved' || r.status === 'in_progress') ? (
          <>
            {r.status === 'approved' && (
              <Button variant="secondary" onClick={() => setMoving('in_progress')}>
                Start work
              </Button>
            )}
            <Button variant="primary" onClick={() => setMoving('completed')}>
              Mark done
            </Button>
          </>
        ) : (
          !canFulfil &&
          r?.status === 'pending' && (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Cancel request
            </Button>
          )
        )
      }
    >
      {detail.isLoading || !r ? (
        detail.isError ? (
          <ErrorState message={getErrorMessage(detail.error)} onRetry={() => detail.refetch()} />
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-7">
          {error && <Alert>{error}</Alert>}
          <div>{position(r)}</div>
          <p className="border-l-2 border-line pl-4 text-lead text-ink">{r.description}</p>
          <dl className="m-0">
            <DetailRow label="Priority">{humanize(r.priority)}</DetailRow>
            {r.estimated_cost !== null && <DetailRow label="Estimated cost">{formatMoney(r.estimated_cost)}</DetailRow>}
            {r.related_asset_name && <DetailRow label="Asset">{r.related_asset_name}</DetailRow>}
            {canFulfil && r.requester_name && <DetailRow label="Asked by">{r.requester_name}</DetailRow>}
            {r.fulfilled_by_name && (
              <DetailRow label={r.status === 'completed' ? 'Done by' : 'Being handled by'}>
                {r.fulfilled_by_name}
                {r.fulfilled_at ? ` · ${formatDate(r.fulfilled_at)}` : ''}
              </DetailRow>
            )}
          </dl>
          {r.fulfilment_note && <p className="border-l-2 border-navy pl-4 text-body text-ink">{r.fulfilment_note}</p>}
          <section aria-labelledby="timeline-heading">
            <h3 id="timeline-heading" className="mb-3 text-body font-semibold text-ink">
              Approvals
            </h3>
            <ol className="m-0 list-none p-0">
              {approvals.map((a, i) => {
                const line = stepLine(a)
                return (
                  <li key={a.id} className="flex gap-3.5">
                    <span className="relative flex w-5 shrink-0 justify-center" aria-hidden="true">
                      <span className={cn('mt-0.5 flex h-5 w-5 items-center justify-center rounded-full', line.tone)}>{line.icon}</span>
                      {i < approvals.length - 1 && <span className="absolute bottom-0 top-6 w-px bg-line" />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-5">
                      <span className={cn('text-body', a.status === 'pending' && a.step_order === r.current_step ? 'font-semibold text-ink' : 'text-ink')}>
                        {line.title}
                      </span>
                      {line.detail && <span className="text-meta text-muted">{line.detail}</span>}
                      {a.comments && a.status !== 'skipped' && <span className="mt-1 text-body text-muted">“{a.comments}”</span>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>
      )}
      <Dialog
        open={moving !== null}
        onOpenChange={(o) => {
          if (!o) {
            setMoving(null)
            setNote('')
          }
        }}
        busy={busy}
        title={moving === 'completed' ? 'Mark this request done?' : 'Start work on this request?'}
        description="The requester is told straight away."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)} disabled={busy}>
              Not now
            </Button>
            <Button
              variant="primary"
              isLoading={busy}
              onClick={async () => {
                if (!r || !moving) return
                setBusy(true)
                setError(null)
                try {
                  await requestService.fulfil(r.id, moving, note.trim())
                  await queryClient.invalidateQueries({ queryKey: ['requests'] })
                  setMoving(null)
                  setNote('')
                } catch (err) {
                  setError(getErrorMessage(err))
                  setMoving(null)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {moving === 'completed' ? 'Mark done' : 'Start work'}
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Note for the requester (optional)"
          hint={moving === 'completed' ? 'e.g. “Collect it from the IT desk.”' : 'e.g. “Ordered, arrives Friday.”'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
        />
      </Dialog>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        busy={busy}
        title="Cancel this request?"
        description="Approvers will no longer see it. You can submit a new one later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" isLoading={busy} onClick={cancel}>
              Cancel request
            </Button>
          </>
        }
      >
        <span />
      </Dialog>
    </SidePanel>
  )
}
