import React from 'react'
import { OnboardingChecklist, ChecklistItemStatus } from '@/types/onboarding'
import { UserRole } from '@/types/dashboard'
import {
  X,
  UserCheck,
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  Lock,
} from 'lucide-react'

interface OnboardingDetailDrawerProps {
  checklist: OnboardingChecklist | null
  isOpen: boolean
  onClose: () => void
  currentRole: UserRole
  onUpdateStatus: (itemId: string, newStatus: ChecklistItemStatus) => void
}

export const OnboardingDetailDrawer: React.FC<OnboardingDetailDrawerProps> = ({
  checklist,
  isOpen,
  onClose,
  currentRole,
  onUpdateStatus,
}) => {
  if (!isOpen || !checklist) return null

  const isCompleted = checklist.status === 'completed'

  const canModifyTask = (taskRoleName?: string): boolean => {
    if (currentRole === 'super_admin') return true
    if (!taskRoleName) return true
    if (currentRole === taskRoleName) return true
    if (currentRole === 'hr_admin' && (taskRoleName === 'hr_admin' || taskRoleName === 'facilities')) return true
    return false
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 select-none">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-lg bg-surface-container-lowest border-l border-outline-variant/60 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-outline-variant/40 bg-surface-container-low/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {checklist.avatar_url ? (
                <img
                  src={checklist.avatar_url}
                  alt={checklist.employee_name}
                  className="w-10 h-10 rounded-full object-cover border border-accent/20"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                  {checklist.employee_name?.charAt(0) || 'E'}
                </div>
              )}
              <div>
                <h3 className="font-sans font-bold text-base text-on-surface leading-tight">
                  {checklist.employee_name}
                </h3>
                <p className="text-xs text-on-surface-variant font-body">
                  {checklist.employee_designation} • {checklist.department_name}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Status & Progress Summary Card */}
            <div className="p-4 rounded-xl border border-outline-variant/50 bg-surface-container-low/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold uppercase text-on-surface-variant">
                  Workflow Status
                </span>
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                    isCompleted
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-accent-container/50 text-on-accent-container border-accent/30'
                  }`}
                >
                  {isCompleted ? 'COMPLETED' : 'IN PROGRESS'}
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span>Progress Gauge</span>
                  <span className="font-bold">{checklist.progress_percentage}%</span>
                </div>
                <div className="h-2.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isCompleted ? 'bg-emerald-500' : 'bg-accent'
                    }`}
                    style={{ width: `${checklist.progress_percentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-body pt-1">
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                  <span>Joining: {checklist.joining_date || 'TBD'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <Building className="w-3.5 h-3.5 text-accent" />
                  <span>Dept: {checklist.department_name}</span>
                </div>
              </div>
            </div>

            {/* Checklist Items Breakdown */}
            <div className="space-y-3">
              <h4 className="font-mono text-xs font-bold uppercase text-on-surface tracking-wider">
                Checklist Audit Timeline ({checklist.completed_items}/{checklist.total_items} Complete)
              </h4>

              <div className="space-y-2.5">
                {checklist.items.map((item, index) => {
                  const isDone = item.status === 'done'
                  const isAuth = canModifyTask(item.owner_role_name)

                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-outline-variant/60 bg-surface-container-lowest space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface font-mono text-[10px] font-bold flex items-center justify-center">
                            {index + 1}
                          </span>
                          <span className="font-body text-xs font-semibold text-on-surface">
                            {item.task_name}
                          </span>
                        </div>

                        {!isAuth && (
                          <div title="Role restriction" className="text-outline">
                            <Lock className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-outline-variant/20">
                        <span className="uppercase text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {item.owner_role_name || 'hr_admin'}
                        </span>

                        {isAuth ? (
                          <button
                            onClick={() =>
                              onUpdateStatus(
                                item.id,
                                item.status === 'done' ? 'in_progress' : 'done'
                              )
                            }
                            className="text-accent hover:underline font-semibold cursor-pointer"
                          >
                            {isDone ? 'Mark Pending' : 'Mark Done'}
                          </button>
                        ) : (
                          <span className="text-outline text-[10px]">View Only</span>
                        )}
                      </div>

                      {isDone && item.completed_by_name && (
                        <div className="text-[10px] font-mono text-emerald-700 bg-emerald-50/60 p-1.5 rounded flex items-center justify-between">
                          <span>Verified: {item.completed_by_name}</span>
                          {item.completed_at && (
                            <span>{new Date(item.completed_at).toLocaleTimeString()}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-outline-variant/40 bg-surface-container-low/40 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-secondary text-on-secondary text-xs font-medium cursor-pointer"
            >
              Close Drawer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
