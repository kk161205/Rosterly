import React, { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import QRCode from 'qrcode'
import { useAssetDetail, useAssetHistory, useAssetPermissions, useRefreshAssets } from '@/features/assets/hooks/useAssets'
import { assetService } from '@/features/assets/services/assetService'
import { bookValueAt, depreciationSchedule, monthsBetween } from '@/features/assets/lib/depreciation'
import { warrantyInfo, toneClass } from '@/features/assets/lib/warranty'
import {
  AssignAssetDialog,
  ChangeStatusDialog,
  RaiseTicketDialog,
  ReturnAssetDialog,
} from '@/features/assets/components/actions/AssetActionDialogs'
import { AssetFormDialog } from '@/features/assets/components/actions/AssetFormDialog'
import type { Asset, AssetAssignment, MaintenanceTicket } from '@/features/assets/types/assets'
import { formatDate, formatMoney, humanize } from '@/lib/format'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { Alert, Button, Dialog, EmptyState, ErrorState, FilterTabs, Skeleton, Status, cn } from '@/ui'

type Dialogs = 'assign' | 'return' | 'ticket' | 'edit' | 'status' | 'delete' | null
type ActivityFilter = 'all' | 'assignments' | 'maintenance'

const METHOD_TEXT = {
  straight_line: 'Straight line',
  declining_balance: 'Declining balance, 20% a year',
  none: 'Not depreciated',
} as const

/**
 * Asset record (§5.8, UI plan Direction B): name, status and holder with the
 * next action; details; one activity timeline; and a side column with book
 * value, warranty and open tickets. Replaces the hero banner and tab set.
 */
export const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const perms = useAssetPermissions()
  const refresh = useRefreshAssets()
  const detail = useAssetDetail(id)
  const { assignments, maintenance } = useAssetHistory(id, true)
  const [dialog, setDialog] = useState<Dialogs>(null)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-label="Loading asset">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (detail.isError || !detail.data) {
    const status = getErrorStatus(detail.error)
    return status === 404 || status === 403 ? (
      <EmptyState
        title={status === 404 ? 'Asset not found' : 'You can’t open this asset'}
        description={
          status === 404 ? 'It may have been deleted, or the link is wrong.' : 'Only IT, auditors and the current holder can see it.'
        }
        action={
          <Button variant="secondary" onClick={() => navigate('/assets')}>
            Back to assets
          </Button>
        }
      />
    ) : (
      <ErrorState message={getErrorMessage(detail.error, 'The asset could not be loaded.')} onRetry={() => detail.refetch()} />
    )
  }

  const asset = detail.data.asset
  const current = detail.data.current_assignment ?? null
  const holder = asset.current_holder
  const canRaise = perms.canRaiseAny || (perms.userId !== null && asset.current_holder_id === perms.userId)
  const openTickets = (maintenance.data ?? []).filter((t) => t.status === 'open' || t.status === 'in_progress')

  const markRepaired = async () => {
    setBusy(true)
    setError(null)
    try {
      await assetService.updateAsset(asset.id, { status: 'in_stock' })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const primary = !perms.canUpdate ? null : asset.status === 'in_stock' ? (
    <Button variant="primary" onClick={() => setDialog('assign')}>
      Assign
    </Button>
  ) : asset.status === 'assigned' ? (
    <Button variant="primary" onClick={() => setDialog('return')}>
      Return to stock
    </Button>
  ) : asset.status === 'under_maintenance' ? (
    <Button variant="primary" isLoading={busy} onClick={markRepaired}>
      Mark repaired
    </Button>
  ) : null

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3.5">
        <nav aria-label="Breadcrumb" className="text-meta text-muted">
          <Link to="/assets" className="hover:text-ink hover:underline">
            Assets
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="font-mono">{asset.asset_tag}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-balance font-display text-page text-ink">{asset.name}</h1>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body">
              <Status value={asset.status} />
              {holder && (
                <span>
                  to{' '}
                  <Link to={`/employees/${holder.id}`} className="text-navy underline decoration-control underline-offset-4 hover:decoration-navy">
                    {holder.full_name}
                  </Link>
                  <span className="text-muted">
                    {holder.department_name && ` · ${holder.department_name}`}
                    {current && ` · since ${formatDate(current.assigned_at)}`}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canRaise && asset.status !== 'retired' && (
              <Button variant="secondary" onClick={() => setDialog('ticket')}>
                Raise ticket
              </Button>
            )}
            {primary}
            {(perms.canUpdate || perms.canDelete) && (
              <MoreMenu
                canUpdate={perms.canUpdate && asset.status !== 'retired'}
                canDelete={perms.canDelete}
                onEdit={() => setDialog('edit')}
                onStatus={() => setDialog('status')}
                onDelete={() => setDialog('delete')}
                onLabel={() => downloadLabel(asset)}
              />
            )}
          </div>
        </div>
        {error && <Alert>{error}</Alert>}
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="details-heading">
            <h2 id="details-heading" className="mb-3 text-section text-ink">
              Details
            </h2>
            <dl className="m-0 grid border-t border-ink sm:grid-cols-2 sm:gap-x-10">
              <Fact label="Asset tag" mono>
                {asset.asset_tag}
              </Fact>
              <Fact label="Serial number" mono>
                {asset.serial_number || '—'}
              </Fact>
              <Fact label="Category">{humanize(asset.category)}</Fact>
              <Fact label="Vendor">{asset.vendor}</Fact>
              <Fact label="Purchased">
                {formatDate(asset.purchase_date)} · {formatMoney(asset.purchase_cost)}
              </Fact>
              <Fact label="Depreciation">
                {METHOD_TEXT[asset.depreciation_method]}
                {asset.depreciation_method !== 'none' && ` over ${asset.useful_life_months} months`}
              </Fact>
              {asset.amc_expiry && <Fact label="AMC ends">{formatDate(asset.amc_expiry)}</Fact>}
            </dl>
          </section>

          <Activity
            filter={filter}
            onFilter={setFilter}
            assignments={assignments.data ?? []}
            tickets={maintenance.isError ? null : maintenance.data ?? []}
            loading={assignments.isLoading}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-9" aria-label="Value, warranty and open items">
          <BookValue asset={asset} />
          <WarrantyBlock asset={asset} />
          <section aria-labelledby="open-heading">
            <h2 id="open-heading" className="mb-1.5 text-section text-ink">
              Open items
            </h2>
            {maintenance.isError ? (
              <p className="text-body text-muted">Tickets are visible to IT and the current holder.</p>
            ) : openTickets.length === 0 ? (
              <p className="text-body text-muted">No open tickets for this asset.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {openTickets.map((t) => (
                  <li key={t.id} className="border-t border-line-soft py-2.5 first:border-t-0">
                    <Link to="/maintenance" className="flex flex-col gap-0.5 hover:underline">
                      <span className="line-clamp-2 text-body text-ink">{t.issue_description}</span>
                      <span className="text-meta text-muted">
                        {humanize(t.priority)} priority · {humanize(t.status)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <AssignAssetDialog asset={asset} open={dialog === 'assign'} onOpenChange={(o) => setDialog(o ? 'assign' : null)} />
      <ReturnAssetDialog
        asset={asset}
        holderName={holder?.full_name}
        open={dialog === 'return'}
        onOpenChange={(o) => setDialog(o ? 'return' : null)}
      />
      <RaiseTicketDialog asset={asset} open={dialog === 'ticket'} onOpenChange={(o) => setDialog(o ? 'ticket' : null)} />
      <AssetFormDialog asset={asset} open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} />
      <ChangeStatusDialog assets={[asset]} open={dialog === 'status'} onOpenChange={(o) => setDialog(o ? 'status' : null)} />
      <DeleteAssetDialog
        asset={asset}
        open={dialog === 'delete'}
        onOpenChange={(o) => setDialog(o ? 'delete' : null)}
        onDeleted={() => navigate('/assets', { replace: true })}
      />
    </div>
  )
}

// ---------------------------------------------------------------- pieces

const Fact: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="flex justify-between gap-4 border-b border-line-soft py-2.5 text-body sm:flex-col sm:justify-start sm:gap-0.5">
    <dt className="text-muted">{label}</dt>
    <dd className={cn('m-0 text-right text-ink sm:text-left', mono && 'font-mono text-meta sm:text-body')}>{children}</dd>
  </div>
)

const MoreMenu: React.FC<{
  canUpdate: boolean
  canDelete: boolean
  onEdit: () => void
  onStatus: () => void
  onDelete: () => void
  onLabel: () => void
}> = ({ canUpdate, canDelete, onEdit, onStatus, onDelete, onLabel }) => {
  const item = 'flex min-h-9 cursor-pointer select-none items-center rounded-soft px-3 text-body outline-none data-[highlighted]:bg-row-hover'
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="More actions"
        className="inline-flex h-10 w-10 items-center justify-center rounded-pill border border-ink text-ink transition-colors hover:bg-ink hover:text-paper data-[state=open]:bg-ink data-[state=open]:text-paper"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-card border border-line bg-paper p-1.5">
          {canUpdate && (
            <>
              <Menu.Item className={cn(item, 'text-ink')} onSelect={onEdit}>
                Edit details
              </Menu.Item>
              <Menu.Item className={cn(item, 'text-ink')} onSelect={onStatus}>
                Change status
              </Menu.Item>
            </>
          )}
          <Menu.Item className={cn(item, 'text-ink')} onSelect={onLabel}>
            Download QR label
          </Menu.Item>
          {canDelete && (
            <>
              <Menu.Separator className="my-1.5 h-px bg-line" />
              <Menu.Item className={cn(item, 'text-status-bad')} onSelect={onDelete}>
                Delete asset
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Printable label: the QR (encodes the asset tag, which the scanner looks up) plus name and tag. */
async function downloadLabel(asset: Asset) {
  const qr = await QRCode.toDataURL(asset.asset_tag, { margin: 1, width: 480, color: { dark: '#17181C', light: '#FFFFFF' } })
  const img = new Image()
  img.src = qr
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 560
  canvas.height = 680
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 40, 40, 480, 480)
  ctx.fillStyle = '#17181C'
  ctx.textAlign = 'center'
  ctx.font = '600 34px "Geist Mono Variable", monospace'
  ctx.fillText(asset.asset_tag, 280, 580)
  ctx.font = '400 24px "Geist Variable", sans-serif'
  ctx.fillText(asset.name.length > 38 ? asset.name.slice(0, 37) + '…' : asset.name, 280, 625)
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = `${asset.asset_tag}-label.png`
  link.click()
}

type Event = { key: string; kind: 'assignment' | 'maintenance'; when: string; what: string; who?: string; note?: string; tone: string }

function buildEvents(assignments: AssetAssignment[], tickets: MaintenanceTicket[]): Event[] {
  const events: Event[] = []
  for (const a of assignments) {
    events.push({
      key: `a-${a.id}`,
      kind: 'assignment',
      when: a.assigned_at,
      what: `Assigned to ${a.employee_name ?? 'someone'}`,
      who: a.assigned_by_name ? `by ${a.assigned_by_name}` : undefined,
      note: a.condition_at_assignment ? `Condition: ${a.condition_at_assignment}` : undefined,
      tone: 'bg-status-info',
    })
    if (a.returned_at)
      events.push({
        key: `r-${a.id}`,
        kind: 'assignment',
        when: a.returned_at,
        what: `Returned by ${a.employee_name ?? 'holder'}`,
        note: a.condition_at_return ? `Condition: ${a.condition_at_return}` : undefined,
        tone: 'bg-status-ok',
      })
  }
  for (const t of tickets) {
    events.push({
      key: `t-${t.id}`,
      kind: 'maintenance',
      when: t.created_at,
      what: 'Ticket raised',
      who: t.reporter_name ? `by ${t.reporter_name}` : undefined,
      note: t.issue_description,
      tone: 'bg-status-warn',
    })
    if (t.resolved_at)
      events.push({
        key: `tr-${t.id}`,
        kind: 'maintenance',
        when: t.resolved_at,
        what: 'Ticket resolved',
        who: t.assignee_name ? `by ${t.assignee_name}` : undefined,
        tone: 'bg-status-ok',
      })
  }
  return events.sort((x, y) => new Date(y.when).getTime() - new Date(x.when).getTime())
}

const Activity: React.FC<{
  filter: ActivityFilter
  onFilter: (f: ActivityFilter) => void
  assignments: AssetAssignment[]
  tickets: MaintenanceTicket[] | null
  loading: boolean
}> = ({ filter, onFilter, assignments, tickets, loading }) => {
  const all = useMemo(() => buildEvents(assignments, tickets ?? []), [assignments, tickets])
  const events = filter === 'all' ? all : all.filter((e) => (filter === 'assignments' ? e.kind === 'assignment' : e.kind === 'maintenance'))
  return (
    <section aria-labelledby="activity-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line">
        <h2 id="activity-heading" className="pb-2.5 text-section text-ink">
          Activity
        </h2>
        <FilterTabs
          label="Filter activity"
          value={filter}
          onChange={onFilter}
          className="border-b-0"
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'assignments', label: 'Assignments' },
            ...(tickets ? [{ value: 'maintenance' as ActivityFilter, label: 'Maintenance' }] : []),
          ]}
        />
      </div>
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : events.length === 0 ? (
        <p className="text-body text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {events.map((e, i) => (
            <li key={e.key} className="flex gap-4">
              <span className="relative flex w-2 shrink-0 justify-center" aria-hidden="true">
                <span className={cn('mt-1.5 h-2 w-2 rounded-full', e.tone)} />
                {i < events.length - 1 && <span className="absolute bottom-0 top-4 w-px bg-line" />}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 pb-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className="text-body">
                    <span className="font-medium text-ink">{e.what}</span>
                    {e.who && <span className="text-muted"> {e.who}</span>}
                  </span>
                  <span className="whitespace-nowrap text-meta text-muted">{formatDate(e.when)}</span>
                </div>
                {e.note && <span className="text-meta text-muted">{e.note}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const BookValue: React.FC<{ asset: Asset }> = ({ asset }) => {
  const cost = Number(asset.purchase_cost)
  const value = Number(asset.current_value)
  const pct = cost > 0 ? Math.round((value / cost) * 100) : 100
  const purchased = new Date(asset.purchase_date)
  const elapsed = monthsBetween(purchased, new Date())
  const life = asset.useful_life_months
  const schedule = asset.depreciation_method === 'none' ? [] : depreciationSchedule(cost, asset.depreciation_method, life)
  const endDate = new Date(purchased.getFullYear(), purchased.getMonth() + life, 1)
  const fmtMonth = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

  // Plot in a 0–100 box stretched to the column; past solid navy, future dashed
  const x = (m: number) => (m / Math.max(life, 1)) * 100
  const y = (v: number) => 8 + (1 - v / Math.max(cost, 1)) * 84
  const now = Math.min(elapsed, life)
  const past = schedule.filter((p) => p.month <= now)
  const future = schedule.filter((p) => p.month >= now)
  const nowValue = bookValueAt(cost, asset.depreciation_method, life, now)
  const pts = (list: { month: number; value: number }[]) => list.map((p) => `${x(p.month)},${y(p.value)}`).join(' ')

  return (
    <section aria-labelledby="value-heading">
      <h2 id="value-heading" className="mb-1.5 text-section text-ink">
        Book value
      </h2>
      <div className="text-metric tabular-nums text-ink">{formatMoney(asset.current_value)}</div>
      <p className="mb-3 text-meta text-muted">
        {pct}% of {formatMoney(asset.purchase_cost)} · recalculated nightly
      </p>
      {schedule.length > 1 && (
        <>
          <div className="relative h-16">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              role="img"
              aria-label={`Book value falls from ${formatMoney(cost)} in ${fmtMonth(purchased)} to ${formatMoney(
                schedule[schedule.length - 1].value,
              )} in ${fmtMonth(endDate)}`}
            >
              <line x1="0" y1="99" x2="100" y2="99" className="stroke-line" vectorEffect="non-scaling-stroke" />
              {future.length > 1 && (
                <polyline points={pts([{ month: now, value: nowValue }, ...future])} fill="none" className="stroke-control" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
              {past.length > 0 && (
                <polyline points={pts([...past, { month: now, value: nowValue }])} fill="none" className="stroke-navy" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              )}
            </svg>
            <span
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy"
              style={{ left: `${x(now)}%`, top: `${y(nowValue)}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="relative h-4 text-micro text-muted">
            <span className="absolute left-0">{fmtMonth(purchased)}</span>
            {/* "Today" sits under the dot, unless it would collide with an end label */}
            {now / Math.max(life, 1) > 0.2 && now / Math.max(life, 1) < 0.8 && (
              <span className="absolute -translate-x-1/2" style={{ left: `${x(now)}%` }}>
                Today
              </span>
            )}
            <span className="absolute right-0">{fmtMonth(endDate)}</span>
          </div>
        </>
      )}
    </section>
  )
}

const WarrantyBlock: React.FC<{ asset: Asset }> = ({ asset }) => {
  const w = warrantyInfo(asset.warranty_expiry)
  return (
    <section aria-labelledby="warranty-heading">
      <h2 id="warranty-heading" className="mb-1.5 text-section text-ink">
        Warranty
      </h2>
      <p className={cn('text-lead', toneClass[w.tone])}>{asset.warranty_expiry ? `Ends ${w.text}` : 'Not recorded'}</p>
      {w.detail && <p className={cn('text-meta', w.tone === 'warn' ? 'text-status-warn' : 'text-muted')}>{w.detail}</p>}
    </section>
  )
}

const DeleteAssetDialog: React.FC<{
  asset: Asset
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}> = ({ asset, open, onOpenChange, onDeleted }) => {
  const refresh = useRefreshAssets()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Delete this asset?"
      description={`${asset.name} · ${asset.asset_tag}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant="danger"
            isLoading={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await assetService.deleteAsset(asset.id)
                await refresh()
                onDeleted()
              } catch (err) {
                setError(getErrorMessage(err))
              } finally {
                setBusy(false)
              }
            }}
          >
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert>{error}</Alert>}
        <p className="text-body text-muted">
          Deleting is only for records added by mistake. To take a working asset out of use, change its status to retired
          instead — that keeps its history.
        </p>
      </div>
    </Dialog>
  )
}
