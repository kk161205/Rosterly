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
} from 'lucide-react'

// "Facilities" has no distinct role in RBAC (§3.1 only has 6 seed roles) — the
// backend's fixed onboarding template (onboarding_service.py) attributes
// workspace/physical-access tasks to hr_admin rather than a separate owner.
// This keyword match is how the Lifecycle tab (employee_profile_service.py)
// already distinguishes them for display; mirrored here for the same reason.
const FACILITIES_KEYWORDS = ['workspace', 'access', 'badge', 'keycard']
const isFacilitiesTask = (taskName: string) =>
  FACILITIES_KEYWORDS.some((kw) => taskName.toLowerCase().includes(kw))

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
      headerBg: 'bg-error-container text-on-error-container border-error/20',
      badgeBg: 'bg-error-container text-on-error-container',
      accentColor: 'border-l-error',
    },
    {
      roleKey: 'it_admin',
      title: 'IT & Access Provisioning',
      subtitle: 'Hardware, Accounts & Credentials',
      icon: Laptop,
      headerBg: 'bg-accent-container text-on-accent-container border-accent/20',
      badgeBg: 'bg-accent-container text-on-accent-container',
      accentColor: 'border-l-accent',
    },
    {
      roleKey: 'facilities',
      title: 'Facilities & Workplace',
      subtitle: 'Keycard, ID Badge & Desk Pass',
      icon: KeyRound,
      headerBg: 'bg-warning-container text-on-warning-container border-warning/20',
      badgeBg: 'bg-warning-container text-on-warning-container',
      accentColor: 'border-l-warning',
    },
  ]

  // Role authorization check for a specific task item — matches the backend's
  // "owner_role_id match, or hr_admin/super_admin" rule (onboarding_service.py).
  const canModifyTask = (taskRoleName?: string): boolean => {
    if (currentRole === 'super_admin') return true
    if (!taskRoleName) return true
    if (currentRole === taskRoleName) return true
    if (currentRole === 'hr_admin' && taskRoleName === 'hr_admin') return true
    return false
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 select-none">
      {columns.map((col) => {
        const Icon = col.icon
        const colItems = items.filter((item) => {
          const isHrOwned = item.owner_role_name === 'hr_admin' || !item.owner_role_name
          if (col.roleKey === 'facilities') return isHrOwned && isFacilitiesTask(item.task_name)
          if (col.roleKey === 'hr_admin') return isHrOwned && !isFacilitiesTask(item.task_name)
          return item.owner_role_name === col.roleKey
        })
        const completedCount = colItems.filter((i) => i.status === 'done').length

        return (
          <div
            key={col.roleKey}
            className="flex flex-col bg-surface-container-low/50 border border-outline-variant/50 rounded-xl overflow-hidden shadow-xs"
          >
            {/* Column Header */}
            <div className={`p-3.5 border-b flex items-center justify-between ${col.headerBg}`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-surface-container-lowest/80 backdrop-blur-xs flex items-center justify-center shadow-xs">
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
                      onClick={() => onSelectItem?.(item)}
                      className={`group bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-3 shadow-2xs hover:shadow-xs transition-all border-l-4 ${
                        col.accentColor
                      } ${isDone ? 'opacity-75 bg-surface-container-low/70' : ''} ${onSelectItem ? 'cursor-pointer' : ''}`}
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
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-on-success-container bg-success-container px-2 py-0.5 rounded border border-success/20">
                              <CheckCircle2 className="w-3 h-3 text-success" /> Done
                            </span>
                          ) : isInProgress ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-on-accent-container bg-accent-container px-2 py-0.5 rounded border border-accent/20">
                              <Clock className="w-3 h-3 text-accent animate-spin-slow" /> In Progress
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant">
                              <AlertCircle className="w-3 h-3 text-outline" /> Pending
                            </span>
                          )}
                        </div>

                        {/* Interactive Status Cycle Toggle (if authorized) */}
                        {isAuthorized ? (
                          <div className="flex items-center gap-1">
                            {item.status !== 'done' ? (
                              <button
                                disabled={isUpdating}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onUpdateStatus(item.id, item.status === 'pending' ? 'in_progress' : 'done')
                                }}
                                className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-accent text-on-accent hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {item.status === 'pending' ? 'Start Task' : 'Mark Done'}
                              </button>
                            ) : (
                              <button
                                disabled={isUpdating}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onUpdateStatus(item.id, 'in_progress')
                                }}
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
