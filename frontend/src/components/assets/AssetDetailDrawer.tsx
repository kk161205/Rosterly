import React, { useEffect, useState } from 'react'
import {
  X,
  QrCode,
  Download,
  DollarSign,
  TrendingDown,
  Clock,
  ShieldCheck,
  AlertTriangle,
  User,
  Building,
  CheckCircle2,
  Wrench,
  Archive,
} from 'lucide-react'
import { Button, StatusBadge } from '@/components/common/CommonUI'
import { Asset, AssetStatus } from '@/types/assets'
import { UserRole } from '@/types/dashboard'
import { getCategoryIcon, getCategoryLabel, getStatusVariant } from './AssetTable'

interface AssetDetailDrawerProps {
  asset: Asset | null
  isOpen: boolean
  onClose: () => void
  onStatusChange?: (assetId: string, newStatus: AssetStatus) => Promise<void>
  currentRole: UserRole
}

export const AssetDetailDrawer: React.FC<AssetDetailDrawerProps> = ({
  asset,
  isOpen,
  onClose,
  onStatusChange,
  currentRole,
}) => {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !asset) return null

  const canWrite = currentRole === 'super_admin' || currentRole === 'it_admin'

  const handleQuickStatus = async (status: AssetStatus) => {
    if (!onStatusChange) return
    setIsUpdatingStatus(true)
    try {
      await onStatusChange(asset.id, status)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleDownloadQrLabel = () => {
    setDownloadSuccess(true)
    setTimeout(() => setDownloadSuccess(false), 2000)
  }

  const depreciationRate =
    asset.purchase_cost > 0
      ? Math.round(((asset.purchase_cost - asset.current_value) / asset.purchase_cost) * 100)
      : 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-[540px] bg-surface-container-lowest border-l border-outline-variant h-full shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-outline-variant/60 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-outline uppercase tracking-wider">Asset Details</span>
            <span className="text-outline">&bull;</span>
            <span className="font-mono text-xs font-semibold text-primary">{asset.asset_tag}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Hero Banner Card */}
          <div className="bg-surface-container-low border border-outline-variant/60 rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium text-[11px]">
                  {getCategoryIcon(asset.category)}
                  <span>{getCategoryLabel(asset.category)}</span>
                </div>
                <StatusBadge status={asset.status} variant={getStatusVariant(asset.status)} />
              </div>
              <h2 className="text-lg font-sans font-bold text-primary tracking-tight">{asset.name}</h2>
              <div className="text-xs font-mono text-on-surface-variant">
                Vendor: <span className="font-semibold text-on-surface">{asset.vendor}</span>
                {asset.serial_number && (
                  <span className="ml-2">| S/N: {asset.serial_number}</span>
                )}
              </div>
            </div>

            {/* Printable QR Code Label Box */}
            <div className="flex flex-col items-center p-3 bg-surface-container-lowest border border-outline-variant rounded-md shadow-xs flex-shrink-0">
              <div className="w-16 h-16 bg-surface-container flex items-center justify-center text-primary rounded mb-1.5">
                <QrCode className="w-12 h-12" />
              </div>
              <span className="font-mono text-[9px] text-outline">{asset.asset_tag}</span>
              <button
                type="button"
                onClick={handleDownloadQrLabel}
                className="mt-1.5 text-[10px] font-sans text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-2.5 h-2.5" />
                <span>{downloadSuccess ? 'Downloaded' : 'Label PNG'}</span>
              </button>
            </div>
          </div>

          {/* Current Holder / Assignment */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">
              Assignment Status
            </h3>
            <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-4">
              {asset.current_holder ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent text-on-accent font-semibold text-sm flex items-center justify-center flex-shrink-0 shadow-xs">
                    {asset.current_holder.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="text-sm font-semibold text-on-surface truncate">
                      {asset.current_holder.full_name}
                    </div>
                    <div className="text-xs text-on-surface-variant truncate">
                      {asset.current_holder.email}
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-outline">
                      <span className="inline-flex items-center gap-1">
                        <Building className="w-3 h-3" />
                        {asset.current_holder.department_name || 'Department Assigned'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 py-1">
                  <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-on-surface">No current holder</div>
                    <div className="text-[11px] text-outline">Available in stock for employee provisioning.</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Financials & Depreciation */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">
              Financial & Depreciation Metrics
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-3.5 space-y-1">
                <span className="text-[11px] font-mono text-outline flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-on-surface-variant" />
                  Purchase Cost
                </span>
                <div className="text-base font-sans font-bold text-primary">
                  ${Number(asset.purchase_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] font-mono text-outline">
                  Purchased on {asset.purchase_date}
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-3.5 space-y-1">
                <span className="text-[11px] font-mono text-outline flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-accent" />
                  Book Value
                </span>
                <div className="text-base font-sans font-bold text-accent">
                  ${Number(asset.current_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] font-mono text-on-surface-variant">
                  {depreciationRate}% depreciated
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low border border-outline-variant/40 rounded-lg p-3 flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Method: <strong className="text-primary capitalize">{asset.depreciation_method.replace('_', ' ')}</strong></span>
              <span>Useful Life: <strong className="text-primary">{asset.useful_life_months} mos</strong></span>
            </div>
          </div>

          {/* Warranty & AMC Information */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">
              Warranty & AMC Coverage
            </h3>
            <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-body">
                <span className="flex items-center gap-1.5 text-on-surface-variant">
                  <ShieldCheck className="w-3.5 h-3.5 text-tertiary" />
                  Warranty Expiry
                </span>
                <span className="font-mono font-semibold text-primary">
                  {asset.warranty_expiry || 'Not specified'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-body pt-2 border-t border-outline-variant/30">
                <span className="flex items-center gap-1.5 text-on-surface-variant">
                  <Clock className="w-3.5 h-3.5 text-on-surface-variant" />
                  AMC Expiry
                </span>
                <span className="font-mono font-semibold text-primary">
                  {asset.amc_expiry || 'Not specified'}
                </span>
              </div>

              {asset.is_expiring_soon && (
                <div className="p-2.5 rounded bg-warning-container text-on-warning-container text-xs flex items-center gap-2 border border-warning/30">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Warranty is expiring in less than 30 days. Recommend review for extension or replacement.</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions (IT Admin & Super Admin) */}
          {canWrite && onStatusChange && asset.status === 'retired' && (
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">
                Quick Status Transition
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                This asset is retired. Retired assets are a terminal state and cannot be transitioned to any other status.
              </p>
            </div>
          )}

          {canWrite && onStatusChange && asset.status !== 'retired' && (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-mono font-semibold text-outline uppercase tracking-wider">
                Quick Status Transition
              </h3>
              <div className="flex flex-wrap gap-2">
                {asset.status !== 'in_stock' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingStatus}
                    icon={<CheckCircle2 className="w-3.5 h-3.5 text-success" />}
                    onClick={() => handleQuickStatus('in_stock')}
                  >
                    Set In Stock
                  </Button>
                )}
                {asset.status !== 'under_maintenance' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingStatus}
                    icon={<Wrench className="w-3.5 h-3.5 text-warning" />}
                    onClick={() => handleQuickStatus('under_maintenance')}
                  >
                    Mark Maintenance
                  </Button>
                )}
                {/* No `status !== 'retired'` guard needed here — the enclosing
                    block (line 264) already only renders when that's true. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isUpdatingStatus}
                  icon={<Archive className="w-3.5 h-3.5 text-outline" />}
                  onClick={() => handleQuickStatus('retired')}
                >
                  Mark Retired
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-outline-variant/60 bg-surface-container-low flex items-center justify-between">
          <span className="text-[11px] font-mono text-outline">
            Created: {new Date(asset.created_at).toLocaleDateString()}
          </span>
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
