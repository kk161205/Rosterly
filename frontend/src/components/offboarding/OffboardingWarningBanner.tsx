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
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-950 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase font-bold tracking-wider text-emerald-800">
                Offboarding Finalized
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-200/70 text-emerald-900 font-semibold">
                Account Terminated
              </span>
            </div>
            <p className="text-xs font-body text-emerald-900 mt-0.5">
              All company assets returned, access credentials revoked, and active sessions terminated.
            </p>
          </div>
        </div>
        {checklist.completed_at && (
          <div className="font-mono text-[11px] text-emerald-800 bg-emerald-200/50 px-3 py-1.5 rounded-md self-start md:self-auto border border-emerald-300">
            Completed: {new Date(checklist.completed_at).toLocaleDateString()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-950 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs">
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
          <AlertTriangle className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs uppercase font-bold tracking-wider text-amber-900">
              Active Offboarding In-Flight
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-950 font-semibold">
              Exit: {checklist.exit_date || 'Scheduled'}
            </span>
            {checklist.reason && (
              <span className="text-[11px] font-body text-amber-800 italic">
                "{checklist.reason}"
              </span>
            )}
          </div>
          <p className="text-xs font-body text-amber-900 mt-1">
            Reclamation and deprovisioning sequence is underway. Full account termination will occur once all tasks are completed.
          </p>
        </div>
      </div>

      {/* Quick Status Chips */}
      <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/70 border border-amber-300/80 text-[11px] font-mono text-amber-950 shadow-2xs">
          <Laptop className="w-3.5 h-3.5 text-indigo-700" />
          <span>{pendingAssets} Assets Pending</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/70 border border-amber-300/80 text-[11px] font-mono text-amber-950 shadow-2xs">
          <Lock className="w-3.5 h-3.5 text-rose-700" />
          <span>{pendingAccess} Access Tasks</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/70 border border-amber-300/80 text-[11px] font-mono text-amber-950 shadow-2xs">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
          <span>{pendingHR} HR Clearances</span>
        </div>
      </div>
    </div>
  )
}
