import React from 'react'
import { Users, RotateCcw } from 'lucide-react'
import { Button } from '@/components/common/CommonUI'

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

export const EmployeeOrgChartSkeleton: React.FC = () => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 sm:p-6 space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between pb-4 border-b border-outline-variant/70">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-surface-container-high flex-shrink-0" />
          <div className="space-y-2">
            <div className="w-56 h-5 bg-surface-container-high rounded" />
            <div className="w-80 h-3.5 bg-surface-container-high rounded" />
          </div>
        </div>
        <div className="w-48 h-8 bg-surface-container-high rounded-lg" />
      </div>

      {/* Hierarchical Tree Structure Skeleton */}
      <div className="space-y-8 min-h-[420px] pt-2">
        {/* Level 0: Top Leader Card Skeleton */}
        <div className="w-full flex flex-col items-center">
          <div className="w-full max-w-xl bg-surface-container-low border border-outline-variant rounded-xl p-4 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-full bg-surface-container-high flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="w-44 h-4 bg-surface-container-high rounded" />
                <div className="w-32 h-3 bg-surface-container-high rounded" />
                <div className="flex items-center gap-2">
                  <div className="w-20 h-4 bg-surface-container-high rounded" />
                  <div className="w-14 h-4 bg-surface-container-high rounded" />
                </div>
              </div>
            </div>
            <div className="w-24 h-7 bg-surface-container-high rounded-lg flex-shrink-0" />
          </div>

          {/* Stem down */}
          <div className="w-0.5 h-4 bg-outline-variant mt-3" />

          {/* Team Box Skeleton */}
          <div className="w-full bg-surface-container-low/30 border border-outline-variant/50 rounded-xl p-5 mt-1 space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/40">
              <div className="w-48 h-3.5 bg-surface-container-high rounded" />
              <div className="w-24 h-3 bg-surface-container-high rounded" />
            </div>

            {/* Sub-Manager / Lead Card Skeleton */}
            <div className="w-full max-w-lg bg-surface-container-low border border-outline-variant rounded-lg p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-surface-container-high flex-shrink-0" />
                <div className="space-y-1.5">
                  <div className="w-36 h-3.5 bg-surface-container-high rounded" />
                  <div className="w-28 h-2.5 bg-surface-container-high rounded" />
                </div>
              </div>
              <div className="w-20 h-6 bg-surface-container-high rounded-md" />
            </div>

            {/* Grid of Team Member Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="bg-surface-container-low border border-outline-variant/70 rounded-lg p-3 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-surface-container-high flex-shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="w-32 h-3.5 bg-surface-container-high rounded" />
                    <div className="w-24 h-2.5 bg-surface-container-high rounded" />
                    <div className="w-16 h-3 bg-surface-container-high rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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

      <Button type="button" variant="primary" size="md" onClick={onResetFilters} className="mt-5" icon={<RotateCcw className="w-3.5 h-3.5" />}>
        Reset Filters
      </Button>
    </div>
  )
}
