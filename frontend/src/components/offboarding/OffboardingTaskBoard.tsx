import React from 'react'
import {
  OffboardingChecklist,
  OffboardingChecklistItem,
  ChecklistItemStatus,
} from '@/types/offboarding'
import { UserRole } from '@/types/dashboard'
import {
  Laptop,
  Lock,
  FileCheck2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Tag,
} from 'lucide-react'

interface OffboardingTaskBoardProps {
  checklist: OffboardingChecklist
  currentRole: UserRole
  onUpdateStatus: (itemId: string, status: ChecklistItemStatus) => Promise<void>
  isUpdating: boolean
}

export const OffboardingTaskBoard: React.FC<OffboardingTaskBoardProps> = ({
  checklist,
  currentRole,
  onUpdateStatus,
  isUpdating,
}) => {
  // Categorize items
  const assetItems = checklist.items.filter(
    (i) =>
      i.asset_assignment_id ||
      i.task_name.toLowerCase().includes('asset') ||
      i.task_name.toLowerCase().includes('laptop') ||
      i.task_name.toLowerCase().includes('retrieve')
  )

  const accessItems = checklist.items.filter(
    (i) =>
      (i.task_name.toLowerCase().includes('access') ||
        i.task_name.toLowerCase().includes('sso') ||
        i.task_name.toLowerCase().includes('credential') ||
        i.task_name.toLowerCase().includes('revoke')) &&
      !assetItems.some((a) => a.id === i.id)
  )

  const hrItems = checklist.items.filter(
    (i) => !assetItems.some((a) => a.id === i.id) && !accessItems.some((a) => a.id === i.id)
  )

  const columns = [
    {
      id: 'asset_recovery',
      title: 'Hardware & Asset Reclamation',
      subtitle: 'Physical equipment retrieval to stock',
      icon: Laptop,
      items: assetItems,
      roleTag: 'IT Admin',
      accentColor: 'border-t-accent',
      badgeBg: 'bg-accent-container text-on-accent-container border-accent/20',
    },
    {
      id: 'access_revocation',
      title: 'System & SSO Revocation',
      subtitle: 'Identity, IAM & credential deactivation',
      icon: Lock,
      items: accessItems,
      roleTag: 'IT Admin',
      accentColor: 'border-t-error',
      badgeBg: 'bg-error-container text-on-error-container border-error/20',
    },
    {
      id: 'exit_settlement',
      title: 'Exit & Financial Settlement',
      subtitle: 'HR clearance, interview & records',
      icon: FileCheck2,
      items: hrItems,
      roleTag: 'HR Admin',
      accentColor: 'border-t-warning',
      badgeBg: 'bg-warning-container text-on-warning-container border-warning/20',
    },
  ]

  const canEditItem = (item: OffboardingChecklistItem) => {
    if (currentRole === 'super_admin' || currentRole === 'hr_admin') return true
    if (currentRole === 'it_admin') {
      return (
        item.owner_role_name === 'it_admin' ||
        Boolean(item.asset_assignment_id) ||
        item.task_name.toLowerCase().includes('asset') ||
        item.task_name.toLowerCase().includes('access') ||
        item.task_name.toLowerCase().includes('sso')
      )
    }
    return false
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-sans font-bold text-base text-on-surface">
            Reclamation & Deprovisioning Board
          </h3>
          <p className="text-xs text-on-surface-variant font-body mt-0.5">
            Grouped action items across IT Hardware, Identity Revocation, and HR Exit Clearances
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-success" /> Done
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-warning" /> In Progress
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-outline-variant" /> Pending
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {columns.map((col) => {
          const Icon = col.icon
          const completedCount = col.items.filter((i) => i.status === 'done').length
          const totalCount = col.items.length

          return (
            <div
              key={col.id}
              className={`bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-2xs flex flex-col border-t-4 ${col.accentColor} overflow-hidden`}
            >
              {/* Column Header */}
              <div className="p-4 border-b border-outline-variant/40 bg-surface-container-low/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-surface-container-high/80 text-on-surface flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-xs text-on-surface leading-tight">
                      {col.title}
                    </h4>
                    <p className="text-[11px] font-body text-on-surface-variant">
                      {col.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-semibold ${col.badgeBg}`}>
                    {col.roleTag}
                  </span>
                  <span className="text-xs font-mono font-bold text-on-surface bg-surface-container px-2 py-0.5 rounded">
                    {completedCount}/{totalCount}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="p-3.5 space-y-3 flex-1 overflow-y-auto min-h-[300px] max-h-[550px]">
                {col.items.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-outline-variant/60 rounded-lg text-xs font-mono text-on-surface-variant bg-surface-container-low/20">
                    No tasks assigned in this category
                  </div>
                ) : (
                  col.items.map((item) => {
                    const isDone = item.status === 'done'
                    const isInProgress = item.status === 'in_progress'
                    const isAllowed = canEditItem(item)

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-lg border transition-all space-y-3 ${
                          isDone
                            ? 'bg-success-container/40 border-success/40 text-on-surface'
                            : isInProgress
                            ? 'bg-warning-container/40 border-warning/40 text-on-surface shadow-2xs'
                            : 'bg-surface-container-lowest border-outline-variant/60 hover:border-outline-variant text-on-surface'
                        }`}
                      >
                        {/* Task Title & Status Pill */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 flex-1">
                            <span
                              className={`text-xs font-medium font-sans leading-snug block ${
                                isDone ? 'line-through text-on-surface-variant/80' : 'text-on-surface'
                              }`}
                            >
                              {item.task_name}
                            </span>

                            {/* Asset Tag Notice if Asset Item */}
                            {item.asset_assignment_id && (
                              <div className="inline-flex items-center gap-1 text-[11px] font-mono text-on-accent-container bg-accent-container/80 px-2 py-0.5 rounded border border-accent/20">
                                <Tag className="w-3 h-3" />
                                <span>Hardware Return to Stock</span>
                              </div>
                            )}
                          </div>

                          {/* Status Badge */}
                          <div className="flex-shrink-0">
                            {isDone ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-success-container text-on-success-container border border-success/30">
                                <CheckCircle2 className="w-3 h-3" /> Done
                              </span>
                            ) : isInProgress ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-warning-container text-on-warning-container border border-warning/30">
                                <Clock className="w-3 h-3" /> In Progress
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/60">
                                <AlertCircle className="w-3 h-3" /> Pending
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Audit / Completion Info */}
                        {isDone && item.completed_at && (
                          <div className="pt-2 border-t border-success/20 text-[11px] font-mono text-on-success-container flex items-center justify-between">
                            <span>By: {item.completed_by_name || 'System Admin'}</span>
                            <span>{new Date(item.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}

                        {/* Status Transition Action Bar */}
                        <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-mono text-on-surface-variant">
                            Owner: {item.owner_role_name || col.roleTag}
                          </div>

                          {isAllowed ? (
                            <div className="flex items-center gap-1">
                              {!isDone && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    onUpdateStatus(
                                      item.id,
                                      isInProgress ? 'pending' : 'in_progress'
                                    )
                                  }
                                  className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                                    isInProgress
                                      ? 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                                      : 'bg-warning-container hover:bg-warning-container/70 text-on-warning-container'
                                  }`}
                                >
                                  {isInProgress ? 'Reset' : 'Start'}
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() =>
                                  onUpdateStatus(item.id, isDone ? 'pending' : 'done')
                                }
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all cursor-pointer shadow-2xs ${
                                  isDone
                                    ? 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                                    : 'bg-accent hover:bg-accent/90 text-on-accent'
                                }`}
                              >
                                {isUpdating ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : isDone ? (
                                  <>
                                    <RotateCcw className="w-3 h-3" /> Reopen
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3 h-3" /> Mark Done
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-mono text-on-surface-variant/70 italic flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> Role Locked
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
