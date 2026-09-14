import React, { useState } from 'react'
import { X, Wrench, AlertCircle } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'
import { Asset, TicketPriority } from '@/types/assets'

interface RaiseTicketModalProps {
  asset: Asset
  isOpen: boolean
  onClose: () => void
  onRaiseTicket: (payload: { issue_description: string; priority: TicketPriority }) => Promise<void>
}

export const RaiseTicketModal: React.FC<RaiseTicketModalProps> = ({
  asset,
  isOpen,
  onClose,
  onRaiseTicket,
}) => {
  const [issueDescription, setIssueDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!issueDescription.trim()) {
      setError('Please describe the issue or maintenance requirement.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onRaiseTicket({
        issue_description: issueDescription.trim(),
        priority,
      })
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to raise service ticket.'
      setError(String(msg || 'Failed to raise ticket.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-warning-container text-on-warning-container">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold text-primary">Raise Maintenance Ticket</h2>
              <p className="text-xs text-on-surface-variant font-mono">
                {asset.name} ({asset.asset_tag})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-on-surface-variant hover:text-primary rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-body">
          {error && (
            <div className="p-3 bg-error-container/30 border border-error/40 text-on-error-container rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="font-semibold text-on-surface">
              Issue Description <span className="text-error">*</span>
            </label>
            <textarea
              required
              rows={4}
              placeholder="Describe the hardware defect, error code, or repair request in detail..."
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-on-surface">Urgency & Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent capitalize"
            >
              <option value="low">Low (Standard Maintenance)</option>
              <option value="medium">Medium (Defect / Usable)</option>
              <option value="high">High (Severe Impact)</option>
              <option value="critical">Critical (Device Inoperable / Blocker)</option>
            </select>
          </div>

          <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={isSubmitting}>
              Submit Ticket
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
