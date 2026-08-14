import React from 'react'
import { Plus, Shield, Sparkles, RefreshCw } from 'lucide-react'
import { UserRole } from '@/types/dashboard'

interface DashboardHeaderProps {
  role: UserRole
  userName?: string
  onRefresh?: () => void
  onPrimaryAction?: () => void
  isRefreshing?: boolean
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  role,
  userName = 'Kushagra',
  onRefresh,
  onPrimaryAction,
  isRefreshing = false,
}) => {
  const getRoleDetails = (role: UserRole) => {
    switch (role) {
      case 'manager':
        return {
          title: 'Department Manager Overview',
          subtitle: 'Review team approvals, department asset allocations, and pending requests.',
          actionLabel: 'Review Approvals',
        }
      case 'hr_admin':
        return {
          title: 'HR Administration Hub',
          subtitle: 'Track active onboardings, employee offboarding clearings, and document watchlists.',
          actionLabel: 'Start Onboarding',
        }
      case 'it_admin':
        return {
          title: 'IT Asset & Infrastructure Depot',
          subtitle: 'Monitor maintenance tickets, expiring hardware warranties, and available stock.',
          actionLabel: 'Log Maintenance Ticket',
        }
      case 'super_admin':
        return {
          title: 'System Oversight & Governance',
          subtitle: 'Global audit ledger, system health metrics, and infrastructure security.',
          actionLabel: 'System Diagnostics',
        }
      case 'auditor':
        return {
          title: 'Compliance & Audit Console',
          subtitle: 'Read-only verification feed, policy compliance scores, and immutable records.',
          actionLabel: 'Export Audit Log',
        }
      case 'employee':
      default:
        return {
          title: 'My Employee Workspace',
          subtitle: 'Your active hardware assignments, request status, and action items at a glance.',
          actionLabel: 'New Asset Request',
        }
    }
  }

  const details = getRoleDetails(role)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-label-caps font-mono bg-accent-container text-on-accent-container border border-accent/20">
            <Shield className="w-3 h-3 text-accent" />
            {role.replace('_', ' ').toUpperCase()} VIEW
          </span>
          <span className="text-body-sm text-on-surface-variant font-mono">
            • Last synced just now
          </span>
        </div>
        <h1 className="text-headline-lg font-sans text-on-surface tracking-tight">
          Welcome back, {userName}
        </h1>
        <p className="text-body-md text-on-surface-variant max-w-2xl mt-0.5">
          {details.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-sm border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors disabled:opacity-50"
            title="Refresh Summary"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}

        <button
          onClick={onPrimaryAction}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-accent text-on-accent font-sans font-medium text-xs shadow-sm hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{details.actionLabel}</span>
        </button>
      </div>
    </div>
  )
}
