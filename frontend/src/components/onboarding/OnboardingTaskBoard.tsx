import React from 'react'
import { ChecklistItem, ChecklistItemStatus } from '@/types/onboarding'
import { UserRole } from '@/types/dashboard'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Lock,
  UserCheck,
  Laptop,
  KeyRound,
  Users,
  ChevronRight,
} from 'lucide-react'

interface OnboardingTaskBoardProps {
  items: ChecklistItem[]
  currentRole: UserRole
  onUpdateStatus: (itemId: string, newStatus: ChecklistItemStatus) => void
  onSelectItem?: (item: ChecklistItem) => void
  isUpdating?: boolean
}

export const OnboardingTaskBoard: React.FC<OnboardingTaskBoardProps> = ({
  items,
  currentRole,
  onUpdateStatus,
  onSelectItem,
  isUpdating = false,
}) => {
  const columns = [
    {
      roleKey: 'hr_admin',
      title: 'HR & Legal Compliance',
      subtitle: 'Contracts, NDA & Payroll',
      icon: UserCheck,
      headerBg: 'bg-rose-50 text-rose-900 border-rose-200',
      badgeBg: 'bg-rose-100 text-rose-800',
      accentColor: 'border-l-rose-500',
    },
    {
      roleKey: 'it_admin',
      title: 'IT & Access Provisioning',
      subtitle: 'Hardware, Accounts & Credentials',
      icon: Laptop,
      headerBg: 'bg-indigo-50 text-indigo-900 border-indigo-200',
      badgeBg: 'bg-indigo-100 text-indigo-800',
      accentColor: 'border-l-indigo-500',
    },
    {
      roleKey: 'facilities',
      title: 'Facilities & Workplace',
      subtitle: 'Keycard, ID Badge & Desk Pass',
      icon: KeyRound,
      headerBg: 'bg-amber-50 text-amber-900 border-amber-200',
      badgeBg: 'bg-amber-100 text-amber-800',
      accentColor: 'border-l-amber-500',
    },
    {
      roleKey: 'manager',
      title: 'Manager & Team Sync',
      subtitle: '1:1 Intro, Mentorship & Goals',
      icon: Users,
      headerBg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      badgeBg: 'bg-emerald-100 text-emerald-800',
      accentColor: 'border-l-emerald-500',
    },
  ]

  // Role authorization check for a specific task item
  const canModifyTask = (taskRoleName?: string): boolean => {
    if (currentRole === 'super_admin') return true
    if (!taskRoleName) return true
    if (currentRole === taskRoleName) return true
    if (currentRole === 'hr_admin' && (taskRoleName === 'hr_admin' || taskRoleName === 'facilities')) return true
    return false
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 select-none">
      {columns.map((col) => {
        const Icon = col.icon
        const colItems = items.filter(
          (item) => item.owner_role_name === col.roleKey || (!item.owner_role_name && col.roleKey === 'hr_admin')
        )
        const completedCount = colItems.filter((i) => i.status === 'done').length

        return (
          <div
            key={col.roleKey}
            className="flex flex-col bg-surface-container-low/50 border border-outline-variant/50 rounded-xl overflow-hidden shadow-xs"
          >
            {/* Column Header */}
            <div className={`p-3.5 border-b flex items-center justify-between ${col.headerBg}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-white/80 backdrop-blur-xs flex items-center justify-center shadow-xs">
                  <Icon className="w-4 h-4 text-on-surface" />
                </div>
                <div>
                  <h4 className="font-sans font-bold text-sm leading-tight text-on-surface">
                    {col.title}
                  </h4>
                  <p className="text-[11px] font-body opacity-80">{col.subtitle}</p>
                </div>
              </div>
              <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full ${col.badgeBg}`}>
                {completedCount}/{colItems.length}
              </span>
            </div>

            {/* Task List */}
            <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[520px]">
              {colItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-on-surface-variant font-body border border-dashed border-outline-variant/40 rounded-lg">
                  No tasks assigned in this column
                </div>
              ) : (
                colItems.map((item) => {
                  const isAuthorized = canModifyTask(item.owner_role_name)
                  const isDone = item.status === 'done'
                  const isInProgress = item.status === 'in_progress'

                  return (
                    <div
                      key={item.id}
                      className={`group bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-3 shadow-2xs hover:shadow-xs transition-all border-l-4 ${
                        col.accentColor
                      } ${isDone ? 'opacity-75 bg-slate-50/70' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-body text-xs font-semibold text-on-surface leading-snug flex-1">
                          {item.task_name}
                        </span>

                        {/* Lock icon if role unauthorized */}
                        {!isAuthorized && (
                          <div
                            title={`Role restriction: Only ${col.title} members can modify this task`}
                            className="text-outline/60 hover:text-outline flex-shrink-0"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>

                      {/* Status & Action Controls */}
                      <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20 mt-2">
                        {/* Status Chip */}
                        <div className="flex items-center gap-1.5">
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Done
                            </span>
                          ) : isInProgress ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              <Clock className="w-3 h-3 text-blue-600 animate-spin-slow" /> In Progress
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              <AlertCircle className="w-3 h-3 text-slate-400" /> Pending
                            </span>
                          )}
                        </div>

                        {/* Interactive Status Cycle Toggle (if authorized) */}
                        {isAuthorized ? (
                          <div className="flex items-center gap-1">
                            {item.status !== 'done' ? (
                              <button
                                disabled={isUpdating}
                                onClick={() =>
                                  onUpdateStatus(
                                    item.id,
                                    item.status === 'pending' ? 'in_progress' : 'done'
                                  )
                                }
                                className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-accent text-on-accent hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {item.status === 'pending' ? 'Start Task' : 'Mark Done'}
                              </button>
                            ) : (
                              <button
                                disabled={isUpdating}
                                onClick={() => onUpdateStatus(item.id, 'in_progress')}
                                className="text-[10px] font-mono text-on-surface-variant hover:text-on-surface underline cursor-pointer"
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-outline italic">
                            Gated ({item.owner_role_name || col.roleKey})
                          </span>
                        )}
                      </div>

                      {/* Completed By Footer */}
                      {isDone && item.completed_by_name && (
                        <div className="mt-2 text-[10px] font-mono text-on-surface-variant/80 border-t border-dashed border-outline-variant/30 pt-1 flex items-center justify-between">
                          <span>By: {item.completed_by_name}</span>
                          {item.completed_at && (
                            <span>{new Date(item.completed_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
