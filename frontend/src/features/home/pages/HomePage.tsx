import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, ScanLine } from 'lucide-react'
import { HOME_SUMMARY_KEY, homeService, type HomeSummary } from '@/features/home/services/homeService'
import { InboxSection } from '@/features/inbox/components/InboxSection'
import { useInbox } from '@/features/inbox/hooks/useInbox'
import { hasRole, rolesLabel, rolesOf, useCurrentUser } from '@/features/auth/hooks/useCurrentUser'
import { formatDate, humanize } from '@/lib/format'
import { ButtonLink, Skeleton, Status } from '@/ui'

interface Stat {
  label: string
  value: number | undefined
  context: string
  to?: string
}

/** The 3–4 numbers each role cares about, all from GET /dashboard/summary (and the Inbox count). */
function statsFor(role: string, s: HomeSummary | undefined, waiting: number | undefined): Stat[] {
  const m = s?.metrics ?? {}
  const o = s?.widgets.system_overview ?? {}
  switch (role) {
    case 'it_admin':
      return [
        {
          label: 'Open tickets',
          value: m.open_maintenance_tickets_count,
          context: 'Open or in progress',
          to: '/maintenance',
        },
        { label: 'Warranties ending', value: m.warranty_expiring_count, context: 'In the next 30 days', to: '/assets' },
        {
          label: 'In stock',
          value: m.available_stock_count,
          context: 'Ready to assign',
          to: '/assets?status=in_stock',
        },
        { label: 'Total assets', value: m.total_assets_count, context: 'Across every status', to: '/assets' },
      ]
    case 'hr_admin':
      return [
        { label: 'Onboardings', value: m.active_onboardings_count, context: 'In progress', to: '/onboarding' },
        { label: 'Offboardings', value: m.active_offboardings_count, context: 'In progress', to: '/offboarding' },
        {
          label: 'Employees',
          value: m.total_employees_count,
          context: 'Active accounts',
          to: '/employees?status=active',
        },
        { label: 'Waiting on you', value: waiting, context: 'Approvals and tasks', to: '#waiting' },
      ]
    case 'manager':
      return [
        {
          label: 'Waiting for approval',
          value: m.pending_approvals_count,
          context: 'Requests at your step',
          to: '#waiting',
        },
        { label: 'Team', value: m.team_headcount, context: 'Active people', to: '/employees' },
        { label: 'Team’s assets', value: m.dept_asset_allocation, context: 'Currently assigned', to: '/assets' },
        {
          label: 'Your open requests',
          value: m.my_open_requests_count,
          context: 'Pending or in progress',
          to: '/requests?status=pending',
        },
      ]
    case 'super_admin':
    case 'auditor':
      return [
        {
          label: 'Active users',
          value: o.active_users,
          context: `Of ${o.total_users ?? '—'} accounts`,
          to: role === 'super_admin' ? '/users' : '/employees',
        },
        {
          label: 'Assets assigned',
          value: o.assigned_assets,
          context: `Of ${o.total_assets ?? '—'} assets`,
          to: '/assets?status=assigned',
        },
        { label: 'Pending requests', value: o.pending_requests, context: 'Across the company' },
        { label: 'Audit events', value: m.audit_events_count, context: 'In the last 24 hours' },
      ]
    default:
      return [
        { label: 'Your assets', value: m.my_assigned_assets_count, context: 'Assigned to you', to: '/profile' },
        {
          label: 'Open requests',
          value: m.my_open_requests_count,
          context: 'Pending or in progress',
          to: '/requests?status=pending',
        },
        {
          label: 'Tasks for you',
          value: m.pending_tasks_count,
          context: 'Joining and leaving checklists',
          to: '#waiting',
        },
      ]
  }
}

// Widest first: when roles overlap, the wider role's cards lead
const STAT_ORDER = ['super_admin', 'auditor', 'hr_admin', 'it_admin', 'manager']

/**
 * Multi-role (§5.14): every held role's cards, widest first, each card once.
 * Only one "waiting" card — the Inbox already merges approvals and tasks.
 */
