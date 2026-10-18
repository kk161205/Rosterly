import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Download } from 'lucide-react'
import { analyticsService } from '@/features/analytics/services/analyticsService'
import type { DateRange, ReplacementQuarter } from '@/features/analytics/types/analytics'
import { roleLabel, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { getErrorMessage } from '@/lib/errors'
import { formatDate, formatDuration as duration, formatMoney, formatShortDate, humanize } from '@/lib/format'
import { Button, ErrorState, FilterTabs, PageHeader, SidePanel, Skeleton, cn } from '@/ui'

type RangeKey = '30' | '90' | '365'
type Csv = { name: string; header: string[]; rows: (string | number | null)[][] }

function rangeFor(days: number): DateRange {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(from), to: iso(to) }
}

/** Download the rows a panel shows as CSV — no re-query. */
function downloadCsv({ name, header, rows }: Csv) {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const url = URL.createObjectURL(
    new Blob([[header, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Analytics (§5.15, revised): each section answers a question someone acts on —
 * what we can save, where the money went, what to budget for, what needs
 * chasing, and where we're slow. The page shows the total and a one-line brief;
 * the records behind a figure open in a side panel. Sections appear only for
 * roles allowed to see them.
 */
export const AnalyticsPage: React.FC = () => {
  const { can } = useCurrentUser()
  const [rangeKey, setRangeKey] = useState<RangeKey>('90')
  const range = useMemo(() => rangeFor(Number(rangeKey)), [rangeKey])
  const rangeText = `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="Analytics"
        description="What we can save, what to budget for, what needs chasing, and where we're slow."
        actions={
          <FilterTabs
            label="Time range"
            value={rangeKey}
            onChange={setRangeKey}
            tabs={[
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
              { value: '365', label: '1 year' },
            ]}
          />
        }
      />
      {can('analytics:savings') && <SavingsSection />}
      {can('analytics:cost_by_department') && <CostSection range={range} rangeText={rangeText} />}
      {can('analytics:budget_forecast') && <BudgetSection />}
      {can('analytics:follow_ups') && <FollowUpsSection range={range} rangeText={rangeText} />}
      {can('analytics:turnaround') && <TurnaroundSection range={range} rangeText={rangeText} />}
    </div>
  )
}

// ---------------------------------------------------------------- building blocks

/** A section and its loading / error states; `children` renders once data is in. */
function Section<T>({
  title,
  question,
  query,
  children,
}: {
  title: string
  question: string
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown }
  children: (data: T) => React.ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-5 border-t border-ink pt-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-panel text-ink">{title}</h2>
        <p className="text-body text-muted">{question}</p>
      </div>
      {query.isLoading ? (
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : query.isError || query.data === undefined ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">{children(query.data)}</div>
      )}
    </section>
  )
}

/**
 * One figure: the total, what it means, a brief naming the item that matters
 * most, and — when there are records behind it — a button opening them.
 */
const Tile: React.FC<{
  value: string
  label: string
  brief: React.ReactNode
  tone?: 'warn'
  action?: string
  panelTitle?: string
  panelDescription?: string
  csv?: Csv
  children?: React.ReactNode
}> = ({ value, label, brief, tone, action, panelTitle, panelDescription, csv, children }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-line pt-3">
      <span className={cn('text-metric tabular-nums', tone === 'warn' ? 'text-status-warn' : 'text-ink')}>{value}</span>
      <span className="text-body text-muted">{label}</span>
      <p className="mt-2 text-body text-ink">{brief}</p>
      {action && children && (
        <>
          <Button variant="secondary" size="sm" className="mt-3 self-start" onClick={() => setOpen(true)}>
            {action}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <SidePanel
            open={open}
            onOpenChange={setOpen}
            title={panelTitle ?? label}
            description={panelDescription}
            footer={
              csv && (
                <Button variant="secondary" onClick={() => downloadCsv(csv)}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download CSV
                </Button>
              )
            }
          >
            <div className="flex flex-col gap-8">{children}</div>
          </SidePanel>
        </>
      )}
    </div>
  )
}

/** A titled group inside a panel. */
const Group: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <div className="flex flex-col border-b border-line pb-2">
      <h3 className="text-body font-semibold text-ink">{title}</h3>
      {note && <span className="text-meta text-muted">{note}</span>}
    </div>
    {children}
  </div>
)

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="py-3 text-body text-muted">{children}</p>

const List: React.FC<{ children: React.ReactNode }> = ({ children }) => <ul className="m-0 list-none p-0">{children}</ul>

const Row: React.FC<{ to?: string; children: React.ReactNode }> = ({ to, children }) =>
  to ? (
    <li className="border-b border-line-soft last:border-b-0">
      <Link to={to} className="flex items-baseline justify-between gap-4 py-2.5 hover:bg-row-hover">
        {children}
      </Link>
    </li>
  ) : (
    <li className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2.5 last:border-b-0">{children}</li>
  )

const Main: React.FC<{ title: string; sub?: React.ReactNode }> = ({ title, sub }) => (
  <span className="flex min-w-0 flex-col">
    <span className="truncate text-body text-ink">{title}</span>
    {sub && <span className="text-meta text-muted">{sub}</span>}
  </span>
)

const Meter: React.FC<{ value: number; max: number }> = ({ value, max }) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-pill bg-line-soft" aria-hidden="true">
    <span
      className="block h-full rounded-pill bg-navy"
      style={{ width: `${max > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0}%` }}
    />
  </span>
)

/** label · bar · figure, for medians and splits. */
const BarRow: React.FC<{ label: string; value: number; max: number; figure: string }> = ({ label, value, max, figure }) => (
  <li className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 py-2">
    <span className="truncate text-body text-ink">{label}</span>
    <Meter value={value} max={max} />
    <span className="text-right text-meta tabular-nums text-ink">{figure}</span>
  </li>
)

const Tag: React.FC<{ children: string }> = ({ children }) => <span className="font-mono">{children}</span>

// ---------------------------------------------------------------- 1. savings

const SavingsSection: React.FC = () => {
  const q = useQuery({ queryKey: ['analytics', 'savings'], queryFn: analyticsService.savings, staleTime: 0 })
  return (
    <Section title="Money we can save" question="What we pay for and nobody uses." query={q}>
      {(d) => {
        const worst = d.unused_licences[0]
        const longest = d.idle_assets.reduce<(typeof d.idle_assets)[number] | undefined>(
          (m, a) => (!m || a.days_idle > m.days_idle ? a : m),
          undefined,
        )
        return (
          <>
            <Tile
              value={formatMoney(d.unused_licence_cost_per_year)}
              label="a year on licence seats nobody is using"
              brief={
                worst
                  ? `Most wasted: ${worst.name}, ${worst.unused_seats} of ${worst.total_seats} seats unused (${formatMoney(worst.unused_cost_per_year)}/yr).`
                  : 'Every seat bought is in use.'
              }
              action={worst ? `See ${plural(d.unused_licences.length, 'licence', 'licences')}` : undefined}
              panelTitle="Unused licence seats"
              panelDescription="Most wasted first. Cut seats at the next renewal."
              csv={{
                name: 'unused-licence-seats',
                header: ['Licence', 'Vendor', 'Seats bought', 'In use', 'Unused', 'Cost per seat (INR/yr)', 'Unused cost (INR/yr)', 'Renews'],
                rows: d.unused_licences.map((l) => [l.name, l.vendor, l.total_seats, l.assigned_seats, l.unused_seats, l.cost_per_seat, l.unused_cost_per_year, l.renewal_date]),
              }}
            >
              <List>
                {d.unused_licences.map((l) => (
                  <li key={l.license_id} className="flex flex-col gap-1.5 border-b border-line-soft py-2.5 last:border-b-0">
                    <span className="flex items-baseline justify-between gap-4">
                      <span className="truncate text-body text-ink">{l.name}</span>
                      <span className="shrink-0 text-body tabular-nums text-ink">{formatMoney(l.unused_cost_per_year)}/yr</span>
                    </span>
                    <Meter value={l.assigned_seats} max={l.total_seats} />
                    <span className="text-meta text-muted">
                      {l.assigned_seats} of {l.total_seats} seats in use · {l.unused_seats} unused
                      {l.renewal_date && ` · renews ${formatDate(l.renewal_date)}`}
                    </span>
                  </li>
                ))}
              </List>
            </Tile>
            <Tile
              value={formatMoney(d.idle_asset_value)}
              label={`of equipment sitting in stock for ${d.idle_threshold_days}+ days`}
              brief={
                longest
                  ? `${plural(d.idle_assets.length, 'device', 'devices')} to reassign or sell. Longest idle: ${longest.name}, ${longest.days_idle} days.`
                  : 'Nothing has been sitting in stock for long.'
              }
              action={longest ? `See ${plural(d.idle_assets.length, 'device', 'devices')}` : undefined}
              panelTitle="Idle equipment"
              panelDescription="Reassign before buying new, or sell."
              csv={{
                name: 'idle-equipment',
                header: ['Tag', 'Asset', 'Category', 'In stock since', 'Days idle', 'Book value (INR)'],
                rows: d.idle_assets.map((a) => [a.asset_tag, a.name, a.category, a.in_stock_since, a.days_idle, a.current_value]),
              }}
            >
              <List>
                {d.idle_assets.map((a) => (
                  <Row key={a.asset_id} to={`/assets/${a.asset_id}`}>
                    <Main
                      title={a.name}
                      sub={
                        <>
                          <Tag>{a.asset_tag}</Tag> · idle {a.days_idle} days, since {formatDate(a.in_stock_since)}
                        </>
                      }
                    />
                    <span className="shrink-0 text-body tabular-nums text-ink">{formatMoney(a.current_value)}</span>
                  </Row>
                ))}
              </List>
            </Tile>
          </>
        )
      }}
    </Section>
  )
}

// ---------------------------------------------------------------- 2. cost by department

const CostSection: React.FC<{ range: DateRange; rangeText: string }> = ({ range, rangeText }) => {
  const q = useQuery({
    queryKey: ['analytics', 'cost', range.from, range.to],
    queryFn: () => analyticsService.costByDepartment(range),
    staleTime: 0, // always recompute from the database on open
  })
  return (
    <Section title="Where the money went" question={`Equipment and licence spend by department, ${rangeText}.`} query={q}>
      {(data) => {
        const rows = data
          .map((r) => ({ ...r, department_name: r.department_id ? r.department_name : 'No department' }))
          .sort((a, b) => Number(b.total_cost) - Number(a.total_cost))
        const total = rows.reduce((s, r) => s + Number(r.total_cost), 0)
        const hardware = rows.reduce((s, r) => s + Number(r.hardware_cost), 0)
        const max = Math.max(0, ...rows.map((r) => Number(r.total_cost)))
        const top = rows[0]
        return (
          <>
            <Tile
              value={formatMoney(total)}
              label="spent in the period"
              brief={
                total > 0 && top
                  ? top.department_id
                    ? `${top.department_name} spent the most: ${formatMoney(top.total_cost)} (${Math.round((Number(top.total_cost) / total) * 100)}%).`
                    : `The biggest share, ${formatMoney(top.total_cost)} (${Math.round((Number(top.total_cost) / total) * 100)}%), isn't tied to any department.`
                  : 'Nothing was bought in this period.'
              }
              action={total > 0 ? `See ${plural(rows.length, 'department', 'departments')}` : undefined}
              panelTitle="Spend by department"
              panelDescription={`${rangeText}. Navy is equipment, grey is licences.`}
              csv={{
                name: 'cost-by-department',
                header: ['Department', 'Equipment (INR)', 'Licences (INR)', 'Total (INR)'],
                rows: rows.map((r) => [r.department_name, r.hardware_cost, r.software_cost, r.total_cost]),
              }}
            >
              <List>
                {rows.map((r) => {
                  const hw = Number(r.hardware_cost)
                  const sw = Number(r.software_cost)
                  return (
                    <li
                      key={r.department_id ?? 'none'}
                      className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 py-2"
                    >
                      <span className="truncate text-body text-ink">{r.department_name}</span>
                      <span
                        className="flex h-2 overflow-hidden rounded-pill bg-line-soft"
                        role="img"
                        aria-label={`Equipment ${formatMoney(hw)}, licences ${formatMoney(sw)}`}
                      >
                        <span className="block h-full bg-navy" style={{ width: `${max ? (hw / max) * 100 : 0}%` }} />
                        <span className="block h-full bg-control" style={{ width: `${max ? (sw / max) * 100 : 0}%` }} />
                      </span>
                      <span className="text-right text-meta tabular-nums text-ink">{formatMoney(r.total_cost)}</span>
                    </li>
                  )
                })}
              </List>
            </Tile>
            <Tile
              value={total > 0 ? `${Math.round((hardware / total) * 100)}%` : '—'}
              label="of it on equipment, the rest on licences"
              brief={
                total > 0
                  ? `${formatMoney(hardware)} on equipment, ${formatMoney(total - hardware)} on licences.`
                  : 'Nothing was bought in this period.'
              }
            />
          </>
        )
      }}
    </Section>
  )
}

