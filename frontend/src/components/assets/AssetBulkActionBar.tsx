import React, { useState } from 'react'
import { PackageCheck, Wrench, Archive, X, CheckSquare, Loader2 } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'
import { AssetStatus } from '@/types/assets'

interface AssetBulkActionBarProps {
  selectedCount: number
  onBulkUpdate: (status: AssetStatus) => Promise<void>
  onClearSelection: () => void
}

export const AssetBulkActionBar: React.FC<AssetBulkActionBarProps> = ({
  selectedCount,
  onBulkUpdate,
  onClearSelection,
}) => {
  const [loadingAction, setLoadingAction] = useState<AssetStatus | null>(null)

  if (selectedCount === 0) return null

  const handleAction = async (status: AssetStatus) => {
    setLoadingAction(status)
    try {
      await onBulkUpdate(status)
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-lg shadow-xl border border-outline/30 flex items-center gap-4 animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center gap-2 border-r border-outline/30 pr-4">
        <CheckSquare className="w-4 h-4 text-accent" />
        <span className="text-xs font-mono font-medium">
          <strong className="text-white">{selectedCount}</strong> {selectedCount === 1 ? 'asset' : 'assets'} selected
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={Boolean(loadingAction)}
          onClick={() => handleAction('in_stock')}
          className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-container/20 hover:bg-surface-container/30 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loadingAction === 'in_stock' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <PackageCheck className="w-3.5 h-3.5 text-success" />
          )}
          <span>Mark In Stock</span>
        </button>

        <button
          type="button"
          disabled={Boolean(loadingAction)}
          onClick={() => handleAction('under_maintenance')}
          className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-container/20 hover:bg-surface-container/30 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loadingAction === 'under_maintenance' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Wrench className="w-3.5 h-3.5 text-warning" />
          )}
          <span>Mark Maintenance</span>
        </button>

        <button
          type="button"
          disabled={Boolean(loadingAction)}
          onClick={() => handleAction('retired')}
          className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-container/20 hover:bg-surface-container/30 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loadingAction === 'retired' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Archive className="w-3.5 h-3.5 text-outline-variant" />
          )}
          <span>Mark Retired</span>
        </button>
      </div>

      <div className="pl-2 border-l border-outline/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="text-inverse-on-surface hover:text-white hover:bg-surface-container/20"
          icon={<X className="w-3.5 h-3.5" />}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}
