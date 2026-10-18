import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { lifecycleService } from '@/features/lifecycle/services/lifecycleService'
import type { Checklist, ChecklistItem, ChecklistItemStatus, ChecklistStatus, ChecklistType } from '@/features/lifecycle/types/checklist'
import { employeeService } from '@/features/employees/services/employeeService'
import { hasRole, roleLabel, rolesOf, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { INBOX_KEY } from '@/features/inbox/hooks/useInbox'
import { ASSETS_KEY } from '@/features/assets/hooks/useAssets'
import { useUrlFilters } from '@/lib/useUrlFilters'
import { getErrorMessage, getFieldErrors } from '@/lib/errors'
import { daysUntil, formatDate } from '@/lib/format'
import {
  Alert,
  Button,
  ButtonLink,
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
  Table,
  Td,
  TextAreaField,
  TextField,
  Th,
  THead,
  Tr,
  cn,
} from '@/ui'

const PAGE_SIZE = 25
// Creating and managing checklists is HR's and super admins' (§5.5, §5.6)
const MANAGER_ROLES = ['hr_admin', 'super_admin']

const COPY = {
  onboarding: {
    title: 'Onboarding',
    description: 'New joiners and everything that has to be ready for their first day.',
    start: 'Start onboarding',
    empty: 'No one is being onboarded',
    emptyText: 'Start an onboarding when someone new joins; HR, IT and their manager each get their tasks.',
    dateVerb: (past: boolean) => (past ? 'Joined' : 'Joins'),
  },
  offboarding: {
    title: 'Offboarding',
    description: 'Leavers: devices to collect, access to remove, and the final sign-off.',
    start: 'Start offboarding',
    empty: 'No one is leaving',
    emptyText: 'Start an offboarding when someone resigns; their devices are listed for IT to collect.',
    dateVerb: (past: boolean) => (past ? 'Left' : 'Leaves'),
  },
} as const

function keyDate(c: Checklist): { text: string; bare: string; soon: boolean } | null {
  const date = c.type === 'onboarding' ? c.date_of_joining : c.date_of_exit
  if (!date) return null
  const days = daysUntil(date)
  const past = days !== null && days < 0
  const rel = days === 0 ? ' · today' : days !== null && days > 0 && days <= 14 ? ` · in ${days} days` : ''
  return {
    text: `${COPY[c.type].dateVerb(past)} ${formatDate(date)}${rel}`,
    // Under a "First day" / "Last day" column the verb would repeat the header
    bare: `${formatDate(date)}${rel}`,
    soon: days !== null && days >= 0 && days <= 7,
  }
}

const keyDateValue = (c: Checklist) => (c.type === 'onboarding' ? c.date_of_joining : c.date_of_exit) ?? ''

/** "3 of 5 done" over a thin bar; once completed the status says it, so no bar. */
const Progress: React.FC<{ c: Checklist; className?: string }> = ({ c, className }) => (
  <span className={cn('flex flex-col gap-1.5', className)}>
    <span className="text-meta text-muted">
      {c.completed_items} of {c.total_items} done
    </span>
    {c.status !== 'completed' && (
      <span className="h-1 w-full overflow-hidden rounded-pill bg-line-soft" aria-hidden="true">
        <span className="block h-full bg-navy" style={{ width: `${c.progress_percentage}%` }} />
      </span>
    )}
  </span>
)

/**
 * Onboarding (§5.5) and offboarding (§5.6): a list with progress, and a side
 * panel with the checklist grouped by who owns each task — the viewer's own
 * tasks first and open, other teams' folded.
 */
export const ChecklistWorkflow: React.FC<{ type: ChecklistType }> = ({ type }) => {
  const copy = COPY[type]
  const { user } = useCurrentUser()
  const canManage = hasRole(user, ...MANAGER_ROLES)
  const { params, update } = useUrlFilters()
  const tab = (params.get('status') as ChecklistStatus) || 'in_progress'
  const page = Number(params.get('page') ?? '1')
  const preselect = params.get('employee')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  // Profile → "Start offboarding" lands here with ?employee=<id>
  useEffect(() => {
    if (preselect && canManage) setStarting(true)
  }, [preselect, canManage])


  const query = { status: tab, page, page_size: PAGE_SIZE }
  const list = useQuery({
    queryKey: ['lifecycle', type, query],
    queryFn: () => lifecycleService.list(type, query),
    placeholderData: keepPreviousData,
  })
  // Most relevant first: in progress → soonest date first; completed → most recent first
  const items = (list.data?.checklists ?? [])
    .slice()
    .sort((a, b) =>
      tab === 'completed'
        ? keyDateValue(b).localeCompare(keyDateValue(a))
        : (keyDateValue(a) || '9999').localeCompare(keyDateValue(b) || '9999'),
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setStarting(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {copy.start}
            </Button>
          )
        }
      />

      <FilterTabs
        label="Filter by status"
        value={tab}
        onChange={(v) => update({ status: v === 'in_progress' ? null : v })}
        tabs={[
          { value: 'in_progress', label: 'In progress' },
          { value: 'completed', label: 'Completed' },
        ]}
      />

      {list.isLoading ? (
        <div className="flex flex-col gap-4" aria-label="Loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message={getErrorMessage(list.error, `${copy.title} could not be loaded.`)} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={tab === 'in_progress' ? copy.empty : 'Nothing completed yet'}
          description={tab === 'in_progress' ? copy.emptyText : undefined}
          action={
            tab === 'in_progress' && canManage ? (
              <Button variant="primary" onClick={() => setStarting(true)}>
                {copy.start}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn(list.isFetching && 'opacity-70 transition-opacity')}>
          <Table label={copy.title} className="hidden md:block">
            <THead>
              <Th>Person</Th>
              <Th>{type === 'onboarding' ? 'First day' : 'Last day'}</Th>
              <Th className="w-56">Progress</Th>
              <Th>Status</Th>
            </THead>
            <tbody>
              {items.map((c) => {
                const date = keyDate(c)
                return (
                  <Tr key={c.id} onClick={() => setSelectedId(c.id)} selected={c.id === selectedId}>
                    <Td>
                      <RowButton onClick={() => setSelectedId(c.id)} label={`Open ${c.employee_name ?? 'checklist'}`}>
                        <span className="font-medium text-ink">{c.employee_name ?? 'Unknown'}</span>
                        <span className="text-meta text-muted">
                          {[c.employee_designation, c.employee_department].filter(Boolean).join(' · ')}
                        </span>
                      </RowButton>
                    </Td>
                    <Td className={cn('whitespace-nowrap', date?.soon ? 'font-medium text-status-warn' : 'text-ink')}>
                      {date?.bare ?? <span className="text-muted">Not set</span>}
                    </Td>
                    <Td>
                      <Progress c={c} />
                    </Td>
                    <Td>
                      <Status value={c.status} />
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
          <ul className="m-0 list-none border-t border-ink p-0 md:hidden" aria-label={copy.title}>
            {items.map((c) => {
              const date = keyDate(c)
              return (
                <li key={c.id} className="border-b border-line-soft">
                  <button type="button" onClick={() => setSelectedId(c.id)} className="flex w-full flex-col gap-2 py-3 text-left">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-body font-medium text-ink">{c.employee_name}</span>
                      <span className={cn('shrink-0 text-meta', date?.soon ? 'text-status-warn' : 'text-muted')}>{date?.text}</span>
                    </span>
                    <Progress c={c} />
                  </button>
                </li>
              )
            })}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPage={(p) => update({ page: String(p) })} />
        </div>
      )}

      <ChecklistPanel type={type} id={selectedId} canManage={canManage} onClose={() => setSelectedId(null)} />
      <StartDialog
        type={type}
        open={starting}
        preselectId={preselect}
        onOpenChange={(o) => {
          setStarting(o)
          if (!o && preselect) update({ employee: null })
        }}
        onStarted={(c) => {
          setStarting(false)
          update({ employee: null, status: null })
          setSelectedId(c.id)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- panel

const ChecklistPanel: React.FC<{ type: ChecklistType; id: string | null; canManage: boolean; onClose: () => void }> = ({
  type,
  id,
  canManage,
  onClose,
}) => {
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()
  const detail = useQuery({ queryKey: ['lifecycle', type, 'detail', id], queryFn: () => lifecycleService.get(type, id!), enabled: Boolean(id) })
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [completing, setCompleting] = useState(false)

  // Open the viewer's own tasks; if they own none (HR, super admin), open every team with work left
  useEffect(() => {
    const items = detail.data?.items ?? []
    // Every role the viewer holds counts as theirs (§5.14 multi-role)
    const mine = rolesOf(user)
    const own = items.filter((i) => i.owner_role_name && mine.includes(i.owner_role_name))
    setOpen(
      new Set(
        own.length
          ? own.map((i) => i.owner_role_name as string)
          : items.filter((i) => i.status !== 'done').map((i) => i.owner_role_name ?? 'other'),
      ),
    )
    setError(null)
  }, [id, user, detail.data?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) return null
  const c = detail.data

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lifecycle', type] }),
      queryClient.invalidateQueries({ queryKey: INBOX_KEY }),
      queryClient.invalidateQueries({ queryKey: ASSETS_KEY }),
    ])

  const setStatus = async (item: ChecklistItem, status: ChecklistItemStatus) => {
    setBusyItem(item.id)
    setError(null)
    try {
      await lifecycleService.setItemStatus(type, item.checklist_id, item.id, status)
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyItem(null)
    }
  }

  // Group by owning role; the viewer's own group first
  const groups = new Map<string, ChecklistItem[]>()
  for (const item of (c?.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)) {
    const key = item.owner_role_name ?? 'other'
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const isMine = (role: string | null | undefined) => Boolean(role && hasRole(user, role))
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    isMine(a) === isMine(b) ? a.localeCompare(b) : isMine(a) ? -1 : 1,
  )
  const canAct = (item: ItemLike) => canManage || isMine(item.owner_role_name)
  const allDone = c ? c.items.every((i) => i.status === 'done') : false

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={c?.employee_name ?? COPY[type].title}
      description={c ? [c.employee_designation, c.employee_department].filter(Boolean).join(' · ') : undefined}
      className="max-w-xl"
      footer={
        c &&
        type === 'offboarding' &&
        canManage &&
        c.status === 'in_progress' && (
          <div className="flex w-full flex-col gap-2">
            <Button variant="danger" disabled={!allDone} onClick={() => setConfirming(true)}>
              Complete offboarding
            </Button>
            {!allDone && <p className="text-meta text-muted">Available once every task is done.</p>}
          </div>
        )
      }
    >
      {detail.isLoading || !c ? (
        detail.isError ? (
          <ErrorState message={getErrorMessage(detail.error)} onRetry={() => detail.refetch()} />
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body">
              <Status value={c.status} />
              {keyDate(c) && <span className="text-muted">{keyDate(c)!.text}</span>}
            </div>
            <Progress c={c} />
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-col">
            {ordered.map(([role, groupItems]) => {
              const isOpen = open.has(role)
              const done = groupItems.filter((i) => i.status === 'done').length
              const mine = isMine(role)
              return (
                <section key={role} className="border-t border-line first:border-ink">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((prev) => {
                        const next = new Set(prev)
                        if (next.has(role)) next.delete(role)
                        else next.add(role)
                        return next
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <ChevronRight className={cn('h-4 w-4 text-muted transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
                      <span className="text-body font-semibold text-ink">{mine ? 'Your tasks' : roleLabel(role)}</span>
                      {mine && <span className="text-meta text-muted">{roleLabel(role)}</span>}
                    </span>
                    <span className="text-meta tabular-nums text-muted">
                      {done} of {groupItems.length}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="m-0 list-none p-0 pb-2">
                      {groupItems.map((item) => (
                        <li key={item.id} className="flex flex-col gap-2 border-t border-line-soft py-3 pl-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className={cn('text-body', item.status === 'done' ? 'text-muted line-through decoration-control' : 'text-ink')}>
                              {item.task_name}
                            </span>
                            <span className="text-meta text-muted">
                              {item.status === 'done'
                                ? `Done${item.completed_by_name ? ` by ${item.completed_by_name}` : ''}${item.completed_at ? ` · ${formatDate(item.completed_at)}` : ''}`
                                : item.status === 'in_progress'
                                  ? 'In progress'
                                  : 'Not started'}
                            </span>
                          </span>
                          {canAct(item) && c.status === 'in_progress' && (
                            <span className="flex gap-1.5">
                              {item.status === 'pending' && (
                                <Button size="sm" variant="secondary" disabled={busyItem !== null} onClick={() => setStatus(item, 'in_progress')}>
                                  Start
                                </Button>
                              )}
                              {item.status !== 'done' ? (
                                <Button size="sm" variant="secondary" isLoading={busyItem === item.id} disabled={busyItem !== null} onClick={() => setStatus(item, 'done')}>
                                  {item.asset_assignment_id ? 'Mark returned' : 'Mark done'}
                                </Button>
                              ) : (
                                !item.asset_assignment_id && (
                                  <Button size="sm" variant="secondary" isLoading={busyItem === item.id} disabled={busyItem !== null} onClick={() => setStatus(item, 'pending')}>
                                    Reopen
                                  </Button>
                                )
                              )}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
          <ButtonLink to={`/employees/${c.employee_id}`} variant="secondary" className="self-start">
            Open {c.employee_name?.split(' ')[0] ?? 'their'}’s profile
          </ButtonLink>
        </div>
      )}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        busy={completing}
        title={`Complete ${c?.employee_name ?? 'this'} offboarding?`}
        description="Their account is closed and they're signed out of every device. This can't be undone here."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={completing}>
              Not yet
            </Button>
            <Button
              variant="danger"
              isLoading={completing}
              onClick={async () => {
                if (!c) return
                setCompleting(true)
                setError(null)
                try {
                  await lifecycleService.completeOffboarding(c.id)
                  await refresh()
                  setConfirming(false)
                } catch (err) {
                  setError(getErrorMessage(err))
                  setConfirming(false)
                } finally {
                  setCompleting(false)
                }
              }}
            >
              Complete and close account
            </Button>
          </>
        }
      >
        <span />
      </Dialog>
    </SidePanel>
  )
}

type ItemLike = Pick<ChecklistItem, 'owner_role_name'>

// ---------------------------------------------------------------- start dialog

interface PersonOption {
  id: string
  full_name: string
  designation: string
  department_name: string | null
  status: string
}

const StartDialog: React.FC<{
  type: ChecklistType
  open: boolean
  preselectId: string | null
  onOpenChange: (o: boolean) => void
  onStarted: (c: Checklist) => void
}> = ({ type, open, preselectId, onOpenChange, onStarted }) => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [personId, setPersonId] = useState<string | null>(null)
  const [exitDate, setExitDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setSearch('')
    setPersonId(preselectId)
    setExitDate('')
    setReason('')
    setError(null)
    setFieldErrors({})
  }, [open, preselectId])
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const people = useQuery({
    queryKey: ['lifecycle-picker', type, term],
    queryFn: async () =>
      (await employeeService.getEmployees({ search: term || undefined, page_size: 8, status: type === 'onboarding' ? undefined : 'active' }))
        .items as PersonOption[],
    enabled: open,
  })
  const preselected = useQuery({
    queryKey: ['lifecycle-preselect', preselectId],
    queryFn: () => employeeService.getEmployeeById(preselectId!),
    enabled: open && Boolean(preselectId),
  })
  const options: PersonOption[] = [
    ...(preselected.data && !(people.data ?? []).some((p) => p.id === preselected.data!.id) ? [preselected.data as PersonOption] : []),
    ...(people.data ?? []),
  ].filter((p) => p.status !== 'terminated')
  const chosen = options.find((p) => p.id === personId)

  const start = async () => {
    if (!personId) return
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const created =
        type === 'onboarding'
          ? await lifecycleService.startOnboarding(personId)
          : await lifecycleService.startOffboarding({ employee_id: personId, exit_date: exitDate || undefined, reason: reason.trim() || undefined })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lifecycle', type] }),
        queryClient.invalidateQueries({ queryKey: INBOX_KEY }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ])
      onStarted(created)
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(getFieldErrors(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={COPY[type].start}
      description={
        type === 'onboarding'
          ? 'Creates the standard checklist and gives HR, IT and the manager their tasks.'
          : 'Marks them as leaving and lists every device they hold for IT to collect.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={busy} disabled={!personId} onClick={start}>
            {chosen ? `${COPY[type].start} for ${chosen.full_name.split(' ')[0]}` : COPY[type].start}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col gap-2">
          <TextField
            label="Person"
            placeholder="Search by name, code or title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            trailing={<Search className="mr-1 h-4 w-4 text-muted" aria-hidden="true" />}
            error={fieldErrors.employee_id}
          />
          <ul className="m-0 flex max-h-60 list-none flex-col gap-0.5 overflow-y-auto p-0" role="radiogroup" aria-label="People">
            {options.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={p.id === personId}
                  onClick={() => setPersonId(p.id)}
                  className={cn(
                    'flex w-full flex-col rounded-card border px-3 py-2.5 text-left transition-colors',
                    p.id === personId ? 'border-navy bg-navy-tint' : 'border-transparent hover:bg-row-hover',
                  )}
                >
                  <span className="text-body font-medium text-ink">{p.full_name}</span>
                  <span className="text-meta text-muted">{[p.designation, p.department_name].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
            {people.data && options.length === 0 && <li className="px-3 py-2 text-body text-muted">No one matches.</li>}
          </ul>
        </div>
        {type === 'onboarding' && (
          <p className="text-meta text-muted">
            Add new people from <Link to="/users" className="underline underline-offset-4">Access → Users</Link> first; their join date comes from
            their record.
          </p>
        )}
        {type === 'offboarding' && (
          <>
            <TextField label="Last day" type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} error={fieldErrors.exit_date} />
            <TextAreaField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} error={fieldErrors.reason} />
          </>
        )}
      </div>
    </Dialog>
  )
}
