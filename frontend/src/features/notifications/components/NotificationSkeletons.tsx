import React from 'react'
import { Skeleton } from '@/ui'

export const NotificationSkeletons: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="flex flex-col gap-3 py-2" aria-label="Loading notifications">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-start gap-3 rounded-card border border-line-soft bg-paper p-4"
        >
          <Skeleton className="h-8 w-8 rounded-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}
