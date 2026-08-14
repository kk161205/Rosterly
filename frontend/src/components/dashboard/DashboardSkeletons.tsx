import React from 'react'

export const MetricRibbonSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-surface-container-lowest border border-outline-variant rounded-lg p-5 flex flex-col justify-between space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-md bg-surface-container-high" />
            <div className="w-16 h-5 rounded-full bg-surface-container-high" />
          </div>
          <div className="space-y-2">
            <div className="w-24 h-4 rounded bg-surface-container-high" />
            <div className="w-16 h-8 rounded bg-surface-container-high" />
          </div>
          <div className="pt-3 border-t border-outline-variant/60">
            <div className="w-32 h-3 rounded bg-surface-container-high" />
          </div>
        </div>
      ))}
    </div>
  )
}

export const SplitGridSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
      {/* Left Section Skeleton */}
      <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="w-40 h-6 rounded bg-surface-container-high" />
          <div className="w-20 h-5 rounded bg-surface-container-high" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-3.5 rounded-md bg-surface-container-low border border-outline-variant flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-surface-container-high" />
                <div className="space-y-1.5">
                  <div className="w-48 h-4 rounded bg-surface-container-high" />
                  <div className="w-24 h-3 rounded bg-surface-container-high" />
                </div>
              </div>
              <div className="w-16 h-6 rounded bg-surface-container-high" />
            </div>
          ))}
        </div>
      </div>

      {/* Right Section Skeleton */}
      <div className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="w-36 h-6 rounded bg-surface-container-high" />
          <div className="w-16 h-4 rounded bg-surface-container-high" />
        </div>
        <div className="space-y-4 pt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-container-high flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-full h-4 rounded bg-surface-container-high" />
                <div className="w-3/4 h-3 rounded bg-surface-container-high" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export const FullPageDashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Banner Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
        <div className="space-y-2">
          <div className="w-64 h-8 bg-surface-container-high rounded" />
          <div className="w-96 max-w-full h-4 bg-surface-container-high rounded" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-surface-container-high rounded" />
          <div className="w-36 h-10 bg-surface-container-high rounded" />
        </div>
      </div>

      {/* Metric Ribbon Skeleton */}
      <MetricRibbonSkeleton />

      {/* Role Widget Skeleton */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 space-y-4">
        <div className="w-48 h-6 bg-surface-container-high rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surface-container-low border border-outline-variant rounded p-4 space-y-2">
              <div className="w-24 h-4 bg-surface-container-high rounded" />
              <div className="w-16 h-6 bg-surface-container-high rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Split Grid Skeleton */}
      <SplitGridSkeleton />
    </div>
  )
}

export const SlowLoadingBanner: React.FC = () => {
  return (
    <div className="p-3.5 rounded-md bg-accent-container/30 border border-accent/20 text-on-accent-container flex items-center justify-center gap-3 animate-fade-in shadow-xs my-2">
      <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin flex-shrink-0" />
      <span className="text-body-sm font-sans font-medium text-center">
        Connecting to enterprise workspace... Taking slightly longer than usual to fetch live records.
      </span>
    </div>
  )
}
