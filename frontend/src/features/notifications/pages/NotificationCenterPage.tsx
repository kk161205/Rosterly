import React, { useState } from 'react'
import { PageHeader, EmptyState, ErrorState, Skeleton, Button } from '@/ui'
import { CheckCheck } from 'lucide-react'
import {
  useNotificationMutations,
  useNotifications,
} from '@/features/notifications/hooks/useNotifications'
import { NotificationItem } from '@/features/notifications/components/NotificationItem'
import {
  NotificationTabs,
  type SelectedCategory,
} from '@/features/notifications/components/NotificationTabs'
import { groupNotificationsByDate } from '@/features/notifications/lib/notificationGrouping'

export const NotificationCenterPage: React.FC = () => {
  const [category, setCategory] = useState<SelectedCategory>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const { data, isLoading, isError, error, refetch } = useNotifications({
    category: category === 'all' ? undefined : category,
    unread_only: unreadOnly,
    page: 1,
    page_size: 50,
  })

  const { markRead, markAllRead } = useNotificationMutations()

  const items = data?.items || []
  const grouped = groupNotificationsByDate(items)
  const unreadCount = data?.unread_count ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="System activity, approvals, and device updates for your account."
        actions={
          unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Mark all as read
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3">
        <NotificationTabs activeTab={category} onChange={setCategory} unreadCount={unreadCount} />
        <label className="flex cursor-pointer items-center gap-2 text-body text-muted">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded text-navy focus:ring-navy"
          />
          <span>Unread only</span>
        </label>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 py-4" aria-label="Loading notifications">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load notifications.'}
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No notifications"
          description={
            unreadOnly
              ? 'You have caught up with all your notifications.'
              : 'There are no activity updates in this category.'
          }
        />
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-paper">
          {grouped.today.length > 0 && (
            <section aria-labelledby="heading-today">
              <div
                id="heading-today"
                className="border-b border-line bg-ground/50 px-4 py-2 font-sans text-meta font-medium uppercase tracking-wider text-muted"
              >
                Today
              </div>
              <div className="divide-y divide-line-soft">
                {grouped.today.map((item) => (
                  <NotificationItem
                    key={item.id}
                    notification={item}
                    onMarkRead={(id) => markRead.mutate(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {grouped.yesterday.length > 0 && (
            <section aria-labelledby="heading-yesterday">
              <div
                id="heading-yesterday"
                className="border-b border-line bg-ground/50 px-4 py-2 font-sans text-meta font-medium uppercase tracking-wider text-muted"
              >
                Yesterday
              </div>
              <div className="divide-y divide-line-soft">
                {grouped.yesterday.map((item) => (
                  <NotificationItem
                    key={item.id}
                    notification={item}
                    onMarkRead={(id) => markRead.mutate(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {grouped.older.length > 0 && (
            <section aria-labelledby="heading-older">
              <div
                id="heading-older"
                className="border-b border-line bg-ground/50 px-4 py-2 font-sans text-meta font-medium uppercase tracking-wider text-muted"
              >
                Older
              </div>
              <div className="divide-y divide-line-soft">
                {grouped.older.map((item) => (
                  <NotificationItem
                    key={item.id}
                    notification={item}
                    onMarkRead={(id) => markRead.mutate(id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
