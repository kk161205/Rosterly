import React, { useState } from 'react'
import { X, QrCode, Plus, Sparkles, AlertCircle } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'
import { AssetCreatePayload, AssetCategory, DepreciationMethod } from '@/types/assets'

interface AddAssetModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: AssetCreatePayload) => Promise<void>
}

export const AddAssetModal: React.FC<AddAssetModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState<AssetCreatePayload>({
    name: '',
    category: 'laptop',
    serial_number: '',
    vendor: '',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_cost: 0,
    depreciation_method: 'straight_line',
    useful_life_months: 36,
    warranty_expiry: '',
    amc_expiry: '',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)

  if (!isOpen) return null

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) newErrors.name = 'Asset name is required'
    if (!formData.vendor.trim()) newErrors.vendor = 'Vendor name is required'
    if (formData.purchase_cost < 0) newErrors.purchase_cost = 'Purchase cost must be 0 or greater'
    if (formData.useful_life_months <= 0) newErrors.useful_life_months = 'Useful life must be greater than 0'
    if (!formData.purchase_date) newErrors.purchase_date = 'Purchase date is required'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setGeneralError(null)

    try {
      const payload: AssetCreatePayload = {
        ...formData,
        serial_number: formData.serial_number?.trim() || null,
        warranty_expiry: formData.warranty_expiry || null,
        amc_expiry: formData.amc_expiry || null,
        purchase_cost: Number(formData.purchase_cost),
        useful_life_months: Number(formData.useful_life_months),
      }

      await onSubmit(payload)
      onClose()
    } catch (err: unknown) {
      const errorMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Failed to create asset. Please check all inputs and try again.'
      setGeneralError(String(errorMsg || 'Failed to create asset'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Live QR tag simulated identifier
  const simulatedTag = `AST-${new Date().getFullYear()}-XXXXX`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-surface-container-lowest border border-outline-variant rounded-lg shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/60 bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-accent-container text-on-accent-container">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold text-primary">Provision New Asset</h2>
              <p className="text-xs text-on-surface-variant">
                Enter asset specifications and initial lifecycle metadata
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs font-body">
          {generalError && (
            <div className="p-3 bg-error-container/30 border border-error/40 text-on-error-container rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* QR Tag Instant Generator Preview Box */}
          <div className="p-4 rounded-lg bg-surface-container-low border border-outline-variant/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-surface-container-lowest border border-outline-variant rounded-md flex items-center justify-center text-primary p-1 shadow-xs">
                <QrCode className="w-10 h-10" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-accent font-semibold">
                  <Sparkles className="w-3 h-3" />
                  <span>Instant Tag Generation</span>
                </div>
                <div className="font-mono text-sm font-bold text-primary">{simulatedTag}</div>
                <p className="text-[11px] text-outline">
                  Sequential enterprise QR tag generated server-side upon provisioning.
                </p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container px-2 py-1 rounded border border-outline-variant/60">
                Category: {formData.category.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Core Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-on-surface">
                Asset Name & Model <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. MacBook Pro 16 M3 Max"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3 py-2 bg-surface-container-low border rounded-md text-on-surface focus:outline-none focus:border-accent ${
                  errors.name ? 'border-error' : 'border-outline-variant'
                }`}
              />
              {errors.name && <p className="text-error text-[10px]">{errors.name}</p>}
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">
                Category <span className="text-error">*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as AssetCategory })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent capitalize"
              >
                <option value="laptop">Laptop</option>
                <option value="monitor">Monitor</option>
                <option value="mobile">Mobile Device</option>
                <option value="software_license">Software License</option>
                <option value="furniture">Furniture</option>
                <option value="other">Other Equipment</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">
                Vendor / Supplier <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Apple Inc. / Dell Tech"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                className={`w-full px-3 py-2 bg-surface-container-low border rounded-md text-on-surface focus:outline-none focus:border-accent ${
                  errors.vendor ? 'border-error' : 'border-outline-variant'
                }`}
              />
              {errors.vendor && <p className="text-error text-[10px]">{errors.vendor}</p>}
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-on-surface">Serial Number (S/N)</label>
              <input
                type="text"
                placeholder="e.g. C02G1234MD6R"
                value={formData.serial_number || ''}
                onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent font-mono"
              />
            </div>
          </div>

          {/* Financial & Depreciation Section */}
          <div className="pt-3 border-t border-outline-variant/40 space-y-3">
            <span className="font-mono text-[11px] font-semibold text-outline uppercase tracking-wider">
              Financial & Depreciation Setup
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-on-surface">
                  Purchase Cost ($) <span className="text-error">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formData.purchase_cost}
                  onChange={(e) => setFormData({ ...formData, purchase_cost: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-on-surface">Depreciation Method</label>
                <select
                  value={formData.depreciation_method}
                  onChange={(e) => setFormData({ ...formData, depreciation_method: e.target.value as DepreciationMethod })}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
                >
                  <option value="straight_line">Straight Line</option>
                  <option value="declining_balance">Declining Balance</option>
                  <option value="none">No Depreciation</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-on-surface">Useful Life (Months)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formData.useful_life_months}
                  onChange={(e) => setFormData({ ...formData, useful_life_months: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent font-mono"
                />
              </div>
            </div>
          </div>

          {/* Dates & Lifecycle Section */}
          <div className="pt-3 border-t border-outline-variant/40 space-y-3">
            <span className="font-mono text-[11px] font-semibold text-outline uppercase tracking-wider">
              Warranty & Contract Dates
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="font-semibold text-on-surface">
                  Purchase Date <span className="text-error">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.purchase_date}
                  onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-md text-on-surface focus:outline-none focus:border-accent"
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
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-outline-variant/60 flex items-center justify-end gap-3">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" isLoading={isSubmitting}>
              Provision Asset
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
