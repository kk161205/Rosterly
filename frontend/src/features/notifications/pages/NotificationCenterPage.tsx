import React, { useState } from 'react'
import { CheckCheck } from 'lucide-react'
import { Button, EmptyState, ErrorState, FilterTabs, PageHeader, Pagination, Skeleton } from '@/ui'
import { useNotificationMutations, useNotifications } from '@/features/notifications/hooks/useNotifications'
import { NotificationItem } from '@/features/notifications/components/NotificationItem'
import { groupNotificationsByDate } from '@/features/notifications/lib/notificationGrouping'
import type { NotificationCategory } from '@/features/notifications/types/notifications'
import { getErrorMessage } from '@/lib/errors'

type View = 'all' | 'unread' | NotificationCategory

const PAGE_SIZE = 20

/** everything sent to you, newest first, a page at a time. */
export const NotificationCenterPage: React.FC = () => {
  const [view, setView] = useState<View>('all')
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error, refetch } = useNotifications({
    category: view === 'all' || view === 'unread' ? undefined : view,
    unread_only: view === 'unread',
    page,
    page_size: PAGE_SIZE,
  })
  const { markRead, markAllRead } = useNotificationMutations()

  const items = data?.items ?? []
  const grouped = groupNotificationsByDate(items)
  const unreadCount = data?.unread_count ?? 0
  const choose = (next: View) => {
    setView(next)
    setPage(1)
  }

  const groups = [
    { key: 'today', title: 'Today', rows: grouped.today },
    { key: 'yesterday', title: 'Yesterday', rows: grouped.yesterday },
    { key: 'older', title: 'Older', rows: grouped.older },
  ].filter((g) => g.rows.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Updates about your requests, approvals and equipment."
        actions={
          unreadCount > 0 && (
            <Button data-guide="notifications.mark-all" variant="secondary" size="sm" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
              <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Mark all as read
            </Button>
          )
        }
      />

      <FilterTabs<View> data-guide="notifications.show"
        label="Show"
        value={view}
        onChange={choose}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'unread', label: 'Unread', count: unreadCount },
          { value: 'approvals', label: 'Approvals' },
          { value: 'hardware', label: 'Equipment' },
          { value: 'system', label: 'Other' },
        ]}
      />

      {isLoading ? (
        <div className="flex flex-col gap-3" aria-label="Loading notifications">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : isError ? (
        <ErrorState message={getErrorMessage(error, 'Could not load notifications.')} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={view === 'unread' ? 'All caught up' : 'No notifications'}
          description={
            view === 'unread'
              ? 'You’ve read everything. New updates appear here and on the bell.'
              : 'When something needs you, or a request of yours moves, it shows up here.'
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`heading-${g.key}`}>
              <h2 id={`heading-${g.key}`} className="border-b border-ink pb-2 text-section text-ink">
                {g.title}
              </h2>
              <div>
                {g.rows.map((item) => (
                  <NotificationItem
                    key={item.id}
                    notification={item}
                    showDate={g.key === 'older'}
                    onMarkRead={(id) => markRead.mutate(id)}
                  />
                ))}
              </div>
            </section>
          ))}
          <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
        </div>
      )}
    </div>
  )
}
