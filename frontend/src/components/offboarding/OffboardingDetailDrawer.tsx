import React from 'react'
import { OffboardingChecklist } from '@/types/offboarding'
import {
  X,
  UserMinus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Tag,
  ShieldCheck,
  Calendar,
  FileText,
  Lock,
} from 'lucide-react'

interface OffboardingDetailDrawerProps {
  isOpen: boolean
  checklist: OffboardingChecklist | null
  onClose: () => void
}

export const OffboardingDetailDrawer: React.FC<OffboardingDetailDrawerProps> = ({
  isOpen,
  checklist,
  onClose,
}) => {
  if (!isOpen || !checklist) return null

  const isCompleted = checklist.status === 'completed'
  const sortedItems = [...checklist.items].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-surface-container-lowest border-l border-outline-variant/60 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-outline-variant/40 bg-surface-container-low/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
                <UserMinus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-sans font-bold text-base text-on-surface leading-tight">
                  Offboarding Audit Trail
                </h3>
                <p className="text-xs text-on-surface-variant font-body">
                  Task verification records & asset return log
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="p-5 space-y-5 overflow-y-auto flex-1">
            {/* Employee Profile Metadata */}
            <div className="p-4 rounded-xl bg-surface-container-low/60 border border-outline-variant/50 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-sans font-bold text-sm text-on-surface">
                    {checklist.employee_name || 'Departing Employee'}
                  </h4>
                  <p className="text-xs text-on-surface-variant font-body">
                    {checklist.employee_designation} • {checklist.department_name}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded-full font-semibold border ${
                    isCompleted
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}
                >
                  {isCompleted ? 'COMPLETED' : 'IN-PROGRESS'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-outline-variant/30 text-on-surface-variant">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-on-surface-variant" />
                  <span>Exit: {checklist.exit_date || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                  <span>Progress: {checklist.progress_percentage}%</span>
                </div>
              </div>

              {checklist.reason && (
                <div className="pt-2 border-t border-outline-variant/30 flex items-start gap-1.5 text-xs text-on-surface-variant">
                  <FileText className="w-3.5 h-3.5 mt-0.5 text-on-surface-variant flex-shrink-0" />
                  <span className="font-body italic">Reason: {checklist.reason}</span>
                </div>
              )}
            </div>

            {/* Checklist Timeline Audit Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-mono text-xs uppercase font-bold text-on-surface tracking-wider">
                  Checklist Tasks & Sign-offs
                </h4>
                <span className="text-xs font-mono text-on-surface-variant">
                  {checklist.completed_items} of {checklist.total_items} done
                </span>
              </div>

              <div className="space-y-2.5">
                {sortedItems.map((item, idx) => {
                  const isDone = item.status === 'done'
                  const isInProgress = item.status === 'in_progress'

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                        isDone
                          ? 'bg-emerald-50/30 border-emerald-300/60'
                          : isInProgress
                          ? 'bg-amber-50/30 border-amber-300/60'
                          : 'bg-surface-container-low/30 border-outline-variant/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <span className="w-5 h-5 rounded-full bg-surface-container flex items-center justify-center font-mono text-[10px] font-bold text-on-surface flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-medium text-on-surface leading-tight block">
                              {item.task_name}
                            </span>
                            {item.asset_assignment_id && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 mt-1">
                                <Tag className="w-3 h-3" /> Hardware Return Link
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Icon */}
                        <div className="flex-shrink-0">
                          {isDone ? (
                            <span className="text-emerald-600 inline-flex items-center gap-1 font-mono font-semibold text-[11px]">
                              <CheckCircle2 className="w-4 h-4" /> Done
                            </span>
                          ) : isInProgress ? (
                            <span className="text-amber-600 inline-flex items-center gap-1 font-mono font-semibold text-[11px]">
                              <Clock className="w-4 h-4" /> Working
                            </span>
                          ) : (
                            <span className="text-on-surface-variant inline-flex items-center gap-1 font-mono text-[11px]">
                              <AlertCircle className="w-4 h-4" /> Pending
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Audit Details */}
                      <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                        <span>Role: {item.owner_role_name || 'Administrator'}</span>
                        {isDone && item.completed_at ? (
                          <span className="text-emerald-800">
                            Cleared {new Date(item.completed_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="italic">Awaiting Action</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Zero-Trust Notice */}
            <div className="p-3.5 rounded-lg bg-surface-container border border-outline-variant/50 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-on-surface">
                <Lock className="w-3.5 h-3.5 text-accent" />
                <span>Zero-Trust Governance</span>
              </div>
              <p className="text-[11px] font-body text-on-surface-variant">
                Every completed reclamation item synchronously cascades to live inventory status. Final offboarding completion permanently revokes active access tokens and device sessions.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-outline-variant/40 bg-surface-container-low/40 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-mono font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              Close Drawer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
