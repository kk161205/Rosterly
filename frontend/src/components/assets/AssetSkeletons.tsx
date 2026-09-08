import React from 'react'
import { Box, AlertCircle, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'

export const AssetTableSkeleton: React.FC = () => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg overflow-hidden shadow-xs">
      <div className="p-4 border-b border-outline-variant/40 bg-surface-container-low flex items-center justify-between">
        <div className="w-32 h-4 bg-surface-container-high rounded animate-pulse" />
        <div className="w-24 h-4 bg-surface-container-high rounded animate-pulse" />
      </div>
      <div className="divide-y divide-outline-variant/30">
        {[...Array(6)].map((_, idx) => (
          <div key={idx} className="p-4 flex items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3 w-1/4">
              <div className="w-4 h-4 bg-surface-container-high rounded" />
              <div className="w-9 h-9 bg-surface-container-high rounded-md" />
              <div className="space-y-1.5 flex-1">
                <div className="w-20 h-3.5 bg-surface-container-high rounded" />
                <div className="w-28 h-2.5 bg-surface-container-high rounded" />
              </div>
            </div>

            <div className="w-1/5 space-y-1.5 hidden md:block">
              <div className="w-24 h-3.5 bg-surface-container-high rounded" />
              <div className="w-16 h-2.5 bg-surface-container-high rounded" />
            </div>

            <div className="w-20 h-6 bg-surface-container-high rounded-full" />

            <div className="w-28 h-4 bg-surface-container-high rounded hidden lg:block" />

            <div className="w-24 h-4 bg-surface-container-high rounded hidden sm:block" />

            <div className="w-16 h-7 bg-surface-container-high rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface AssetEmptyStateProps {
  hasFilters?: boolean
  onReset?: () => void
  onAddAsset?: () => void
  canAdd?: boolean
}

export const AssetEmptyState: React.FC<AssetEmptyStateProps> = ({
  hasFilters = false,
  onReset,
  onAddAsset,
  canAdd = false,
}) => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-lg p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-xs">
      <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant border border-outline-variant/60">
        <Box className="w-7 h-7 stroke-1" />
      </div>

      <div className="space-y-1.5 max-w-md">
        <h3 className="font-sans font-semibold text-base text-primary">
          {hasFilters ? 'No matching assets found' : 'Asset catalog is currently empty'}
        </h3>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {hasFilters
            ? 'No hardware or software assets match your search filters. Try widening your criteria or reset your filter settings.'
            : 'No assets have been provisioned in the system yet. IT Admins can add hardware and software items directly.'}
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        {hasFilters && onReset && (
          <Button
            variant="secondary"
            size="md"
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={onReset}
          >
            Reset Filters
          </Button>
        )}
        {canAdd && onAddAsset && (
          <Button
            variant="primary"
            size="md"
            icon={<Box className="w-3.5 h-3.5" />}
            onClick={onAddAsset}
          >
            Add New Asset
          </Button>
        )}
      </div>
    </div>
  )
}

interface AssetErrorStateProps {
  message?: string
  onRetry: () => void
}

export const AssetErrorState: React.FC<AssetErrorStateProps> = ({
  message = 'Failed to load asset catalog from server',
  onRetry,
}) => {
  return (
    <div className="bg-error-container/20 border border-error/30 rounded-lg p-6 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
      <div className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center text-error">
        <AlertCircle className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <h4 className="font-sans font-semibold text-sm text-on-error-container">
          Unable to synchronize assets
        </h4>
        <p className="text-xs text-on-surface-variant max-w-sm">{message}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        icon={<RefreshCw className="w-3.5 h-3.5" />}
        onClick={onRetry}
        className="mt-1"
      >
        Retry Connection
      </Button>
    </div>
  )
}
