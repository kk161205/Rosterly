import React from 'react'
import { CheckCircle2, Clock, ShieldCheck, UserCheck, CheckSquare, Layers } from 'lucide-react'
import { LifecycleChecklist, ChecklistItem } from '@/types/profile'

interface LifecycleTabProps {
  lifecycleData: LifecycleChecklist | null
  isLoading?: boolean
}

export const LifecycleTab: React.FC<LifecycleTabProps> = ({
  lifecycleData,
  isLoading = false,
}) => {
  if (!lifecycleData) {
    return (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-12 flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-surface-container-high/60 flex items-center justify-center text-outline">
          <CheckSquare className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-headline font-semibold text-on-surface">
          No Active Onboarding or Offboarding Workflow
        </h3>
        <p className="text-xs font-body text-on-surface-variant max-w-sm">
          This employee has completed all onboarding requirements and has no active offboarding checklist pending.
        </p>
      </div>
    )
  }

  const { type, progress_percentage, completed_items, total_items, items } = lifecycleData

  const getCategoryBadge = (category: ChecklistItem['category']) => {
    switch (category) {
      case 'hr':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-accent-container text-on-accent-container font-medium">
            HR Ops
          </span>
        )
      case 'it':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-tertiary-fixed text-on-tertiary-fixed-variant font-medium">
            IT Provisioning
          </span>
        )
      case 'facilities':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary-container text-on-secondary-container font-medium">
            Facilities
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Progress Gauge Card */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center md:text-left">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium uppercase tracking-wider bg-surface-container text-accent inline-block">
              {type === 'onboarding' ? 'Onboarding Checklist' : 'Offboarding Reclamation'}
            </span>
            <h2 className="text-lg font-headline font-bold text-on-surface">
              {type === 'onboarding'
                ? 'Employee Onboarding & Setup Workflow'
                : 'Employee Offboarding & Asset Reclamation'}
            </h2>
            <p className="text-xs font-body text-on-surface-variant">
              {completed_items} of {total_items} task items completed across HR, IT, and Facilities.
            </p>
          </div>

          {/* Visual Circular Gauge & Percentage Bar */}
          <div className="flex items-center gap-4 bg-surface-container-low p-4 rounded-lg border border-outline-variant/60">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="currentColor"
                  strokeWidth="5"
                  className="text-surface-container-high"
                  fill="transparent"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="currentColor"
                  strokeWidth="5"
                  dasharray={163}
                  strokeDashoffset={163 - (163 * progress_percentage) / 100}
                  className="text-accent transition-all duration-500"
                  fill="transparent"
                />
              </svg>
              <span className="absolute font-mono font-bold text-xs text-on-surface">
                {progress_percentage}%
              </span>
            </div>
            <div className="text-xs font-body">
              <span className="font-semibold text-on-surface block">Completion Rate</span>
              <span className="text-outline text-[11px]">
                {progress_percentage === 100 ? 'All Tasks Verified' : 'Tasks Pending Verification'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Task Checklist Items Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex items-center justify-between">
          <h3 className="text-sm font-headline font-semibold text-on-surface flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent" />
            Checklist Task Breakdown
          </h3>
          <span className="text-[11px] font-mono text-outline">Lifecycle SLA Tracking</span>
        </div>

        <div className="divide-y divide-outline-variant/60">
          {items.map((item) => (
            <div
              key={item.id}
              className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container-low/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {item.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-tertiary flex-shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="text-xs font-semibold text-on-surface">{item.title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    {getCategoryBadge(item.category)}
                    <span className="text-[11px] text-outline font-mono">
                      Owner: {item.owner_role}
                    </span>
                  </div>
                </div>
              </div>

              <div className="sm:text-right flex items-center sm:flex-col justify-between gap-1 text-[11px] font-mono">
                {item.status === 'completed' ? (
                  <span className="text-tertiary font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completed {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : ''}
                  </span>
                ) : (
                  <span className="text-amber-700 font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Pending {item.due_date ? `(Due ${new Date(item.due_date).toLocaleDateString()})` : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
