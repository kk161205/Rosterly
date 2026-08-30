import React, { useState } from 'react'
import { AlertTriangle, X, UserX } from 'lucide-react'
import { EmployeeProfile } from '@/types/profile'
import { Button, SelectDropdown } from '@/components/common/CommonUI'

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
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg(null)
    try {
      await onConfirm(reason, exitDate)
      onClose()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to initiate offboarding. Please try again.')
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
          {errorMsg && (
            <div className="p-3 rounded-sm bg-error-container/60 border border-error/30 text-on-error-container text-xs">
              {errorMsg}
            </div>
          )}
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
            <SelectDropdown
              value={reason}
              onChange={setReason}
              containerClassName="w-full"
              className="w-full justify-between"
              options={[
                { value: 'Resignation / Career Change', label: 'Resignation / Career Change' },
                { value: 'Contract Expiration', label: 'Contract Expiration' },
                { value: 'Role Redundancy', label: 'Role Redundancy' },
                { value: 'Performance Termination', label: 'Performance Termination' },
                { value: 'Mutual Separation', label: 'Mutual Separation' },
              ]}
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-outline-variant">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting}
              icon={!isSubmitting ? <UserX className="w-4 h-4" /> : undefined}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm & Start Offboarding
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
