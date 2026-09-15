import React from 'react'
import { Link } from 'react-router-dom'
import { Box, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'

export const AssetDetailSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Breadcrumb Skeleton */}
      <div className="w-48 h-4 bg-surface-container-high rounded" />

      {/* Hero Banner Skeleton */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-6 h-36 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 bg-surface-container-high rounded-lg" />
          <div className="space-y-2">
            <div className="w-32 h-5 bg-surface-container-high rounded" />
            <div className="w-56 h-7 bg-surface-container-high rounded" />
            <div className="w-40 h-4 bg-surface-container-high rounded" />
          </div>
        </div>
        <div className="w-32 h-9 bg-surface-container-high rounded-md hidden lg:block" />
      </div>

      {/* Depreciation Card Skeleton */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-6 h-48 space-y-4">
        <div className="w-64 h-5 bg-surface-container-high rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="h-20 bg-surface-container-high rounded-lg" />
          <div className="h-20 bg-surface-container-high rounded-lg" />
          <div className="h-20 bg-surface-container-high rounded-lg" />
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-6 h-64 space-y-4">
        <div className="w-72 h-8 bg-surface-container-high rounded" />
        <div className="h-40 bg-surface-container-high rounded-lg" />
      </div>
    </div>
  )
}

export const AssetNotFoundState: React.FC = () => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-xs">
      <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-outline">
        <Box className="w-7 h-7 stroke-1" />
      </div>
      <div className="space-y-1.5 max-w-md">
        <h3 className="font-sans font-bold text-base text-primary">Asset Record Not Found</h3>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          The requested asset tag or identifier does not exist in the database or may have been deleted.
        </p>
      </div>
      <Link to="/assets">
        <Button variant="primary" size="md" icon={<ArrowLeft className="w-4 h-4" />}>
          Back to Asset Inventory
        </Button>
      </Link>
    </div>
  )
}

interface AssetDetailErrorStateProps {
  message?: string
  onRetry: () => void
}

export const AssetDetailErrorState: React.FC<AssetDetailErrorStateProps> = ({
  message = 'Failed to load asset details from server',
  onRetry,
}) => {
  return (
    <div className="bg-error-container/20 border border-error/30 rounded-xl p-8 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
      <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center text-error">
        <AlertCircle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h4 className="font-sans font-semibold text-sm text-on-error-container">
          Unable to synchronize asset record
        </h4>
        <p className="text-xs text-on-surface-variant max-w-sm">{message}</p>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={onRetry}
        >
          Retry Connection
        </Button>
        <Link to="/assets">
          <Button variant="secondary" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />}>
            Back to Inventory
          </Button>
        </Link>
      </div>
    </div>
  )
}
