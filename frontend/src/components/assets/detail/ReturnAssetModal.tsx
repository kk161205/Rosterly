import React, { useState } from 'react'
import { X, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'
import { Asset, AssetReturnPayload, AssetAssignment } from '@/types/assets'

interface ReturnAssetModalProps {
  asset: Asset
  currentAssignment?: AssetAssignment | null
  isOpen: boolean
  onClose: () => void
  onReturn: (payload: AssetReturnPayload) => Promise<void>
}

export const ReturnAssetModal: React.FC<ReturnAssetModalProps> = ({
  asset,
  currentAssignment,
  isOpen,
  onClose,
  onReturn,
}) => {
  const [conditionNotes, setConditionNotes] = useState('Returned in Good Working Condition')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!conditionNotes.trim()) {
      setError('Condition at return is required.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onReturn({
        condition_notes: conditionNotes.trim(),
        notes: notes.trim() || null,
      })
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to process asset return.'
      setError(String(msg || 'Return process failed.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const holder = asset.current_holder

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-surface-container text-primary">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold text-primary">Return Asset to Stock</h2>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-body">
          {error && (
            <div className="p-3 bg-error-container/30 border border-error/40 text-on-error-container rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Custody Info Box */}
          {holder && (
            <div className="p-3 bg-surface-container-low border border-outline-variant/40 rounded-lg space-y-1">
              <span className="text-[10px] font-mono text-outline uppercase tracking-wider">
                Returning From Custody
              </span>
              <div className="flex items-center gap-2.5 pt-1">
                <div className="w-6 h-6 rounded-full bg-accent text-on-accent text-[10px] font-bold flex items-center justify-center">
                  {holder.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-semibold text-on-surface">{holder.full_name}</div>
                  <div className="text-[10px] text-outline">{holder.email}</div>
                </div>
              </div>
            </div>
          )}

          {/* Condition at Return */}
          <div className="space-y-1">
            <label className="font-semibold text-on-surface">
              Condition at Return <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Good condition, normal wear and tear"
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
            />
          </div>

          {/* Return Notes */}
          <div className="space-y-1">
            <label className="font-semibold text-on-surface">Return / Inspection Notes</label>
            <textarea
              rows={3}
              placeholder="Inspection notes or peripheral items verified..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="p-2.5 rounded bg-surface-container text-on-surface-variant text-[11px] leading-relaxed">
            Returning this asset will close the active assignment record and set the asset status back to <strong>In Stock</strong>.
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={isSubmitting}>
              Confirm Return
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
