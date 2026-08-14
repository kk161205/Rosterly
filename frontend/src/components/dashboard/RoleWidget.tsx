import React from 'react'
import {
  Laptop,
  CheckCircle2,
  Clock,
  UserPlus,
  Wrench,
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  Tag,
  FileCheck,
} from 'lucide-react'
import {
  UserRole,
  AssignedAssetItem,
  PendingApprovalItem,
  OnboardingOffboardingItem,
  MaintenanceTicketItem,
} from '@/types/dashboard'

interface RoleWidgetProps {
  role: UserRole
  widgets: Record<string, any>
}

export const RoleWidget: React.FC<RoleWidgetProps> = ({ role, widgets }) => {
  if (role === 'employee' && widgets.my_assigned_assets) {
    const assets = widgets.my_assigned_assets as AssignedAssetItem[]
    return (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm">
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
                <span className="text-emerald-600 font-medium">Assigned</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (role === 'manager' && widgets.pending_approvals) {
    const approvals = widgets.pending_approvals as PendingApprovalItem[]
    return (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
          <div>
            <h2 className="text-title-md font-sans font-semibold text-on-surface">
              Pending Approvals Queue
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              Department hardware, software access, and leave requests awaiting your decision
            </p>
          </div>
          <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
            {approvals.length} Awaiting Signoff
          </span>
        </div>

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
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-semibold">
                      {item.priority}
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">
                    Requester: <strong>{item.requester_name}</strong> • Type: {item.request_type}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-mono font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-mono font-medium rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (role === 'hr_admin' && widgets.active_onboardings) {
    const onboardings = widgets.active_onboardings as OnboardingOffboardingItem[]
    return (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant/80 mb-4">
          <div>
            <h2 className="text-title-md font-sans font-semibold text-on-surface">
              Active Onboarding Workflows
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              Track new employee document verifications and department task progress
            </p>
          </div>
          <span className="text-label-caps font-mono px-2 py-0.5 rounded bg-accent-container text-on-accent-container">
            {onboardings.length} Active Hires
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {onboardings.map((hire) => (
            <div
              key={hire.id}
              className="p-4 rounded-md bg-surface-container-low border border-outline-variant flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-tertiary bg-tertiary-container/30 px-2 py-0.5 rounded">
                  {hire.department || 'General'}
                </span>
                <span className="text-[10px] font-mono uppercase text-accent">
                  {hire.status.replace('_', ' ')}
                </span>
              </div>
              <h3 className="text-body-md font-sans font-semibold text-on-surface">
                {hire.employee_name}
              </h3>
              <div className="mt-3 pt-2 border-t border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant">
                <span>Verification</span>
                <button type="button" className="text-accent font-semibold hover:underline">
                  View Tasks
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (role === 'it_admin' && widgets.open_maintenance_tickets) {
    const tickets = widgets.open_maintenance_tickets as MaintenanceTicketItem[]
    return (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm">
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
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-error/10 text-error font-bold">
                      {tkt.priority}
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">
                    Issue: {tkt.issue_description}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="px-3 py-1.5 text-xs font-mono font-medium rounded bg-accent text-on-accent hover:bg-accent/90 transition-colors self-end sm:self-center"
              >
                Dispatch Repair
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}
