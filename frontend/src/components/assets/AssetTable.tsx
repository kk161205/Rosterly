import React from 'react'
import {
  Laptop,
  Monitor,
  Smartphone,
  Key,
  Armchair,
  Box,
  QrCode,
  Copy,
  Check,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
} from 'lucide-react'
import { StatusBadge, Button } from '@/components/common/CommonUI'
import { Asset, AssetCategory, AssetStatus } from '@/types/assets'
import { UserRole } from '@/types/dashboard'

interface AssetTableProps {
  assets: Asset[]
  selectedAssetIds: string[]
  onToggleSelect: (assetId: string) => void
  onToggleSelectAll: () => void
  onRowClick: (asset: Asset) => void
  onDeleteClick?: (asset: Asset) => void
  currentRole: UserRole
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (newPage: number) => void
  onPageSizeChange: (newSize: number) => void
}

export const getCategoryIcon = (category: AssetCategory) => {
  switch (category) {
    case 'laptop':
      return <Laptop className="w-3.5 h-3.5" />
    case 'monitor':
      return <Monitor className="w-3.5 h-3.5" />
    case 'mobile':
      return <Smartphone className="w-3.5 h-3.5" />
    case 'software_license':
      return <Key className="w-3.5 h-3.5" />
    case 'furniture':
      return <Armchair className="w-3.5 h-3.5" />
    default:
      return <Box className="w-3.5 h-3.5" />
  }
}

export const getCategoryLabel = (category: AssetCategory) => {
  switch (category) {
    case 'laptop':
      return 'Laptop'
    case 'monitor':
      return 'Monitor'
    case 'mobile':
      return 'Mobile'
    case 'software_license':
      return 'Software'
    case 'furniture':
      return 'Furniture'
    default:
      return 'Hardware'
  }
}

export const getStatusVariant = (status: AssetStatus): 'success' | 'info' | 'warning' | 'neutral' | 'error' => {
  switch (status) {
    case 'in_stock':
      return 'success'
    case 'assigned':
      return 'info'
    case 'under_maintenance':
      return 'warning'
    case 'retired':
      // Per DESIGN.md's explicit semantic mapping and §4's global shell spec
      // (Rose for Locked/Retired-style states) — confirmed with the developer.
      return 'error'
    case 'lost':
      return 'error'
    default:
      return 'neutral'
  }
}

