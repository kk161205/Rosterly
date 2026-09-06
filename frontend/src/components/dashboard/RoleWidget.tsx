import React from 'react'
import {
  Laptop,
  CheckCircle2,
  Wrench,
  Shield,
  UserCheck,
  ClipboardList,
  Users,
  UserMinus,
  ShieldAlert,
} from 'lucide-react'
import {
  UserRole,
  AssignedAssetItem,
  RequestItem,
  PendingApprovalItem,
  TeamMemberItem,
  OnboardingOffboardingItem,
  MaintenanceTicketItem,
  ExpiringWarrantyItem,
  AuditEventItem,
} from '@/types/dashboard'
import { Card, Button, StatusBadge } from '@/components/common/CommonUI'

const PRIORITY_VARIANT: Record<string, 'info' | 'warning' | 'error'> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
  critical: 'error',
}

const TICKET_STATUS_VARIANT: Record<string, 'error' | 'warning' | 'success' | 'neutral'> = {
  open: 'error',
  in_progress: 'warning',
  resolved: 'success',
  closed: 'neutral',
}

const REQUEST_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  in_progress: 'info',
  completed: 'success',
}

const TEAM_STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  active: 'success',
  onboarding: 'info',
  leave: 'warning',
  inactive: 'neutral',
}

