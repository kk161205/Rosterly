import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, CheckCircle2, Info } from 'lucide-react'
import type {
  ApprovalCheck,
  ApprovalDetail,
  ChainStep,
  DoneItem,
  InboxItem,
  TaskDetail,
  TicketDetail,
} from '@/features/inbox/types/inbox'
import { roleLabel } from '@/features/auth/hooks/useCurrentUser'
import { daysUntil, formatDate, formatMoney, humanize } from '@/lib/format'
import { getErrorMessage } from '@/lib/errors'
import { Alert, Button, ButtonLink, DetailRow, Status, TextAreaField, cn } from '@/ui'

/** What the detail pane needs from the page to act on an item. */
export interface InboxActions {
  approve: (requestId: string) => Promise<void>
  reject: (requestId: string, reason: string) => Promise<void>
  setTaskStatus: (task: TaskDetail, status: 'in_progress' | 'done') => Promise<void>
  updateTicket: (ticket: TicketDetail, changes: { status?: string; take?: boolean }) => Promise<void>
}

/** Runs one action at a time and keeps its error next to the buttons. */
function useAction() {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, run }
}

const Header: React.FC<{ eyebrow: string; title: string; sub?: React.ReactNode }> = ({ eyebrow, title, sub }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-meta text-muted">{eyebrow}</span>
    <h2 className="text-pretty font-display text-panel text-ink">{title}</h2>
    {sub && <p className="text-body text-muted">{sub}</p>}
  </div>
)

const SubHeading: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="flex items-baseline justify-between gap-3">
    <h3 className="text-body font-semibold text-ink">{children}</h3>
    {aside}
  </div>
)

// ---------------------------------------------------------------- approvals

const checkIcon: Record<ApprovalCheck['status'], { Icon: typeof Info; className: string; label: string }> = {
  pass: { Icon: CheckCircle2, className: 'text-status-ok', label: 'Passed' },
  attention: { Icon: AlertCircle, className: 'text-status-warn', label: 'Needs a look' },
  info: { Icon: Info, className: 'text-muted', label: 'For information' },
}

function stepText(step: ChainStep): string {
  const role = roleLabel(step.role_name) || 'Approver'
  if (step.is_current) return `You · ${role}`
  if (step.status === 'approved') return step.approver_name ? `${step.approver_name} approved` : `${role} approved`
  if (step.status === 'skipped') return `${role} skipped`
  if (step.status === 'rejected') return `${role} rejected`
  return role
}

