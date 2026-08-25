import React from 'react'
import { OnboardingChecklist } from '@/types/onboarding'
import { CheckCircle2, Clock, ShieldAlert, Award, Layers } from 'lucide-react'

interface OnboardingProgressGaugeProps {
  checklist: OnboardingChecklist
}

export const OnboardingProgressGauge: React.FC<OnboardingProgressGaugeProps> = ({ checklist }) => {
  const percentage = checklist.progress_percentage || 0
  const isCompleted = checklist.status === 'completed'

  // Calculate breakdown per owner role
  const roles = [
    { key: 'hr_admin', label: 'HR Tasks', color: 'bg-rose-500', bgLight: 'bg-rose-50', text: 'text-rose-700' },
    { key: 'it_admin', label: 'IT Hardware & Access', color: 'bg-indigo-600', bgLight: 'bg-indigo-50', text: 'text-indigo-700' },
    { key: 'facilities', label: 'Facilities Access', color: 'bg-amber-500', bgLight: 'bg-amber-50', text: 'text-amber-700' },
    { key: 'manager', label: 'Manager Orientation', color: 'bg-emerald-600', bgLight: 'bg-emerald-50', text: 'text-emerald-700' },
  ]

  const roleStats = roles.map((r) => {
    const roleItems = checklist.items.filter((i) => i.owner_role_name === r.key)
    const doneItems = roleItems.filter((i) => i.status === 'done')
    return {
      ...r,
      total: roleItems.length,
      done: doneItems.length,
      pct: roleItems.length > 0 ? Math.round((doneItems.length / roleItems.length) * 100) : 100,
    }
  })

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm space-y-5">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/30 pb-4">
        <div className="flex items-center gap-3">
          {checklist.avatar_url ? (
            <img
              src={checklist.avatar_url}
              alt={checklist.employee_name}
              className="w-12 h-12 rounded-full object-cover border-2 border-accent/20"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
              {checklist.employee_name?.charAt(0) || 'E'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-sans font-bold text-lg text-on-surface leading-tight">
                {checklist.employee_name || 'New Employee'}
              </h3>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  isCompleted
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-accent-container/50 text-on-accent-container border-accent/30'
                }`}
              >
                {isCompleted ? 'FULLY ONBOARDED' : 'ONBOARDING IN-PROGRESS'}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant font-body mt-0.5">
              {checklist.employee_designation || 'Team Member'} • {checklist.department_name || 'General Operations'} • Joining Date: {checklist.joining_date || 'TBD'}
            </p>
          </div>
        </div>

        {/* Big Percentage Widget */}
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
                className={isCompleted ? 'text-emerald-600 transition-all duration-700' : 'text-accent transition-all duration-700'}
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
            <span className="text-[11px] text-on-surface-variant font-body">
              {isCompleted ? 'All clearance tasks verified' : `${checklist.total_items - checklist.completed_items} pending tasks remaining`}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Linear Progress Bar */}
      <div>
        <div className="flex justify-between items-center text-xs font-mono mb-1.5 text-on-surface-variant">
          <span className="flex items-center gap-1.5 font-medium">
            <Layers className="w-3.5 h-3.5 text-accent" /> Cumulative Onboarding Progress
          </span>
          <span className="font-bold text-on-surface">{percentage}% Complete</span>
        </div>
        <div className="h-3 w-full bg-surface-container-high rounded-full overflow-hidden flex p-0.5 border border-outline-variant/20">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-accent to-indigo-600'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Department Owners Sub-Gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
        {roleStats.map((stat) => (
          <div
            key={stat.key}
            className={`p-3 rounded-lg border border-outline-variant/40 ${stat.bgLight} transition-colors`}
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className={`font-mono font-semibold text-[11px] uppercase ${stat.text}`}>
                {stat.label}
              </span>
              <span className="font-mono text-xs font-bold text-on-surface">
                {stat.done}/{stat.total}
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/70 rounded-full overflow-hidden">
              <div
                className={`h-full ${stat.color} rounded-full transition-all duration-500`}
                style={{ width: `${stat.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