export const AssetTable: React.FC<AssetTableProps> = ({
  assets,
  selectedAssetIds,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
  onDeleteClick,
  currentRole,
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}) => {
  const [copiedTag, setCopiedTag] = React.useState<string | null>(null)

  const handleCopyTag = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(tag)
    setCopiedTag(tag)
    setTimeout(() => setCopiedTag(null), 2000)
  }

  const isAllSelected = assets.length > 0 && selectedAssetIds.length === assets.length
  const isIndeterminate = selectedAssetIds.length > 0 && selectedAssetIds.length < assets.length

  const canWrite = currentRole === 'super_admin' || currentRole === 'it_admin'
  const canDelete = currentRole === 'super_admin'

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg overflow-hidden shadow-xs flex flex-col">
      {/* Table Container */}
      <div className="overflow-x-auto min-w-full">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/40 text-[11px] font-mono text-outline uppercase tracking-wider select-none">
              {canWrite && (
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isIndeterminate
                    }}
                    onChange={onToggleSelectAll}
                    className="rounded border-outline-variant text-accent focus:ring-accent/30 cursor-pointer"
                    aria-label="Select all assets"
                  />
                </th>
              )}
              <th className="py-3 px-4 font-semibold">Asset Tag</th>
              <th className="py-3 px-4 font-semibold">Asset Name & Model</th>
              <th className="py-3 px-4 font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Current Holder</th>
              <th className="py-3 px-4 font-semibold">Warranty / AMC</th>
              <th className="py-3 px-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20 text-xs font-body">
            {assets.map((asset) => {
              const isSelected = selectedAssetIds.includes(asset.id)
              const holder = asset.current_holder

              return (
                <tr
                  key={asset.id}
                  onClick={() => onRowClick(asset)}
                  className={`group transition-colors cursor-pointer hover:bg-surface-container-low/70 ${
                    isSelected ? 'bg-accent/5' : ''
                  }`}
                >
                  {/* Checkbox */}
                  {canWrite && (
                    <td
                      className="py-3.5 px-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(asset.id)}
                        className="rounded border-outline-variant text-accent focus:ring-accent/30 cursor-pointer"
                        aria-label={`Select asset ${asset.asset_tag}`}
                      />
                    </td>
                  )}

                  {/* Asset Tag + QR */}
                  <td className="py-3.5 px-4 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-primary group-hover:bg-accent-container group-hover:text-on-accent-container transition-colors"
                        title="QR Tag"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-primary">
                        <span>{asset.asset_tag}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyTag(e, asset.asset_tag)}
                          className="p-1 text-outline hover:text-primary transition-colors rounded hover:bg-surface-container"
                          title="Copy asset tag"
                        >
                          {copiedTag === asset.asset_tag ? (
                            <Check className="w-3 h-3 text-success" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Asset Name & Serial */}
                  <td className="py-3.5 px-4">
                    <div className="space-y-0.5 max-w-xs">
                      <div className="font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
                        {asset.name}
                      </div>
                      <div className="text-[11px] font-mono text-on-surface-variant flex items-center gap-2 truncate">
                        <span>Vendor: {asset.vendor}</span>
                        {asset.serial_number && (
                          <>
                            <span>&bull;</span>
                            <span className="truncate">S/N: {asset.serial_number}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Category */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-on-surface-variant font-medium text-[11px]">
                      {getCategoryIcon(asset.category)}
                      <span>{getCategoryLabel(asset.category)}</span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <StatusBadge
                      status={asset.status}
                      variant={getStatusVariant(asset.status)}
                    />
                  </td>

                  {/* Current Holder */}
                  <td className="py-3.5 px-4">
                    {holder ? (
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <div className="w-6 h-6 rounded-full bg-accent text-on-accent font-semibold text-[10px] flex items-center justify-center flex-shrink-0">
                          {holder.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="font-medium text-on-surface truncate">
                            {holder.full_name}
                          </div>
                          <div className="text-[10px] text-outline truncate">
                            {holder.department_name || 'Assigned'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-mono text-outline bg-surface-container">
                        Unassigned
                      </span>
                    )}
                  </td>

                  {/* Warranty / AMC */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <div className="text-[11px] text-on-surface">
                        {asset.warranty_expiry ? `Exp: ${asset.warranty_expiry}` : 'No warranty'}
                      </div>
                      {asset.is_expiring_soon && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-warning-container text-on-warning-container border border-warning/30">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>Expiring soon</span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td
                    className="py-3.5 px-4 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Eye className="w-3.5 h-3.5" />}
                        onClick={() => onRowClick(asset)}
                        title="View Asset Details"
                      >
                        <span className="sr-only">View</span>
                      </Button>
                      {canDelete && onDeleteClick && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                          onClick={() => onDeleteClick(asset)}
                          className="hover:bg-error-container/30"
                          title="Delete Asset (Mistake only)"
                        >
                          <span className="sr-only">Delete</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3.5 bg-surface-container-low border-t border-outline-variant/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-outline select-none">
        <div className="flex items-center gap-3">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-surface-container-lowest border border-outline-variant rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-accent"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>
            {totalItems > 0
              ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalItems)} of ${totalItems}`
              : '0 of 0'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            icon={<ChevronLeft className="w-3.5 h-3.5" />}
          >
            Prev
          </Button>
          <span className="px-2 text-on-surface font-semibold">
            {currentPage} / {Math.max(totalPages, 1)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            icon={<ChevronRight className="w-3.5 h-3.5" />}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
