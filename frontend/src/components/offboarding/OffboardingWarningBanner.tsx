import React from 'react'
import { AlertTriangle, ShieldAlert, Laptop, Lock, UserCheck } from 'lucide-react'
import { OffboardingChecklist } from '@/types/offboarding'

interface OffboardingWarningBannerProps {
  checklist: OffboardingChecklist
}

export const OffboardingWarningBanner: React.FC<OffboardingWarningBannerProps> = ({ checklist }) => {
  const isCompleted = checklist.status === 'completed'
  const pendingItems = checklist.items.filter((i) => i.status !== 'done')
  const pendingAssets = pendingItems.filter(
    (i) => i.asset_assignment_id || i.task_name.toLowerCase().includes('asset') || i.task_name.toLowerCase().includes('laptop')
  ).length
  const pendingAccess = pendingItems.filter(
    (i) => i.task_name.toLowerCase().includes('access') || i.task_name.toLowerCase().includes('sso') || i.task_name.toLowerCase().includes('credential')
  ).length
  const pendingHR = pendingItems.filter(
    (i) => i.owner_role_name === 'hr_admin' && !i.asset_assignment_id
  ).length

  if (isCompleted) {
    return (
      <div className="rounded-xl border border-success/30 bg-success-container p-4 text-on-success-container flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-success text-on-success flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase font-bold tracking-wider text-on-success-container">
                Offboarding Finalized
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-success/20 text-on-success-container font-semibold">
                Account Terminated
              </span>
            </div>
            <p className="text-xs font-body text-on-success-container mt-0.5">
              All company assets returned, access credentials revoked, and active sessions terminated.
            </p>
          </div>
        </div>
        {checklist.completed_at && (
          <div className="font-mono text-[11px] text-on-success-container bg-success/20 px-3 py-1.5 rounded-md self-start md:self-auto border border-success/30">
            Completed: {new Date(checklist.completed_at).toLocaleDateString()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning-container p-4 text-on-warning-container flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs">
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-warning text-on-warning flex items-center justify-center flex-shrink-0 shadow-sm">
          <AlertTriangle className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs uppercase font-bold tracking-wider text-on-warning-container">
              Active Offboarding In-Flight
            </span>
            <span className="w-2 h-2 rounded-full bg-warning animate-ping" />
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-warning/20 text-on-warning-container font-semibold">
              Exit: {checklist.exit_date || 'Scheduled'}
            </span>
            {checklist.reason && (
              <span className="text-[11px] font-body text-on-warning-container italic">
                "{checklist.reason}"
              </span>
            )}
          </div>
          <p className="text-xs font-body text-on-warning-container mt-1">
            Reclamation and deprovisioning sequence is underway. Full account termination will occur once all tasks are completed.
          </p>
        </div>
      </div>

      {/* Quick Status Chips */}
      <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/70 border border-warning/30 text-[11px] font-mono text-on-warning-container shadow-2xs">
          <Laptop className="w-3.5 h-3.5 text-accent" />
          <span>{pendingAssets} Assets Pending</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/70 border border-warning/30 text-[11px] font-mono text-on-warning-container shadow-2xs">
          <Lock className="w-3.5 h-3.5 text-error" />
          <span>{pendingAccess} Access Tasks</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/70 border border-warning/30 text-[11px] font-mono text-on-warning-container shadow-2xs">
          <ShieldAlert className="w-3.5 h-3.5 text-warning" />
          <span>{pendingHR} HR Clearances</span>
        </div>
      </div>
    </div>
  )
}
