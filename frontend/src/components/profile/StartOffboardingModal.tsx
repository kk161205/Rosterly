import React, { useState } from 'react'
import { AlertTriangle, X, UserX, Loader2 } from 'lucide-react'
import { EmployeeProfile } from '@/types/profile'

interface StartOffboardingModalProps {
  isOpen: boolean
  onClose: () => void
  profile: EmployeeProfile
  onConfirm: (reason: string, exitDate: string) => Promise<void>
}

export const StartOffboardingModal: React.FC<StartOffboardingModalProps> = ({
  isOpen,
  onClose,
  profile,
  onConfirm,
}) => {
  const [reason, setReason] = useState('Resignation / Career Change')
  const [exitDate, setExitDate] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await onConfirm(reason, exitDate)
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-headline font-semibold text-amber-950">
              Initiate Employee Offboarding
            </h2>
          </div>
          <button onClick={onClose} className="text-amber-800 hover:text-amber-950">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs font-body text-on-surface-variant leading-relaxed">
            You are initiating the formal offboarding workflow for{' '}
            <strong className="text-on-surface">{profile.full_name}</strong> ({profile.employee_code}).
            This will auto-generate asset reclamation tasks and access revocation checklists.
          </p>

          <div>
            <label className="block text-xs font-medium text-on-surface mb-1">
              Effective Exit Date
            </label>
            <input
              type="date"
              required
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-body bg-surface-container-low border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface mb-1">
              Primary Reason for Departure
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs font-body bg-surface-container-low border border-outline-variant rounded-sm text-on-surface focus:outline-none focus:border-amber-500"
            >
              <option value="Resignation / Career Change">Resignation / Career Change</option>
              <option value="Contract Expiration">Contract Expiration</option>
              <option value="Role Redundancy">Role Redundancy</option>
              <option value="Performance Termination">Performance Termination</option>
              <option value="Mutual Separation">Mutual Separation</option>
            </select>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-outline-variant">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-on-surface-variant hover:text-on-surface bg-surface-container rounded-sm border border-outline-variant/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-sm shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserX className="w-4 h-4" />
              )}
              Confirm & Start Offboarding
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
