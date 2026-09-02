import React from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { UserRole } from '@/types/dashboard'
import { Button } from '@/components/common/CommonUI'

interface DashboardHeaderProps {
  role: UserRole
  userName?: string
  onRefresh?: () => void
  onPrimaryAction?: () => void
  isRefreshing?: boolean
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  role,
  onRefresh,
  onPrimaryAction,
  isRefreshing = false,
}) => {
  // `hasDestination` tracks whether this role's action currently routes
  // somewhere real. Requests (§5.11), Approvals (§5.12), Maintenance Tickets
  // (§5.10), and Audit Log (§5.17) pages aren't built yet in this codebase —
  // their buttons stay visible (so the layout doesn't shift once those pages
  // ship) but disabled, rather than silently doing nothing on click.
  const getRoleDetails = (role: UserRole) => {
    switch (role) {
      case 'manager':
        return {
          title: 'Department Manager Overview',
          subtitle: 'Review team approvals, department asset allocations, and pending requests.',
          actionLabel: 'Review Approvals',
          hasDestination: false,
        }
      case 'hr_admin':
        return {
          title: 'HR Administration Hub',
          subtitle: 'Track active onboardings, employee offboarding clearances, and document watchlists.',
          actionLabel: 'Start Onboarding',
          hasDestination: true,
        }
      case 'it_admin':
        return {
          title: 'IT Asset & Infrastructure Depot',
          subtitle: 'Monitor maintenance tickets, expiring hardware warranties, and available stock.',
          actionLabel: 'Log Maintenance Ticket',
          hasDestination: false,
        }
      case 'super_admin':
        return {
          title: 'System Oversight & Governance',
          subtitle: 'Global audit ledger, system health metrics, and infrastructure security.',
          actionLabel: 'System Diagnostics',
          hasDestination: false,
        }
      case 'auditor':
        return {
          title: 'Compliance & Audit Console',
          subtitle: 'Read-only verification feed, policy compliance scores, and immutable records.',
          actionLabel: 'Export Audit Log',
          hasDestination: false,
        }
      case 'employee':
      default:
        return {
          title: 'Employee Workspace',
          subtitle: 'Your active hardware assignments, request status, and action items at a glance.',
          actionLabel: 'New Asset Request',
          hasDestination: false,
        }
    }
  }

  const details = getRoleDetails(role)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
      <div>
        <h1 className="text-headline-lg font-sans text-on-surface tracking-tight font-semibold">
          {details.title}
        </h1>
        <p className="text-body-sm text-on-surface-variant max-w-2xl mt-1 leading-relaxed">
          {details.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        {onRefresh && (
          <Button
            variant="secondary"
            size="md"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh Summary"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}

        <Button
          variant="primary"
          size="md"
          onClick={onPrimaryAction}
          disabled={!details.hasDestination}
          icon={<Plus className="w-4 h-4" />}
          title={details.hasDestination ? undefined : `${details.actionLabel} isn't built yet — coming in a future page`}
        >
          {details.actionLabel}
        </Button>
      </div>
    </div>
  )
}
