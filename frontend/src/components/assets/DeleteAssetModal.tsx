import React, { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'
import { Asset } from '@/types/assets'

interface DeleteAssetModalProps {
  asset: Asset | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (assetId: string) => Promise<void>
}

export const DeleteAssetModal: React.FC<DeleteAssetModalProps> = ({
  asset,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !asset) return null

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)
    try {
      await onConfirm(asset.id)
      onClose()
    } catch (err: unknown) {
      const errorMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to delete asset. Only records without historical assignments can be deleted.'
      setError(String(errorMsg || 'Failed to delete asset'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-lg p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-base text-primary">Permanently Delete Asset</h3>
              <p className="text-xs font-mono text-outline">Action restricted to Super Admin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-on-surface-variant hover:text-primary rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs text-on-surface-variant bg-surface-container-low p-3.5 rounded-md border border-outline-variant/40">
          <p>
            Are you sure you want to permanently delete{' '}
            <strong className="text-on-surface">{asset.name}</strong> ({asset.asset_tag})?
          </p>
          <p className="text-error text-[11px]">
            Notice: Hard deletion is intended solely for data-entry corrections. Assets with active or historical assignments cannot be deleted and should instead be marked as <strong>Retired</strong>.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-error-container/30 border border-error/40 text-on-error-container rounded text-xs">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            isLoading={isDeleting}
            onClick={handleDelete}
          >
            Confirm Deletion
          </Button>
        </div>
      </div>
    </div>
  )
}
