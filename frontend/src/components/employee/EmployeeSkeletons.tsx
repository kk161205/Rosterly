import React from 'react'
import { Users, RotateCcw } from 'lucide-react'

export const EmployeeTableSkeleton: React.FC = () => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-6 space-y-4 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between border-b border-outline-variant/60 pb-4">
        <div className="space-y-2">
          <div className="w-48 h-6 bg-surface-container-high rounded" />
          <div className="w-80 h-4 bg-surface-container-high rounded" />
        </div>
        <div className="w-36 h-9 bg-surface-container-high rounded" />
      </div>

      {/* Table Rows Skeleton */}
      <div className="space-y-3 pt-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="p-3.5 rounded-md bg-surface-container-low border border-outline-variant flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-surface-container-high flex-shrink-0" />
              <div className="space-y-1.5">
                <div className="w-40 h-4 bg-surface-container-high rounded" />
                <div className="w-56 h-3 bg-surface-container-high rounded" />
              </div>
            </div>
            <div className="w-28 h-4 bg-surface-container-high rounded" />
            <div className="w-24 h-5 bg-surface-container-high rounded" />
            <div className="w-20 h-6 bg-surface-container-high rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface EmployeeEmptyStateProps {
  onResetFilters: () => void
}

export const EmployeeEmptyState: React.FC<EmployeeEmptyStateProps> = ({ onResetFilters }) => {
  return (
    <div className="bg-surface-container-lowest border-2 border-dashed border-outline-variant/80 rounded-lg p-12 text-center flex flex-col items-center justify-center my-4">
      <div className="w-14 h-14 rounded-full bg-accent-container/40 text-accent flex items-center justify-center mb-4 border border-accent/20">
        <Users className="w-7 h-7" />
      </div>

      <h3 className="text-title-md font-sans font-semibold text-on-surface">
        No employees match your search criteria
      </h3>
      <p className="text-body-sm font-body text-on-surface-variant max-w-md mt-1.5 leading-relaxed">
        Try adjusting your full-text search keywords, clearing department filters, or resetting status chips to view matching team records.
      </p>

      <button
        type="button"
        onClick={onResetFilters}
        className="mt-5 px-4 py-2 text-xs font-mono font-semibold rounded bg-accent text-on-accent hover:bg-accent/90 transition-colors inline-flex items-center gap-2 cursor-pointer shadow-xs"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Reset Filters</span>
      </button>
    </div>
  )
}