// ---------------------------------------------------------------- 3. budget

const QuarterList: React.FC<{ quarters: ReplacementQuarter[] }> = ({ quarters }) => {
  const [openQuarter, setOpenQuarter] = useState<string | null>(quarters[0]?.label ?? null)
  const max = Math.max(0, ...quarters.map((r) => Number(r.replacement_cost)))
  return (
    <List>
      {quarters.map((r) => {
        const open = openQuarter === r.label
        return (
          <li key={r.label} className="border-b border-line-soft last:border-b-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenQuarter(open ? null : r.label)}
              className="grid w-full grid-cols-[1rem_minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left hover:bg-row-hover"
            >
              <ChevronRight className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-90')} aria-hidden="true" />
              <span className="text-body text-ink">{r.label}</span>
              <Meter value={Number(r.replacement_cost)} max={max} />
              <span className="text-right text-meta tabular-nums text-ink">
                {r.count} · {formatMoney(r.replacement_cost)}
              </span>
            </button>
            {open && (
              <ul className="m-0 list-none pb-2 pl-7">
                {r.assets.map((a) => (
                  <Row key={a.asset_id} to={`/assets/${a.asset_id}`}>
                    <Main
                      title={a.name}
                      sub={
                        <>
                          <Tag>{a.asset_tag}</Tag>
                          {a.holder_name && ` · ${a.holder_name}`} · ends {formatDate(a.date)}
                        </>
                      }
                    />
                    <span className="shrink-0 text-meta tabular-nums text-ink">{formatMoney(a.purchase_cost)}</span>
                  </Row>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </List>
  )
}

const BudgetSection: React.FC = () => {
  const q = useQuery({ queryKey: ['analytics', 'budget'], queryFn: analyticsService.budget, staleTime: 0 })
  return (
    <Section title="What to budget for" question="Devices reaching the end of their useful life, and warranties about to end." query={q}>
      {(d) => {
        const count = d.replacements.reduce((s, r) => s + r.count, 0)
        const busiest = d.replacements.reduce<(typeof d.replacements)[number] | undefined>(
          (m, r) => (!m || Number(r.replacement_cost) > Number(m.replacement_cost) ? r : m),
          undefined,
        )
        const next = d.warranties_expiring[0]
        return (
          <>
            <Tile
              value={formatMoney(d.replacement_cost_12_months)}
              label={`to replace ${plural(count, 'device', 'devices')} in the next 12 months, at original prices`}
              brief={
                <>
                  {busiest ? `Biggest quarter: ${busiest.label}, ${formatMoney(busiest.replacement_cost)}.` : 'Nothing reaches end of life in the next 12 months.'}
                  {d.past_end_of_life_count > 0 && (
                    <span className="block text-status-warn">
                      {plural(d.past_end_of_life_count, 'device is', 'devices are')} already past end of life and still in use.
                    </span>
                  )}
                </>
              }
              action={busiest ? 'See forecast by quarter' : undefined}
              panelTitle="Replacement forecast"
              panelDescription="End of life is purchase date plus useful life. Open a quarter to see its devices."
              csv={{
                name: 'replacement-forecast',
                header: ['Quarter', 'Tag', 'Asset', 'Holder', 'End of life', 'Purchase cost (INR)'],
                rows: d.replacements.flatMap((r) => r.assets.map((a) => [r.label, a.asset_tag, a.name, a.holder_name, a.date, a.purchase_cost])),
              }}
            >
              {d.past_end_of_life_count > 0 && (
                <p className="text-body text-status-warn">
                  {plural(d.past_end_of_life_count, 'device is', 'devices are')} already past end of life and still in use (
                  {formatMoney(d.past_end_of_life_cost)} to replace).
                </p>
              )}
              <Group title="By quarter" note="Devices · cost to replace">
                <QuarterList quarters={d.replacements} />
              </Group>
            </Tile>
            <Tile
              value={String(d.warranties_expiring.length)}
              label="warranties ending in the next 90 days"
              brief={next ? `Next: ${next.name} on ${formatDate(next.date)}.` : 'No warranties end in the next 90 days.'}
              action={next ? `See ${plural(d.warranties_expiring.length, 'warranty', 'warranties')}` : undefined}
              panelTitle="Warranties ending"
              panelDescription="Extend cover or plan for repairs."
              csv={{
                name: 'warranties-ending',
                header: ['Tag', 'Asset', 'Holder', 'Warranty ends'],
                rows: d.warranties_expiring.map((a) => [a.asset_tag, a.name, a.holder_name, a.date]),
              }}
            >
              <List>
                {d.warranties_expiring.map((a) => (
                  <Row key={a.asset_id} to={`/assets/${a.asset_id}`}>
                    <Main
                      title={a.name}
                      sub={
                        <>
                          <Tag>{a.asset_tag}</Tag>
                          {a.holder_name && ` · ${a.holder_name}`}
                        </>
                      }
                    />
                    <span className="shrink-0 text-meta text-status-warn">{formatDate(a.date)}</span>
                  </Row>
                ))}
              </List>
            </Tile>
          </>
        )
      }}
    </Section>
  )
}

// ---------------------------------------------------------------- 4. follow-ups

const FollowUpsSection: React.FC<{ range: DateRange; rangeText: string }> = ({ range, rangeText }) => {
  const q = useQuery({
    queryKey: ['analytics', 'follow-ups', range.from, range.to],
    queryFn: () => analyticsService.followUps(range),
    staleTime: 0, // always recompute from the database on open
  })
  return (
    <Section title="What needs chasing" question="Devices leavers still hold, and joiners who weren't ready." query={q}>
      {(d) => {
        const leaver = d.leavers[0]
        const joiner = d.upcoming_not_ready[0]
        return (
          <>
            <Tile
              value={formatMoney(d.unreturned_value)}
              label={`of equipment still with leavers (${plural(d.unreturned_count, 'device', 'devices')})`}
              tone={d.unreturned_count ? 'warn' : undefined}
              brief={
                leaver
                  ? `${leaver.full_name} holds ${plural(leaver.assets.length, 'device', 'devices')}${leaver.date_of_exit ? `, last day ${formatDate(leaver.date_of_exit)}` : ''}.`
                  : 'No leaver is holding a device.'
              }
              action={leaver ? `See ${plural(d.leavers.length, 'leaver', 'leavers')}` : undefined}
              panelTitle="Leavers with devices"
              panelDescription="Collect before their last day."
              csv={{
                name: 'leavers-with-devices',
                header: ['Employee', 'Last day', 'Tag', 'Asset', 'Book value (INR)'],
                rows: d.leavers.flatMap((l) => l.assets.map((a) => [l.full_name, l.date_of_exit, a.asset_tag, a.name, a.current_value])),
              }}
            >
              {d.leavers.map((l) => (
                <Group key={l.employee_id} title={l.full_name} note={l.date_of_exit ? `Last day ${formatDate(l.date_of_exit)}` : 'Last day not set'}>
                  <List>
                    {l.assets.map((a) => (
                      <Row key={a.asset_id} to={`/assets/${a.asset_id}`}>
                        <Main title={a.name} sub={<Tag>{a.asset_tag}</Tag>} />
                        <span className="shrink-0 text-meta tabular-nums text-ink">{formatMoney(a.current_value)}</span>
                      </Row>
                    ))}
                  </List>
                </Group>
              ))}
            </Tile>
            <Tile
              value={d.joiners_in_period ? `${d.joiners_ready_on_day_one} of ${d.joiners_in_period}` : '—'}
              label={`joiners had everything ready on day one (${rangeText})`}
              brief={
                joiner
                  ? `${joiner.full_name} joins ${formatDate(joiner.date_of_joining)} with ${plural(joiner.open_tasks, 'task', 'tasks')} still open.`
                  : 'Everyone joining in the next 14 days is ready.'
              }
              action={joiner ? `See ${plural(d.upcoming_not_ready.length, 'joiner', 'joiners')}` : undefined}
              panelTitle="Joining soon, not ready"
              panelDescription="First day in the next 14 days, tasks still open."
            >
              <List>
                {d.upcoming_not_ready.map((j) => (
                  <Row key={j.employee_id} to="/onboarding">
                    <Main title={j.full_name} sub={`Joins ${formatDate(j.date_of_joining)}`} />
                    <span className="shrink-0 text-meta text-status-warn">{plural(j.open_tasks, 'task', 'tasks')} open</span>
                  </Row>
                ))}
              </List>
            </Tile>
          </>
        )
      }}
    </Section>
  )
}

// ---------------------------------------------------------------- 5. turnaround

const TurnaroundSection: React.FC<{ range: DateRange; rangeText: string }> = ({ range, rangeText }) => {
  const q = useQuery({
    queryKey: ['analytics', 'turnaround', range.from, range.to],
    queryFn: () => analyticsService.turnaround(range),
    staleTime: 0, // always recompute from the database on open
  })
  return (
    <Section title="Where we're slow" question={`How long approvals and repairs take, ${rangeText}.`} query={q}>
      {(d) => {
        const slowest = d.approvals_by_step[0]
        const stepName = (role: string | null) => (role ? roleLabel(role) : 'Approver')
        const maxStep = Math.max(0, ...d.approvals_by_step.map((s) => s.median_hours))
        const maxRepair = Math.max(0, ...d.repairs_by_priority.map((s) => s.median_hours))
        const stuck = d.stuck_requests.length
        const repeat = d.repeat_assets.length
        return (
          <>
            <Tile
              value={duration(d.approval_median_hours)}
              label="median time to decide an approval step"
              brief={
                <>
                  {slowest ? `Slowest step: ${stepName(slowest.role_name)}, ${duration(slowest.median_hours)}.` : 'No approvals were decided in this period.'}
                  {stuck > 0 && (
                    <span className="block text-status-warn">
                      {plural(stuck, 'request has', 'requests have')} been stuck for {d.stuck_threshold_days}+ days.
                    </span>
                  )}
                </>
              }
              action={slowest || stuck ? 'See approval times' : undefined}
              panelTitle="Approval times"
              panelDescription={rangeText}
            >
              <Group title="By approval step" note="Slowest first. Median time · decisions.">
                {d.approvals_by_step.length === 0 ? (
                  <Empty>No approvals were decided in this period.</Empty>
                ) : (
                  <List>
                    {d.approvals_by_step.map((s) => (
                      <BarRow
                        key={s.role_name ?? 'none'}
                        label={stepName(s.role_name)}
                        value={s.median_hours}
                        max={maxStep}
                        figure={`${duration(s.median_hours)} · ${s.decisions}`}
                      />
                    ))}
                  </List>
                )}
              </Group>
              <Group title={`Stuck for ${d.stuck_threshold_days}+ days`} note="Still waiting at the same step.">
                {stuck === 0 ? (
                  <Empty>Nothing is stuck.</Empty>
                ) : (
                  <List>
                    {d.stuck_requests.map((s) => (
                      <Row key={s.request_id} to="/requests">
                        <Main title={s.title} sub={`Waiting on ${s.waiting_on_role ? roleLabel(s.waiting_on_role) : 'an approver'}`} />
                        <span className="shrink-0 text-meta text-status-warn">{plural(s.waiting_days, 'day', 'days')}</span>
                      </Row>
                    ))}
                  </List>
                )}
              </Group>
            </Tile>
            <Tile
              value={duration(d.repair_median_hours)}
              label="median time to resolve a repair ticket"
              brief={
                <>
                  {d.repairs_by_priority.length
                    ? `${plural(d.repairs_by_priority.reduce((s, p) => s + p.resolved, 0), 'ticket', 'tickets')} resolved in the period.`
                    : 'No tickets were resolved in this period.'}
                  {repeat > 0 && (
                    <span className="block text-status-warn">
                      {plural(repeat, 'device keeps', 'devices keep')} breaking — replace rather than repair?
                    </span>
                  )}
                </>
              }
              action={d.repairs_by_priority.length || repeat ? 'See repair times' : undefined}
              panelTitle="Repair times"
              panelDescription={rangeText}
            >
              <Group title="By priority" note="Median time · tickets resolved.">
                {d.repairs_by_priority.length === 0 ? (
                  <Empty>No tickets were resolved in this period.</Empty>
                ) : (
                  <List>
                    {d.repairs_by_priority.map((p) => (
                      <BarRow
                        key={p.priority}
                        label={humanize(p.priority)}
                        value={p.median_hours}
                        max={maxRepair}
                        figure={`${duration(p.median_hours)} · ${p.resolved}`}
                      />
                    ))}
                  </List>
                )}
              </Group>
              <Group title="Keeps breaking" note="Two or more tickets in 90 days.">
                {repeat === 0 ? (
                  <Empty>No device has needed repeated repairs.</Empty>
                ) : (
                  <List>
                    {d.repeat_assets.map((a) => (
                      <Row key={a.asset_id} to={`/assets/${a.asset_id}`}>
                        <Main title={a.name} sub={<Tag>{a.asset_tag}</Tag>} />
                        <span className="shrink-0 text-meta text-status-warn">{a.tickets} tickets</span>
                      </Row>
                    ))}
                  </List>
                )}
              </Group>
            </Tile>
          </>
        )
      }}
    </Section>
  )
}
