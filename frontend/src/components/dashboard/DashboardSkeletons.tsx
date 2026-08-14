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
