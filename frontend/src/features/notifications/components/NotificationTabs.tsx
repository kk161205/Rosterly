import React from 'react'
import type { NotificationCategory } from '@/features/notifications/types/notifications'
import { cn } from '@/ui'

export type SelectedCategory = 'all' | NotificationCategory

interface NotificationTabsProps {
  activeTab: SelectedCategory
  onChange: (tab: SelectedCategory) => void
  unreadCount?: number
  className?: string
}

const TABS: { id: SelectedCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'system', label: 'System Alerts' },
]

export const NotificationTabs: React.FC<NotificationTabsProps> = ({
  activeTab,
  onChange,
  className,
}) => {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="tablist">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'rounded-pill px-3.5 py-1 text-body font-medium transition-colors',
              isActive
                ? 'bg-ink text-paper'
                : 'bg-ground text-muted hover:bg-row-hover hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
