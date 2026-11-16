import type { QueryClient } from '@tanstack/react-query'
import { NOTIFICATIONS_KEY } from '@/features/notifications/hooks/useNotifications'
import type { NotificationListResponse } from '@/features/notifications/types/notifications'

/**
 * Optimistically updates the notifications query cache to mark an item as read immediately.
 */
export function markNotificationOptimistic(queryClient: QueryClient, notificationId: string) {
  queryClient.setQueriesData<NotificationListResponse>(
    { queryKey: NOTIFICATIONS_KEY },
    (oldData) => {
      if (!oldData) return oldData
      return {
        ...oldData,
        unread_count: Math.max(0, oldData.unread_count - 1),
        items: oldData.items.map((item) =>
          item.id === notificationId ? { ...item, is_read: true } : item,
        ),
      }
    },
  )
}