const ApprovalView: React.FC<{ item: InboxItem; detail: ApprovalDetail; actions: InboxActions }> = ({
  item,
  detail,
  actions,
}) => {
  const { busy, error, run } = useAction()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const firstName = detail.requester.full_name.split(' ')[0]
  const attention = detail.attention_count
  const urgent = detail.priority === 'high' || detail.priority === 'critical'

  return (
    <div className="flex flex-col gap-7">
      <Header
        eyebrow={`${humanize(detail.request_type)} · step ${detail.current_step} of ${detail.total_steps}`}
        title={item.title}
        sub={
          <>
            {detail.requester.full_name}
            {detail.requester.department && `, ${detail.requester.department}`}
            {detail.estimated_cost !== null && ` · ${formatMoney(detail.estimated_cost)}`}
            {urgent && ` · ${humanize(detail.priority)} priority`}
          </>
        }
      />

      {detail.description && (
        <p className="border-l-2 border-line pl-4 text-lead text-ink">{detail.description}</p>
      )}

      <section aria-label="Checks" className="flex flex-col gap-1">
        <SubHeading
          aside={
            <span className={cn('text-meta font-medium', attention ? 'text-status-warn' : 'text-status-ok')}>
              {attention === 0 ? 'Nothing to look at' : attention === 1 ? '1 thing to look at' : `${attention} things to look at`}
            </span>
          }
        >
          Rosterly checked this request
        </SubHeading>
        <ul className="m-0 mt-1 list-none p-0">
          {detail.checks.map((check) => {
            const { Icon, className, label } = checkIcon[check.status]
            return (
              <li key={check.text} className="flex items-start gap-3 py-2 text-body text-ink">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', className)} role="img" aria-label={label} />
                <span>{check.text}</span>
              </li>
            )
          })}
        </ul>
        <p className="text-meta text-muted">
          Fixed rules on live data: the cost tiers, the requester’s equipment and the requested asset.
        </p>
      </section>

      <section aria-label="Approval chain" className="flex flex-col gap-2">
        <SubHeading>Approval chain</SubHeading>
        <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-body">
          {detail.chain.map((step, i) => (
            <li key={step.step_order} className="inline-flex items-center gap-2">
              <span
                className={cn(
                  step.is_current && 'font-semibold text-navy',
                  !step.is_current && step.status === 'approved' && 'text-status-ok',
                  !step.is_current && step.status !== 'approved' && 'text-muted',
                )}
              >
                {stepText(step)}
              </span>
              {i < detail.chain.length - 1 && (
                <span className="text-control" aria-hidden="true">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {error && <Alert>{error}</Alert>}

      {rejecting ? (
        <div className="flex flex-col gap-3">
          <TextAreaField
            label={`Reason for ${firstName}`}
            hint={`${firstName} sees this with the rejection.`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              disabled={reason.trim().length === 0}
              isLoading={busy === 'reject'}
              onClick={() => run('reject', () => actions.reject(detail.request_id, reason.trim()))}
            >
              Reject request
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy !== null}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            isLoading={busy === 'approve'}
            disabled={busy !== null}
            onClick={() => run('approve', () => actions.approve(detail.request_id))}
          >
            Approve
          </Button>
          <Button variant="danger" disabled={busy !== null} onClick={() => setRejecting(true)}>
            Reject
          </Button>
          <ButtonLink variant="secondary" to="/requests">
            Open requests
          </ButtonLink>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- tasks

function whenText(type: TaskDetail['checklist_type'], date: string | null): string | null {
  if (!date) return null
  const days = daysUntil(date)
  const verb = type === 'onboarding' ? 'Joins' : 'Leaves'
  const past = type === 'onboarding' ? 'Joined' : 'Left'
  const rel =
    days === null ? '' : days === 0 ? ' (today)' : days === 1 ? ' (tomorrow)' : days > 1 ? ` (in ${days} days)` : ''
  return `${days !== null && days < 0 ? past : verb} ${formatDate(date)}${rel}`
}

const TaskView: React.FC<{ item: InboxItem; detail: TaskDetail; actions: InboxActions }> = ({
  item,
  detail,
  actions,
}) => {
  const { busy, error, run } = useAction()
  const when = whenText(detail.checklist_type, detail.key_date)
  const listPath = `/${detail.checklist_type}`

  return (
    <div className="flex flex-col gap-7">
      <Header
        eyebrow={`${humanize(detail.checklist_type)} checklist`}
        title={item.title}
        sub={
          <>
            {detail.employee.full_name}
            {detail.employee.department && `, ${detail.employee.department}`}
          </>
        }
      />

      <dl className="m-0">
        {when && <DetailRow label="Key date">{when}</DetailRow>}
        <DetailRow label="Status">
          <Status value={detail.status} />
        </DetailRow>
        {detail.asset && (
          <DetailRow label="Asset">
            <Link to={`/assets/${detail.asset.id}`} className="text-navy underline decoration-control underline-offset-4">
              {detail.asset.name} <span className="font-mono text-meta">{detail.asset.asset_tag}</span>
            </Link>
          </DetailRow>
        )}
      </dl>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          isLoading={busy === 'done'}
          disabled={busy !== null}
          onClick={() => run('done', () => actions.setTaskStatus(detail, 'done'))}
        >
          Mark done
        </Button>
        {detail.status === 'pending' && (
          <Button
            variant="secondary"
            isLoading={busy === 'start'}
            disabled={busy !== null}
            onClick={() => run('start', () => actions.setTaskStatus(detail, 'in_progress'))}
          >
            Start
          </Button>
        )}
        <ButtonLink variant="secondary" to={listPath}>
          Open checklist
        </ButtonLink>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- tickets

const TicketView: React.FC<{ item: InboxItem; detail: TicketDetail; actions: InboxActions }> = ({
  item,
  detail,
  actions,
}) => {
  const { busy, error, run } = useAction()
  const unassigned = !detail.assigned_to_me

  return (
    <div className="flex flex-col gap-7">
      <Header eyebrow={`Maintenance ticket · ${detail.asset.asset_tag}`} title={item.title} sub={detail.asset.name} />

      <p className="border-l-2 border-line pl-4 text-lead text-ink">{detail.issue_description}</p>

      <dl className="m-0">
        <DetailRow label="Priority">{humanize(detail.priority)}</DetailRow>
        <DetailRow label="Status">
          <Status value={detail.status} />
        </DetailRow>
        <DetailRow label="Reported by">{detail.reported_by ?? '—'}</DetailRow>
        <DetailRow label="Assigned to">{detail.assigned_to_me ? 'You' : 'No one yet'}</DetailRow>
      </dl>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        {unassigned ? (
          <Button
            variant="primary"
            isLoading={busy === 'take'}
            disabled={busy !== null}
            onClick={() => run('take', () => actions.updateTicket(detail, { take: true, status: 'in_progress' }))}
          >
            Take this ticket
          </Button>
        ) : (
          detail.status === 'open' && (
            <Button
              variant="primary"
              isLoading={busy === 'start'}
              disabled={busy !== null}
              onClick={() => run('start', () => actions.updateTicket(detail, { status: 'in_progress' }))}
            >
              Start work
            </Button>
          )
        )}
        {!unassigned && (
          <Button
            variant={detail.status === 'open' ? 'secondary' : 'primary'}
            isLoading={busy === 'resolve'}
            disabled={busy !== null}
            onClick={() => run('resolve', () => actions.updateTicket(detail, { status: 'resolved' }))}
          >
            Mark resolved
          </Button>
        )}
        <ButtonLink variant="secondary" to="/maintenance">
          Open maintenance
        </ButtonLink>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- done

const DoneView: React.FC<{ item: DoneItem }> = ({ item }) => (
  <div className="flex flex-col gap-6">
    <Header eyebrow="Done today" title={item.title} />
    <div className="flex items-center gap-3 border-t border-ink pt-4 text-body text-ink">
      <Check className="h-4 w-4 shrink-0 text-status-ok" aria-hidden="true" />
      <span>
        {item.outcome} by you at{' '}
        {new Date(item.done_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
      </span>
    </div>
  </div>
)

// ---------------------------------------------------------------- entry point

export const InboxDetail: React.FC<
  { actions: InboxActions } & ({ type: 'open'; item: InboxItem } | { type: 'done'; item: DoneItem })
> = (props) => {
  if (props.type === 'done') return <DoneView item={props.item} />
  const { item, actions } = props
  // key resets local state (reject form, errors) when the selection changes
  if (item.approval) return <ApprovalView key={item.id} item={item} detail={item.approval} actions={actions} />
  if (item.task) return <TaskView key={item.id} item={item} detail={item.task} actions={actions} />
  if (item.ticket) return <TicketView key={item.id} item={item} detail={item.ticket} actions={actions} />
  return null
}