function AssignedAssetsWidget({ assets }: { assets: AssignedAssetItem[] }) {
  return (
    <Card elevated>
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
        <div>
          <h2 className="text-title-md font-sans font-semibold text-on-surface">
            My Assigned Hardware & Licenses
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Active hardware tags and serial numbers assigned to your user account
          </p>
        </div>
        <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-tertiary-container/30 text-tertiary">
          {assets.length} Active Devices
        </span>
      </div>

      {assets.length === 0 ? (
        <div className="py-8 text-center text-on-surface-variant text-body-sm">
          No assets currently assigned.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="p-4 rounded-md bg-surface-container-low border border-outline-variant hover:border-accent/50 transition-all flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary">
                  <Laptop className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
                  {asset.asset_tag}
                </span>
              </div>
              <div>
                <h3 className="text-body-md font-sans font-semibold text-on-surface">
                  {asset.name}
                </h3>
                <p className="text-body-sm text-on-surface-variant font-mono mt-0.5">
                  SN: {asset.serial_number || 'N/A'}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/60 flex items-center justify-between text-[11px] font-mono text-outline">
                <span>Category: {asset.category}</span>
                <span className="text-success font-medium">Assigned</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function MyOpenRequestsWidget({ requests }: { requests: RequestItem[] }) {
  return (
    <Card elevated>
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
        <div>
          <h2 className="text-title-md font-sans font-semibold text-on-surface">
            My Open Requests
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Hardware, access, and IT tickets you've submitted that are still in flight
          </p>
        </div>
        <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-accent-container text-on-accent-container">
          {requests.length} Open
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="py-8 text-center text-on-surface-variant text-body-sm">
          No open requests. Everything you've submitted has been resolved.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-4 rounded-md bg-surface-container-low border border-outline-variant hover:bg-surface-container transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-accent-container text-on-accent-container flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-body-md font-sans font-semibold text-on-surface">
                      {req.title}
                    </h3>
                    <StatusBadge status={req.priority} variant={PRIORITY_VARIANT[req.priority] || 'neutral'} dot={false} />
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">
                    Type: {req.request_type}
                  </p>
                </div>
              </div>
              <StatusBadge status={req.status} variant={REQUEST_STATUS_VARIANT[req.status] || 'neutral'} />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function PendingApprovalsWidget({ approvals }: { approvals: PendingApprovalItem[] }) {
  return (
    <Card elevated>
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
        <div>
          <h2 className="text-title-md font-sans font-semibold text-on-surface">
            Pending Approvals Queue
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Department hardware, software access, and leave requests awaiting your decision
          </p>
        </div>
        <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-warning-container text-on-warning-container border border-warning/20">
          {approvals.length} Awaiting Signoff
        </span>
      </div>

      {approvals.length === 0 ? (
        <div className="py-8 text-center text-on-surface-variant text-body-sm">
          No pending approvals in queue.
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-md bg-surface-container-low border border-outline-variant hover:bg-surface-container transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-accent-container text-on-accent-container flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-body-md font-sans font-semibold text-on-surface">
                      {item.title}
                    </h3>
                    <StatusBadge status={item.priority} variant={PRIORITY_VARIANT[item.priority] || 'neutral'} dot={false} />
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">
                    Requester: <strong>{item.requester_name}</strong> • Type: {item.request_type}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <Button type="button" variant="primary" size="sm" className="bg-success hover:bg-success/90">
                  Approve
                </Button>
                <Button type="button" variant="outline" size="sm">
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function TeamMembersWidget({ members }: { members: TeamMemberItem[] }) {
  return (
    <Card elevated>
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
        <div>
          <h2 className="text-title-md font-sans font-semibold text-on-surface">
            Team Headcount
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Direct reports in your department and their current status
          </p>
        </div>
        <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-tertiary-container/30 text-tertiary">
          {members.length} Members
        </span>
      </div>

      {members.length === 0 ? (
        <div className="py-8 text-center text-on-surface-variant text-body-sm">
          No team members found for your department.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="p-3 rounded-md bg-surface-container-low border border-outline-variant flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-sans font-bold text-xs flex-shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-body-sm font-sans font-semibold text-on-surface truncate">{m.full_name}</h4>
                <p className="text-[11px] text-on-surface-variant truncate">{m.designation}</p>
              </div>
              <StatusBadge status={m.status} variant={TEAM_STATUS_VARIANT[m.status] || 'neutral'} dot={false} className="flex-shrink-0" />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function OnboardingOffboardingWidget({
  title,
  description,
  countLabel,
  items,
  icon,
  emptyLabel,
}: {
  title: string
  description: string
  countLabel: string
  items: OnboardingOffboardingItem[]
  icon: React.ReactNode
  emptyLabel: string
}) {
  return (
    <Card elevated>
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
        <div>
          <h2 className="text-title-md font-sans font-semibold text-on-surface">{title}</h2>
          <p className="text-body-sm text-on-surface-variant">{description}</p>
        </div>
        <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-accent-container text-on-accent-container">
          {items.length} {countLabel}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-on-surface-variant text-body-sm">{emptyLabel}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-md bg-surface-container-low border border-outline-variant flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-tertiary bg-tertiary-container/30 px-2 py-0.5 rounded">
                  {item.department || 'General'}
                </span>
                <StatusBadge status={item.status} variant={item.status === 'completed' ? 'success' : 'warning'} dot={false} />
              </div>
              <h3 className="text-body-md font-sans font-semibold text-on-surface">
                {item.employee_name}
              </h3>
              <div className="mt-3 pt-2 border-t border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant">
                {icon}
                <span className="text-accent font-mono font-medium">Checklist Active</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function MaintenanceTicketsWidget({ tickets }: { tickets: MaintenanceTicketItem[] }) {
  return (
    <Card elevated>
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
        <div>
          <h2 className="text-title-md font-sans font-semibold text-on-surface">
            Open Hardware Maintenance Queue
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Reported hardware issues, battery replacements, and device repairs
          </p>
        </div>
        <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-error-container text-on-error-container">
          {tickets.length} Active Tickets
        </span>
      </div>

      {tickets.length === 0 ? (
        <div className="py-8 text-center text-on-surface-variant text-body-sm">
          No open maintenance tickets. All hardware healthy.
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((tkt) => (
            <div
              key={tkt.id}
              className="p-4 rounded-md bg-surface-container-low border border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-error-container text-on-error-container flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-body-md font-sans font-semibold text-on-surface">
                      {tkt.asset_name}
                    </h3>
                    <StatusBadge status={tkt.priority} variant={PRIORITY_VARIANT[tkt.priority] || 'neutral'} dot={false} />
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">
                    Issue: {tkt.issue_description}
                  </p>
                </div>
              </div>

              <span className="self-end sm:self-center">
                <StatusBadge status={tkt.status} variant={TICKET_STATUS_VARIANT[tkt.status] || 'neutral'} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ExpiringWarrantiesWidget({ items }: { items: ExpiringWarrantyItem[] }) {
  return (
    <Card elevated>
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
        <div>
          <h2 className="text-title-md font-sans font-semibold text-on-surface">
            Warranty Expiring (30 Days)
          </h2>
          <p className="text-body-sm text-on-surface-variant">
            Assets whose warranty or AMC coverage lapses within the next month
          </p>
        </div>
        <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-warning-container text-on-warning-container border border-warning/20">
          {items.length} Expiring
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-on-surface-variant text-body-sm">
          No warranties expiring in the next 30 days.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((asset) => (
            <div
              key={asset.id}
              className="p-3 rounded-md bg-surface-container-low border border-outline-variant flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded bg-warning-container text-on-warning-container flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-body-sm font-sans font-semibold text-on-surface truncate">{asset.name}</h4>
                  <p className="text-[11px] font-mono text-on-surface-variant">{asset.asset_tag}</p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-warning font-semibold flex-shrink-0">
                {asset.warranty_expiry || 'N/A'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

interface RoleWidgetProps {
  role: UserRole
  widgets: Record<string, any>
}

export const RoleWidget: React.FC<RoleWidgetProps> = ({ role, widgets }) => {
  if (role === 'employee') {
    if (!widgets.my_assigned_assets && !widgets.my_open_requests) return null
    return (
      <div className="space-y-6">
        {widgets.my_assigned_assets && <AssignedAssetsWidget assets={widgets.my_assigned_assets as AssignedAssetItem[]} />}
        {widgets.my_open_requests && <MyOpenRequestsWidget requests={widgets.my_open_requests as RequestItem[]} />}
      </div>
    )
  }

  if (role === 'manager') {
    if (!widgets.pending_approvals && !widgets.team_members) return null
    return (
      <div className="space-y-6">
        {widgets.pending_approvals && <PendingApprovalsWidget approvals={widgets.pending_approvals as PendingApprovalItem[]} />}
        {widgets.team_members && <TeamMembersWidget members={widgets.team_members as TeamMemberItem[]} />}
      </div>
    )
  }

  if (role === 'hr_admin') {
    if (!widgets.active_onboardings && !widgets.active_offboardings) return null
    return (
      <div className="space-y-6">
        {widgets.active_onboardings && (
          <OnboardingOffboardingWidget
            title="Active Onboarding Workflows"
            description="Track new employee document verifications and department task progress"
            countLabel="Active Hires"
            items={widgets.active_onboardings as OnboardingOffboardingItem[]}
            icon={<span>Verification</span>}
            emptyLabel="No active onboarding workflows."
          />
        )}
        {widgets.active_offboardings && (
          <OnboardingOffboardingWidget
            title="Active Offboarding Workflows"
            description="Track exiting employee asset reclamation and access revocation progress"
            countLabel="In Progress"
            items={widgets.active_offboardings as OnboardingOffboardingItem[]}
            icon={<UserMinus className="w-3.5 h-3.5 text-outline" />}
            emptyLabel="No active offboarding workflows."
          />
        )}
      </div>
    )
  }

  if (role === 'it_admin') {
    if (!widgets.open_maintenance_tickets && !widgets.expiring_warranties) return null
    return (
      <div className="space-y-6">
        {widgets.open_maintenance_tickets && (
          <MaintenanceTicketsWidget tickets={widgets.open_maintenance_tickets as MaintenanceTicketItem[]} />
        )}
        {widgets.expiring_warranties && (
          <ExpiringWarrantiesWidget items={widgets.expiring_warranties as ExpiringWarrantyItem[]} />
        )}
      </div>
    )
  }

  if (role === 'super_admin' || role === 'auditor') {
    if (!widgets.system_overview && !widgets.audit_events_feed) return null
    const overview = widgets.system_overview || {}
    const auditFeed = (widgets.audit_events_feed || []) as AuditEventItem[]

    return (
      <Card elevated className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80">
          <div>
            <h2 className="text-title-md font-sans font-semibold text-on-surface">
              System Governance & Audit Trail
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              Centralized platform telemetry and immutable audit log stream (PRD §5.2)
            </p>
          </div>
          <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-primary-container text-on-primary-container">
            SOC-2 Compliant Ledger
          </span>
        </div>

        {/* System Overview Counts */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-md bg-surface-container-low border border-outline-variant">
            <span className="text-[11px] font-mono text-on-surface-variant block">Total Users</span>
            <span className="text-title-md font-sans font-bold text-on-surface">{overview.total_users ?? 0}</span>
          </div>
          <div className="p-3 rounded-md bg-surface-container-low border border-outline-variant">
            <span className="text-[11px] font-mono text-on-surface-variant block">Active Users</span>
            <span className="text-title-md font-sans font-bold text-success">{overview.active_users ?? 0}</span>
          </div>
          <div className="p-3 rounded-md bg-surface-container-low border border-outline-variant">
            <span className="text-[11px] font-mono text-on-surface-variant block">Total Assets</span>
            <span className="text-title-md font-sans font-bold text-on-surface">{overview.total_assets ?? 0}</span>
          </div>
          <div className="p-3 rounded-md bg-surface-container-low border border-outline-variant">
            <span className="text-[11px] font-mono text-on-surface-variant block">Assigned Assets</span>
            <span className="text-title-md font-sans font-bold text-accent">{overview.assigned_assets ?? 0}</span>
          </div>
          <div className="p-3 rounded-md bg-surface-container-low border border-outline-variant">
            <span className="text-[11px] font-mono text-on-surface-variant block">Pending Requests</span>
            <span className="text-title-md font-sans font-bold text-warning">{overview.pending_requests ?? 0}</span>
          </div>
        </div>

        {/* Audit Events Feed */}
        {auditFeed.length > 0 && (
          <div>
            <h3 className="text-body-md font-sans font-semibold text-on-surface mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>Recent Immutable Audit Logs</span>
            </h3>
            <div className="divide-y divide-outline-variant/60 rounded-md border border-outline-variant bg-surface-container-low overflow-hidden">
              {auditFeed.slice(0, 5).map((log) => (
                <div key={log.id} className="p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-outline flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-on-surface">{log.actor_name}</span>
                      <span className="text-on-surface-variant ml-1 font-mono">{log.action}</span>
                    </div>
                  </div>
                  <span className="font-mono text-outline uppercase">{log.entity_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    )
  }

  return null
}
