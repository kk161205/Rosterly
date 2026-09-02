import React from 'react'
import { OffboardingChecklist } from '@/types/offboarding'
import { Laptop, Lock, ShieldCheck } from 'lucide-react'

interface OffboardingProgressGaugeProps {
  checklist: OffboardingChecklist
}

export const OffboardingProgressGauge: React.FC<OffboardingProgressGaugeProps> = ({ checklist }) => {
  const percentage = checklist.progress_percentage || 0
  const isCompleted = checklist.status === 'completed'

  // Categorize checklist items
  const assetItems = checklist.items.filter(
    (i) => i.asset_assignment_id || i.task_name.toLowerCase().includes('asset') || i.task_name.toLowerCase().includes('laptop') || i.task_name.toLowerCase().includes('retrieve')
  )
  const accessItems = checklist.items.filter(
    (i) => i.task_name.toLowerCase().includes('access') || i.task_name.toLowerCase().includes('sso') || i.task_name.toLowerCase().includes('credential') || i.task_name.toLowerCase().includes('revoke')
  )
  const hrItems = checklist.items.filter(
    (i) => !assetItems.some((a) => a.id === i.id) && !accessItems.some((a) => a.id === i.id)
  )

  const categories = [
    {
      key: 'assets',
      label: 'Asset Reclamation',
      icon: Laptop,
      items: assetItems,
      color: 'bg-accent',
      text: 'text-accent',
      bgLight: 'bg-accent-container',
    },
    {
      key: 'access',
      label: 'Access Revocation',
      icon: Lock,
      items: accessItems,
      color: 'bg-error',
      text: 'text-error',
      bgLight: 'bg-error-container',
    },
    {
      key: 'hr',
      label: 'Exit Clearance',
      icon: ShieldCheck,
      items: hrItems,
      color: 'bg-warning',
      text: 'text-warning',
      bgLight: 'bg-warning-container',
    },
  ]

  const categoryStats = categories.map((cat) => {
    const done = cat.items.filter((i) => i.status === 'done').length
    const total = cat.items.length
    const pct = total > 0 ? Math.round((done / total) * 100) : 100
    return {
      ...cat,
      done,
      total,
      pct,
    }
  })

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-2xs space-y-5">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/30 pb-4">
        <div className="flex items-center gap-3">
          {checklist.avatar_url ? (
            <img
              src={checklist.avatar_url}
              alt={checklist.employee_name || ''}
              className="w-12 h-12 rounded-full object-cover border-2 border-outline-variant/60"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg border border-primary/20">
              {checklist.employee_name?.charAt(0) || 'E'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-sans font-bold text-lg text-on-surface leading-tight">
                {checklist.employee_name || 'Departing Employee'}
              </h3>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  isCompleted
                    ? 'bg-success-container text-on-success-container border-success/30'
                    : 'bg-warning-container text-on-warning-container border-warning/30'
                }`}
              >
                {isCompleted ? 'OFFBOARDING COMPLETED' : 'OFFBOARDING IN-PROGRESS'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant font-body mt-0.5">
              {checklist.employee_designation || 'Staff Member'} • {checklist.department_name || 'Operations'} • Exit Date: {checklist.exit_date || 'Scheduled'}
            </p>
          </div>
        </div>

        {/* Circular Metric Widget */}
        <div className="flex items-center gap-4 bg-surface-container-low/70 px-4 py-2.5 rounded-lg border border-outline-variant/40 self-start sm:self-auto">
          <div className="relative flex items-center justify-center">
            <svg className="w-14 h-14 transform -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="22"
                stroke="currentColor"
                strokeWidth="4"
                className="text-surface-container-high"
                fill="transparent"
              />
              <circle
                cx="28"
                cy="28"
                r="22"
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={138.2}
                strokeDashoffset={138.2 - (138.2 * percentage) / 100}
                className={isCompleted ? 'text-success transition-all duration-700' : 'text-warning transition-all duration-700'}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <span className="absolute font-mono text-xs font-bold text-on-surface">
              {percentage}%
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-mono font-semibold text-on-surface">
              {checklist.completed_items} of {checklist.total_items} Tasks
            </span>
            <span className="text-[11px] font-body text-on-surface-variant">
              {isCompleted ? 'All offboarding tasks cleared' : `${checklist.total_items - checklist.completed_items} tasks pending completion`}
            </span>
          </div>
        </div>
      </div>

      {/* Category Progress Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {categoryStats.map((cat) => {
          const Icon = cat.icon
          return (
            <div
              key={cat.key}
              className="p-3.5 rounded-lg border border-outline-variant/40 bg-surface-container-low/40 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-md ${cat.bgLight} ${cat.text} flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-sans font-semibold text-on-surface">
                    {cat.label}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-on-surface">
                  {cat.done}/{cat.total}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full ${cat.color} transition-all duration-500`}
                  style={{ width: `${cat.pct}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                <span>{cat.pct}% cleared</span>
                <span>{cat.total - cat.done} pending</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