function mergedStats(roles: string[], s: HomeSummary | undefined, waiting: number | undefined): Stat[] {
  const ordered = STAT_ORDER.filter((r) => roles.includes(r))
  if (ordered.length < roles.length || ordered.length === 0) ordered.push('employee')
  const out: Stat[] = []
  for (const role of ordered) {
    for (const stat of statsFor(role, s, waiting)) {
      const duplicate = out.some((o) => o.label === stat.label || (stat.to === '#waiting' && o.to === '#waiting'))
      if (!duplicate) out.push(stat)
    }
  }
  return out
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const StatBlock: React.FC<{ stat: Stat; loading: boolean }> = ({ stat, loading }) => {
  const body = (
    <>
      <span className="text-meta text-muted group-hover:text-ink">{stat.label}</span>
      {loading || stat.value === undefined ? (
        <Skeleton className="my-1.5 h-8 w-16" />
      ) : (
        <span className="text-metric tabular-nums text-ink">{stat.value}</span>
      )}
      <span className="text-meta text-muted">{stat.context}</span>
    </>
  )
  const cls = 'group flex flex-col gap-1 border-t border-ink pt-3'
  if (!stat.to) return <div className={cls}>{body}</div>
  if (stat.to.startsWith('#'))
    return (
      <a href={stat.to} className={cls}>
        {body}
      </a>
    )
  return (
    <Link to={stat.to} className={cls}>
      {body}
    </Link>
  )
}

/**
 * Home (§5.2): a greeting, the handful of numbers this role watches (each a
 * link to the list behind it), then "Waiting on you" — the Inbox (§5.2a).
 * People with little to approve also see their equipment and requests.
 */
export const HomePage: React.FC = () => {
  const { user, can } = useCurrentUser()
  const summary = useQuery({ queryKey: HOME_SUMMARY_KEY, queryFn: homeService.summary, enabled: Boolean(user) })
  const inbox = useInbox(Boolean(user))
  const roles = rolesOf(user)
  const stats = mergedStats(roles, summary.data, inbox.data?.items.length)
  const firstName = user?.full_name.split(' ')[0]
  // Admin roles work queues; everyone else also sees their own equipment and requests
  const personal = Boolean(user) && !hasRole(user, 'it_admin', 'hr_admin', 'super_admin', 'auditor')
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  const inboxEmpty = Boolean(inbox.data) && inbox.data!.items.length === 0 && inbox.data!.done_today.length === 0
  const personalLists = personal && summary.data && (
    <div className="grid gap-10 lg:grid-cols-2">
      <section aria-labelledby="equipment-heading" className="border-t border-ink pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 id="equipment-heading" className="text-section text-ink">
            Your equipment
          </h2>
          <Link to="/profile" className="text-meta text-muted hover:text-ink hover:underline">
            See all
          </Link>
        </div>
        {(summary.data.widgets.my_assigned_assets ?? []).length === 0 ? (
          <p className="py-2 text-body text-muted">Nothing is assigned to you right now.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {(summary.data.widgets.my_assigned_assets ?? []).slice(0, 5).map((a) => (
              <li
                key={a.id}
                className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body text-ink">{a.name}</span>
                  <span className="text-meta text-muted">
                    <span className="font-mono">{a.asset_tag}</span> · {humanize(a.category)}
                  </span>
                </span>
                {a.assigned_at && (
                  <span className="shrink-0 text-meta text-muted">Since {formatDate(a.assigned_at)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="requests-heading" className="border-t border-ink pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 id="requests-heading" className="text-section text-ink">
            Your open requests
          </h2>
          <Link to="/requests" className="text-meta text-muted hover:text-ink hover:underline">
            See all
          </Link>
        </div>
        {(summary.data.widgets.my_open_requests ?? []).length === 0 ? (
          <p className="py-2 text-body text-muted">No open requests.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {(summary.data.widgets.my_open_requests ?? []).slice(0, 5).map((r) => (
              <li key={r.id} className="border-b border-line-soft last:border-b-0">
                <Link to="/requests" className="flex items-baseline justify-between gap-4 py-2.5 hover:bg-row-hover">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body text-ink">{r.title}</span>
                    <span className="text-meta text-muted">Submitted {formatDate(r.created_at)}</span>
                  </span>
                  <Status value={r.status} className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-page text-ink">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-lead text-muted">{user ? `${rolesLabel(roles)} · ${today}` : today}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('assets:lookup') && (
            <ButtonLink to="/assets/qr" variant="secondary">
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              Scan a QR code
            </ButtonLink>
          )}
          {can('request:create') && (
            <ButtonLink to="/requests?new=1" variant="primary">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New request
            </ButtonLink>
          )}
        </div>
      </header>

      {!summary.isError && (
        <section aria-label="At a glance" className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4 lg:gap-x-10">
          {stats.map((s) => (
            <StatBlock key={s.label} stat={s} loading={summary.isLoading || !user} />
          ))}
        </section>
      )}

      {/* With nothing waiting, the person's own equipment and requests are the useful part, so they lead */}
      {inboxEmpty ? personalLists : null}
      <InboxSection />
      {inboxEmpty ? null : personalLists}
    </div>
  )
}
