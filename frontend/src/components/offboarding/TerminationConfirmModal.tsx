import React, { useState } from 'react'
import { OffboardingChecklist } from '@/types/offboarding'
import { offboardingService } from '@/services/offboardingService'
import { X, ShieldAlert, AlertOctagon, CheckCircle2, Lock, Loader2 } from 'lucide-react'

interface TerminationConfirmModalProps {
  isOpen: boolean
  checklist: OffboardingChecklist
  onClose: () => void
  onSuccess: () => void
}

export const TerminationConfirmModal: React.FC<TerminationConfirmModalProps> = ({
  isOpen,
  checklist,
  onClose,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  if (!isOpen) return null

  const incompleteItems = checklist.items.filter((i) => i.status !== 'done')
  const canTerminate = incompleteItems.length === 0

  const handleCompleteTermination = async () => {
    if (!canTerminate) {
      setErrorMsg('Cannot finalize termination until all checklist tasks are marked done.')
      return
    }
    if (!confirmed) {
      setErrorMsg('Please check the confirmation box to proceed with termination.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')
    try {
      await offboardingService.completeOffboarding(checklist.id)
      onSuccess()
      onClose()
    } catch {
      setErrorMsg('Failed to complete offboarding. Please verify that all items are completed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div className="bg-surface-container-lowest border border-error/30 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-error/20 bg-error-container/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-error text-on-error flex items-center justify-center font-bold shadow-sm">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-base text-on-surface leading-tight">
                Finalize Termination & Revoke Access
              </h3>
              <p className="text-xs text-on-surface-variant font-body">
                Permanent zero-trust session revocation & employee status update
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

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-error-container text-on-error-container border border-error/20 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Target Employee Summary */}
          <div className="p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/60 space-y-1">
            <div className="text-[11px] font-mono text-on-surface-variant uppercase font-semibold">
              Target Employee
            </div>
            <div className="font-sans font-bold text-sm text-on-surface">
              {checklist.employee_name}
            </div>
            <div className="text-on-surface-variant font-body">
              {checklist.employee_email} • {checklist.department_name} • Exit: {checklist.exit_date || 'Today'}
            </div>
          </div>

          {/* Validation Status */}
          {canTerminate ? (
            <div className="p-3.5 rounded-lg bg-success-container border border-success/30 text-on-success-container space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-on-success-container">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>All {checklist.total_items} Checklist Tasks Completed</span>
              </div>
              <p className="text-[11px] font-body text-on-success-container">
                Hardware assets have been returned to inventory and identity deactivations verified.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-warning-container border border-warning/30 text-on-warning-container space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-on-warning-container">
                <ShieldAlert className="w-4 h-4 text-warning" />
                <span>{incompleteItems.length} Incomplete Task(s) Remaining</span>
              </div>
              <p className="text-[11px] font-body text-on-warning-container">
                All checklist items must be marked done before final termination can be executed.
              </p>
            </div>
          )}

          {/* Consequences List */}
          <div className="space-y-2 pt-2">
            <div className="font-mono text-[11px] uppercase font-bold text-on-surface">
              Actions Triggered upon Confirmation:
            </div>
            <ul className="space-y-1.5 text-on-surface-variant font-body pl-1">
              <li className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-error mt-0.5 flex-shrink-0" />
                <span>Immediate revocation of all active zero-trust user sessions across all devices.</span>
              </li>
              <li className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-error mt-0.5 flex-shrink-0" />
                <span>Transition employee account status to <strong>Terminated</strong> in directory.</span>
              </li>
              <li className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-error mt-0.5 flex-shrink-0" />
                <span>Append immutable audit log entry documenting completed offboarding.</span>
              </li>
            </ul>
          </div>

          {/* Confirmation Checkbox */}
          {canTerminate && (
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-outline-variant bg-surface-container-low/40 cursor-pointer hover:bg-surface-container-low transition-colors">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-error rounded border-outline-variant focus:ring-error"
              />
              <span className="font-medium text-on-surface leading-tight">
                I confirm that all company assets are accounted for and authoritatively authorize account termination.
              </span>
            </label>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-outline-variant/30 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-mono font-semibold text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canTerminate || !confirmed || isSubmitting}
              onClick={handleCompleteTermination}
              className="px-4 py-2 rounded-lg bg-error hover:bg-error/90 text-on-error text-xs font-mono font-semibold transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Terminating...</span>
                </>
              ) : (
                <>
                  <AlertOctagon className="w-4 h-4" />
                  <span>Authorize Termination</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
