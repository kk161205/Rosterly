import React, { useState } from 'react'
import { X, Edit, AlertCircle } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'
import { Asset, AssetUpdatePayload, AssetStatus } from '@/types/assets'

interface EditAssetModalProps {
  asset: Asset
  isOpen: boolean
  onClose: () => void
  onUpdate: (payload: AssetUpdatePayload) => Promise<void>
}

export const EditAssetModal: React.FC<EditAssetModalProps> = ({
  asset,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [formData, setFormData] = useState<AssetUpdatePayload>({
    name: asset.name,
    category: asset.category,
    serial_number: asset.serial_number || '',
    vendor: asset.vendor,
    purchase_date: asset.purchase_date,
    purchase_cost: asset.purchase_cost,
    depreciation_method: asset.depreciation_method,
    useful_life_months: asset.useful_life_months,
    warranty_expiry: asset.warranty_expiry || '',
    amc_expiry: asset.amc_expiry || '',
    status: asset.status,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const payload: AssetUpdatePayload = {
        ...formData,
        serial_number: formData.serial_number?.trim() || null,
        warranty_expiry: formData.warranty_expiry || null,
        amc_expiry: formData.amc_expiry || null,
        purchase_cost: Number(formData.purchase_cost),
        useful_life_months: Number(formData.useful_life_months),
      }

      await onUpdate(payload)
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to update asset specifications.'
      setError(String(msg || 'Update failed.'))
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
      <div className="relative w-full max-w-xl bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-surface-container text-primary">
              <Edit className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold text-primary">Edit Asset Specifications</h2>
              <p className="text-xs text-on-surface-variant font-mono">{asset.asset_tag}</p>
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-body">
          {error && (
            <div className="p-3 bg-error-container/30 border border-error/40 text-on-error-container rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-on-surface">Asset Name & Model</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">Category</label>
              <input
                type="text"
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">Vendor</label>
              <input
                type="text"
                required
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">Serial Number (S/N)</label>
              <input
                type="text"
                value={formData.serial_number || ''}
                onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as AssetStatus })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent capitalize"
              >
                <option value="in_stock">In Stock</option>
                <option value="assigned">Assigned</option>
                <option value="under_maintenance">Under Maintenance</option>
                <option value="retired">Retired</option>
                <option value="lost">Lost</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">Purchase Cost ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.purchase_cost}
                onChange={(e) => setFormData({ ...formData, purchase_cost: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">Warranty Expiry</label>
              <input
                type="date"
                value={formData.warranty_expiry || ''}
                onChange={(e) => setFormData({ ...formData, warranty_expiry: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">AMC Expiry</label>
              <input
                type="date"
                value={formData.amc_expiry || ''}
                onChange={(e) => setFormData({ ...formData, amc_expiry: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={isSubmitting}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
