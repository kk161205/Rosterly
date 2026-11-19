import type { NotificationItem } from '@/features/notifications/types/notifications'

export interface GroupedNotifications {
  today: NotificationItem[]
  yesterday: NotificationItem[]
  older: NotificationItem[]
}

/**
 * Groups notifications into Today, Yesterday, and Older based on created_at timestamp.
 */
export function groupNotificationsByDate(items: NotificationItem[]): GroupedNotifications {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000

  const groups: GroupedNotifications = {
    today: [],
    yesterday: [],
    older: [],
  }

  for (const item of items) {
    const itemTime = new Date(item.created_at).getTime()
    if (itemTime >= todayStart) {
      groups.today.push(item)
    } else if (itemTime >= yesterdayStart) {
      groups.yesterday.push(item)
    } else {
      groups.older.push(item)
    }
  }

  return groups
}
